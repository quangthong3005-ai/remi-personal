/* Cài đặt riêng của bản cá nhân: nút ⚙ ở góc dưới bên trái. Lưu trong trình duyệt, không gửi đi đâu
   ngoài địa chỉ Claude (api.anthropic.com) và máy chủ nhắc việc của chính bạn. */
(function () {
  'use strict';
  const A = window.RemiAPI;
  if (!A || !A._ls) return;
  const ls = A._ls;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const css = document.createElement('style');
  css.textContent = `
  #pz-btn{position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:60;width:38px;height:38px;border-radius:50%;border:1px solid rgba(0,0,0,.12);background:#fff;font-size:18px;line-height:1;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15);opacity:.75}
  #pz-btn:hover,#pz-btn:focus-visible{opacity:1}
  #pz-ov{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px}
  #pz-ov[hidden]{display:none}
  #pz-box{background:#fff;color:#222;border-radius:16px;max-width:420px;width:100%;max-height:90vh;overflow:auto;padding:18px;font:15px/1.4 system-ui,-apple-system,sans-serif}
  #pz-box h2{margin:0 0 4px;font-size:18px} #pz-box p{margin:0 0 12px;color:#666;font-size:13px}
  #pz-box label{display:block;margin:12px 0 4px;font-weight:600;font-size:13px}
  #pz-box input[type=text],#pz-box input[type=password],#pz-box input[type=url]{width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:10px;font-size:16px}
  #pz-box .row{display:flex;gap:8px;align-items:center;margin-top:12px}
  #pz-box button{padding:10px 14px;border-radius:10px;border:0;font-size:15px;cursor:pointer}
  #pz-ok{background:#FF6A1F;color:#fff;flex:1} #pz-no{background:#eee}
  #pz-st{font-size:13px;color:#555;margin-top:6px}`;
  document.head.appendChild(css);

  const btn = document.createElement('button');
  btn.id = 'pz-btn'; btn.type = 'button'; btn.title = 'Cài đặt Remi cá nhân'; btn.setAttribute('aria-label', 'Cài đặt Remi cá nhân'); btn.textContent = '⚙';
  const ov = document.createElement('div');
  ov.id = 'pz-ov'; ov.hidden = true; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
  document.body.append(btn, ov);

  function stateLine() {
    const s = ls.get('wstate', null);
    if (!A._cfg().wurl) return 'Chưa nối máy chủ nhắc việc.';
    if (!s) return 'Chưa đồng bộ lần nào. Thêm hoặc sửa một việc để đồng bộ.';
    const t = new Date(s.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    return s.ok ? '✅ Đã đồng bộ ' + s.count + ' lời nhắc lúc ' + t + '.' : '⚠️ ' + s.err + ' (' + t + ').';
  }

  function open() {
    const c = A._cfg();
    ov.innerHTML = '<div id="pz-box"><h2>Remi cá nhân</h2><p>Mọi thứ lưu ngay trong máy này. Không có tài khoản hay máy chủ trung gian.</p>' +
      '<label for="pz-name">Tên bạn</label><input type="text" id="pz-name" autocomplete="off" value="' + esc(c.name) + '">' +
      '<label for="pz-key">Khóa Claude (tuỳ chọn, để hiểu câu nói thông minh hơn)</label><input type="password" id="pz-key" autocomplete="off" value="' + esc(c.aikey) + '">' +
      '<div class="row"><input type="checkbox" id="pz-local"' + (c.onlyLocal ? ' checked' : '') + '><label for="pz-local" style="margin:0;font-weight:400">Chỉ hiểu câu trên máy (không gửi gì ra ngoài)</label></div>' +
      '<label for="pz-wurl">Máy chủ nhắc việc (địa chỉ Cloudflare Worker, tuỳ chọn)</label><input type="url" id="pz-wurl" placeholder="https://remi-push.…workers.dev" value="' + esc(c.wurl) + '">' +
      '<label for="pz-wtok">Mã bí mật của máy chủ đó</label><input type="password" id="pz-wtok" autocomplete="off" value="' + esc(c.wtoken) + '">' +
      '<div id="pz-st">' + esc(stateLine()) + '</div>' +
      '<div class="row"><button type="button" id="pz-no">Đóng</button><button type="button" id="pz-ok">Lưu</button></div></div>';
    ov.hidden = false;
    ov.querySelector('#pz-no').onclick = close;
    ov.querySelector('#pz-ok').onclick = () => {
      const v = (id) => ov.querySelector(id).value.trim();
      ls.set('name', v('#pz-name')); ls.set('aikey', v('#pz-key')); ls.set('onlyLocal', ov.querySelector('#pz-local').checked);
      ls.set('wurl', v('#pz-wurl').replace(/\/+$/, '')); ls.set('wtoken', v('#pz-wtok'));
      location.reload();
    };
    ov.querySelector('#pz-name').focus();
  }
  function close() { ov.hidden = true; ov.innerHTML = ''; }
  btn.onclick = open;
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ov.hidden) close(); });
})();
