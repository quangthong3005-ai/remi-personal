/* Remi - Nhóm D: lịch nâng cao (xem Tuần/Ngày dạng timeline, kéo thả đổi giờ,
 * báo trùng giờ, tìm giờ trống, xuất/nhập .ics).
 * Giao diện nằm ở đây, logic thuần nằm ở cal-utils.js (window.RemiCal).
 * Nối vào app.js bằng window.RemiCalUI({...}) giống cách kitchen-ui.js. */
window.RemiCalUI = function (c) {
  'use strict';
  const C = window.RemiCal;
  const HH = 52;            // chiều cao 1 giờ (px), phải khớp CSS (.cxcol)
  const DEF_DUR = 30, SNAP = 15, MAXD = 720;
  const state = c.state, esc = c.esc, dKey = c.dKey;
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (m) => pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60);
  const toM = (t) => { const a = String(t).split(':'); return (+a[0] || 0) * 60 + (+a[1] || 0); };
  const parseKey = (k) => new Date(k + 'T00:00:00');
  const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dKey(d); };
  const mondayOf = (k) => addDays(k, -((parseKey(k).getDay() + 6) % 7));
  const durOf = (t) => Math.max(15, Math.min(MAXD, t.durMin || DEF_DUR));
  const shortDay = (k) => { const d = parseKey(k); return c.WDS[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1); };
  const lenText = (m) => (m >= 60 && m % 60 === 0) ? (m / 60) + ' giờ' : (m > 60 ? Math.floor(m / 60) + ' giờ ' + (m % 60) + ' phút' : m + ' phút');

  let view = c.store.get('remi.calview', 'month');
  if (view !== 'week' && view !== 'day') view = 'month';
  let lastScroll = null, drag = null, suppress = false;

  /* ---------- dữ liệu của một ngày ---------- */
  function dayEvents(key) {
    return c.projTasks(key).map((it) => {
      const m = toM(it.time), t = it.t;
      return { id: t.id, t: t, proj: it.proj, key: key, start: m, end: Math.min(1440, m + durOf(t)),
        title: t.title, emoji: t.emoji, done: !!t.done };
    });
  }
  // Xếp các việc trùng giờ thành các cột đứng cạnh nhau
  function layout(evs) {
    const s = evs.slice().sort((a, b) => a.start - b.start || b.end - a.end);
    let cluster = [], cEnd = -1;
    const flush = () => {
      const cols = [];
      cluster.forEach((e) => { let i = 0; while (cols[i] !== undefined && cols[i] > e.start) i++; cols[i] = e.end; e.col = i; });
      cluster.forEach((e) => { e.cols = cols.length; });
      cluster = [];
    };
    s.forEach((e) => {
      if (cluster.length && e.start >= cEnd) { flush(); cEnd = -1; }
      cluster.push(e); cEnd = Math.max(cEnd, e.end);
    });
    if (cluster.length) flush();
    return s;
  }

  /* ---------- thanh công cụ (dùng cả ở xem Tháng) ---------- */
  function bar() {
    return '<div class="cxbar"><div class="seg cxseg" role="group" aria-label="Kiểu xem lịch">' +
      [['month', 'Tháng'], ['week', 'Tuần'], ['day', 'Ngày']].map((v) =>
        '<button type="button" data-act="cx-view" data-v="' + v[0] + '" class="' + (view === v[0] ? 'on' : '') + '">' + v[1] + '</button>').join('') +
      '</div><div class="cxtools"><button type="button" class="addt" data-act="cx-free">🕐 Giờ trống</button>' +
      '<button type="button" class="addt" data-act="cx-export">⬇ .ics</button>' +
      '<button type="button" class="addt" data-act="cx-import">⬆ Nhập</button>' +
      '<button type="button" class="addt" data-act="cx-link">🔗 Liên kết</button></div></div>';
  }

  /* ---------- vẽ timeline ---------- */
  function colHtml(k, evs, bad, today) {
    const hb = c.habitsOn(k);
    const padR = hb.length ? 24 : 0;
    let h = '<div class="cxcol' + (k === today ? ' today' : '') + '" data-key="' + k + '" style="height:' + (HH * 24) + 'px">';
    hb.forEach((x) => {
      c.habitTimes(x, k).forEach((t) => {
        h += '<div class="cxhb" data-hid="' + x.id + '" style="top:' + (toM(t) * HH / 60) + 'px" title="' + esc(x.title + ' ' + t) + '">' + esc(x.emoji) + '</div>';
      });
    });
    layout(evs).forEach((e) => {
      const ht = Math.max((e.end - e.start) * HH / 60, 22);
      h += '<div class="cxev' + (e.done ? ' dn' : '') + (bad[e.id + k] ? ' warn' : '') + (e.proj ? ' proj' : '') + '"' +
        ' data-act="opentask" data-id="' + e.id + '" data-key="' + k + '" data-start="' + e.start + '" data-end="' + e.end + '" data-proj="' + (e.proj ? 1 : 0) + '"' +
        ' role="button" tabindex="0" aria-label="' + esc(e.title + ', ' + fmt(e.start)) + '"' +
        ' style="top:' + (e.start * HH / 60) + 'px;height:' + ht + 'px;' +
        'left:calc((100% - ' + padR + 'px) * ' + (e.col / e.cols) + ' + 2px);width:calc((100% - ' + padR + 'px) / ' + e.cols + ' - 4px)">' +
        '<span class="cxt">' + fmt(e.start) + '</span> ' + esc(e.emoji) + ' ' + esc(e.title) + (e.proj ? ' <em>(lặp lại)</em>' : '') + '</div>';
    });
    if (k === today) { const n = new Date(); h += '<div class="cxnow" style="top:' + ((n.getHours() * 60 + n.getMinutes()) * HH / 60) + 'px"></div>'; }
    return h + '</div>';
  }

  function render(host) {
    if (drag && drag.active) return;                  // đang kéo thì không vẽ lại
    const old = host.querySelector('.cxscroll');
    if (old) lastScroll = old.scrollTop;
    const sel = c.getSel(), today = dKey(new Date());
    const keys = view === 'week' ? [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(mondayOf(sel), i)) : [sel];
    const evs = {};
    keys.forEach((k) => { evs[k] = dayEvents(k); });
    const warns = [], bad = {};
    keys.forEach((k) => {
      C.findConflicts(evs[k].filter((e) => !e.done)).forEach((p) => {
        warns.push({ k: k, a: p[0], b: p[1] }); bad[p[0].id + k] = 1; bad[p[1].id + k] = 1;
      });
    });
    const label = view === 'week'
      ? 'Tuần ' + shortDay(keys[0]) + ' – ' + shortDay(keys[6])
      : c.fullDay(sel) + (sel === today ? ' (hôm nay)' : '');
    let h = '<div class="cxwrap ' + view + '">' + bar() +
      '<div class="calh cxnav"><button type="button" data-act="cx-prev" aria-label="Trước">‹</button><h2>' + esc(label) + '</h2>' +
      '<button type="button" data-act="cx-next" aria-label="Sau">›</button><button type="button" class="todaybtn" data-act="cx-today">Hôm nay</button></div>';
    if (warns.length) {
      h += '<div class="cxwarn" role="status"><b>⚠️ ' + warns.length + ' chỗ trùng giờ</b><ul>' +
        warns.slice(0, 4).map((w) => '<li>' + (view === 'week' ? shortDay(w.k) + ': ' : '') + fmt(w.a.start) + ' ' + esc(w.a.title) + ' ↔ ' + fmt(w.b.start) + ' ' + esc(w.b.title) + '</li>').join('') +
        '</ul>' + (warns.length > 4 ? '<p>và ' + (warns.length - 4) + ' chỗ nữa</p>' : '') + '</div>';
    }
    h += '<div class="cxscroll"><div class="cxinner">' +
      '<div class="cxhead" style="--n:' + keys.length + '"><div class="cxcorner"></div>' +
      keys.map((k) => { const d = parseKey(k); return '<button type="button" class="cxdh' + (k === today ? ' today' : '') + '" data-act="cx-goday" data-key="' + k + '"><span>' + c.WDS[d.getDay()] + '</span><b>' + d.getDate() + '</b></button>'; }).join('') + '</div>' +
      '<div class="cxbody" style="--n:' + keys.length + '"><div class="cxgut" style="height:' + (HH * 24) + 'px">';
    for (let i = 1; i < 24; i++) h += '<div class="cxh" style="top:' + (i * HH) + 'px">' + pad(i) + ':00</div>';
    h += '</div>' + keys.map((k) => colHtml(k, evs[k], bad, today)).join('') + '</div></div></div>' +
      '<p class="dhint">Giữ và kéo một việc để đổi giờ. Chạm vào ô trống để thêm việc. Việc lặp lại: mở thẻ để đổi giờ.</p></div>';
    host.innerHTML = h;
    const sc = host.querySelector('.cxscroll');
    if (sc) {
      if (lastScroll === null) {
        const n = new Date();
        const m = keys.indexOf(today) >= 0 ? n.getHours() * 60 + n.getMinutes() - 60 : 6 * 60 + 30;
        lastScroll = Math.max(0, m * HH / 60);
      }
      sc.scrollTop = lastScroll;
    }
  }

  /* ---------- kéo thả đổi giờ ---------- */
  const host = () => document.getElementById('view-cal');
  function begin(e) {
    const d = drag; if (!d || d.active) return;
    d.active = true;
    const r = d.el.getBoundingClientRect();
    d.grab = (d.y0 - r.top) / HH * 60;            // chạm vào chỗ nào của khối thì giữ nguyên chỗ đó
    d.origCol = d.el.closest('.cxcol').getBoundingClientRect().left;
    d.el.classList.add('drag');
    try { d.el.setPointerCapture(d.pid); } catch (err) { /* bỏ qua */ }
    try { if (navigator.vibrate) navigator.vibrate(15); } catch (err) { /* bỏ qua */ }
    d.sc = d.el.closest('.cxscroll');
    d.auto = setInterval(() => {
      if (!drag || !drag.active || !drag.last || !drag.sc) return;
      const r2 = drag.sc.getBoundingClientRect(), y = drag.last.clientY;
      if (y < r2.top + 40) drag.sc.scrollTop -= 10; else if (y > r2.bottom - 40) drag.sc.scrollTop += 10; else return;
      update(drag.last);
    }, 30);
  }
  function update(e) {
    const d = drag; if (!d || !d.active) return;
    d.last = { clientX: e.clientX, clientY: e.clientY };
    const cols = Array.prototype.slice.call(host().querySelectorAll('.cxcol'));
    if (!cols.length) return;
    let col = cols.find((x) => { const r = x.getBoundingClientRect(); return e.clientX >= r.left && e.clientX < r.right; });
    if (!col) col = e.clientX < cols[0].getBoundingClientRect().left ? cols[0] : cols[cols.length - 1];
    const r = col.getBoundingClientRect(), len = d.end - d.start;
    let m = (e.clientY - r.top) / HH * 60 - d.grab;
    m = Math.round(m / SNAP) * SNAP;
    m = Math.max(0, Math.min(1440 - len, m));
    d.nm = m; d.nk = col.dataset.key;
    d.el.style.top = (m * HH / 60) + 'px';
    d.el.style.transform = 'translateX(' + (r.left - d.origCol) + 'px)';
    const t = d.el.querySelector('.cxt'); if (t) t.textContent = fmt(m) + '–' + fmt(m + len);
    const clash = dayEvents(d.nk).filter((o) => o.id !== d.id && !o.done && m < o.end && o.start < m + len);
    d.el.classList.toggle('warn', clash.length > 0);
  }
  function finish(cancel) {
    const d = drag; if (!d) return;
    clearTimeout(d.timer); clearInterval(d.auto);
    drag = null;
    if (!d.active) return;
    suppress = true; setTimeout(() => { suppress = false; }, 60);
    d.el.classList.remove('drag');
    const t = state.tasks.find((x) => x.id === d.id);
    if (cancel || !t || d.nm == null || (d.nk === d.key && d.nm === d.start)) { c.render(); return; }
    const old = t.when;
    t.when = d.nk + 'T' + fmt(d.nm);
    c.save(); c.render(); c.tick();
    const clash = dayEvents(d.nk).filter((o) => o.id !== d.id && !o.done && d.nm < o.end && o.start < d.nm + (d.end - d.start));
    c.alertUser(clash.length ? '⚠️' : '🗓️', 'Đã dời sang ' + shortDay(d.nk) + ', ' + fmt(d.nm),
      clash.length ? 'Trùng giờ với ' + clash.map((o) => o.title).slice(0, 2).join(', ') + '.' : 'Không trùng việc nào.',
      { label: 'Hoàn tác', fn: () => { const u = state.tasks.find((x) => x.id === d.id); if (u) { u.when = old; c.save(); c.render(); c.tick(); } } });
  }
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest && e.target.closest('.cxev');
    if (!el || (e.pointerType === 'mouse' && e.button > 0)) return;
    if (el.dataset.proj === '1') return;                       // bản chiếu của việc lặp: không kéo
    drag = { el: el, id: el.dataset.id, pid: e.pointerId, x0: e.clientX, y0: e.clientY, active: false,
      touch: e.pointerType === 'touch', start: +el.dataset.start, end: +el.dataset.end, key: el.dataset.key, timer: null };
    if (drag.touch) drag.timer = setTimeout(() => { if (drag && !drag.active) begin(); }, 350);   // cảm ứng: giữ 0,35 giây mới kéo
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.active) {
      const dist = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
      if (drag.touch) { if (dist > 8) { clearTimeout(drag.timer); drag = null; } return; }   // vuốt sớm = cuộn trang
      if (dist < 5) return;
      begin(e);
    }
    e.preventDefault();
    update(e);
  });
  document.addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.pid) finish(false); });
  document.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.pid) finish(true); });
  document.addEventListener('touchmove', (e) => { if (drag && drag.active) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', (e) => { if (drag && e.target.closest && e.target.closest('.cxev')) e.preventDefault(); });
  // Sau khi thả, trình duyệt bắn thêm sự kiện click: chặn để khỏi mở thẻ việc
  document.addEventListener('click', (e) => { if (suppress) { e.stopPropagation(); e.preventDefault(); } }, true);
  // Chạm vào ô trống: thêm việc tại giờ đó
  document.addEventListener('click', (e) => {
    const col = e.target.closest && e.target.closest('.cxcol');
    if (!col || e.target.closest('.cxev,.cxhb')) return;
    const r = col.getBoundingClientRect();
    const m = Math.floor(((e.clientY - r.top) / HH * 60) / 30) * 30;
    c.addAt(col.dataset.key, fmt(Math.max(0, Math.min(1410, m))));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('cxev')) c.openTask(e.target.dataset.id);
  });

  /* ---------- tìm giờ trống ---------- */
  function slotsFor(key, len) {
    const now = new Date();
    let from = toM(c.profileWake()), to = toM(c.profileBed());
    if (to <= from) to = 1320;
    if (key === dKey(now)) from = Math.max(from, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15);
    const busy = dayEvents(key).filter((e) => !e.done).map((e) => [e.start, e.end]);
    return C.freeGaps(busy, from, to, len);
  }
  function openFree(key, len) {
    key = key || c.getSel(); len = len || 60;
    const sh = c.sheet(), today = dKey(new Date());
    let days = [0, 1, 2, 3, 4, 5, 6].map((i) => { const k = addDays(today, i); return [k, i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : shortDay(k)]; });
    if (!days.some((x) => x[0] === key)) days.unshift([key, shortDay(key)]);
    const LENS = [[30, '30 phút'], [60, '1 giờ'], [90, '1,5 giờ'], [120, '2 giờ'], [180, '3 giờ']];
    const chips = (arr, cur, attr) => arr.map((o) => '<button type="button" class="wchip' + (String(o[0]) === String(cur) ? ' on' : '') + '" ' + attr + '="' + o[0] + '">' + esc(o[1]) + '</button>').join('');
    const paint = () => {
      const slots = slotsFor(key, len);
      sh.querySelector('#fr-days').innerHTML = chips(days, key, 'data-fk');
      sh.querySelector('#fr-lens').innerHTML = chips(LENS, len, 'data-fl');
      sh.querySelector('#fr-list').innerHTML = slots.length
        ? slots.slice(0, 8).map((s) => '<div class="frow"><div><b>' + fmt(s.start) + ' – ' + fmt(s.end) + '</b><span>trống ' + lenText(s.end - s.start) + '</span></div>' +
          '<button type="button" class="addt" data-fs="' + s.start + '">Đặt lúc ' + fmt(s.start) + '</button></div>').join('')
        : '<p class="dhint">Không có khoảng trống đủ ' + lenText(len) + ' trong ngày này (tính từ giờ dậy đến giờ ngủ). Thử chọn thời lượng ngắn hơn hoặc ngày khác.</p>';
    };
    sh.innerHTML = '<button class="sx" id="fr-x" type="button" aria-label="Đóng">✕</button><div class="grab"></div>' +
      '<h3 style="margin:0 0 10px">Tìm giờ trống</h3>' +
      '<div class="field"><label>Ngày</label><div class="wchips" id="fr-days"></div></div>' +
      '<div class="field"><label>Cần trống ít nhất</label><div class="wchips" id="fr-lens"></div></div>' +
      '<div class="field"><label>Các khoảng trống</label><div id="fr-list"></div></div>';
    document.body.classList.add('sheet-open');
    paint();
    sh.querySelector('#fr-x').onclick = c.closeSheet;
    sh.querySelector('#fr-days').onclick = (e) => { const b = e.target.closest('[data-fk]'); if (b) { key = b.dataset.fk; paint(); } };
    sh.querySelector('#fr-lens').onclick = (e) => { const b = e.target.closest('[data-fl]'); if (b) { len = +b.dataset.fl; paint(); } };
    sh.querySelector('#fr-list').onclick = (e) => {
      const b = e.target.closest('[data-fs]'); if (!b) return;
      const at = +b.dataset.fs, k = key, l = len;
      c.closeSheet();
      c.addAt(k, fmt(at), l);
    };
  }

  /* ---------- xuất / nhập .ics ---------- */
  function exportIcs() {
    const list = state.tasks.filter((t) => t.when && (!t.done || t.repeat !== 'none'));
    if (!list.length) { c.alertUser('⬇️', 'Chưa có việc nào để xuất', 'Thêm vài việc rồi thử lại nhé.'); return; }
    const events = list.map((t) => {
      const s = new Date(t.when).getTime();
      const desc = [t.note, (t.checklist || []).length ? 'Cần chuẩn bị: ' + t.checklist.map((x) => x.item + (x.qty ? ' (' + x.qty + ')' : '')).join(', ') : '']
        .filter(Boolean).join('\n');
      return { id: t.id, title: (t.emoji ? t.emoji + ' ' : '') + t.title, start: s, end: s + durOf(t) * 60000,
        repeat: t.repeat, leadMin: t.leadMin, description: desc };
    });
    const ics = C.toICS(events, { name: 'Remi' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    a.download = 'remi-lich.ics';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    c.alertUser('⬇️', 'Đã xuất ' + events.length + ' việc', 'Mở file .ics bằng Google Calendar, Apple Lịch hoặc Outlook để nhập.');
  }
  function importText(text) {
    const evs = C.parseICS(text).slice(0, 500);
    const now = Date.now(), sod = new Date(); sod.setHours(0, 0, 0, 0);
    const have = {};
    state.tasks.forEach((t) => { have[t.id + '@remi'] = 1; if (t.icsUid) have[t.icsUid] = 1; });
    let added = 0, dup = 0, past = 0;
    evs.forEach((e) => {
      if (e.id && have[e.id]) { dup++; return; }
      const notes = [];
      let rep = 'none';
      const rr = e.rrule || '';
      const fr = /FREQ=(DAILY|WEEKLY)/i.exec(rr), iv = /INTERVAL=(\d+)/i.exec(rr);
      if (fr && (!iv || +iv[1] === 1) && !/BYDAY=[^;]*,/i.test(rr) && !/COUNT=|UNTIL=/i.test(rr)) rep = fr[1].toLowerCase();
      else if (rr) notes.push('Lịch gốc lặp theo quy tắc riêng, Remi chỉ nhập một lần.');
      let start = e.start, len = Math.round((e.end - e.start) / 60000);
      if (e.allDay) { const d0 = new Date(e.start); d0.setHours(8, 0, 0, 0); start = d0.getTime(); len = 60; notes.push('Sự kiện cả ngày.'); }
      len = Math.max(15, Math.min(MAXD, len || DEF_DUR));
      if (rep === 'none' && start + len * 60000 < sod.getTime()) { past++; return; }
      if (rep !== 'none' && start < now) {                       // việc lặp từ quá khứ: nhảy tới lần tới
        const step = rep === 'weekly' ? 7 : 1, n = Math.ceil((now - start) / (step * 86400000));
        const d1 = new Date(start); d1.setDate(d1.getDate() + n * step); start = d1.getTime();
      }
      if (e.location) notes.push('Địa điểm: ' + e.location);
      if (e.description) notes.push(e.description);
      const st = c.splitTitle(String(e.title || 'Sự kiện').slice(0, 80), '📅');
      state.tasks.push({ id: c.uid(), title: st.title, emoji: st.emoji, when: c.toLocal(new Date(start)), leadMin: 0, repeat: rep,
        summary: '', checklist: [], tips: [], shop: false, done: false, durMin: len, icsUid: e.id || undefined, note: notes.join('\n').slice(0, 2000) });
      added++;
    });
    return { added: added, dup: dup, past: past, total: evs.length };
  }
  function importIcs() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.ics,text/calendar';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      if (f.size > 1500000) { c.alertUser('⬆️', 'File quá lớn', 'Chỉ nhập file .ics dưới 1,5 MB.'); return; }
      let text = '';
      try { text = await f.text(); } catch (err) { c.alertUser('⬆️', 'Không đọc được file', 'Thử lại với file .ics khác.'); return; }
      const r = importText(text);
      if (r.added) { c.save(); c.render(); c.tick(); }
      c.alertUser(r.added ? '⬆️' : 'ℹ️', r.added ? 'Đã nhập ' + r.added + ' sự kiện' : (r.total ? 'Không có sự kiện mới' : 'File này không có sự kiện'),
        [r.dup ? r.dup + ' đã có sẵn' : '', r.past ? r.past + ' đã qua nên bỏ qua' : ''].filter(Boolean).join(', '));
    };
    inp.click();
  }

  /* ---------- liên kết lịch để thuê bao ---------- */
  async function openLink() {
    const API = window.RemiAPI, sh = c.sheet();
    sh.innerHTML = '<button class="sx" id="lk-x" type="button" aria-label="Đóng">✕</button><div class="grab"></div>' +
      '<h3 style="margin:0 0 10px">Liên kết lịch</h3><div id="lk-body"><p class="dhint">Đang tải…</p></div>';
    document.body.classList.add('sheet-open');
    sh.querySelector('#lk-x').onclick = c.closeSheet;
    const body = sh.querySelector('#lk-body');
    let token = null, armed = false;
    const urlOf = (t) => location.origin + '/api/cal.ics?t=' + t;
    const fail = (e) => c.alertUser('🔗', 'Chưa làm được', (e && e.message) || 'Thử lại sau nhé.');
    const paint = () => {
      armed = false;
      if (!token) {
        body.innerHTML = '<p class="dhint" style="margin:0 0 12px">Tạo một đường dẫn riêng để Google Calendar, Apple Lịch hoặc Outlook tự cập nhật việc của bạn từ Remi (chỉ xem, không sửa được).</p>' +
          '<button class="aibtn" id="lk-new" type="button">🔗 Tạo liên kết</button>';
        body.querySelector('#lk-new').onclick = async () => { try { token = (await API.post('/api/cal/link', {})).token; paint(); } catch (e) { fail(e); } };
        return;
      }
      body.innerHTML = '<div class="field" style="margin-top:0"><label for="lk-url">Đường dẫn của bạn</label>' +
        '<input class="title-in" id="lk-url" readonly style="font-size:13px" value="' + esc(urlOf(token)) + '"></div>' +
        '<div class="sbtns" style="margin-top:8px"><button class="sec" id="lk-off" type="button">Tắt liên kết</button><button class="pri" id="lk-copy" type="button">Sao chép</button></div>' +
        '<button class="aibtn" id="lk-re" type="button" style="margin-top:10px">Tạo lại liên kết</button>' +
        '<div class="blk" style="margin-top:14px"><h4>Cách dùng</h4><ul class="tips">' +
        '<li>Google Calendar: Cài đặt, Thêm lịch, Từ URL, dán đường dẫn.</li>' +
        '<li>Apple Lịch: Tệp, Đăng ký lịch mới, dán đường dẫn.</li>' +
        '<li>Ai có đường dẫn đều xem được lịch của bạn. Nếu lộ, bấm Tạo lại để đường dẫn cũ hết dùng.</li></ul></div>';
      const inp = body.querySelector('#lk-url');
      inp.onfocus = () => inp.select();
      body.querySelector('#lk-copy').onclick = async () => {
        try { await navigator.clipboard.writeText(urlOf(token)); } catch (e) { inp.select(); try { document.execCommand('copy'); } catch (e2) { /* bỏ qua */ } }
        c.alertUser('🔗', 'Đã sao chép', 'Dán vào Google Calendar hoặc Apple Lịch nhé.');
      };
      body.querySelector('#lk-re').onclick = async (ev) => {
        if (!armed) { armed = true; ev.target.textContent = 'Chạm lần nữa: đường dẫn cũ sẽ hết dùng'; return; }
        try { token = (await API.post('/api/cal/link', {})).token; paint(); } catch (e) { fail(e); }
      };
      body.querySelector('#lk-off').onclick = async () => { try { await API.del('/api/cal/link', {}); token = null; paint(); } catch (e) { fail(e); } };
    };
    try { token = (await API.get('/api/cal/link')).token || null; } catch (e) { body.innerHTML = '<p class="dhint">Không tải được: ' + esc((e && e.message) || 'lỗi') + '</p>'; return; }
    paint();
  }

  /* ---------- điều khiển từ app.js ---------- */
  function act(a, el) {
    if (a === 'cx-view') { view = el.dataset.v; c.store.set('remi.calview', view); c.render(); }
    else if (a === 'cx-prev' || a === 'cx-next') { c.setSel(addDays(c.getSel(), (a === 'cx-next' ? 1 : -1) * (view === 'week' ? 7 : 1))); c.render(); }
    else if (a === 'cx-today') { c.setSel(dKey(new Date())); lastScroll = null; c.render(); }
    else if (a === 'cx-goday') { c.setSel(el.dataset.key); view = 'day'; c.store.set('remi.calview', view); c.render(); }
    else if (a === 'cx-free') openFree(c.getSel());
    else if (a === 'cx-export') exportIcs();
    else if (a === 'cx-import') importIcs();
    else if (a === 'cx-link') openLink();
  }
  return { isTimeline: () => view !== 'month', bar: bar, render: render, act: act, openFree: openFree, importText: importText };
};
