// Kenesa App engine: Arabic normalisation, fuzzy search, voice-command parsing.
(function () {
  const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
  function norm(s) {
    return (s || '')
      .replace(/\p{Cf}/gu, '').replace(/\p{Nd}/gu, d => String(d.codePointAt(0) & 0xF))
      .replace(TASHKEEL, '')
      .replace(/[إأآٱا]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ء/g, '')
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/[^ء-ي0-9a-z ]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  // word match: exact, prefix-tolerant (و/ف/ب/ل/ال), or 1-2 typos
  function stripPre(w) { return w.replace(/^(وال|فال|بال|لل|ال|و|ف|ب|ل)(?=..)/, ''); }
  // sound skeleton: how the word is SAID, not spelled. Drops vowels/long letters and hamza,
  // merges letters people mix up (ق ك ء / ذ ز ظ / ث س ص / ض د / ط ت / ة ه), doubled letters count once.
  const SK = { 'ق': 'ك', 'ء': '', 'ذ': 'د', 'ز': 'د', 'ظ': 'د', 'ض': 'د', 'ث': 'س', 'ص': 'س', 'ط': 'ت', 'ا': '', 'و': '', 'ي': '' };
  const skCache = new Map();
  function skel(w) {
    let r = skCache.get(w); if (r !== undefined) return r;
    const b = stripPre(w); let out = '';
    for (let i = 0; i < b.length; i++) {
      let c = b[i];
      if (c in SK) c = (i === 0 && (c === 'ا' || c === 'و' || c === 'ي')) ? c : SK[c];
      if (c && out[out.length - 1] !== c) out += c;
    }
    if (skCache.size > 200000) skCache.clear();
    skCache.set(w, out); return out;
  }
  function wordScore(q, w) {
    if (q === w) return 1;
    const qs = stripPre(q), ws = stripPre(w);
    if (qs === ws) return 0.95;
    if (qs.length >= 4 && lev(qs, ws, 1) <= 1) return 0.8;
    if (q.length >= 3) {                                   // sounds the same (نامين / ناميين, قال / كال)
      const a = skel(q), b = skel(w);
      if (a === b && (a.length >= 2 || (a.length === 1 && stripPre(q).length <= 3))) return 0.78;
      if (a.length >= 4 && lev(a, b, 1) <= 1) return 0.62;
    }
    if (qs.length >= 7 && lev(qs, ws, 2) <= 2) return 0.65;
    return 0;
  }
  function textScore(qWords, docWords) {
    if (!qWords.length) return 0;
    let tot = 0, run = 0, bestRun = 0, last = -2;
    for (const q of qWords) {
      let best = 0, at = -1;
      for (let i = 0; i < docWords.length; i++) {
        const s = wordScore(q, docWords[i]);
        if (s > best || (s === best && s > 0 && i === last + 1)) { best = s; at = i; if (s === 1 && i === last + 1) break; }
      }
      tot += best;
      if (best > 0 && at === last + 1) { run++; } else run = best > 0 ? 1 : 0;
      if (best > 0) last = at;
      bestRun = Math.max(bestRun, run);
    }
    return tot / qWords.length * 0.75 + (bestRun / qWords.length) * 0.25;
  }

  // ---------- index ----------
  const IDX = { hymnSlides: [], verses: [], books: [], hv: null, bv: null };
  // inverted index: word -> list of documents that contain it (fast search)
  function invert(docs) {
    const map = new Map();
    docs.forEach((d, i) => { for (const w of new Set(d.words)) { if (!w) continue; let a = map.get(w); if (!a) map.set(w, a = []); a.push(i); } });
    return { map, vocab: [...map.keys()] };
  }
  function build(HYMNS, BIBLE, BOOKS) {
    HYMNS.forEach(h => h.slides.forEach((s, i) => {
      IDX.hymnSlides.push({ num: h.num, i, words: norm(s.lines.join(' ')).split(' ') });
    }));
    BIBLE.forEach((b, bi) => b.chapters.forEach((ch, ci) => ch.forEach((v, vi) => {
      IDX.verses.push({ b: bi, c: ci, v: vi, words: norm(v).split(' ') });
    })));
    IDX.books = BOOKS.map((names, bi) => ({ bi, names: names.map(norm) }));
    IDX.hv = invert(IDX.hymnSlides); IDX.bv = invert(IDX.verses);
  }
  // words of the index that can stand for query word q (exact, without و/ال/ب…, or 1-2 typos)
  const expCache = new Map();
  function expand(ix, q, tag) {
    const k = tag + q; if (expCache.has(k)) return expCache.get(k);
    const out = new Map();
    if (ix.map.has(q)) out.set(q, 1);
    const qs = stripPre(q);
    if (q.length >= 3 || ix.map.has(q)) for (const w of ix.vocab) {
      if (out.has(w)) continue;
      if (Math.abs(w.length - q.length) > 3) continue;
      const s = wordScore(q, w); if (s > 0) out.set(w, s);
    }
    const res = [...out.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
    if (expCache.size > 3000) expCache.clear();
    expCache.set(k, res); return res;
  }
  // candidates by word hits, then exact scoring on the best few hundred
  function indexed(ix, docs, text, n, minScore) {
    const q = norm(text).split(' ').filter(w => w.length > 1);
    if (!q.length) return [];
    const hits = new Map();
    q.forEach((w, qi) => {
      const seen = new Map();
      for (const [vw, s] of expand(ix, w, ix === IDX.bv ? 'b' : 'h')) for (const d of ix.map.get(vw)) if ((seen.get(d) || 0) < s) seen.set(d, s);
      for (const [d, s] of seen) hits.set(d, (hits.get(d) || 0) + s);
    });
    const need = Math.max(0.6, q.length * 0.35);
    const cand = [...hits.entries()].filter(([, h]) => h >= need).sort((a, b) => b[1] - a[1]).slice(0, 300);
    return cand.map(([d]) => ({ d, score: textScore(q, docs[d].words) })).filter(r => r.score > minScore)
      .sort((a, b) => b.score - a.score).slice(0, n);
  }

  // ---------- numbers ----------
  const ORD = { 'اول': 1, 'الاول': 1, 'واحد': 1, 'تاني': 2, 'ثاني': 2, 'التاني': 2, 'الثاني': 2, 'اتنين': 2, 'اثنين': 2,
    'تالت': 3, 'ثالث': 3, 'التالت': 3, 'الثالث': 3, 'تلاته': 3, 'ثلاثه': 3, 'رابع': 4, 'الرابع': 4, 'اربعه': 4, 'اربع': 4,
    'خامس': 5, 'الخامس': 5, 'خمسه': 5, 'خمس': 5, 'سادس': 6, 'السادس': 6, 'سته': 6, 'ست': 6, 'سابع': 7, 'السابع': 7, 'سبعه': 7, 'سبع': 7,
    'تامن': 8, 'ثامن': 8, 'التامن': 8, 'الثامن': 8, 'تمانيه': 8, 'ثمانيه': 8, 'تمن': 8, 'تاسع': 9, 'التاسع': 9, 'تسعه': 9, 'تسع': 9,
    'عاشر': 10, 'العاشر': 10, 'عشره': 10, 'عشر': 10, 'حداشر': 11, 'اتناشر': 12, 'تلتاشر': 13, 'اربعتاشر': 14, 'خمستاشر': 15,
    'ستاشر': 16, 'سبعتاشر': 17, 'تمنتاشر': 18, 'تسعتاشر': 19, 'عشرين': 20, 'تلاتين': 30, 'ثلاثين': 30, 'اربعين': 40, 'خمسين': 50,
    'ستين': 60, 'سبعين': 70, 'تمانين': 80, 'ثمانين': 80, 'تسعين': 90, 'ميه': 100, 'مايه': 100, 'ماءه': 100, 'ميتين': 200, 'مييتين': 200,
    'عشرون': 20, 'عشرين': 20, 'ثلاثون': 30, 'اربعون': 40, 'خمسون': 50, 'ستون': 60, 'سبعون': 70, 'ثمانون': 80, 'تسعون': 90,
    'اثنا': 2, 'اثني': 2, 'احد': 1, 'حادي': 1, 'الحادي': 1, 'مائتان': 200, 'مئتان': 200, 'مئتين': 200, 'ثلاثمائه': 300, 'ثلاثمئه': 300,
    'ثالث': 3, 'رابع': 4, 'اولي': 1, 'الاولي': 1, 'ثانيه': 2, 'الثانيه': 2, 'ثالثه': 3, 'رابعه': 4, 'خامسه': 5, 'سادسه': 6, 'سابعه': 7, 'ثامنه': 8, 'تاسعه': 9, 'عاشره': 10,
    'تلتميه': 300, 'ثلاثمايه': 300, 'تلاتميه': 300, 'ثلاثمائه': 300, 'مائه': 100, 'مئه': 100, 'مائتين': 200, 'ميتين': 200,
    'احدعشر': 11, 'اتنعشر': 12, 'ثمانيه': 8, 'التمنيه': 8, 'تمنيه': 8, 'تمانيه': 8, 'ثلاث': 3, 'تلات': 3, 'تلت': 3, 'اتنين': 2, 'سبعتعشر': 17, 'ربعميه': 400 };
  // read a number starting at words[i]; returns [value, nextIndex] or null
  const ORD_KEYS = Object.keys(ORD);
  // number word -> value: exact, without ال / و, or 1 typo (e.g. "الثمانية", "تمانيه", "وتمانين")
  function numWord(w) {
    const tries = [w];
    if (w.startsWith('و')) tries.push(w.slice(1));
    for (const t of tries.slice()) if (t.startsWith('ال')) tries.push(t.slice(2));
    for (const t of tries) if (ORD[t] !== undefined) return ORD[t];
    for (const t of tries) {                          // hundreds as Whisper writes them: "تولتوميو", "ربعمية"
      if (/^[تث][او]?ل[ا]?[تث][او]?م[ياوئ]/.test(t)) return 300;
      if (/^ا?ربع[او]?م[ياوئ]/.test(t)) return 400;
    }
    for (const t of tries) if (t.length >= 4) { const k = ORD_KEYS.find(k => k.length >= 4 && lev(t, k, 1) <= 1); if (k) return ORD[k]; }
    return undefined;
  }
  const FILL = new Set(['رقم', 'نمره', 'نمرة', 'يا', 'لو', 'سمحت', 'من', 'فضلك']);
  function readNum(words, i) {
    let val = 0, j = i, got = false;
    while (j < words.length && !got && FILL.has(words[j])) j++;          // "ترنيمة رقم 8"
    while (j < words.length) {
      let w = words[j];
      if (/^\d+$/.test(w)) { if (got) break; val += +w; got = true; j++; break; }
      if (got && (w === 'و' || w === 'او')) { j++; continue; }   // Whisper sometimes writes 'أو' for 'و'
      const n = numWord(w);
      if (n !== undefined && !(got && !w.startsWith('و') && n >= 100)) { val += n; got = true; j++; continue; }
      break;
    }
    return got ? [val, j] : null;
  }
  function numAfter(words, keys) {
    for (let i = 0; i < words.length; i++) {
      if (keys.some(k => wordScore(k, words[i]) >= 0.8)) { const r = readNum(words, i + 1); if (r) return r[0]; }
    }
    return null;
  }

  // ---------- parse what was heard ----------
  // returns {type:'hymn', num, verse} | {type:'verse', b,c,v} | {type:'lyric', num, i, score} | null
  // the word "ترنيمة" as it often comes out of speech recognition: ترنمت / ترنيمت / ترنيم / ترميم / تريمه …
  const isHymnWord = w => /^(ال)?(ترن|ترانيم)/.test(w) || (w.length >= 4 && (lev(stripPre(w), 'ترنيمه', 2) <= 2 || lev(stripPre(w), 'ترنيمت', 2) <= 2));
  function parse(text, HYMNS, BIBLE) {
    const t = norm(text), words = t.split(' ').map(w => isHymnWord(w) ? 'ترنيمه' : w);
    // hymn by number
    let hn = numAfter(words, ['ترنيمه', 'الترنيمه', 'ترنيم', 'الترنيم', 'ترنيمتنا', 'ترانيم']);
    if (!hn) {                                          // "169 عدد 3" (the word ترنيمة was not heard)
      const r0 = readNum(words.filter(w => !FILL.has(w)), 0);
      const vi = words.findIndex(w => /^(ال)?عدد$/.test(w));
      if (r0 && vi > 0 && !IDX.books.some(bk => bk.names.some(n => words.join(' ').includes(n)))) hn = r0[0];
    }
    if (hn && hn >= 1 && hn <= HYMNS.length) {
      const verse = numAfter(words, ['العدد', 'عدد', 'المقطع', 'القطعه', 'الكوبليه', 'العددين']);
      return { type: 'hymn', num: hn, verse: verse || 1 };
    }
    // bible reference: book name + chapter (+ verse)
    let bestBook = null;
    for (const bk of IDX.books) for (const n of bk.names) {
      const nw = n.split(' ');
      for (let i = 0; i + nw.length <= words.length; i++) {
        let s = 0; for (let k = 0; k < nw.length; k++) s += wordScore(nw[k], words[i + k]);
        s /= nw.length;
        if (s >= 0.8 && (!bestBook || s > bestBook.s || (s === bestBook.s && n.length > bestBook.len))) bestBook = { bi: bk.bi, s, at: i + nw.length, len: n.length };
      }
    }
    if (bestBook) {
      const rest = words.slice(bestBook.at);
      let c = numAfter(rest, ['الاصحاح', 'اصحاح', 'الإصحاح', 'المزمور', 'مزمور']);
      let v = numAfter(rest, ['العدد', 'عدد', 'الايه', 'ايه', 'آيه']);
      if (c === null) { const r = readNum(rest, 0); if (r) { c = r[0]; const r2 = readNum(rest, r[1]); if (r2) v = r2[0]; } }
      const book = BIBLE[bestBook.bi];
      if (c && book.chapters[c - 1]) {
        if (!v || !book.chapters[c - 1][v - 1]) v = 1;
        return { type: 'verse', b: bestBook.bi, c: c - 1, v: v - 1 };
      }
    }
    // lyric line -> best hymn slide
    const q = words.filter(w => w.length > 1);
    if (q.length >= 3) {
      const rs = searchHymnText(text, 10), r = rs[0];
      const second = rs.find(x => x.num !== (r && r.num));
      if (r && r.score >= 0.7 && (!second || r.score - second.score >= 0.1)) return { type: 'lyric', num: r.num, i: r.i, score: r.score };
      if (r && r.score >= 0.5) return { type: 'lyric', num: r.num, i: r.i, score: r.score, unsure: true, alts: rs.filter(x => x.num !== r.num).slice(0, 3).map(x => x.num) };
    }
    return null;
  }

  function searchHymnText(text, n) {
    return indexed(IDX.hv, IDX.hymnSlides, text, n || 20, 0.35).map(r => ({ num: IDX.hymnSlides[r.d].num, i: IDX.hymnSlides[r.d].i, score: r.score }));
  }
  function searchBible(text, n) {
    return indexed(IDX.bv, IDX.verses, text, n || 30, 0.45).map(r => { const v = IDX.verses[r.d]; return { b: v.b, c: v.c, v: v.v, score: r.score }; });
  }
  const words = s => norm(s).split(' ').filter(w => w.length > 1);
  // "سبعة وخمسين" / "57" alone -> 57 (null if the sentence is not just a number)
  function bareNumber(text) {
    const w = norm(text).split(' ').filter(x => x && !FILL.has(x));
    for (let i = 0; i < w.length; i++) { const r = readNum(w, i); if (r) { const rest = w.length - (r[1] - i); return rest <= 2 ? { n: r[0], verseWord: w.some(x => /^(ال)?عدد$/.test(x)) } : null; } }
    return null;
  }
  window.KE = { norm, build, parse, searchHymnText, searchBible, lev, textScore, words, skel, bareNumber, isHymnWord, wordScore };
})();
