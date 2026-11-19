/* Remi cá nhân: thay lớp gọi máy chủ bằng bản chạy ngay trong máy.
   Giữ nguyên giao diện window.RemiAPI mà app.js của nhóm dùng, nhưng:
   - tài khoản: chỉ một người dùng cục bộ, không đăng nhập;
   - dữ liệu: lưu trong localStorage của trình duyệt;
   - hiểu câu: khóa Claude của bạn (nếu có) rồi tới bộ luật chạy trong máy;
   - thông báo ngoài app: máy chủ Cloudflare riêng của bạn (thư mục worker/), nếu đã cài. */
(function () {
  'use strict';
  const P = 'remi.local.';
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(P + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) { /* đầy bộ nhớ hoặc bị chặn */ } },
  };
  const fail = (status, code, message) => { const e = new Error(message); e.status = status; e.code = code; e.data = { error: code, message }; return e; };

  /* ---------- cấu hình cá nhân (đặt trong nút ⚙ ở góc màn hình, xem personal.js) ---------- */
  const cfg = () => ({
    name: ls.get('name', ''),
    aikey: ls.get('aikey', ''),
    model: ls.get('model', 'claude-haiku-5-5'),
    onlyLocal: ls.get('onlyLocal', false),
    wurl: String(ls.get('wurl', '') || '').trim().replace(/\/+$/, ''),
    wtoken: String(ls.get('wtoken', '') || '').trim(),
  });

function buildPrompt({ text, now, weekday }) {
  const clean = String(text).replace(/"""/g, '"');
  return [
    `Bạn là trợ lý của app quản lý cá nhân “Remi”. Bây giờ là ${weekday}, ${now} (giờ địa phương của người dùng).`,
    'Người dùng nhập một câu tiếng Việt tự nhiên. Hiểu ý và trả về DUY NHẤT một JSON hợp lệ (không markdown, không giải thích) theo mẫu:',
    '{"intent":"task"|"habit","title":"tên ngắn gọn","emoji":"1 emoji","when":"YYYY-MM-DDTHH:mm hoặc null","repeat":"none"|"daily"|"weekly","leadMinutes":0,"shopping":false,"servings":4,"assumption":"cực ngắn, tối đa 6 từ, ví dụ: 19:00 hôm nay","summary":"rỗng","checklist":[{"item":"tên","qty":"định lượng"}],"tips":["mẹo ngắn"],"habit":null|{"recurring":false,"times":["07:00"],"days":[0,1,2,3,4,5,6],"spread":null,"ml":null}}',
    'Quy tắc:',
    '- intent "habit" khi là thói quen lặp lại hằng ngày/hằng tuần (uống nước, giãn cơ, đi bộ, đọc sách, thiền...). Con số như “2 lít”, “5 phút” giữ trong title. Còn lại là "task", khi đó habit=null.',
    '- task: "when" là lúc việc diễn ra, luôn là mốc gần nhất SAU bây giờ. Nếu nói “7h” cho nấu ăn/bữa tối/đi chợ chiều thì hiểu là 19:00; việc buổi sáng thì 07:00. Nếu không nói giờ, chọn giờ hợp lý và ghi rõ trong assumption.',
    '- leadMinutes: nếu người dùng nói nhắc trước thì dùng đúng; nếu việc cần chuẩn bị (đi chợ, nấu ăn, di chuyển, họp) tự đề xuất 30–60; còn lại 0.',
    '- shopping=true khi là đi chợ/mua sắm/nấu ăn cần mua nguyên liệu. Khi đó checklist là các GỢI Ý nguyên liệu hoặc đồ cần mua kèm định lượng ngắn (cho 3–4 người nếu không nói số người, tối đa 8 mục; nếu không rõ món thì để mảng rỗng). Việc khác: shopping=false, checklist là mảng rỗng.',
    '- servings: số người ăn mà định lượng trong checklist tính cho (lấy từ câu nói, ví dụ “nấu cho 6 người”; không nói thì 4). Định lượng luôn ghi dạng số + đơn vị, ví dụ “500 g”, “3 củ”, “1 gói”, “1,5 lít”, để app tăng giảm được.',
    '- tips: tối đa 2 mẹo, mỗi mẹo dưới 10 từ; việc liên quan sức khỏe thì không đưa lời khuyên dài.',
    '- habit: recurring=true CHỈ khi người dùng nói rõ lặp lại (“mỗi ngày”, “hằng ngày”, “mỗi tuần”, “thứ 2, 4, 6”...). Nếu không nói gì thêm thì recurring=false (chỉ hôm nay). times là mốc nhắc HH:mm: nếu người dùng nêu giờ thì dùng đúng giờ đó; việc làm 1 lần (giãn cơ, thiền) không nêu giờ thì chọn 1 mốc hợp lý. days (0=Chủ nhật … 6=Thứ bảy): “thứ 2, 4, 6” = [1,3,5], “cuối tuần” = [6,0], mặc định đủ 7 ngày. Với việc chia nhỏ theo lượng (uống nước) dùng spread {"count":số lần,"from":"now"|"wake"|"HH:mm","to":"bed"|"HH:mm"} và times=[]: mỗi lần uống 250 ml nên count = số lít × 4 (1,5 lít = 6). from="now" nếu nói “từ bây giờ/từ đây”, from="wake" nếu lặp lại mỗi ngày; to là giờ người dùng nêu (“đến 9h tối” = "21:00") hoặc "bed". Nếu người dùng chia lượng nước thành N lần trong khoảng giờ A đến B (ví dụ “1 lít chia 4 lần từ 1h-5h”) thì spread {"count":N,"from":"13:00","to":"17:00"} (giờ 1 đến 5 không nói gì thêm hiểu là buổi chiều), times=[], và habit.ml là TỔNG lượng nước bằng ml (1 lít = 1000). Ví dụ “giãn cơ 5 phút mỗi ngày” → title “Giãn cơ 5 phút”, recurring true.',
    '- Mọi chữ bằng tiếng Việt, cực kỳ ngắn gọn, không giải thích dài dòng.',
    `Câu của người dùng: """${clean}"""`,
  ].join('\n');
}

  function extractJson(text) {
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a < 0 || b < a) throw fail(502, 'ai_bad_output', 'AI trả về dữ liệu không đọc được.');
    try { return JSON.parse(text.slice(a, b + 1)); } catch (e) { throw fail(502, 'ai_bad_output', 'AI trả về dữ liệu không đọc được.'); }
  }

  let parserP = null;
  function localParser() {
    if (!parserP) {
      parserP = fetch('/data/dishes.json').then((r) => (r.ok ? r.json() : [])).catch(() => [])
        .then((d) => window.RemiLocalParse.createParser(Array.isArray(d) ? d : (d.dishes || [])));
    }
    return parserP;
  }

  async function aiParse(body) {
    const text = String(body.text || '').trim();
    if (!text || text.length > 300) throw fail(400, 'bad_text', 'Câu nhập cần từ 1 đến 300 ký tự.');
    const c = cfg();
    if (c.aikey && !c.onlyLocal) {
      let res;
      try {
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': c.aikey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: c.model, max_tokens: 1200, messages: [{ role: 'user', content: buildPrompt({ text, now: body.now, weekday: body.weekday }) }] }),
        });
      } catch (e) { const er = new Error('Không kết nối được.'); er.network = true; throw er; }
      if (res.ok) {
        const j = await res.json();
        const t = (j.content || []).map((x) => x.text || '').join('');
        return { data: extractJson(t) };
      }
      if (res.status === 401) throw fail(502, 'ai_upstream', 'Khóa Claude chưa đúng. Kiểm tra lại trong ⚙.');
      // lỗi khác từ AI: rơi xuống bộ luật trong máy để vẫn dùng được
    }
    const p = await localParser();
    return { data: p.parse(text, body.now) };
  }

  /* ---------- máy chủ nhắc việc riêng (Cloudflare Worker) ---------- */
  const wh = (c) => ({ 'content-type': 'application/json', authorization: 'Bearer ' + c.wtoken });
  async function currentSub() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 3000))]);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      return sub ? sub.toJSON() : null;
    } catch (e) { return null; }
  }
  async function workerSync(schedule) {
    const c = cfg();
    if (!c.wurl || !c.wtoken) return;
    const reminders = (schedule || []).map((r) => ({ id: r.key, at: r.at, title: r.title, body: r.body }));
    const sub = await currentSub();
    try {
      const r = await fetch(c.wurl + '/sync', { method: 'POST', headers: wh(c), body: JSON.stringify({ subscription: sub || undefined, reminders }) });
      const j = await r.json().catch(() => ({}));
      ls.set('wstate', r.ok ? { ok: true, count: j.count, at: Date.now() } : { ok: false, err: r.status === 401 ? 'Mã bí mật chưa đúng' : (j.error || 'Lỗi ' + r.status), at: Date.now() });
    } catch (e) { ls.set('wstate', { ok: false, err: 'Không kết nối được máy chủ nhắc việc', at: Date.now() }); }
  }

  /* ---------- các đường dẫn app.js gọi ---------- */
  async function call(method, path, body) {
    if (path === '/api/me') return { user: { id: 'local', email: '', name: cfg().name || 'Bạn' } };
    if (path === '/api/state' && method === 'GET') return { version: ls.get('version', 0), state: ls.get('state', null) };
    if (path === '/api/state' && method === 'PUT') {
      const v = ls.get('version', 0) + 1;
      ls.set('state', body.state); ls.set('version', v);
      workerSync(body.schedule);                         // không chờ: lỗi mạng không làm hỏng việc lưu
      return { version: v };
    }
    if (path === '/api/ai/parse' && method === 'POST') return aiParse(body || {});
    if (path === '/api/push/key') {
      const c = cfg();
      if (!c.wurl) return { enabled: false };
      try { const j = await (await fetch(c.wurl + '/vapid')).json(); return { enabled: !!j.publicKey, publicKey: j.publicKey }; }
      catch (e) { return { enabled: false }; }
    }
    if (path === '/api/push/subscribe') {
      if (method === 'POST') { await workerSync([]); return { ok: true }; }   // app.js đồng bộ lại lịch ngay sau đó
      return { ok: true };
    }
    if (path === '/api/auth/logout') return { ok: true };
    throw fail(404, 'not_found', 'Chức năng này không có trong bản cá nhân.');
  }

  window.RemiAPI = {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b || {}),
    put: (p, b) => call('PUT', p, b),
    del: (p, b) => call('DELETE', p, b || {}),
    _cfg: cfg, _ls: ls,
  };
})();
