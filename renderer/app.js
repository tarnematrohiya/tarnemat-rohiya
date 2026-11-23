// Brethren Presenter — control logic
const H = window.HYMNS, B = window.BIBLE, BK = window.BOOKS;
const LITE = !!(window.bp && window.bp.lite);            // church version: no microphone
if (LITE) document.body.classList.add('lite');
KE.build(H, B, BK);
const $ = id => document.getElementById(id);

let SET = { font: 'K Cairo', scale: 1, follow: true, fill: true };
try { Object.assign(SET, JSON.parse(localStorage.getItem('kenesa_set') || '{}')); } catch (e) {}
const st = { tab: 'hymns', mode: 'assist', prayer: false, cur: null, slides: [], cue: -1, live: -1, liveKey: null, liveSlide: null, out: null, blank: false, browse: null };

// ---------- helpers ----------
const bookName = bi => BK[bi][0];
const arD = n => String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
const ref = (b, c, v) => `${bookName(b)} ${arD(c + 1)}: ${arD(v + 1)}`;
const esc = s => String(s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
const plain = s => KE.norm(s);
const verseName = l => l === 'ق' ? 'القرار' : 'العدد ' + l;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }
function setLast(msg) { if (window.bp && window.bp.log) window.bp.log('SHOW ' + msg); $('last').innerHTML = 'آخر حاجة: <b>' + esc(msg) + '</b>'; }

function hymnSlides(num) {
  return H[num - 1].slides.map((s, i) => ({
    theme: i % 2 ? 'b' : 'w',
    num: s.label === 'ق' ? 'ق' : (s.part ? '' : s.label),
    html: s.lines.map(esc).join('<br>'),
    lab: verseName(s.label) + (s.part ? ' (تكملة)' : ''),
    ref: `ترنيمة ${num} · ${verseName(s.label)}`
  })).concat([{ theme: 'b', end: true, html: '', lab: 'شاشة سودا (النهاية)', ref: `ترنيمة ${num} · خلصت — شاشة سودا` }]);
}
function chapterSlides(b, c) {
  return B[b].chapters[c].map((t, v) => ({ theme: 'bible', html: `${esc(t)}<div class="r">${ref(b, c, v)}</div>`, lab: 'آية ' + arD(v + 1), ref: ref(b, c, v) }));
}
function paint(el, s) {
  el.classList.remove('th-w', 'th-b', 'th-bible');
  if (!s) { el.innerHTML = ''; return; }
  if (s.end) { el.classList.add('th-b'); el.innerHTML = el.id === 'cueScr' ? '<div class="endlab">آخر الترنيمة — الشاشة هتبقى سودا</div>' : ''; return; }
  el.classList.add('th-' + s.theme);
  el.innerHTML = (s.num ? `<span class="vn">${s.num}</span>` : '') + `<div class="tx">${s.html}</div>`;
  if (el.classList.contains('screen')) {          // preview screens: shrink long text to fit
    el.style.fontSize = ''; const base = parseFloat(getComputedStyle(el).fontSize); let k = 1;
    while (k > 0.45 && el.scrollHeight > el.clientHeight + 2) { k -= 0.05; el.style.fontSize = (base * k) + 'px'; }
  }
}

// ---------- load ----------
function loadHymn(num, cueIdx) {
  st.cur = { kind: 'hymn', num }; st.slides = hymnSlides(num);
  $('curTitle').innerHTML = `<svg class="ic"><use href="#i-music"/></svg> ترنيمة ${num} <small>${esc(plain(H[num - 1].title))}</small>`;
  renderSlides(); setCue(cueIdx || 0);
  hymnCtx = num;                                  // a number + Enter now = a verse of this hymn
}
function loadChapter(b, c, v) {
  st.cur = { kind: 'bible', b, c }; st.slides = chapterSlides(b, c);
  $('curTitle').innerHTML = `<svg class="ic"><use href="#i-book"/></svg> ${bookName(b)} <small>الإصحاح ${arD(c + 1)}</small>`;
  renderSlides(); setCue(v || 0);
}
const key = () => JSON.stringify(st.cur);
function renderSlides() {
  const el = $('slides'); el.innerHTML = '';
  el.classList.toggle('list', !!(st.cur && st.cur.kind === 'bible'));   // verses = small lines one under the other
  st.slides.forEach((s, i) => {
    const d = document.createElement('div'); d.className = 'slide th-' + s.theme + (s.end ? ' end' : '');
    d.innerHTML = `<span class="lab">${s.lab}</span><div class="in">${s.html}</div>`;
    d.title = 'ضغطة = جهّزها (ولو الترنيمة معروضة تظهر على طول) · ضغطتين = اعرضها';
    d.onclick = () => pick(i);
    d.ondblclick = () => { setCue(i); play(); };
    el.appendChild(d);
  });
  fitSlides(); mark();
}
// hymn slides: always 3 columns like the Mac; if they don't all fit, the whole grid shrinks evenly (no scrolling)
function fitSlides() {
  const el = $('slides');
  el.style.gridTemplateColumns = ''; el.style.removeProperty('--sf');
  if (el.classList.contains('list') || !el.children.length || !el.clientHeight) return;
  el.style.gridTemplateColumns = 'repeat(3,minmax(0,1fr))';
  let lo = 0.4, hi = 1;
  el.style.setProperty('--sf', 1);
  if (el.scrollHeight <= el.clientHeight + 1) return;
  for (let k = 0; k < 9; k++) {
    const m = (lo + hi) / 2; el.style.setProperty('--sf', m.toFixed(3));
    if (el.scrollHeight <= el.clientHeight + 1) lo = m; else hi = m;
  }
  el.style.setProperty('--sf', lo.toFixed(3));
}
new ResizeObserver(() => fitSlides()).observe($('slides'));
function setCue(i) {
  if (i < 0 || i >= st.slides.length) return;
  st.cue = i; paint($('cueScr'), st.slides[i]); $('cueRef').textContent = st.slides[i].ref; mark();
  const n = $('slides').children[i]; if (n) n.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function mark() {
  const same = st.liveKey === key();
  [...$('slides').children].forEach((d, i) => { d.classList.toggle('cue', i === st.cue); d.classList.toggle('onair', same && i === st.live && !st.blank); });
}

// ---------- live / output ----------
const onAir = () => st.liveKey === key() && st.live >= 0 && !st.blank;
function step(d) {
  if (onAir()) { const i = st.live + d; if (i < 0 || i >= st.slides.length) { toast(d > 0 ? 'دي آخر شريحة' : 'دي أول شريحة'); return; } setCue(i); play(); }
  else setCue(st.cue + d);
}
function pick(i) { setCue(i); if (onAir()) play(); }
function play() {
  if (st.cue < 0 || !st.slides[st.cue]) { toast('اختار حاجة الأول'); return; }
  const s = st.slides[st.cue];
  st.live = st.cue; st.liveKey = key(); st.liveSlide = s; st.blank = false; $('blankBtn').classList.remove('on');
  paint($('liveScr'), s); $('liveRef').textContent = s.ref;
  sendOut(s); mark(); record(s);
  if (!outputReady()) toast('اتعرضت هنا بس — دوس "فتح شاشة العرض" عشان تطلع على البروجكتور');
  if (st.cue + 1 < st.slides.length) setCue(st.cue + 1);
}
function blank() {
  st.blank = !st.blank; const s = st.blank ? null : st.liveSlide;
  paint($('liveScr'), s); sendOut(s); $('blankBtn').classList.toggle('on', st.blank); mark();
  toast(st.blank ? 'الشاشة اتخفت' : 'الكلام رجع على الشاشة');
}
const APP = !!window.bp;
let outOpen = false;
function openOut() {
  if (APP) { window.bp.openOutput(); return; }
  st.out = window.open('', 'kenesa_out', 'width=1280,height=720');
  if (!st.out) { toast('المتصفح منع الشباك — اسمح بالـ popups'); return; }
  const d = st.out.document;
  d.open(); d.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><base href="${location.href}"><link rel="stylesheet" href="fonts/fonts.css"><title>شاشة العرض</title><style>
  html,body{margin:0;height:100%;background:#000;color:#fff;overflow:hidden}
  body.th-w{background:#fff}
  #t{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:6vh 7vw;font-family:var(--f),sans-serif;font-size:calc(var(--s) * 6.5vh);font-weight:600;line-height:1.8;transition:opacity .25s}
  #t.th-w,#t.th-b{font-size:calc(var(--s) * 8vh);font-weight:800;line-height:1.55}
  #t.th-w{background:#fff;color:#000}#t.th-b{background:#000;color:#fff}
  .vn{position:absolute;top:2.5vh;left:4vw;color:#e00;font-weight:800;font-size:.55em}
  .r{font-size:.5em;color:#999;margin-top:1.2em}
  #hint{position:fixed;inset:auto 0 0 0;padding:14px;background:#222;color:#ddd;font:600 16px "K Cairo",sans-serif;text-align:center}
  </style></head><body><div id="t"></div><div id="hint">اسحب الشباك ده على شاشة البروجكتور، وبعدين اضغط هنا مرتين أو زرار F عشان يملا الشاشة</div></body></html>`); d.close();
  const fs = () => { st.out.document.documentElement.requestFullscreen().catch(() => {}); const h = st.out.document.getElementById('hint'); if (h) h.remove(); st.out.document.body.style.cursor = 'none'; };
  st.out.document.addEventListener('dblclick', fs);
  st.out.document.addEventListener('keydown', e => { if (e.key === 'f' || e.key === 'F') fs(); else onKey(e); });
  outOpen = true; applySet();
  sendOut(st.blank ? null : st.liveSlide);
  $('outLbl').textContent = 'شاشة العرض مفتوحة';
}
function sendOut(s) {
  if (APP) { window.bp.slide(s ? { theme: s.theme, num: s.num || '', html: s.html, end: !!s.end } : null); return; }
  if (!st.out || st.out.closed) return;
  const t = st.out.document.getElementById('t'); if (!t) return;
  t.style.opacity = 0;
  setTimeout(() => { paint(t, s); st.out.document.body.className = s && !s.end ? 'th-' + s.theme : ''; t.style.opacity = 1; }, 180);
}
const outputReady = () => APP ? outOpen : !!(st.out && !st.out.closed);
if (APP) {
  document.documentElement.classList.toggle('mac', window.bp.platform === 'darwin');
  window.bp.on('status', s => {
    outOpen = s.outputOpen;
    $('outLbl').textContent = s.outputOpen ? (s.projector ? 'شغالة على البروجكتور' : 'شاشة العرض مفتوحة') : (s.projector ? 'فتح شاشة العرض' : 'فتح شاشة العرض (مفيش بروجكتور)');
    $('openOut').classList.toggle('primary', !s.outputOpen);
  });
  window.bp.on('key', k => onKey({ key: k.key, code: k.code, target: document.body, preventDefault() {} }));
}

// ---------- font / size ----------
function applySet() {
  if (APP) window.bp.style({ font: SET.font, scale: SET.scale, fill: SET.fill !== false });
  if ($('fillBtn')) { $('fillBtn').textContent = 'ملء الشاشة: ' + (SET.fill !== false ? 'شغال' : 'مقفول'); $('fillBtn').classList.toggle('on', SET.fill !== false); }
  for (const d of [document, st.out && !st.out.closed ? st.out.document : null]) if (d) { d.documentElement.style.setProperty('--f', `"${SET.font}"`); d.documentElement.style.setProperty('--s', SET.scale); }
  $('fontSel').value = SET.font; $('szVal').textContent = Math.round(SET.scale * 100) + '%';
  try { localStorage.setItem('kenesa_set', JSON.stringify(SET)); } catch (e) {}
}
$('fontSel').onchange = e => { SET.font = e.target.value; applySet(); };
$('fillBtn').onclick = () => { SET.fill = SET.fill === false; applySet(); toast(SET.fill ? 'الكلام هيكبر لحد ما يملا الشاشة' : 'الكلام بالحجم العادي'); };
$('szUp').onclick = () => { SET.scale = Math.min(1.6, +(SET.scale + 0.1).toFixed(1)); applySet(); };
$('szDn').onclick = () => { SET.scale = Math.max(0.6, +(SET.scale - 0.1).toFixed(1)); applySet(); };
$('setBtn').onclick = e => { e.stopPropagation(); $('pop').classList.toggle('open'); fillMics(); };
$('pop').onclick = e => e.stopPropagation();
document.addEventListener('click', () => $('pop').classList.remove('open'));

// ---------- library ----------
function item(no, title, sub, fn) {
  const d = document.createElement('div'); d.className = 'item';
  d.innerHTML = `${no !== '' ? `<div class="no">${no}</div>` : ''}<div><div class="t">${esc(title)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}</div>`;
  d.onclick = () => { [...$('results').querySelectorAll('.item')].forEach(x => x.classList.remove('sel')); d.classList.add('sel'); fn(); };
  $('results').appendChild(d); return d;
}
function sec(t) { const d = document.createElement('div'); d.className = 'sec'; d.textContent = t; $('results').appendChild(d); }
function empty(t) { const d = document.createElement('div'); d.className = 'empty'; d.innerHTML = t; $('results').appendChild(d); }
function crumb(parts) {
  const c = $('crumb'); c.innerHTML = '';
  parts.forEach((p, i) => {
    if (i) { const s = document.createElement('span'); s.textContent = '‹'; c.appendChild(s); }
    if (p.fn) { const b = document.createElement('button'); b.textContent = p.t; b.onclick = p.fn; c.appendChild(b); }
    else { const s = document.createElement('span'); s.textContent = p.t; c.appendChild(s); }
  });
}

function browseBooks() {
  st.browse = null; crumb([]); $('results').innerHTML = '';
  const t = SET.testament || 'new';
  const seg = document.createElement('div'); seg.className = 'seg testament';
  [['old', 'العهد القديم'], ['new', 'العهد الجديد']].forEach(([k, l]) => {
    const b = document.createElement('button'); b.textContent = l; if (k === t) b.className = 'on';
    b.onclick = () => { SET.testament = k; applySet(); browseBooks(); };
    seg.appendChild(b);
  });
  $('results').appendChild(seg);
  if (t === 'old') grid(BK.slice(0, 39).map((n, i) => [n[0], () => browseChapters(i)]), true);
  else grid(BK.slice(39).map((n, i) => [n[0], () => browseChapters(i + 39)]), true);
}
function browseChapters(b) {
  st.browse = b; $('results').innerHTML = '';
  crumb([{ t: 'كل الأسفار', fn: browseBooks }, { t: bookName(b) }]);
  sec('اختار الإصحاح');
  grid(B[b].chapters.map((_, c) => [arD(c + 1), () => { loadChapter(b, c, 0); }]));
}
function grid(items, wide) {
  const g = document.createElement('div'); g.className = 'grid';
  if (wide) g.style.gridTemplateColumns = 'repeat(2,1fr)';
  items.forEach(([t, fn]) => { const b = document.createElement('button'); b.textContent = t; b.onclick = fn; g.appendChild(b); });
  $('results').appendChild(g);
}

// any script's digits -> 0-9, and drop invisible direction marks the Arabic keyboard can add
const latinDigits = s => String(s).replace(/\p{Cf}/gu, '').replace(/\p{Nd}/gu, d => String(d.codePointAt(0) & 0xF));
function search() {
  const q = latinDigits($('q').value.trim()); $('results').innerHTML = '';
  if (st.tab === 'today') { crumb([]); showToday(); return; }
  if (st.tab === 'history') { showHistory(); return; }
  if (st.tab === 'hymns') {
    crumb([]);
    const hv = q.match(/^(\d+)\s*[ .\-]\s*(\d+)$/);
    if (hv) { if (H[+hv[1] - 1]) empty(`ترنيمة ${hv[1]} العدد ${hv[2]} — دوس Enter`); else empty('مفيش ترنيمة بالرقم ده'); return; }
    if (/^\d+$/.test(q)) {
      const n = +q;
      const vc = hymnCtxVerses(n);
      if (vc) { empty(`العدد ${n} من ترنيمة ${st.cur.num} — دوس Enter<br><small>عشان تفتح ترنيمة ${n}: دوس Esc الأول</small>`); return; }
      if (H[n - 1]) item(n, plain(H[n - 1].title), 'دوس Enter تعرضها', () => openHymnNum(n));
      else empty('مفيش ترنيمة بالرقم ده<br>الترانيم من 1 لـ ' + H.length);
      return;
    }
    if (!q) { H.forEach(h => item(h.num, plain(h.title), '', () => loadHymn(h.num))); return; }
    const seen = new Set(), res = KE.searchHymnText(q, 40);
    if (!res.length) { empty('مالقيتش ترنيمة فيها الكلام ده'); return; }
    res.forEach(r => {
      if (seen.has(r.num)) return; seen.add(r.num);
      const s = H[r.num - 1].slides[r.i];
      item(r.num, plain(H[r.num - 1].title), `${verseName(s.label)}: ${plain(s.lines.join(' / ')).slice(0, 70)}`, () => loadHymn(r.num, r.i));
    });
  } else {
    if (!q) { browseBooks(); return; }
    if (/^\d+$/.test(q) && st.cur && st.cur.kind === 'bible') { empty(`العدد ${q} من ${bookName(st.cur.b)} ${arD(st.cur.c + 1)} — دوس Enter`); return; }
    const ab = abbrevRef(q);
    if (ab) { sec('الشاهد'); item('', ref(ab.b, ab.c, ab.v), plain(B[ab.b].chapters[ab.c][ab.v]).slice(0, 90) + ' — دوس Enter تعرضها', () => openRef(ab)); return; }
    crumb([{ t: 'كل الأسفار', fn: () => { $('q').value = ''; browseBooks(); } }, { t: 'نتايج البحث' }]);
    const p = KE.parse(q, H, B);
    if (p && p.type === 'verse') { sec('الشاهد'); item('', ref(p.b, p.c, p.v), plain(B[p.b].chapters[p.c][p.v]).slice(0, 90), () => loadChapter(p.b, p.c, p.v)); }
    const res = KE.searchBible(q, 40);
    if (res.length) sec('آيات فيها الكلام ده');
    res.forEach(r => item('', ref(r.b, r.c, r.v), plain(B[r.b].chapters[r.c][r.v]).slice(0, 110), () => loadChapter(r.b, r.c, r.v)));
    if (!res.length && !(p && p.type === 'verse')) empty('مالقيتش حاجة<br>جرّب كلمة تانية أو اكتب الشاهد زي: يوحنا 3 16');
  }
}
function setTab(t) {
  st.tab = t; document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x.dataset.tab === t));
  $('q').value = ''; $('q').placeholder = t === 'hymns' ? 'رقم الترنيمة أو أي كلام منها…' : 'اكتب الشاهد (يوحنا 3 16) أو أي كلام من الآية…';
  document.querySelector('.search').style.display = (t === 'today' || t === 'history') ? 'none' : '';
  search(); if (t === 'hymns' || t === 'bible') $('q').focus();
}

// ---------- meetings: اجتماع اليوم + السجل ----------
// every hymn / verse shown goes into today's meeting (named by the computer's date), saved to disk
let MEET = { meetings: [] }, meetSaveT = null;
const pad = n => String(n).padStart(2, '0');
const todayId = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const meetTitle = d => 'اجتماع ' + d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
function curMeeting() {
  const id = todayId();
  let m = MEET.meetings.find(x => x.day === id && !x.closed);
  if (!m) { const d = new Date(); m = { id: id + '-' + d.getTime(), day: id, title: meetTitle(d), started: d.getTime(), items: [] }; MEET.meetings.unshift(m); }
  return m;
}
function saveMeet() {
  clearTimeout(meetSaveT);
  meetSaveT = setTimeout(() => {
    if (window.bp && window.bp.meetSave) window.bp.meetSave(MEET);
    else try { localStorage.setItem('kenesa_meet', JSON.stringify(MEET)); } catch (e) {}
  }, 400);
}
async function loadMeet() {
  let d = null;
  if (window.bp && window.bp.meetLoad) d = await window.bp.meetLoad();
  else try { d = JSON.parse(localStorage.getItem('kenesa_meet') || 'null'); } catch (e) {}
  if (d && Array.isArray(d.meetings)) MEET = d;
  if (st.tab === 'today' || st.tab === 'history') search();
}
function record(s) {
  if (!s || s.end || !st.cur) return;
  const m = curMeeting(), last = m.items[m.items.length - 1], t = Date.now();
  if (st.cur.kind === 'hymn') {
    const lab = H[st.cur.num - 1].slides[st.live] ? H[st.cur.num - 1].slides[st.live].label : '1';
    if (last && last.k === 'h' && last.num === st.cur.num) { if (!last.v.includes(lab)) last.v.push(lab); last.t2 = t; }
    else m.items.push({ k: 'h', num: st.cur.num, v: [lab], t, t2: t });
  } else {
    const b = st.cur.b, c = st.cur.c, v = st.live;
    if (last && last.k === 'b' && last.b === b && last.c === c && v >= last.from - 1 && v <= last.to + 1) { last.from = Math.min(last.from, v); last.to = Math.max(last.to, v); last.t2 = t; }
    else m.items.push({ k: 'b', b, c, from: v, to: v, t, t2: t });
  }
  saveMeet();
  if (st.tab === 'today') search();
}
const timeOf = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
function itemLabel(it) {
  const noT = x => String(x).replace(/[\u064B-\u0652\u0670]/g, '');
  if (it.k === 'h') return ['ترنيمة ' + it.num + ' — ' + noT(H[it.num - 1].title), it.v.map(verseName).join('، ')];
  const r = bookName(it.b) + ' ' + (it.c + 1) + ':' + (it.from + 1) + (it.to > it.from ? '-' + (it.to + 1) : '');
  return [r, noT(B[it.b].chapters[it.c][it.from]).slice(0, 70)];
}
function openItem(it) {
  if (it.k === 'h') { const i = H[it.num - 1].slides.findIndex(s => s.label === it.v[0] && !s.part); loadHymn(it.num, Math.max(0, i)); }
  else loadChapter(it.b, it.c, it.from);
}
function listItems(m) {
  if (!m.items.length) { empty('لسه مفيش حاجة اتعرضت في الاجتماع ده'); return; }
  m.items.forEach(it => { const [t, s] = itemLabel(it); const d = item(it.k === 'h' ? '<svg class="ic"><use href="#i-music"/></svg>' : '<svg class="ic"><use href="#i-book"/></svg>', t, s, () => openItem(it)); const w = document.createElement('span'); w.className = 'when'; w.textContent = timeOf(it.t); d.appendChild(w); });
}
function showToday() {
  const m = curMeeting(), head = document.createElement('div'); head.className = 'meethead';
  head.innerHTML = `<b>${esc(m.title)}</b>`;
  const nb = document.createElement('button'); nb.className = 'btn'; nb.textContent = 'اجتماع جديد';
  nb.onclick = () => { if (!m.items.length) { toast('الاجتماع ده لسه فاضي'); return; } m.closed = true; curMeeting(); saveMeet(); search(); toast('بدأنا اجتماع جديد'); };
  head.appendChild(nb); $('results').appendChild(head);
  listItems(m);
}
function showHistory(openId) {
  const list = MEET.meetings.filter(m => m.items.length);
  if (openId) {
    const m = MEET.meetings.find(x => x.id === openId); if (!m) return showHistory();
    crumb([{ t: 'كل الاجتماعات', fn: () => { $('results').innerHTML = ''; showHistory(); } }, { t: m.title }]);
    listItems(m); return;
  }
  crumb([]);
  if (!list.length) { empty('لسه مفيش اجتماعات متسجلة'); return; }
  list.forEach(m => item('', m.title, (m.items.length === 1 ? 'حاجة واحدة' : m.items.length + ' حاجات') + ' · بدأ ' + timeOf(m.started), () => { $('results').innerHTML = ''; showHistory(m.id); }));
}

// ---------- heard (voice or typed test) ----------
function verseByText(text) {
  if (KE.words(text).length < 4) return null;
  const rs = KE.searchBible(text, 5), r = rs[0];
  if (!r || r.score < 0.8) return null;
  if (rs[1] && r.score - rs[1].score < 0.1) return null;
  return { type: 'verse', b: r.b, c: r.c, v: r.v, score: r.score, byText: true };
}
function heard(text, fromMic) {
  let p = KE.parse(text, H, B);
  if (!p && fromMic) {                                   // just a number: decide by what is on the screen
    const bn = KE.bareNumber(text);
    if (bn && bn.n >= 1) {
      const auto = st.mode === 'auto';
      if (st.cur && st.cur.kind === 'bible' && B[st.cur.b].chapters[st.cur.c][bn.n - 1]) {
        loadChapter(st.cur.b, st.cur.c, bn.n - 1); setLast(ref(st.cur.b, st.cur.c, bn.n - 1) + (auto && !st.prayer ? ' — اتعرضت' : ' — جاهزة، دوس اعرض')); if (auto && !st.prayer) play(); return true;
      }
      if (st.cur && st.cur.kind === 'hymn' && (bn.verseWord || bn.n <= 12)) {
        const i = H[st.cur.num - 1].slides.findIndex(s => s.label === String(bn.n) && !s.part);
        if (i >= 0) { setCue(i); setLast(`ترنيمة ${st.cur.num} ${verseName(String(bn.n))}` + (auto ? ' — اتعرضت' : ' — جاهزة، دوس اعرض')); if (auto || onAir()) play(); return true; }
      }
      if (!bn.verseWord && H[bn.n - 1]) { p = { type: 'hymn', num: bn.n, verse: 1 }; }
    }
  }
  if (fromMic && !st.prayer && (!p || (p.type === 'lyric' && p.unsure))) {      // part of a verse said out loud
    const v = verseByText(text);
    if (v && (!p || v.score > p.score)) p = v;
  }
  if (!p) { setLast(fromMic ? `سمعت: "${text}"` : `"${text}" — مافهمتش`); if (!fromMic) toast('مافهمتش الطلب'); return false; }
  const auto = st.mode === 'auto';
  if (p.type === 'hymn') {
    if (st.tab !== 'hymns') setTab('hymns');
    const h = H[p.num - 1]; let idx = h.slides.findIndex(s => s.label === String(p.verse) && !s.part); if (idx < 0) idx = 0;
    loadHymn(p.num, idx);
    setLast(`ترنيمة ${p.num} ${verseName(String(p.verse))}` + (auto ? ' — اتعرضت' : ' — جاهزة، دوس اعرض'));
    if (auto) play();
  } else if (p.type === 'verse') {
    if (fromMic && p.byText && !switchOk('v' + p.b + ':' + p.c + ':' + p.v, ref(p.b, p.c, p.v))) return true;
    loadChapter(p.b, p.c, p.v);
    const go = auto && !st.prayer && (!p.byText || p.score >= 0.9);
    setLast(ref(p.b, p.c, p.v) + (go ? ' — اتعرضت' : st.prayer ? ' — جاهزة (وقت الصلاة: مش هتظهر لوحدها)' : ' — جاهزة، دوس اعرض'));
    if (go) play();
  } else if (p.type === 'lyric') {
    if (st.cur && st.cur.kind === 'hymn' && st.cur.num === p.num) {        // same hymn: just go to that part
      if (p.i !== st.live) { setCue(p.i); if (auto && onAir()) play(); }
      setLast(`ترنيمة ${p.num} — ${st.slides[p.i] ? st.slides[p.i].lab : ''}`); return true;
    }
    if (fromMic && !switchOk('h' + p.num, 'ترنيمة ' + p.num)) return true;
    loadHymn(p.num, p.i);
    if (p.unsure) { setLast(`يمكن ترنيمة ${p.num}؟ (أو ${p.alts.join('، ')}) — اتأكد ودوس اعرض`); toast('مش متأكد — جهزتها بس'); return true; }
    setLast(`ترنيمة ${p.num} من الكلام` + (auto ? ' — اتعرضت' : ' — جاهزة، دوس اعرض'));
    if (auto) play();
  }
  return true;
}

// ---------- events ----------
let numBuf = '', numTimer = null, hymnCtx = 0;
// after a hymn was opened by number: small numbers = its verses (Esc = next number opens a hymn again)
function hymnCtxVerses(n) {
  if (!hymnCtx || st.tab !== 'hymns' || !st.cur || st.cur.kind !== 'hymn' || st.cur.num !== hymnCtx) return 0;
  const i = H[hymnCtx - 1].slides.findIndex(s => s.label === String(n));
  return i >= 0 ? i + 1 : 0;
}
function openHymnNum(n) {
  const vi = hymnCtxVerses(n);
  if (vi) { setCue(vi - 1); play(); setLast(`ترنيمة ${st.cur.num} العدد ${n} — اتعرض`); return true; }
  if (!H[n - 1]) { toast('مفيش ترنيمة بالرقم ده'); return false; }
  if (st.tab !== 'hymns') setTab('hymns');
  loadHymn(n); play(); hymnCtx = n; setLast(`ترنيمة ${n} — اتعرضت · رقم + Enter = العدد`); return true;
}
// Bible: "١كو ٣ ١", "تك 1 1", "يو ٣: ١٦", "مز 23" (Van Dyke abbreviations or full names)
const ABBR = { 'تك':0,'خر':1,'لا':2,'عد':3,'تث':4,'يش':5,'قض':6,'را':7,'1صم':8,'2صم':9,'1مل':10,'2مل':11,'1اخ':12,'2اخ':13,'عز':14,'نح':15,'اس':16,'اي':17,'مز':18,'ام':19,'جا':20,'نش':21,'اش':22,'ار':23,'مرا':24,'حز':25,'دا':26,'هو':27,'يوء':28,'يوئ':28,'عا':29,'عو':30,'يون':31,'مي':32,'نا':33,'حب':34,'صف':35,'حج':36,'زك':37,'مل':38,
  'مت':39,'مر':40,'لو':41,'يو':42,'اع':43,'رو':44,'1كو':45,'2كو':46,'غل':47,'اف':48,'في':49,'كو':50,'1تس':51,'2تس':52,'1تي':53,'2تي':54,'تي':55,'فل':56,'عب':57,'يع':58,'1بط':59,'2بط':60,'1يو':61,'2يو':62,'3يو':63,'يه':64,'رؤ':65 };
function bookByName(w) {
  const raw = w.replace(/\s+/g, '');
  if (ABBR[raw] !== undefined) return ABBR[raw];
  if (/^يو[ءئ]$|^يؤ$/.test(raw)) return 28;                      // Joel (يو alone = John)
  const n = KE.norm(raw).replace(/\s+/g, '');
  for (const k in ABBR) if (!/[ءئؤ]/.test(k) && KE.norm(k).replace(/\s+/g, '') === n) return ABBR[k];
  const full = KE.norm(w);
  for (let i = 0; i < BK.length; i++) if (BK[i].some(x => KE.norm(x) === full)) return i;
  return -1;
}
function abbrevRef(q) {
  const m = latinDigits(q).replace(/[ً-ْ]/g, '').trim().match(/^([1-3]?\s*[ء-ي][ء-ي\s]*?)\s*[.:،,-]?\s*(\d+)(?:\s*[\s.:،,-]\s*(\d+))?\s*$/);
  if (!m) return null;
  const b = bookByName(m[1]); if (b < 0) return null;
  const c = +m[2] - 1, v = m[3] ? +m[3] - 1 : 0;
  if (!B[b].chapters[c] || B[b].chapters[c][v] === undefined) return null;
  return { b, c, v };
}
function openRef(r) { if (st.tab !== 'bible') setTab('bible'); loadChapter(r.b, r.c, r.v); play(); setLast(ref(r.b, r.c, r.v) + ' — اتعرضت · رقم + Enter = آية تانية'); }
// "182 2" / "182.2" = hymn 182 verse 2
function openHymnVerse(n, v) {
  if (!H[n - 1]) { toast('مفيش ترنيمة بالرقم ده'); return false; }
  if (st.tab !== 'hymns') setTab('hymns');
  loadHymn(n);
  const i = H[n - 1].slides.findIndex(s => s.label === String(v));
  if (i < 0) { play(); setLast(`ترنيمة ${n} مافيهاش العدد ${v} — اتعرضت من الأول`); return true; }
  setCue(i); play(); setLast(`ترنيمة ${n} العدد ${v} — اتعرضت`); return true;
}
function numToast() {
  const m = numBuf.match(/^(\d+) ?(\d*)$/); if (!m) return;
  toast(m[2] ? `ترنيمة ${m[1]} العدد ${m[2]} … دوس Enter` : numBuf.endsWith(' ') ? `ترنيمة ${m[1]} العدد … اكتب الرقم` : (hymnCtxVerses(+m[1]) ? 'العدد ' : 'ترنيمة ') + m[1] + ' … دوس Enter');
}
function numKey(e) {
  const k = latinDigits(e.key || ''); const d = /^[0-9]$/.test(k) ? k : null;
  if (d !== null) {
    if (numBuf.includes(' ') ? numBuf.split(' ')[1].length < 2 : numBuf.length < 3) numBuf += d;
    clearTimeout(numTimer); numTimer = setTimeout(() => { numBuf = ''; }, 5000);
    numToast(); return true;
  }
  // space / dot after the hymn number = "and the verse is…"
  if (numBuf && !numBuf.includes(' ') && (e.code === 'Space' || e.key === '.' || e.code === 'NumpadDecimal' || e.key === '-')) {
    numBuf += ' '; clearTimeout(numTimer); numTimer = setTimeout(() => { numBuf = ''; }, 5000); numToast(); return true;
  }
  if (numBuf && e.key === 'Enter') {
    const [a, b] = numBuf.trim().split(' '); numBuf = ''; clearTimeout(numTimer);
    if (b) openHymnVerse(+a, +b); else openHymnNum(+a);
    return true;
  }
  if (numBuf && (e.key === 'Escape' || e.key === 'Backspace')) { numBuf = e.key === 'Backspace' ? numBuf.slice(0, -1) : ''; if (numBuf) numToast(); else toast('اتلغى'); return true; }
  if (!numBuf && e.key === 'Escape' && hymnCtx) { hymnCtx = 0; toast('الرقم الجاي هيفتح ترنيمة'); return true; }
  return false;
}
const isB = e => e.code === 'KeyB' || /^(b|B|لا|ﻻ|ﻵ|ﻷ|ﻹ)$/.test(e.key);
function onKey(e) {
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'SELECT') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (isB(e)) { e.preventDefault(); blank(); return; }          // B (also "لا" on the Arabic keyboard)
  // Bible tab: anything typed goes into the search box (numbers too: "١كو ٣ ١", or a verse number)
  if (st.tab === 'bible' && e.key.length === 1 && e.code !== 'Space') { $('q').value = ''; $('q').focus(); return; }
  if (numKey(e)) { if (e.preventDefault) e.preventDefault(); return; }
  // Hymns tab: Arabic / English letters go into the search box
  if (st.tab === 'hymns' && e.key.length === 1 && /[؀-ۿA-Za-z]/.test(e.key)) { $('q').value = ''; $('q').focus(); return; }
  // verses: ↓ ↑ walk the list, Enter shows the verse
  if (st.cur && st.cur.kind === 'bible' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setCue(st.cue + (e.key === 'ArrowDown' ? 1 : -1)); return; }
  if (e.key === 'Enter' && st.cur) { e.preventDefault(); play(); return; }
  if (e.code === 'Space') { e.preventDefault(); play(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); step(1); }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); step(-1); }
}
document.addEventListener('keydown', onKey);
let qT; $('q').addEventListener('input', () => { [...$('results').querySelectorAll('.kb')].forEach(x => x.classList.remove('kb')); clearTimeout(qT); qT = setTimeout(search, 250); });
$('q').addEventListener('keydown', e => {
  if (e.key === 'Escape') { $('q').blur(); if (hymnCtx && !$('q').value) { hymnCtx = 0; toast('الرقم الجاي هيفتح ترنيمة'); } return; }
  // ↓ ↑ walk the results, Enter opens the one you are on
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const its = [...$('results').querySelectorAll('.item')]; if (!its.length) return;
    e.preventDefault();
    let i = its.findIndex(x => x.classList.contains('kb'));
    i = i < 0 ? (e.key === 'ArrowDown' ? 0 : its.length - 1) : Math.max(0, Math.min(its.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    its.forEach(x => x.classList.remove('kb')); its[i].classList.add('kb'); its[i].scrollIntoView({ block: 'nearest' });
    return;
  }
  if (e.key !== 'Enter') return;
  const q = latinDigits($('q').value.trim()); clearTimeout(qT);
  let done = false;
  if (st.tab === 'hymns' && /^\d+$/.test(q)) done = openHymnNum(+q);
  else if (st.tab === 'hymns' && /^(\d+)\s*[ .\-]\s*(\d+)$/.test(q)) { const m = q.match(/^(\d+)\s*[ .\-]\s*(\d+)$/); done = openHymnVerse(+m[1], +m[2]); }
  else if (st.tab === 'bible' && /^\d+$/.test(q) && st.cur && st.cur.kind === 'bible') {
    const v = +q - 1;
    if (B[st.cur.b].chapters[st.cur.c][v] !== undefined) { setCue(v); play(); setLast(ref(st.cur.b, st.cur.c, v) + ' — اتعرضت'); done = true; } else toast('الإصحاح ده مافيهوش العدد ده');
  } else if (st.tab === 'bible' && abbrevRef(q)) { openRef(abbrevRef(q)); done = true; }
  else {
    const f = $('results').querySelector('.item.kb') || $('results').querySelector('.item');
    if (f) { const before = key(); f.click(); if (key() !== before && st.cur) { play(); $('q').blur(); } }
  }
  // ready for the next number / arrows / B
  if (done) { $('q').value = ''; $('q').blur(); search(); }
});
$('cmd').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.value.trim()) { heard(latinDigits(e.target.value.trim())); e.target.select(); } });
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab));
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
  st.mode = b.dataset.mode; document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
  toast(st.mode === 'auto' ? 'أوتوماتيك: أي طلب هيظهر على الشاشة على طول' : 'يدوي: هجهزلك وانت تدوس اعرض');
});
$('prayerBtn').onclick = () => { st.prayer = !st.prayer; $('prayerBtn').classList.toggle('on', st.prayer); toast(st.prayer ? 'وقت الصلاة: الآيات مش هتظهر لوحدها' : 'خلص وقت الصلاة'); };
$('followBtn').onclick = () => { SET.follow = !SET.follow; applySet(); $('followBtn').classList.toggle('on', SET.follow); toast(SET.follow ? 'هقلب الشرايح لوحدي مع الترنيم' : 'التقليب مع الترنيم اتقفل'); };
$('followBtn').classList.toggle('on', SET.follow);
$('openOut').onclick = openOut;
$('blankBtn').onclick = blank;
$('playBtn').onclick = play;
$('nextBtn').onclick = () => step(1);
$('prevBtn').onclick = () => step(-1);
// ---------- mic ----------
function micUI(state, x) {
  const b = $('micBtn'); b.classList.remove('on', 'loading', 'err');
  b.querySelector('use').setAttribute('href', state === 'on' ? '#i-mic' : '#i-micoff');
  if (state === 'loading') { b.classList.add('loading'); $('micLbl').textContent = x && x.pct ? `بيجهز الميكروفون… ${x.pct}%` : 'بيجهز الميكروفون… (أول مرة بس بياخد وقت)'; }
  else if (state === 'on') { b.classList.add('on'); if (x && x.exact) micUI.exact = x.exact; $('micLbl').textContent = 'الميكروفون شغال · ' + (micUI.exact === 'ready' ? 'دقيق ✓' : micUI.exact === 'error' ? 'الدقيق واقف ✗' : 'الدقيق بيحمّل…'); }
  else if (state === 'error') { b.classList.add('err'); $('micLbl').textContent = (x && x.msg) || 'في مشكلة في الميكروفون'; }
  else $('micLbl').textContent = 'تشغيل الميكروفون';
}
Mic.on('status', micUI);
Mic.on('level', v => { $('lvl').style.width = Math.round(v * 100) + '%'; });
// ---------- real-time listening ----------
// partial = the sentence while it is being spoken; act as soon as it clearly matches, then forget it (Mic.reset)
let cooldownUntil = 0, cmdTimer = null, lastBibleAt = 0, lastAuto = { key: '', at: 0 };
// Vosk writes odd symbols (e.g. "إUٌٍأ") when it hears a number: never show them, but use them as a hint
const JUNKW = w => /[A-Za-z\u064B-\u0652]/.test(w.replace(/^[\u0621-\u064A]+$/, ''));
const cleanVosk = t => t.split(' ').filter(w => w && !/[A-Za-z]/.test(w)).join(' ');
const hasNumberHint = t => t.split(' ').some(w => /[A-Za-z]/.test(w));
function earState(s) { const e = $('earState'); if (!e) return; e.className = 'ear ' + s; e.textContent = s === 'think' ? 'بفهم…' : s === 'found' ? 'لقيت ✓' : 'سامع'; if (s === 'found') { clearTimeout(earState.t); earState.t = setTimeout(() => earState(Object.keys(pendingExact).length ? 'think' : 'listen'), 1600); } }
function showHeard(t) { const c = cleanVosk(t); $('last').innerHTML = 'بسمع: <b>' + esc(c.split(' ').slice(-10).join(' ') || '…') + '</b>'; }
function acted(k, fromExact) {
  earState('found'); lastAuto = { key: k || '', at: Date.now() };
  if (fromExact) return;                     // Whisper result = old audio: keep listening to what is being said now
  Mic.reset(); cooldownUntil = Date.now() + 900; clearTimeout(cmdTimer); clearTimeout(cmdTimer2); cmdAt = null; utterStart = null;
}
const recently = k => lastAuto.key === k && Date.now() - lastAuto.at < 20000;
// Vosk gives the words live; for exact numbers / verse text the same sentence is re-heard by Whisper ("exact")
let utterStart = null, cmdAt = null, cmdTimer2 = null, pendingExact = {};
const CMD_RX = /(ترن|ترانيم|اصحاح|صحاح|مزمور|مزامير|سفر|رساله|انجيل)/;
// Vosk often garbles the keyword itself ("ترنمت"): accept anything close to it
const looksLikeCmd = t => { const w = KE.norm(t).split(' '); return CMD_RX.test(KE.norm(t)) || w.some(x => x.length >= 4 && (KE.lev(x, 'ترنيمه', 2) <= 2 || KE.lev(x, 'الاصحاح', 2) <= 2)); };
// One Whisper request per spoken sentence (plus one more only if the sentence grew after we asked).
// Results of OLD audio never reset the recognizer, so a second request said right after is not lost.
let numCueT = null, lastFinalAt = 0, utterWords = 0, asked = null;   // asked = { start, words, id }
let holdT = null, carry = null, lastAskAt = 0, coveredUntil = 0;
// Whisper's well-known inventions on silence / music
const HALLU = /^(شكرا|شكرا لكم|شكرا جزيلا|شكرا للمشاهده|اشتركوا|اشترك|ترجمه|موسيقي|السلام عليكم)$/;
const isRequest = t => { const p = KE.parse(t, H, B); return !!(p && (p.type === 'hymn' || (p.type === 'verse' && !p.byText))); };
Mic.on('partial', raw => {
  if (holdT) { clearTimeout(holdT); holdT = null; }        // still talking after "ترنيمة …": same request
  if (utterStart === null) utterStart = Math.max(performance.now() - 2000, lastFinalAt);
  showHeard(raw);
  const t = cleanVosk(raw);
  utterWords = raw.split(' ').filter(Boolean).length;
  if (Date.now() < cooldownUntil) return;
  if (Mic.exactReady && hasNumberHint(raw) && cmdAt === null) cmdAt = utterStart;   // a number is being said: Whisper gets the whole sentence at the pause
  if (Mic.exactReady && cmdAt === null && (looksLikeCmd(t) || (KE.parse(t, H, B) || {}).type === 'verse')) {
    cmdAt = utterStart; clearTimeout(cmdTimer2);
    cmdTimer2 = setTimeout(() => askExact('cmd'), 4000);                 // talking on without a pause: ask anyway
  }
  if (t) onLive(t, false);
});
Mic.on('text', raw => {
  showHeard(raw); clearTimeout(numCueT);
  const t = cleanVosk(raw);
  utterWords = raw.split(' ').filter(Boolean).length;
  if (utterStart === null) utterStart = Math.max(performance.now() - 3500, lastFinalAt);   // Vosk sometimes gives the sentence with no partials
  if (Mic.exactReady && (hasNumberHint(raw) || looksLikeCmd(t)) && cmdAt === null) cmdAt = utterStart;
  const start = utterStart; utterStart = null; lastFinalAt = performance.now();
  if (Date.now() < cooldownUntil) { cmdAt = null; asked = null; return; }
  if (cmdAt !== null) {
    // the sentence stopped right after "ترنيمة" / "العدد": the number is still coming -> wait a moment
    const lw = KE.norm(t).split(' ').pop() || '';
    if (!hasNumberHint(raw) && (KE.isHymnWord(lw) || /^(ال)?(عدد|اصحاح|رقم)$/.test(lw))) {
      clearTimeout(holdT); holdT = setTimeout(() => { holdT = null; askExact('cmd', null, true, t); asked = null; }, 1300); return;
    }
    askExact('cmd', null, true, t); asked = null; return;
  }
  onLive(t, true);
  // nothing matched from the live words, but it looks like a request / a verse -> let Whisper hear it exactly
  if (Mic.exactReady && Date.now() >= cooldownUntil && start !== null) {
    const n = KE.words(t).length;
    if ((n >= 1 && n <= 6) || (n >= 3 && looksClose(t)) || following() || followingVerses()) askExact('text', start, true, t);
  }
  asked = null;
});
Mic.on('exact', (t, id, ms) => {
  const req = pendingExact[id]; delete pendingExact[id];
  if (!Object.keys(pendingExact).length) earState('listen');
  if (window.bp && window.bp.log) window.bp.log('exact ' + (req && req.why) + ' ' + ms + 'ms: ' + t);
  if (t && HALLU.test(KE.norm(t))) t = '';
  if (!req) return;
  // a newer request for the same sentence is on its way -> this one heard only part of it
  if (Object.values(pendingExact).some(r => r.start === req.start && r.id > id)) return;
  if (!t) { if (req.vosk && isRequest(req.vosk) && heard(req.vosk, true)) acted('x' + req.vosk, true); return; }
  $('last').innerHTML = 'سمعت: <b>' + esc(t) + '</b>';
  if (req.why === 'text' && Date.now() < cooldownUntil) return;
  const asks = isRequest(t);
  if (!asks && following() && followAt(KE.words(t), req.sent || performance.now() - (ms || 2500), true)) return;   // singing the hymn on screen
  if (req.why === 'follow' && !asks && following()) { heard(t, true); return; }        // maybe another hymn (needs to be heard twice)
  if (!asks && followingVerses() && followVerseExact(t)) return;
  if (heard(t, true)) { carry = null; acted('x' + t, true); return; }
  // "ترنيمة" was heard but the number came in the next breath: next request starts from here
  if (looksLikeCmd(t) || /^(ال)?(عدد|اصحاح)/.test(KE.norm(t).split(' ').pop() || '')) carry = { start: req.start, until: performance.now() + 6000 };
  else if (req.vosk && isRequest(req.vosk) && heard(req.vosk, true)) acted('x' + req.vosk, true);
});
// sentences the live recognizer gave nothing for (singing, a quiet voice): Whisper hears them anyway
Mic.on('seg', (s, e, why) => {
  if (!Mic.exactReady || holdT || following()) return;          // while following, the follow loop asks Whisper
  setTimeout(() => {
    if (holdT || coveredUntil >= e - 400 || Object.keys(pendingExact).length >= 2) return;
    if (!following() && !followingVerses() && why === 'long' && !st.prayer && Object.keys(pendingExact).length) return;
    const from = carry && performance.now() < carry.until ? Math.min(carry.start, s) : s;
    const id = Mic.exactSince(from);
    if (id) { pendingExact[id] = { why: 'vad', start: from, id, sent: performance.now() }; coveredUntil = performance.now(); lastAskAt = coveredUntil; earState('think'); if (window.bp && window.bp.log) window.bp.log('-> whisper (voice ' + why + ')'); }
  }, why === 'pause' ? 450 : 0);
});
function askExact(why, start, isFinal, vosk) {
  clearTimeout(cmdTimer2);
  let from = why === 'cmd' ? cmdAt : start; cmdAt = null;
  if (from == null) return;
  if (carry && performance.now() < carry.until) from = Math.min(from, carry.start);
  if (isFinal && coveredUntil > performance.now() - 900 && Object.keys(pendingExact).length) return;   // the voice detector just sent this sentence
  // already asked for this sentence and nothing new was said since -> don't ask twice
  if (!isFinal && asked && asked.start === from && utterWords <= asked.words) return;
  const id = Mic.exactSince(from);
  if (id) { pendingExact[id] = { why, start: from, id, vosk: vosk || '', sent: performance.now() }; asked = { start: from, words: utterWords, id }; coveredUntil = lastAskAt = performance.now(); earState('think'); if (!isFinal) cmdAt = from; }
  else if (window.bp && window.bp.log) window.bp.log('askExact ' + why + ' skipped (exactReady=' + Mic.exactReady + ')');
}
function looksClose(t) {
  const r = KE.searchHymnText(t, 1)[0];
  if (r && r.score >= 0.5) return true;
  if (st.prayer) return false;
  const v = KE.searchBible(t, 1)[0];
  return !!(v && v.score >= 0.5);
}

const following = () => SET.follow && st.mode === 'auto' && st.cur && st.cur.kind === 'hymn' && onAir();
const followingVerses = () => SET.follow && st.mode === 'auto' && st.cur && st.cur.kind === 'bible' && onAir();
let follow = { key: null, live: -1, endTimer: null, lastAt: 0 };
// a hymn is on screen and the mic hears words of ANOTHER hymn / a verse: hear it twice (two different moments) before switching
const pendingSwitch = {};
function switchOk(k, what) {
  if (!(onAir() && st.cur && st.cur.kind === 'hymn')) return true;
  const t = pendingSwitch[k], now = Date.now();
  if (t && now - t >= 3500 && now - t < 25000) { delete pendingSwitch[k]; return true; }
  if (!t || now - t >= 25000) { pendingSwitch[k] = now; setLast('سامع ' + what + '؟ لو اتكررت هقلب عليها'); }
  return false;
}
function slideWords(i) {
  const h = H[st.cur.num - 1], s = h.slides[i];
  return s ? s.lines.map(l => KE.words(l)) : null;
}
function flipTo(i, why) {
  if (!following()) return;
  if (i < 0 || i >= st.slides.length || i === st.live) return;
  clearTimeout(follow.endTimer); follow.endTimer = null; clearTimeout(trk.timer); trk.timer = null; trk.flipAt = performance.now();
  setCue(i); play(); setLast('قلبت مع الترنيم ← ' + st.slides[i].lab + (why ? ' (' + why + ')' : '')); Mic.reset();
}
// ── follow the singing: know which line is being sung, learn the speed, flip during the last line ──
// trk: where we are in the hymn on screen (slide, line, how far into the line, at what time) + seconds per line
const trk = { key: null, slide: -1, line: -1, frac: 0, at: 0, dur: 3.2, timer: null, grp: {} };
function trkReset() { clearTimeout(trk.timer); Object.assign(trk, { key: key(), slide: st.live, line: -1, frac: 0, at: 0, timer: null, grp: {} }); }
// how many times each line is sung: "(…)٢" around lines = those lines twice
function lineReps(j) {
  const raw = H[st.cur.num - 1].slides[j]; if (!raw) return [];
  const w = raw.lines.map(() => 1), open = [];
  raw.lines.forEach((l, i) => {
    for (let k = 0; k < l.length; k++) {
      if (l[k] === '(') open.push(i);
      else if (l[k] === ')') {
        const m = l.slice(k + 1).match(/^\s*([0-9٠-٩])/), from = open.length ? open.pop() : i;
        const n = m ? ('٠١٢٣٤٥٦٧٨٩'.indexOf(m[1]) >= 0 ? '٠١٢٣٤٥٦٧٨٩'.indexOf(m[1]) : +m[1]) : 1;
        if (n > 1) for (let x = from; x <= i; x++) w[x] *= n;
      }
    }
  });
  return w.map(x => Math.min(x, 4));
}
// words heard (the last one sung at time `at`) -> best place in the hymn on screen
function locate(words, at) {
  const tail = words.slice(-5); if (tail.length < 2) return null;
  const L = st.live, c = [];
  for (let j = 0; j < st.slides.length; j++) {
    const sw = slideWords(j); if (!sw) continue;
    const before = j > 0 && slideWords(j - 1) ? (slideWords(j - 1).slice(-1)[0] || []) : [];
    sw.forEach((line, i) => {
      if (!line.length) return;
      const prev = i > 0 ? sw[i - 1] : before;
      const s = Math.max(KE.textScore(tail.slice(-Math.min(4, line.length + 1)), line), KE.textScore(tail, prev.concat(line)) - 0.03);
      c.push({ j, i, s, line });
    });
  }
  if (!c.length) return null;
  const bs = Math.max(...c.map(x => x.s));
  // the same words in a chorus that repeats: take the nearest place from where we are now
  const near = c.filter(x => x.s >= bs - 0.06);
  // just after a flip the audio may still be the end of the slide before (same chorus later must not win)
  const R = L > 0 && at < (trk.flipAt || 0) + trk.dur * 1000 * 1.5 ? L - 1 : L;
  const here = x => x.j > R || (x.j === R && x.i >= (R === L && trk.slide === L ? Math.max(0, trk.line) : 0));
  const p = near.find(here) || near.find(x => x.s === bs);
  // how far into the line: the last word heard
  // how far into the line: line word that lines up with the end of what was heard (longest run backwards)
  let k = -1, kr = 0;
  for (let x = 0; x < p.line.length; x++) {
    let r = 0; while (r <= x && r < tail.length && KE.wordScore(tail[tail.length - 1 - r], p.line[x - r]) >= 0.7) r++;
    if (r > kr) { kr = r; k = x; }
  }
  p.frac = k >= 0 ? (k + 1) / p.line.length : 0.5;
  return p;
}
// seconds left until this slide is sung to the end
function slideLeft(j, i, frac, at) {
  const reps = lineReps(j), n = reps.length; let left = 0;
  for (let x = i + 1; x < n; x++) left += reps[x];
  let cur = reps[i] || 1;
  if (cur > 1) {                                       // a repeated line: first time or second time?
    const g = trk.grp[j + ':' + i];
    if (g && at - g > trk.dur * 1000 * 0.8) cur = 1; else if (!g) trk.grp[j + ':' + i] = at;
  }
  return (left + cur - frac) * trk.dur;
}
function plan(j, i, frac, at) {
  clearTimeout(trk.timer); trk.timer = null;
  const n = (slideWords(j) || []).length, next = j + 1; if (!st.slides[next]) return;
  const isEnd = st.slides[next].end;
  if (i < n - 2 && !isEnd) return;                     // too early to guess; wait until we are near the end
  const left = slideLeft(j, i, frac, at);
  // flip while the last line is being sung (people read ahead); the black screen at the end comes after it
  const lead = isEnd ? -1.5 : Math.min(0.55 * trk.dur, 1.8);
  const due = at + (left - lead) * 1000, wait = due - performance.now();
  if (isEnd && i < n - 1) return;
  trk.timer = setTimeout(() => {
    if (!following() || st.live !== j) return;
    flipTo(next, isEnd ? 'خلصت الترنيمة' : 'آخر سطر');
    trk.slide = next; trk.line = -1; trk.frac = 0; trk.at = performance.now();
  }, Math.max(0, wait));
}
// heard words of the hymn on screen (at = when the last word was sung). Returns false if it is not this hymn.
function followAt(words, at, strong) {
  if (trk.key !== key()) trkReset();
  const p = locate(words, at); if (!p || p.s < (strong ? 0.6 : 0.66)) return false;
  const L = st.live; earState('found');
  // audio from before our last flip (we flip a bit early on purpose): the previous slide is not news
  if (p.j < L && at < (trk.flipAt || 0) + trk.dur * 1000 * 1.5) return true;
  if (p.j !== L) {
    // we are behind (next slide already being sung) or somebody went back to another part
    if (strong ? ((p.j > L && p.j <= L + 2) || p.s >= 0.8) : (p.j === L + 1 && p.s >= 0.75)) {
      flipTo(p.j, 'سمعت الكلام'); Object.assign(trk, { slide: p.j, line: p.i, frac: p.frac, at, grp: {} }); plan(p.j, p.i, p.frac, at);
    }
    return true;
  }
  if (trk.slide === L && trk.line >= 0 && at > trk.at + 400) {
    const reps = lineReps(L); let lines = (1 - trk.frac) + p.frac;
    for (let x = trk.line + 1; x < p.i; x++) lines += 1;
    if (p.i > trk.line && lines > 0.4) { const d = (at - trk.at) / 1000 / lines; if (d > 1.2 && d < 8) trk.dur = trk.dur * 0.6 + d * 0.4; }
    if (p.i < trk.line && !(reps[p.i] > 1)) return true;                 // older audio: ignore going back
  }
  Object.assign(trk, { slide: L, line: p.i, frac: p.frac, at });
  plan(L, p.i, p.frac, at);
  return true;
}
// while a hymn is on screen and people sing: ask Whisper about the last 4.5 s again and again
setInterval(() => {
  if (!following() || !Mic.exactReady || holdT) return;
  if (Object.keys(pendingExact).length) return;
  if (performance.now() - Mic.voiceAt > 1200) return;
  const now = performance.now(), id = Mic.exactSince(now - 4500);
  if (id) { pendingExact[id] = { why: 'follow', start: now - 4500, id, sent: now }; coveredUntil = now; }
}, 250);
function followVerseExact(t) {
  const q = KE.words(t); if (q.length < 3) return false;
  const ch = B[st.cur.b].chapters[st.cur.c], L = st.live;
  const sc = i => ch[i] ? KE.textScore(q.slice(-8), KE.words(ch[i])) : 0;
  const sCur = sc(L), s1 = sc(L + 1), s2 = sc(L + 2);
  const j = s2 > s1 + 0.1 ? L + 2 : L + 1, sj = Math.max(s1, s2);
  if (sj >= 0.6 && sj > sCur + 0.08) { setCue(j); play(); setLast('قلبت مع القراية ← ' + ref(st.cur.b, st.cur.c, j)); earState('found'); return true; }
  return sCur >= 0.6;
}
function onLive(text, final) {
  clearTimeout(cmdTimer);
  // 1) a spoken request ("ترنيمة 184 العدد التاني", "رومية 1 12"): wait until the number is finished
  const p = KE.parse(text, H, B);
  if (p && (p.type === 'hymn' || (p.type === 'verse' && !p.byText))) {
    if (Mic.exactReady) return;                        // Whisper will hear the exact number

    const fire = () => { if (heard(text, true)) acted(JSON.stringify(p)); };
    const last = KE.norm(text).split(' ').pop() || '';
    const unfinished = /^(و|ال)?(مي|ماي|مائ|مئ|ميت|ميتين|مائتين|تلتمي|ثلاثمائ|ثلاثمئ)/.test(last) || last === 'و' || /^(رقم|العدد|عدد|الاصحاح|اصحاح)$/.test(last);
    if (final) fire(); else cmdTimer = setTimeout(fire, unfinished ? 1300 : 650);
    return;
  }
  // 2) a hymn is on the screen: follow the singing
  if (following()) {
    followAt(KE.words(text), performance.now(), false);
    const q = KE.words(text).slice(-6), mine = q.length >= 4 ? Math.max(0, ...st.slides.map((x, j) => { const w = slideWords(j); return w && w.length ? KE.textScore(q, w.flat()) : 0; })) : 1;
    if (mine >= 0.45) return;                                   // still this hymn
  }
  // 2b) a verse is on the screen and the preacher reads on: move to the next verse when it starts
  if (followingVerses()) {
    const q = KE.words(text).slice(-5);
    if (q.length >= 3) {
      const ch = B[st.cur.b].chapters[st.cur.c], L = st.live;
      const cur = KE.words(ch[L] || ''), nx = KE.words(ch[L + 1] || '');
      if (nx.length) {
        const sNext = KE.textScore(q, nx.slice(0, 6)), sCur = KE.textScore(q, cur);
        if (sNext >= 0.6 && sNext > sCur + 0.08) { setCue(L + 1); play(); setLast('قلبت مع القراية ← ' + ref(st.cur.b, st.cur.c, L + 1)); acted('vf' + L); return; }
      }
    }
  }
  const W = text.split(' ').filter(Boolean);
  const tails = ns => ns.filter(n => n <= W.length).map(n => W.slice(-n).join(' '));
  const recent = W.slice(-12).join(' ');
  // 3) someone starts singing / saying a hymn line (also during prayer) — try the last 4..10 words
  let r = null, rs = [];
  for (const t of tails([4, 6, 8, 10])) {
    const x = KE.searchHymnText(t, 10);
    if (x[0] && (!r || x[0].score > r.score)) { r = x[0]; rs = x; }
  }
  if (r) {
    const second = rs.find(x => x.num !== r.num);
    if (r.score >= 0.78 && (!second || r.score - second.score >= 0.12) && !recently('h' + r.num) && !(st.cur && st.cur.kind === 'hymn' && st.cur.num === r.num)) {
      if (!switchOk('h' + r.num, 'ترنيمة ' + r.num)) return;
      loadHymn(r.num, r.i);
      const auto = st.mode === 'auto';
      setLast(`ترنيمة ${r.num} من الكلام` + (auto ? ' — اتعرضت' : ' — جاهزة، دوس اعرض'));
      if (auto) play();
      acted('h' + r.num); return;
    }
  }
  // 4) part of a verse said out loud (not during prayer)
  if (!st.prayer && KE.words(recent).length >= 5 && (final || Date.now() - lastBibleAt > 700)) {
    lastBibleAt = Date.now();
    let v = null;
    for (const t of tails([5, 8, 12])) { const x = verseByText(t); if (x && (!v || x.score > v.score)) v = x; }
    if (v && v.score >= 0.82 && !recently('v' + v.b + ':' + v.c + ':' + v.v)) {
      if (!switchOk('v' + v.b + ':' + v.c + ':' + v.v, ref(v.b, v.c, v.v))) return;
      loadChapter(v.b, v.c, v.v);
      const go = st.mode === 'auto' && v.score >= 0.9;
      setLast(ref(v.b, v.c, v.v) + ' من الكلام' + (go ? ' — اتعرضت' : ' — جاهزة، دوس اعرض'));
      if (go) play();
      acted('v' + v.b + ':' + v.c + ':' + v.v);
    }
  }
}
$('micBtn').onclick = () => {
  if (!APP && !navigator.mediaDevices) { toast('الميكروفون شغال في البرنامج بس'); return; }
  if (Mic.live) { Mic.stop(); toast('الميكروفون اتقفل'); }
  else { Mic.start(SET.mic || ''); }
};
async function fillMics() {
  const sel = $('micSel'), list = await Mic.devices();
  sel.innerHTML = '<option value="">الميكروفون الافتراضي</option>' + list.filter(d => d.deviceId && d.deviceId !== 'default').map(d => `<option value="${d.deviceId}">${esc(d.label || 'ميكروفون')}</option>`).join('');
  sel.value = SET.mic || '';
}
$('micSel').onchange = e => { SET.mic = e.target.value; applySet(); if (Mic.live) { Mic.stop(); Mic.start(SET.mic); } };
applySet();
setTab('hymns');
loadMeet();

// automatic update (Windows): tell quietly, never interrupt the meeting
if (window.bp && window.bp.on) window.bp.on('update', u => {
  if (u.state === 'downloading') toast('في نسخة جديدة من البرنامج بتتنزل…');
  if (u.state === 'ready') {
    const b = $('updBtn'); b.style.display = ''; b.textContent = 'نسخة جديدة جاهزة — حدّث';
    b.onclick = () => { if (confirm('البرنامج هيتقفل ويفتح تاني بالنسخة الجديدة. تمام؟')) window.bp.updateNow(); };
  }
});
