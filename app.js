const $ = s => document.querySelector(s), T = 30, LT = ['أ', 'ب', 'ج', 'د'];
let qs = [], i = 0, session = '', name = '', total = 0, t0 = 0, left = T, tick, done = false;

const show = id => document.querySelectorAll('.screen').forEach(s => s.hidden = s.id !== id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 4500); }

async function api(path, body = {}) {
  const r = await fetch('/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d.message || 'حدث خطأ في الاتصال بالخادم.');
  return d;
}

$('#go').onclick = async () => {
  name = $('#name').value.trim();
  if (!name) { toast('يرجى كتابة اسم المتسابق أولاً.'); $('#name').focus(); return; }
  const b = $('#go'); b.disabled = true; b.textContent = 'جاري تحميل الأسئلة...';
  try {
    const d = await api('start');
    qs = d.questions; session = d.session; i = 0; total = 0;
    show('quiz'); load();
  } catch (e) { toast(e.message); }
  finally { b.disabled = false; b.textContent = 'ابدأ الاختبار'; }
};

function paintTimer() {
  $('#tt').textContent = left;
  $('#ring').style.strokeDashoffset = 100 * (1 - left / T);
  $('#timer').classList.toggle('warn', left <= 10);
}

function load() {
  done = false; left = T; t0 = Date.now();
  const q = qs[i];
  $('#qn').textContent = `السؤال ${i + 1} / ${qs.length}`;
  $('#bar').style.width = (i / qs.length * 100) + '%';
  $('#qt').textContent = q.q;
  $('#next').hidden = true;
  const box = $('#opts'); box.replaceChildren();
  q.options.forEach((o, k) => {
    const b = el('button', 'opt'); b.append(el('i', '', LT[k]), el('span', '', o));
    b.onclick = () => pick(k, b);
    box.append(b);
  });
  $('#ring').style.transition = 'none'; paintTimer();
  requestAnimationFrame(() => requestAnimationFrame(() => $('#ring').style.transition = ''));
  clearInterval(tick);
  tick = setInterval(() => { left--; paintTimer(); if (left <= 0) { clearInterval(tick); timeUp(); } }, 1000);
}

const lock = () => document.querySelectorAll('.opt').forEach(o => o.disabled = true);
function showNext() {
  const n = $('#next'); n.hidden = false;
  n.textContent = i === qs.length - 1 ? 'عرض النتيجة' : 'السؤال التالي';
  n.focus();
}

async function pick(k, btn) {
  if (done) return; done = true; clearInterval(tick);
  total += Math.min(T, Math.ceil((Date.now() - t0) / 1000));
  lock(); btn.classList.add('sel');
  try {
    const c = await api('check', { session, question_id: qs[i].id, selected_index: k });
    const all = document.querySelectorAll('.opt');
    btn.classList.remove('sel');
    if (c.correct) btn.classList.add('ok');
    else { btn.classList.add('no'); all[c.correct_index]?.classList.add('ok'); }
  } catch (e) { toast(e.message); }
  showNext();
}

function timeUp() { if (done) return; done = true; total += T; lock(); toast('انتهى الوقت'); showNext(); }

$('#next').onclick = async () => {
  if (i < qs.length - 1) { i++; load(); return; }
  const b = $('#next'); b.disabled = true; b.textContent = 'جاري حفظ النتيجة...';
  try {
    const d = await api('submit', { session, name, elapsed_seconds: total });
    showResult(d.result);
  } catch (e) { toast('تعذر حفظ النتيجة: ' + e.message); b.disabled = false; b.textContent = 'إعادة محاولة الحفظ'; }
};

function showResult(r) {
  show('result');
  const p = r.percentage;
  const [ic, t, m] = p >= 90 ? ['🏆', 'ممتاز!', 'أداء استثنائي، أنت متميز في الحاسب الآلي.']
    : p >= 70 ? ['🌟', 'جيد جداً!', 'أداء رائع، استمر في التعلم.']
    : p >= 50 ? ['💪', 'جيد', 'أداء مقبول، راجع بعض المواضيع.']
    : ['📚', 'تحتاج مراجعة', 'راجع المواد وأعد المحاولة.'];
  $('#ri').textContent = ic; $('#rt').textContent = t; $('#rm').textContent = `${name} — ${m}`;
  $('#st').textContent = p + '%';
  $('#sc').textContent = r.correct; $('#sw').textContent = r.wrong;
  $('#sa').textContent = Math.round(r.elapsed_seconds / Math.max(1, r.total));
  requestAnimationFrame(() => $('#sr').style.setProperty('--d', p * 3.6 + 'deg'));
  if (p >= 70) confetti();
}

$('#again').onclick = () => { clearInterval(tick); $('#next').disabled = false; $('#sr').style.setProperty('--d', '0deg'); show('start'); };

document.addEventListener('keydown', e => {
  if (!$('#quiz').hidden) {
    if (/^[1-4]$/.test(e.key) && !done) document.querySelectorAll('.opt')[e.key - 1]?.click();
  }
  if (e.key === 'Enter' && !$('#start').hidden) $('#go').click();
});

function confetti() {
  const c = $('#fx'), x = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
  const P = Array.from({ length: 140 }, () => ({ x: Math.random() * c.width, y: -Math.random() * c.height * .6, v: 2 + Math.random() * 4, s: 6 + Math.random() * 6, r: Math.random() * 6, h: Math.random() * 360 }));
  let f = 0;
  (function d() {
    x.clearRect(0, 0, c.width, c.height);
    P.forEach(p => { p.y += p.v; p.x += Math.sin(p.r += .05) * 2; x.fillStyle = `hsl(${p.h},90%,60%)`; x.fillRect(p.x, p.y, p.s, p.s * .6); });
    ++f < 260 ? requestAnimationFrame(d) : x.clearRect(0, 0, c.width, c.height);
  })();
}
