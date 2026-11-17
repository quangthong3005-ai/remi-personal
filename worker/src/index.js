import { generateVapid, sendPush } from './webpush.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-max-age': '86400',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS } });
const ALLOWED_PUSH_HOSTS = /(^|\.)(push\.apple\.com|googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;
const GRACE_MS = 20 * 60 * 1000; // bỏ qua nhắc đã trễ hơn 20 phút
const MAX_REMINDERS = 400;

const kvGet = async (env, k, d) => { const v = await env.REMI.get(k); return v ? JSON.parse(v) : d; };
const kvPut = (env, k, v) => env.REMI.put(k, JSON.stringify(v));

async function getVapid(env) {
  let v = await kvGet(env, 'vapid', null);
  if (!v) { v = await generateVapid(); await kvPut(env, 'vapid', v); }
  return v;
}

function authed(req, env) {
  const h = req.headers.get('authorization') || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!env.TOKEN || t.length !== env.TOKEN.length) return false;
  let d = 0; // so sánh không phụ thuộc thời gian
  for (let i = 0; i < t.length; i++) d |= t.charCodeAt(i) ^ env.TOKEN.charCodeAt(i);
  return d === 0;
}

function validSub(s) {
  try {
    const u = new URL(s.endpoint);
    return u.protocol === 'https:' && ALLOWED_PUSH_HOSTS.test(u.hostname) && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
  } catch (e) { return false; }
}

function cleanReminders(list) {
  if (!Array.isArray(list)) return [];
  const now = Date.now();
  return list
    .filter((r) => r && typeof r.id === 'string' && Number.isFinite(r.at) && r.at > now - GRACE_MS)
    .slice(0, MAX_REMINDERS)
    .map((r) => ({ id: r.id.slice(0, 80), at: Math.round(r.at), title: String(r.title || 'Remi').slice(0, 80), body: String(r.body || '').slice(0, 200) }));
}

async function handle(req, env) {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (url.pathname === '/vapid' && req.method === 'GET') return json({ publicKey: (await getVapid(env)).publicKey });
  if (!authed(req, env)) return json({ error: 'unauthorized' }, 401);

  if (url.pathname === '/sync' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
    if (b.subscription) {
      if (!validSub(b.subscription)) return json({ error: 'bad subscription' }, 400);
      await kvPut(env, 'sub', b.subscription);
    }
    const sent = await kvGet(env, 'sent', {});
    const rem = cleanReminders(b.reminders).filter((r) => !sent[r.id]);
    await kvPut(env, 'rem', rem);
    return json({ ok: true, count: rem.length, hasSub: !!(await env.REMI.get('sub')) });
  }

  if (url.pathname === '/status' && req.method === 'GET') {
    const rem = await kvGet(env, 'rem', []);
    const next = rem.slice().sort((a, b) => a.at - b.at)[0];
    return json({ hasSub: !!(await env.REMI.get('sub')), count: rem.length, next: next ? { at: next.at, title: next.title } : null });
  }

  if (url.pathname === '/inbox' && req.method === 'GET') return json({ items: await kvGet(env, 'inbox', []) });

  if (url.pathname === '/inbox' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
    const text = String((b && b.text) || '').trim().slice(0, 500);
    if (!text) return json({ error: 'empty text' }, 400);
    const items = await kvGet(env, 'inbox', []);
    items.push({ id: crypto.randomUUID(), text, at: Date.now() });
    await kvPut(env, 'inbox', items.slice(-20));
    let pushed = false;
    const sub = await kvGet(env, 'sub', null);
    if (sub) {
      try {
        const r = await sendPush(sub, { title: 'Remi đã nhận', body: text.slice(0, 120) + ' · chạm để xác nhận', tag: 'remi-inbox', url: '/' }, await getVapid(env), env.SUBJECT || 'mailto:admin@example.com');
        pushed = r.ok;
        if (r.gone) await env.REMI.delete('sub');
      } catch (e) { /* vẫn lưu trong hộp thư */ }
    }
    return json({ ok: true, pushed });
  }

  if (url.pathname === '/inbox/ack' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
    const ids = new Set(Array.isArray(b.ids) ? b.ids : []);
    const items = (await kvGet(env, 'inbox', [])).filter((i) => !ids.has(i.id));
    await kvPut(env, 'inbox', items);
    return json({ ok: true, left: items.length });
  }

  if (url.pathname === '/test' && req.method === 'POST') {
    const sub = await kvGet(env, 'sub', null);
    if (!sub) return json({ error: 'no subscription' }, 400);
    const r = await sendPush(sub, { title: 'Remi', body: 'Thông báo thử: nếu bạn thấy dòng này ở màn hình khóa thì đã ổn 🎉', tag: 'remi-test', url: '/' }, await getVapid(env), env.SUBJECT || 'mailto:admin@example.com');
    if (r.gone) await env.REMI.delete('sub');
    return json(r, r.ok ? 200 : 502);
  }
  return json({ error: 'not found' }, 404);
}

export async function runDue(env, now = Date.now()) {
  const rem = await kvGet(env, 'rem', []);
  if (!rem.length) return { sent: 0 };
  const sent = await kvGet(env, 'sent', {});
  const due = rem.filter((r) => r.at <= now && now - r.at <= GRACE_MS && !sent[r.id]).sort((a, b) => a.at - b.at).slice(0, 15);
  let n = 0, changed = false;
  if (due.length) {
    const sub = await kvGet(env, 'sub', null);
    if (sub) {
      const vapid = await getVapid(env);
      for (const r of due) {
        try {
          const res = await sendPush(sub, { title: r.title, body: r.body, tag: r.id, url: '/' }, vapid, env.SUBJECT || 'mailto:admin@example.com');
          if (res.ok) { sent[r.id] = now; n++; changed = true; }
          else if (res.gone) { await env.REMI.delete('sub'); break; }
        } catch (e) { /* thử lại ở phút sau */ }
      }
    }
  }
  const keep = rem.filter((r) => r.at > now - GRACE_MS && !sent[r.id]);
  if (keep.length !== rem.length) { await kvPut(env, 'rem', keep); }
  for (const k of Object.keys(sent)) if (now - sent[k] > 3 * 86400000) { delete sent[k]; changed = true; }
  if (changed) await kvPut(env, 'sent', sent);
  return { sent: n };
}

export default {
  fetch: (req, env) => handle(req, env).catch((e) => json({ error: String(e && e.message || e) }, 500)),
  scheduled: (event, env, ctx) => { ctx.waitUntil(runDue(env)); },
};
