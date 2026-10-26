// Cloudflare Worker — الـ API + تقديم الملفات الثابتة
// متغيرات البيئة المطلوبة (Secrets): SUPABASE_URL , SUPABASE_SERVICE_ROLE_KEY
class E extends Error { constructor(m, s = 400) { super(m); this.s = s; } }
const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function api(request, env) {
  const route = new URL(request.url).pathname.replace(/^\/api\/?/, '');
  const sb = async (method, path, body, rep) => {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new E('إعدادات Supabase غير مكتملة على الخادم.', 500);
    const r = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
      method,
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', ...(rep ? { Prefer: 'return=representation' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) { console.error('Supabase', r.status, (await r.text()).slice(0, 500)); throw new E(`رفضت قاعدة البيانات الطلب (${r.status}).`, 502); }
    const t = await r.text(); return t ? JSON.parse(t) : [];
  };
  try {
    const b = await request.json().catch(() => ({}));

    if (route === 'start') {
      const rows = await sb('GET', 'questions?select=id,question,options&active=eq.true&order=id.asc');
      if (!rows.length) throw new E('لا توجد أسئلة في قاعدة البيانات.', 404);
      const [s] = await sb('POST', 'quiz_sessions', { question_ids: rows.map(r => r.id) }, true);
      return J({ ok: true, session: s.id, questions: rows.map(r => ({ id: r.id, q: r.question, options: r.options })) });
    }

    const sess = async () => {
      if (!UUID.test(b.session || '')) throw new E('الجلسة غير صالحة، ابدأ من جديد.');
      const [s] = await sb('GET', `quiz_sessions?select=*&id=eq.${b.session}`);
      if (!s) throw new E('انتهت الجلسة، ابدأ من جديد.', 404);
      return s;
    };

    if (route === 'check') {
      const s = await sess(), id = b.question_id, k = b.selected_index;
      if (!Number.isInteger(id) || !s.question_ids.includes(id) || !Number.isInteger(k) || k < 0 || k > 3) throw new E('بيانات الإجابة غير صحيحة.');
      if (String(id) in s.answers) throw new E('سبق الإجابة عن هذا السؤال.', 409);
      const [q] = await sb('GET', `questions?select=answer_index&id=eq.${id}`);
      if (!q) throw new E('السؤال غير موجود.', 404);
      await sb('PATCH', `quiz_sessions?id=eq.${s.id}`, { answers: { ...s.answers, [id]: k } });
      return J({ ok: true, correct: k === q.answer_index, correct_index: q.answer_index });
    }

    if (route === 'submit') {
      const s = await sess(), name = String(b.name || '').trim();
      if (!name || [...name].length > 100) throw new E('يرجى إدخال اسم صحيح لا يتجاوز 100 حرف.');
      const rows = await sb('GET', `questions?select=id,answer_index&id=in.(${s.question_ids.join(',')})`);
      const key = Object.fromEntries(rows.map(r => [r.id, r.answer_index]));
      const total = rows.length, correct = Object.entries(s.answers).filter(([id, a]) => key[id] === a).length;
      const elapsed = Math.min(Math.max(parseInt(b.elapsed_seconds) || 0, 0), 86400), pct = Math.round(correct / total * 100);
      const [saved] = await sb('POST', 'quiz_results', { participant_name: name, total_questions: total, correct_answers: correct, wrong_answers: total - correct, percentage: pct, elapsed_seconds: elapsed }, true);
      await sb('DELETE', `quiz_sessions?id=eq.${s.id}`);
      return J({ ok: true, result: { id: saved?.id, total, correct, wrong: total - correct, percentage: pct, elapsed_seconds: elapsed } });
    }
    throw new E('الطلب غير معروف.', 404);
  } catch (e) {
    return J({ ok: false, message: e instanceof E ? e.message : 'حدث خطأ داخلي.' }, e instanceof E ? e.s : 500);
  }
}

export default {
  fetch(request, env) {
    const u = new URL(request.url);
    if (u.pathname.startsWith('/api/')) {
      return request.method === 'POST' ? api(request, env) : J({ ok: false, message: 'الطريقة غير مسموحة.' }, 405);
    }
    return env.ASSETS.fetch(request);
  },
};
