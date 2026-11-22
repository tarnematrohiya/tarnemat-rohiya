// طريقة الاستخدام: a short tour inside the app. The keyboard keeps working while it is open, so each step can be tried.
(() => {
  const LITE = !!(window.bp && window.bp.lite);
  const S = [
    { t: 'أهلاً! ده "ترنيمات روحية"', d: 'هوريك في دقيقة كل طرق البحث والعرض. تقدر تجرب كل خطوة بالكيبورد والشرح مفتوح.' },
    { el: '[data-tab=hymns]', tab: 'hymns', t: 'ترنيمة بالرقم', d: 'اكتب رقم الترنيمة ودوس <kbd>Enter</kbd> — بتظهر على الشاشة على طول.<br>جرب: <b>182</b> <kbd>Enter</kbd>' },
    { el: '#liveScr', t: 'بعدها: رقم = العدد', d: 'طول ما الترنيمة مفتوحة، أي رقم + <kbd>Enter</kbd> يجيب العدد ده.<br>جرب: <b>2</b> <kbd>Enter</kbd><br>عايز ترنيمة جديدة؟ دوس <kbd>Esc</kbd> واكتب رقمها.' },
    { el: '#liveScr', t: 'ترنيمة وعدد مرة واحدة', d: 'رقم الترنيمة، مسافة، رقم العدد، <kbd>Enter</kbd>.<br>جرب: <b>182 2</b> <kbd>Enter</kbd>' },
    { el: '#q', tab: 'hymns', t: 'البحث بالكلام', d: 'اكتب أي كلام من الترنيمة على طول — بيتكتب في البحث لوحده، حتى لو فيه غلطة إملائية.<br>انزل بالأسهم <kbd>↓</kbd> <kbd>↑</kbd> ودوس <kbd>Enter</kbd> تتعرض.' },
    { el: '#slides', t: 'شرايح الترنيمة', d: 'ضغطة على شريحة = تجهزها، ضغطتين = تظهر.<br>الأسهم <kbd>←</kbd> <kbd>→</kbd> تقلب اللي على الشاشة على طول.' },
    { el: '.screens', t: 'على الشاشة الآن والتالي', d: 'فوق (الأحمر الكبير) = اللي الناس شايفاه دلوقتي.<br>تحت (الأزرق الصغير) = اللي جاي.' },
    { el: '.ctrl', t: 'الأزرار', d: '<kbd>مسافة</kbd> = اعرض، <kbd>←</kbd> التالي، <kbd>→</kbd> السابق.' },
    { el: '#blankBtn', t: 'إخفاء الشاشة', d: 'حرف <kbd>B</kbd> سواء الكيبورد إنجليزي أو عربي يخفي الكلام من على الشاشة ويرجعه.' },
    { el: '[data-tab=bible]', tab: 'bible', t: 'الكتاب المقدس', d: 'اكتب اختصار السفر والإصحاح والعدد ودوس <kbd>Enter</kbd>، أمثلة:<br><b><bdi>يو ٣ ١٦</bdi></b> = يوحنا ٣: ١٦<br><b><bdi>١كو ١٣ ٤</bdi></b> = كورنثوس الأولى ١٣: ٤<br><b><bdi>تك 1 1</bdi></b> = التكوين ١: ١ &nbsp;·&nbsp; <b><bdi>امثال8 1</bdi></b> = الأمثال ٨: ١' },
    { el: '#slides', tab: 'bible', t: 'آيات الإصحاح', d: 'بعد ما الآية تظهر، أي رقم + <kbd>Enter</kbd> = آية تانية في نفس الإصحاح.<br>أو انزل بالأسهم <kbd>↓</kbd> <kbd>↑</kbd> ودوس <kbd>Enter</kbd>.' },
    { el: '#setBtn', t: 'الخط والحجم', d: 'اختار خط مريح وكبّر أو صغّر الكلام على الشاشة.' },
    { el: '#openOut', t: 'شاشة العرض', d: 'لو البروجكتور متوصل، دوس هنا تفتح شاشة العرض عليه.' },
    { el: '[data-tab=today]', tab: 'today', t: 'اجتماع اليوم والسجل', d: 'كل ترنيمة وآية اتعرضت النهارده بتتسجل هنا، والاجتماعات اللي فاتت في "السجل".' },
    { t: 'خلاص', d: 'الشرح ده موجود دايماً في زرار "طريقة الاستخدام" فوق.' }
  ];
  let i = 0, box, hole;
  function build() {
    hole = document.createElement('div'); hole.id = 'tourHole';
    box = document.createElement('div'); box.id = 'tourBox';
    document.body.append(hole, box);
  }
  function show() {
    const s = S[i];
    if (s.tab && typeof setTab === 'function' && typeof st !== 'undefined' && st.tab !== s.tab) setTab(s.tab);
    const el = s.el && document.querySelector(s.el);
    box.innerHTML = `<div class="tt">${s.t}</div><div class="td">${s.d}</div>
      <div class="tb"><span>${i + 1} / ${S.length}</span><span class="sp"></span>
      ${i ? '<button class="btn" data-a="prev">السابق</button>' : ''}
      <button class="btn primary" data-a="next">${i === S.length - 1 ? 'إنهاء' : 'التالي'}</button>
      <button class="btn" data-a="close">قفل</button></div>`;
    box.querySelectorAll('button').forEach(b => b.onclick = () => { const a = b.dataset.a; if (a === 'next') go(1); else if (a === 'prev') go(-1); else close(); });
    if (el) {
      const r = el.getBoundingClientRect(), p = 6;
      Object.assign(hole.style, { display: 'block', left: r.left - p + 'px', top: r.top - p + 'px', width: r.width + 2 * p + 'px', height: r.height + 2 * p + 'px' });
      // card next to the highlighted part, inside the window
      const bw = 380, bh = box.offsetHeight || 200;
      let x = r.left - bw - 18; if (x < 10) x = r.right + 18; if (x + bw > innerWidth - 10) x = Math.max(10, (innerWidth - bw) / 2);
      let y = Math.min(Math.max(10, r.top), innerHeight - bh - 10);
      Object.assign(box.style, { left: x + 'px', top: y + 'px', transform: 'none' });
    } else {
      hole.style.display = 'block'; Object.assign(hole.style, { left: '50%', top: '50%', width: '0px', height: '0px' });
      Object.assign(box.style, { left: '50%', top: '40%', transform: 'translate(-50%,-50%)' });
    }
  }
  function go(d) { i = Math.max(0, Math.min(S.length - 1, i + d)); if (d > 0 && i === S.length - 1 && box.querySelector('[data-a=next]').textContent === 'إنهاء') { close(); return; } show(); }
  function close() { hole.remove(); box.remove(); hole = box = null; try { localStorage.setItem('bp.tourSeen', '1'); } catch (e) {} }
  window.startTour = () => { if (box) close(); i = 0; build(); show(); };
  addEventListener('resize', () => { if (box) show(); });
  // the first time the app opens on a computer
  addEventListener('load', () => { let seen = '1'; try { seen = localStorage.getItem('bp.tourSeen'); } catch (e) {} if (!seen) setTimeout(window.startTour, 900); });
})();
