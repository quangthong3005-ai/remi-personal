/* Nhóm B: giao diện tab "Bếp" (thực đơn tuần, tủ đồ, món của tôi, gợi ý hôm nay nấu gì).
   Logic tính toán nằm trong kitchen.js (có test riêng); file này chỉ vẽ và nối sự kiện.
   app.js gọi window.RemiKitchenUI(ctx) một lần và nhận lại { render, todayBanner, stockFromTask, openToday }. */
(function () {
  'use strict';
  const K = window.RemiKitchen;
  const Q = window.RemiQty;
  const WDS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const WD = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
  const SLOT = {};
  K.SLOTS.forEach((s) => { SLOT[s.id] = s; });
  const EXP_OPTS = [['', 'Không ghi'], ['3', '3 ngày'], ['7', '1 tuần'], ['14', '2 tuần'], ['30', '1 tháng']];

  window.RemiKitchenUI = function create(ctx) {
    const { state, esc, uid } = ctx;
    const $ = (s) => document.querySelector(s);
    let LIB = [];
    let libState = 'idle'; // idle | loading | ready | error
    const ui = { sub: ctx.store.get('remi.ksub', 'plan'), week: null };

    if (!state.kitchen) state.kitchen = K.normalizeKitchen(null);
    const today = () => K.localKey(new Date());
    const curSlot = () => K.slotForHour(new Date().getHours());
    const dayShort = (key) => { const p = key.split('-'); return WDS[K.weekdayOf(key)] + ' ' + (+p[2]) + '/' + (+p[1]); };
    const dayLong = (key) => { const p = key.split('-'); return WD[K.weekdayOf(key)] + ' ' + (+p[2]) + '/' + (+p[1]); };
    const index = () => K.dishIndex(LIB, state.kitchen.recipes);
    const dishes = () => K.allDishes(LIB, state.kitchen.recipes);
    const commit = () => { ctx.save(); ctx.render(); };

    function loadLibrary() {
      if (libState === 'loading' || libState === 'ready') return;
      libState = 'loading';
      fetch('/data/dishes.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then((j) => { LIB = K.libraryFrom(j); libState = 'ready'; ctx.render(); })
        .catch(() => { libState = 'error'; ctx.render(); });
    }

    /* ---------------- vẽ tab ---------------- */
    function render(host) {
      loadLibrary();
      const ae = document.activeElement;
      if (ae && host.contains(ae) && /^(TEXTAREA|INPUT)$/.test(ae.tagName)) return; // đang gõ thì không vẽ lại kẻo mất chữ
      if (!ui.week) ui.week = K.weekStart(today());
      const sum = K.stockSummary(state.kitchen.stock, today());
      const warn = sum.expired + sum.soon;
      const tabs = [['plan', '🗓️ Thực đơn tuần'], ['stock', '🧺 Tủ đồ' + (warn ? ' <span class="kbadge" aria-label="' + warn + ' món cần chú ý">' + warn + '</span>' : '')], ['mine', '👩‍🍳 Món của tôi']];
      let h = '<h2>Bếp nhà mình</h2><div class="seg kseg" role="tablist" aria-label="Phần của bếp">' +
        tabs.map((t) => '<button type="button" role="tab" data-k="sub" data-v="' + t[0] + '" aria-selected="' + (ui.sub === t[0]) + '" class="' + (ui.sub === t[0] ? 'on' : '') + '">' + t[1] + '</button>').join('') + '</div>';
      if (libState === 'error') h += '<div class="banner"><p>Chưa tải được kho món có sẵn. Món của bạn vẫn dùng bình thường.</p><button type="button" data-k="reloadlib">Thử lại</button></div>';
      if (ui.sub === 'stock') h += stockView(sum);
      else if (ui.sub === 'mine') h += mineView();
      else h += todayCard() + planView();
      host.innerHTML = h;
      if (ui.sub === 'stock') syncExpChips();
    }

    /* ---------- hôm nay nấu gì ---------- */
    function todayCard() {
      const t = today(), slot = curSlot();
      const planned = state.kitchen.meals[K.mealKey(t, slot)] || [];
      let h = '<section class="kcard ktoday" id="k-today" aria-label="Hôm nay nấu gì"><div class="kc-h"><h3>🍳 Hôm nay nấu gì?</h3><span class="sub">Bữa ' + SLOT[slot].label.toLowerCase() + '</span></div>';
      if (planned.length) {
        h += '<p class="dhint">Đã lên thực đơn: ' + planned.map((e, i) => '<button type="button" class="kmeal" data-k="meal" data-key="' + K.mealKey(t, slot) + '" data-i="' + i + '">' + esc(e.n) + ' <small>' + e.s + ' người</small></button>').join(' ') + '</p>';
      }
      if (!state.kitchen.stock.length) {
        h += '<p class="dhint">Thêm đồ đang có vào <button type="button" class="klink" data-k="sub" data-v="stock">Tủ đồ</button>, Remi sẽ gợi ý món nấu được ngay, ưu tiên đồ sắp hết hạn.</p></section>';
        return h;
      }
      const sug = K.suggest(dishes(), state.kitchen.stock, state.kitchen.meals, t, { limit: 3 });
      if (!sug.length) {
        h += '<p class="dhint">' + (libState === 'loading' ? 'Đang tải kho món...' : 'Chưa có món nào dùng được đồ trong tủ. Thêm món quen của nhà bạn vào <button type="button" class="klink" data-k="sub" data-v="mine">Món của tôi</button> nhé.') + '</p></section>';
        return h;
      }
      h += '<div class="ksugs">' + sug.map((s) => '<div class="ksug" data-dish="' + esc(s.dish.id) + '"><div class="ksug-t"><b>' + esc(s.dish.name) + (s.dish.mine ? ' <span class="chip ai">Món của tôi</span>' : '') + '</b>' +
        '<span>' + esc(s.reasons.join(' · ')) + '</span>' +
        (s.missing.length ? '<span class="kmiss">Thiếu: ' + esc(s.missing.slice(0, 4).join(', ')) + (s.missing.length > 4 ? '…' : '') + '</span>' : '<span class="kfull">Đủ nguyên liệu chính</span>') +
        '</div><button type="button" class="addt" data-k="sugadd" data-id="' + esc(s.dish.id) + '">+ Bữa ' + SLOT[slot].label.toLowerCase() + '</button></div>').join('') + '</div></section>';
      return h;
    }

    /* ---------- thực đơn tuần ---------- */
    function planView() {
      const start = ui.week, days = K.weekDays(start), t = today();
      const entries = K.weekEntries(state.kitchen.meals, start);
      const nMeals = new Set(entries.map((e) => e.date + e.slot)).size;
      let h = '<div class="calh kweek-h"><button type="button" data-k="wprev" aria-label="Tuần trước">‹</button><h2>Tuần ' + dayShort(days[0]).slice(3) + ' – ' + dayShort(days[6]).slice(3) + '</h2>' +
        '<button type="button" data-k="wnext" aria-label="Tuần sau">›</button>' + (start !== K.weekStart(t) ? '<button type="button" class="todaybtn" data-k="wnow">Tuần này</button>' : '') + '</div>';
      h += '<p class="dhint" id="k-wsum">' + (nMeals ? nMeals + ' bữa đã lên thực đơn, ' + entries.length + ' món.' : 'Chưa có bữa nào. Chạm dấu + để thêm món cho từng bữa.') + '</p>';
      h += '<div class="kweek" id="k-week">' + days.map((d) => {
        const cls = 'kday' + (d === t ? ' today' : '') + (d < t ? ' past' : '');
        return '<section class="' + cls + '" aria-label="' + esc(dayLong(d)) + '"><h3>' + (d === t ? 'Hôm nay, ' : '') + dayShort(d) + '</h3>' + K.SLOTS.map((s) => {
          const key = K.mealKey(d, s.id), list = state.kitchen.meals[key] || [];
          return '<div class="kslot" data-key="' + key + '"><span class="kslab"><span aria-hidden="true">' + s.emoji + '</span> ' + s.label + '</span><div class="kmeals">' +
            list.map((e, i) => '<button type="button" class="kmeal" data-k="meal" data-key="' + key + '" data-i="' + i + '">' + esc(e.n) + ' <small>' + e.s + '</small></button>').join('') +
            (list.length < K.MAX.perSlot ? '<button type="button" class="kadd" data-k="add" data-key="' + key + '" aria-label="Thêm món bữa ' + s.label.toLowerCase() + ' ' + esc(dayLong(d)) + '">+</button>' : '') + '</div></div>';
        }).join('') + '</section>';
      }).join('') + '</div>';
      h += '<div class="kacts"><button type="button" class="send" data-k="shop"' + (entries.length ? '' : ' disabled') + '>🛒 Gộp thành danh sách đi chợ</button>' +
        '<button type="button" class="tone" data-k="copy">Chép tuần trước</button>' + (entries.length ? '<button type="button" class="tone" data-k="clear">Xoá tuần</button>' : '') + '</div>';
      return h;
    }

    /* ---------- tủ đồ ---------- */
    function stockView(sum) {
      const t = today();
      let h = '<section class="kcard" aria-label="Thêm đồ vào tủ"><div class="field" style="margin-top:0"><label for="ks-name">Thêm đồ vào tủ</label>' +
        '<div class="krow2"><input id="ks-name" maxlength="60" list="ks-names" autocomplete="off" placeholder="Tên, ví dụ Thịt gà" enterkeyhint="next">' +
        '<input id="ks-qty" class="kqty" maxlength="24" placeholder="500 g" aria-label="Số lượng" enterkeyhint="done"></div>' +
        '<datalist id="ks-names">' + nameSuggestions().map((n) => '<option value="' + esc(n) + '">').join('') + '</datalist></div>' +
        '<div class="field"><label>Hạn dùng</label><div class="wchips" id="ks-exp">' + EXP_OPTS.map((o) => '<button type="button" class="wchip' + (o[0] === '' ? ' on' : '') + '" data-v="' + o[0] + '">' + o[1] + '</button>').join('') +
        '<input type="date" id="ks-date" class="kdate" aria-label="Chọn ngày hết hạn" min="' + t + '"></div><p class="dhint wlab" id="ks-explab">Không ghi hạn dùng</p></div>' +
        '<p class="dhint wwarn" id="ks-err" role="alert"></p><button type="button" class="send" id="ks-add" data-k="sadd">Thêm vào tủ</button></section>';
      h += '<h2>Trong tủ<span class="sub">' + sum.total + ' món' + (sum.expired ? ', ' + sum.expired + ' đã hết hạn' : '') + (sum.soon ? ', ' + sum.soon + ' sắp hết hạn' : '') + '</span></h2>';
      if (!sum.total) return h + '<div class="empty"><b>Tủ đồ còn trống</b>Ghi lại đồ đang có để Remi trừ bớt khi đi chợ, nhắc khi sắp hết hạn và gợi ý món nấu.</div>';
      if (sum.expired) h += '<button type="button" class="linkbtn" data-k="sclean">Bỏ ' + sum.expired + ' món đã hết hạn</button>';
      h += '<div class="kstock" id="k-stock">' + K.sortStock(state.kitchen.stock, t).map((x) => {
        const st = K.expiryStatus(x, t);
        const chip = st.level === 'expired' ? 'late' : st.level === 'soon' ? 'lead' : '';
        return '<div class="kitem lv-' + st.level + '" data-id="' + esc(x.id) + '"><div class="kin"><b>' + esc(x.name) + '</b><span class="chip ' + chip + '">' + esc(st.text) + '</span></div>' +
          '<div class="qs"><button type="button" data-k="sq" data-d="-1" data-id="' + esc(x.id) + '" aria-label="Giảm ' + esc(x.name) + '"' + (Q.canStep(x.qty) ? '' : ' disabled') + '>−</button>' +
          '<input class="lq" data-kq="' + esc(x.id) + '" value="' + esc(x.qty) + '" maxlength="24" aria-label="Số lượng ' + esc(x.name) + '">' +
          '<button type="button" data-k="sq" data-d="1" data-id="' + esc(x.id) + '" aria-label="Tăng ' + esc(x.name) + '"' + (Q.canStep(x.qty) ? '' : ' disabled') + '>+</button></div>' +
          '<button type="button" class="lx" data-k="sdel" data-id="' + esc(x.id) + '" aria-label="Bỏ ' + esc(x.name) + ' khỏi tủ">×</button></div>';
      }).join('') + '</div>';
      return h;
    }
    function nameSuggestions() {
      const seen = {}, out = [];
      const add = (n) => { const k = K.normName(n); if (k && !seen[k]) { seen[k] = 1; out.push(n); } };
      Object.keys(state.pantry || {}).forEach((k) => add(state.pantry[k].name));
      dishes().forEach((d) => d.items.forEach((x) => add(x.item)));
      return out.slice(0, 200);
    }

    /* ---------- món của tôi ---------- */
    function mineView() {
      const mine = state.kitchen.recipes.map(K.recipeToDish).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      let h = '<button type="button" class="send kmt" data-k="newrec">＋ Tạo món của riêng mình</button>';
      h += '<h2>Món của tôi<span class="sub">' + mine.length + ' món</span></h2>';
      h += mine.length ? '<div class="krecs">' + mine.map((d) => recCard(d, true)).join('') + '</div>'
        : '<div class="empty"><b>Chưa có món nào của riêng bạn</b>Ghi lại món quen của nhà mình (tên, số người, nguyên liệu) để lên thực đơn và gộp danh sách đi chợ.</div>';
      h += '<h2>Món có sẵn<span class="sub">' + LIB.length + ' món</span></h2>';
      h += libState === 'loading' ? '<p class="dhint">Đang tải...</p>' : '<div class="krecs">' + LIB.map((d) => recCard(d, false)).join('') + '</div>';
      return h;
    }
    function recCard(d, mine) {
      return '<div class="kcard krec"><div><b>' + esc(d.name) + '</b><span class="dhint">' + d.servings + ' người · ' + d.items.length + ' nguyên liệu</span>' +
        '<span class="krec-i">' + esc(d.items.slice(0, 5).map((x) => x.item).join(', ')) + (d.items.length > 5 ? '…' : '') + '</span></div>' +
        '<button type="button" class="tone" data-k="' + (mine ? 'editrec' : 'copyrec') + '" data-id="' + esc(d.id) + '">' + (mine ? 'Sửa' : 'Chép để sửa') + '</button></div>';
    }

    /* ---------------- khung chi tiết ---------------- */
    function openSheet(html) {
      const sh = $('#sheet');
      sh.innerHTML = '<button class="sx" type="button" data-k="close" aria-label="Đóng">✕</button><div class="grab"></div>' + html;
      sh.scrollTop = 0;
      document.body.classList.add('sheet-open');
      return sh;
    }
    const close = () => ctx.closeSheet();
    const svHtml = (id, n) => '<div class="serv"><span>Số người ăn</span><div class="qs"><button type="button" data-sv="-1" aria-label="Giảm số người ăn">−</button><b id="' + id + '" aria-live="polite">' + n + '</b><button type="button" data-sv="1" aria-label="Tăng số người ăn">+</button></div></div>';
    function bindServings(sh, get, set) {
      sh.querySelector('.serv').addEventListener('click', (e) => {
        const b = e.target.closest('[data-sv]'); if (!b) return;
        set(Math.max(1, Math.min(20, get() + Number(b.dataset.sv))));
      });
    }

    /* chọn món cho một bữa */
    function openPicker(key, preset) {
      const mk = K.parseMealKey(key); if (!mk) return;
      let sv = ctx.store.get('remi.kserv', 4);
      const sh = openSheet('<h3 class="kst">Thêm món · Bữa ' + SLOT[mk.slot].label.toLowerCase() + ' ' + esc(dayLong(mk.date)) + '</h3>' + svHtml('kp-sv', sv) +
        '<div class="shopbox"><div class="sbar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
        '<input id="kp-q" type="text" autocomplete="off" maxlength="60" aria-label="Tìm món" placeholder="Tìm món hoặc nguyên liệu" value="' + esc(preset || '') + '"></div><div class="slist" id="kp-list"></div></div>');
      bindServings(sh, () => sv, (n) => { sv = n; $('#kp-sv').textContent = n; });
      const list = $('#kp-list'), q = $('#kp-q');
      const draw = () => {
        const raw = q.value.trim();
        const all = dishes(), found = K.searchDishes(all, raw);
        let h = '';
        if (!raw && state.kitchen.stock.length) {
          const sug = K.suggest(all, state.kitchen.stock, state.kitchen.meals, mk.date, { limit: 3 });
          if (sug.length) h += '<div class="shead">Hợp với tủ đồ</div>' + sug.map((s) => row(s.dish, 'Có ' + s.have + '/' + s.total)).join('');
        }
        const mine = found.filter((d) => d.mine), lib = found.filter((d) => !d.mine);
        if (mine.length) h += '<div class="shead">Món của tôi</div>' + mine.map((d) => row(d)).join('');
        if (lib.length) h += '<div class="shead">Món có sẵn</div>' + lib.map((d) => row(d)).join('');
        if (raw && !found.some((d) => K.normName(d.name) === K.normName(raw))) h = '<button type="button" class="srow new" data-pick-new="1"><span class="plus">+</span><span class="sname">Tạo món “' + esc(raw) + '”</span></button>' + h;
        if (!h) h = '<p class="dhint" style="padding:14px">' + (libState === 'loading' ? 'Đang tải kho món...' : 'Chưa có món nào. Gõ tên để tạo món mới.') + '</p>';
        list.innerHTML = h;
      };
      const row = (d, sub) => '<button type="button" class="srow" data-pick="' + esc(d.id) + '"><span class="plus">+</span><span class="sname">' + esc(d.name) + '</span><span class="sqty">' + esc(sub || d.items.length + ' nguyên liệu') + '</span></button>';
      draw();
      q.addEventListener('input', () => { list.scrollTop = 0; draw(); });
      q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const f = list.querySelector('[data-pick],[data-pick-new]'); if (f) f.click(); } });
      list.addEventListener('click', (e) => {
        const nw = e.target.closest('[data-pick-new]');
        if (nw) { const name = q.value.trim(); openRecipe(null, { name, servings: sv, afterSave: (d) => addTo(key, d, sv) }); return; }
        const b = e.target.closest('[data-pick]'); if (!b) return;
        const d = index()[b.dataset.pick]; if (!d) return;
        addTo(key, d, sv); close();
      });
    }
    function addTo(key, dish, sv) {
      const mk = K.parseMealKey(key);
      const r = K.addMeal(state.kitchen.meals, mk.date, mk.slot, dish, sv);
      if (!r.added) { ctx.alertUser('🍽️', 'Bữa này đã đủ ' + K.MAX.perSlot + ' món', 'Bỏ bớt một món rồi thêm lại nhé.'); return; }
      state.kitchen.meals = r.meals;
      ctx.store.set('remi.kserv', sv);
      commit();
    }

    /* một món trong bữa: đổi số người, bỏ, nấu xong */
    function openMeal(key, i) {
      const mk = K.parseMealKey(key); const list = state.kitchen.meals[key] || []; const e = list[i];
      if (!mk || !e) return;
      const dish = index()[e.d];
      let sv = e.s;
      const ing = () => dish ? dish.items.map((x) => '<div class="li"><span>' + esc(x.item) + '</span><span>' + esc(Q.scaleQty(x.qty, sv / dish.servings) || '') + '</span></div>').join('') : '';
      const sh = openSheet('<h3 class="kst">' + esc(e.n) + '</h3><p class="dhint">Bữa ' + SLOT[mk.slot].label.toLowerCase() + ' ' + esc(dayLong(mk.date)) + '</p>' + svHtml('km-sv', sv) +
        (dish ? '<div class="blk"><h4>Nguyên liệu</h4><div id="km-ing">' + ing() + '</div></div>' + (dish.note ? '<div class="blk"><h4>Cách nấu</h4><p class="dhint kpre">' + esc(dish.note) + '</p></div>' : '')
          : '<p class="dhint wwarn">Món này không còn công thức (có thể đã bị xoá khỏi Món của tôi), nên không tính vào danh sách đi chợ.</p>') +
        '<div class="sbtns"><button class="sec" type="button" data-k="mrm">Bỏ khỏi bữa</button>' + (dish ? '<button class="pri" type="button" data-k="mcook">🍳 Nấu xong, trừ tủ đồ</button>' : '<button class="pri" type="button" data-k="close">Đóng</button>') + '</div>');
      bindServings(sh, () => sv, (n) => {
        sv = n; $('#km-sv').textContent = n; if ($('#km-ing')) $('#km-ing').innerHTML = ing();
        const cur = (state.kitchen.meals[key] || []).slice(); if (!cur[i]) return;
        cur[i] = Object.assign({}, cur[i], { s: n }); state.kitchen.meals = Object.assign({}, state.kitchen.meals, { [key]: cur }); commit(); // vẽ lại lưới phía sau để số người cập nhật ngay
      });
      sh.dataset.meal = key + '#' + i;
    }
    function cook(dish, sv) {
      const r = K.consume(state.kitchen.stock, dish, sv, today());
      state.kitchen.stock = r.stock;
      commit();
      ctx.alertUser('🍳', 'Ngon miệng nhé!', r.used.length ? 'Đã trừ khỏi tủ: ' + r.used.join(', ') + '.' : 'Tủ đồ không có nguyên liệu nào của món này để trừ.');
    }

    /* gộp danh sách đi chợ cho tuần đang xem */
    function openShop() {
      const start = ui.week, days = K.weekDays(start);
      const entries = K.weekEntries(state.kitchen.meals, start);
      const agg = K.aggregate(entries, index());
      const rows = K.subtractStock(agg.items, state.kitchen.stock, today());
      const pick = rows.map((r) => !r.covered);
      const need = rows.filter((r) => !r.covered), have = rows.filter((r) => r.covered);
      const rowHtml = (r) => { const i = rows.indexOf(r); return '<label class="krow"><input type="checkbox" data-ki="' + i + '"' + (pick[i] ? ' checked' : '') + '><span class="kn"><b>' + esc(r.item) + '</b><small>' +
        esc((r.have ? 'Tủ có ' + r.have + ' · ' : '') + r.dishes.join(', ')) + '</small></span><span class="kq">' + esc(r.covered ? (r.unsure ? r.text : 'Đủ') : r.need) + '</span></label>'; };
      const t = new Date(), when = new Date(t);
      if (t.getHours() < 16) when.setHours(17, 0, 0, 0); else { when.setDate(when.getDate() + 1); when.setHours(8, 0, 0, 0); }
      const old = state.tasks.find((x) => x.mealWeek === start && !x.done);
      const sh = openSheet('<h3 class="kst">🛒 Đi chợ cho tuần ' + dayShort(days[0]).slice(3) + ' – ' + dayShort(days[6]).slice(3) + '</h3>' +
        '<p class="dhint">' + entries.length + ' món trong thực đơn, ' + rows.length + ' nguyên liệu. Đã trừ đồ đang có trong tủ (không tính đồ hết hạn).</p>' +
        (agg.missing.length ? '<p class="dhint wwarn">Không tính được: ' + esc(agg.missing.join(', ')) + ' (không còn công thức).</p>' : '') +
        (old ? '<p class="understood">Tuần này đã có việc đi chợ. Lưu lại sẽ cập nhật việc đó, không tạo việc mới.</p>' : '') +
        '<div class="blk"><h4>Cần mua <span class="sub" id="ks-n"></span></h4><div class="klist" id="ks-need">' + (need.length ? need.map(rowHtml).join('') : '<p class="dhint">Tủ đồ đã đủ hết rồi!</p>') + '</div></div>' +
        (have.length ? '<details class="more"><summary>Đã có trong tủ (' + have.length + ')</summary><div class="klist">' + have.map(rowHtml).join('') + '</div></details>' : '') +
        ctx.whenBlockHtml(old ? old.when : ctx.toLocal(when), old ? old.leadMin : 30, 'none', 'kw') +
        '<div class="sbtns"><button class="sec" type="button" data-k="close">Huỷ</button><button class="pri" type="button" id="ks-ok">' + (old ? 'Cập nhật việc đi chợ' : 'Tạo việc đi chợ') + '</button></div>');
      ctx.bindWhenBlock('kw');
      const count = () => { const n = pick.filter(Boolean).length; $('#ks-n').textContent = n + ' món đã chọn'; $('#ks-ok').disabled = !n; };
      count();
      sh.addEventListener('change', (e) => { const i = e.target.dataset.ki; if (i === undefined) return; pick[+i] = e.target.checked; count(); });
      $('#ks-ok').onclick = () => {
        const list = rows.filter((_, i) => pick[i]).map((r) => {
          const prev = old && (old.checklist || []).find((c) => K.normName(c.item) === r.key);
          return { item: r.item, qty: r.need || r.text, done: !!(prev && prev.done) };
        });
        if (!list.length) return;
        const w = $('#kw-when').value, lead = parseInt($('#kw-lead').value, 10) || 0;
        const title = 'Đi chợ cho thực đơn tuần ' + dayShort(days[0]).slice(3);
        if (old) Object.assign(old, { checklist: list, when: w, leadMin: lead });
        else state.tasks.push({ id: uid(), title, emoji: '🛒', when: w, leadMin: lead, repeat: 'none', summary: '', checklist: list, tips: [], shop: true, mealWeek: start, done: false });
        list.forEach((x) => ctx.pantryAdd(x.item));
        close(); commit();
        ctx.alertUser('🛒', old ? 'Đã cập nhật việc đi chợ' : 'Đã tạo việc đi chợ', list.length + ' món, lúc ' + w.slice(11) + ' ' + dayShort(w.slice(0, 10)) + '. Xem ở tab Hôm nay hoặc Sắp tới.');
      };
    }

    /* tạo hoặc sửa món của tôi */
    function openRecipe(id, preset) {
      preset = preset || {};
      const old = id ? state.kitchen.recipes.find((r) => r.id === id) : null;
      const r = old ? JSON.parse(JSON.stringify(old)) : { name: preset.name || '', servings: preset.servings || 4, items: (preset.items || []).map((x) => ({ item: x.item, qty: x.qty })), note: preset.note || '' };
      if (!r.items.length) r.items.push({ item: '', qty: '' });
      const sh = openSheet('<h3 class="kst">' + (old ? 'Sửa món' : 'Món mới của tôi') + '</h3>' +
        '<div class="field"><label for="kr-name">Tên món</label><input class="title-in" id="kr-name" maxlength="60" value="' + esc(r.name) + '"></div>' +
        svHtml('kr-sv', r.servings) +
        '<div class="blk"><h4>Nguyên liệu</h4><div class="kings" id="kr-items"></div><button type="button" class="tone" id="kr-addi">＋ Thêm nguyên liệu</button>' +
        '<p class="dhint">Ghi lượng dạng số + đơn vị (500 g, 2 củ, 1 muỗng) để Remi cộng dồn và co giãn được.</p></div>' +
        '<div class="field"><label for="kr-note">Cách nấu (tuỳ chọn)</label><textarea class="note" id="kr-note" maxlength="500" rows="3">' + esc(r.note || '') + '</textarea></div>' +
        '<p class="dhint wwarn" id="kr-err" role="alert"></p>' +
        '<div class="sbtns">' + (old ? '<button class="sec" type="button" id="kr-del">Xoá món</button>' : '<button class="sec" type="button" data-k="close">Huỷ</button>') + '<button class="pri" type="button" id="kr-ok">Lưu món</button></div>');
      const items = $('#kr-items');
      const draw = (focusLast) => {
        items.innerHTML = r.items.map((x, i) => '<div class="kingr"><input data-ri="' + i + '" data-f="item" maxlength="60" value="' + esc(x.item) + '" aria-label="Nguyên liệu ' + (i + 1) + '" placeholder="Nguyên liệu">' +
          '<input class="kqty" data-ri="' + i + '" data-f="qty" maxlength="24" value="' + esc(x.qty) + '" aria-label="Lượng nguyên liệu ' + (i + 1) + '" placeholder="Lượng">' +
          '<button type="button" class="lx" data-rx="' + i + '" aria-label="Bỏ nguyên liệu ' + (i + 1) + '">×</button></div>').join('');
        if (focusLast) { const f = items.querySelectorAll('[data-f="item"]'); if (f.length) f[f.length - 1].focus(); }
      };
      draw(false);
      bindServings(sh, () => r.servings, (n) => { r.servings = n; $('#kr-sv').textContent = n; });
      items.addEventListener('input', (e) => { const i = e.target.dataset.ri; if (i !== undefined) r.items[+i][e.target.dataset.f] = e.target.value; });
      items.addEventListener('click', (e) => { const b = e.target.closest('[data-rx]'); if (!b) return; r.items.splice(+b.dataset.rx, 1); if (!r.items.length) r.items.push({ item: '', qty: '' }); draw(false); });
      items.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset.f === 'qty') { e.preventDefault(); r.items.push({ item: '', qty: '' }); draw(true); } });
      $('#kr-addi').onclick = () => { if (r.items.length >= K.MAX.items) return; r.items.push({ item: '', qty: '' }); draw(true); };
      $('#kr-ok').onclick = () => {
        r.name = $('#kr-name').value.trim(); r.note = $('#kr-note').value.trim();
        const err = K.validateRecipe(r);
        if (err) { $('#kr-err').textContent = err; return; }
        const clean = { name: r.name, servings: r.servings, items: r.items.map((x) => ({ item: x.item.trim(), qty: x.qty.trim() })).filter((x) => x.item), note: r.note };
        let saved;
        if (old) { Object.assign(old, clean); saved = old; } else { saved = Object.assign({ id: 'my-' + uid() }, clean); state.kitchen.recipes.push(saved); }
        // đổi tên món thì đổi luôn tên hiển thị trong thực đơn
        Object.keys(state.kitchen.meals).forEach((k) => {
          if (state.kitchen.meals[k].some((e) => e.d === saved.id)) state.kitchen.meals = Object.assign({}, state.kitchen.meals, { [k]: state.kitchen.meals[k].map((e) => e.d === saved.id ? Object.assign({}, e, { n: K.recipeToDish(saved).name }) : e) });
        });
        close();
        if (preset.afterSave) preset.afterSave(K.recipeToDish(saved)); else commit();
        ctx.toast(old ? 'Đã lưu món ' + clean.name : 'Đã thêm ' + clean.name + ' vào Món của tôi');
      };
      if ($('#kr-del')) {
        let armed = false;
        $('#kr-del').onclick = () => {
          if (!armed) { armed = true; $('#kr-del').textContent = 'Chạm lần nữa để xoá'; return; }
          state.kitchen.recipes = state.kitchen.recipes.filter((x) => x.id !== id);
          close(); commit();
        };
      }
      if (!old) setTimeout(() => { const f = $('#kr-name'); if (f && !f.value) f.focus(); }, 250);
    }

    /* ---------------- tủ đồ: thêm, sửa, bỏ ---------------- */
    let expPick = '';
    function stockAdd() {
      const name = $('#ks-name').value, qty = $('#ks-qty').value;
      const r = K.addStock(state.kitchen.stock, { name, qty, exp: expPick }, 'st-' + uid(), today());
      if (r.error) { $('#ks-err').textContent = r.error; $('#ks-name').focus(); return; }
      state.kitchen.stock = r.stock;
      ctx.pantryAdd(name);
      expPick = '';   // món sau thường có hạn khác: trả về "Không ghi" thay vì giữ hạn cũ một cách âm thầm
      $('#ks-name').value = ''; $('#ks-qty').value = '';
      ctx.save(); document.activeElement.blur(); ctx.render();
      ctx.toast(r.merged ? 'Đã cộng thêm vào ' + name.trim() : 'Đã thêm ' + name.trim() + ' vào tủ');
      const n = $('#ks-name'); if (n) n.focus();
    }
    function syncExpChips() {
      const box = $('#ks-exp'); if (!box) return;
      const days = expPick ? K.daysBetween(today(), expPick) : null;
      box.querySelectorAll('.wchip').forEach((b) => b.classList.toggle('on', b.dataset.v === '' ? !expPick : days === Number(b.dataset.v)));
      const lab = $('#ks-explab');
      if (lab) lab.textContent = expPick ? 'Hết hạn ' + dayLong(expPick) + ' (' + K.expiryStatus({ exp: expPick }, today()).text.toLowerCase() + ')' : 'Không ghi hạn dùng';
      const d = $('#ks-date'); if (d) d.value = expPick;
    }
    function removeStock(id) {
      const i = state.kitchen.stock.findIndex((x) => x.id === id); if (i < 0) return;
      const gone = state.kitchen.stock[i];
      state.kitchen.stock = state.kitchen.stock.filter((x) => x.id !== id);
      commit();
      ctx.alertUser('🧺', 'Đã bỏ ' + gone.name + ' khỏi tủ', '', { label: 'Hoàn tác', fn: () => { state.kitchen.stock = state.kitchen.stock.concat([Object.assign({}, gone, { id: 'st-' + uid() })]); commit(); } });
    }

    /* ---------------- sự kiện ---------------- */
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-k]'); if (!el) return;
      const k = el.dataset.k;
      if (k === 'close') { close(); return; }
      if (k === 'sub') { ui.sub = el.dataset.v; ctx.store.set('remi.ksub', ui.sub); if (document.body.classList.contains('sheet-open')) close(); ctx.goTab('kitchen'); return; }
      if (k === 'gostock') { ui.sub = 'stock'; ctx.goTab('kitchen'); return; }
      if (k === 'reloadlib') { libState = 'idle'; loadLibrary(); return; }
      if (k === 'wprev' || k === 'wnext') { ui.week = K.addDays(ui.week, k === 'wprev' ? -7 : 7); ctx.render(); return; }
      if (k === 'wnow') { ui.week = K.weekStart(today()); ctx.render(); return; }
      if (k === 'add') { openPicker(el.dataset.key); return; }
      if (k === 'meal') { openMeal(el.dataset.key, +el.dataset.i); return; }
      if (k === 'mrm' || k === 'mcook') {
        const p = String($('#sheet').dataset.meal || '').split('#'), key = p[0], i = +p[1];
        const entry = (state.kitchen.meals[key] || [])[i]; if (!entry) { close(); return; }
        const mk = K.parseMealKey(key);
        if (k === 'mrm') { state.kitchen.meals = K.removeMeal(state.kitchen.meals, mk.date, mk.slot, i); close(); commit(); return; }
        const dish = index()[entry.d]; close(); if (dish) cook(dish, entry.s); return;
      }
      if (k === 'sugadd') {
        const d = index()[el.dataset.id]; if (!d) return;
        addTo(K.mealKey(today(), curSlot()), d, ctx.store.get('remi.kserv', d.servings));
        ctx.toast('Đã thêm ' + d.name + ' vào bữa ' + SLOT[curSlot()].label.toLowerCase() + ' hôm nay');
        return;
      }
      if (k === 'shop') { if (!el.disabled) openShop(); return; }
      if (k === 'copy') {
        const r = K.copyWeek(state.kitchen.meals, K.addDays(ui.week, -7), ui.week);
        if (!r.count) { ctx.alertUser('🗓️', 'Không có gì để chép', 'Tuần trước chưa có bữa nào, hoặc các bữa tuần này đã kín.'); return; }
        state.kitchen.meals = r.meals; commit(); ctx.toast('Đã chép ' + r.count + ' bữa từ tuần trước'); return;
      }
      if (k === 'clear') {
        if (el.dataset.armed !== '1') { el.dataset.armed = '1'; el.textContent = 'Chạm lần nữa để xoá'; return; }
        const before = state.kitchen.meals;
        state.kitchen.meals = K.clearWeek(state.kitchen.meals, ui.week); commit();
        ctx.alertUser('🗓️', 'Đã xoá thực đơn tuần này', '', { label: 'Hoàn tác', fn: () => { state.kitchen.meals = Object.assign({}, state.kitchen.meals, before); commit(); } });
        return;
      }
      if (k === 'sadd') { stockAdd(); return; }
      if (k === 'sdel') { removeStock(el.dataset.id); return; }
      if (k === 'sq') {
        const x = state.kitchen.stock.find((s) => s.id === el.dataset.id); if (!x) return;
        x.qty = Q.stepQty(x.qty, Number(el.dataset.d)); commit(); return;
      }
      if (k === 'sclean') {
        const t = today(), n = state.kitchen.stock.filter((x) => K.expiryStatus(x, t).level === 'expired').length;
        state.kitchen.stock = state.kitchen.stock.filter((x) => K.expiryStatus(x, t).level !== 'expired'); commit();
        ctx.toast('Đã bỏ ' + n + ' món hết hạn'); return;
      }
      if (k === 'newrec') { openRecipe(null); return; }
      if (k === 'editrec') { openRecipe(el.dataset.id); return; }
      if (k === 'copyrec') { const d = LIB.find((x) => x.id === el.dataset.id); if (d) openRecipe(null, { name: d.name, servings: d.servings, items: d.items }); return; }
    });
    // hạn dùng nhanh: không ghi, 3 ngày, 1 tuần... hoặc chọn ngày
    document.addEventListener('click', (e) => {
      const b = e.target.closest('#ks-exp .wchip'); if (!b) return;
      expPick = b.dataset.v === '' ? '' : K.addDays(today(), Number(b.dataset.v)); syncExpChips();
    });
    document.addEventListener('change', (e) => {
      if (e.target.id === 'ks-date') { expPick = K.isKey(e.target.value) ? e.target.value : ''; syncExpChips(); return; }
      const id = e.target.dataset && e.target.dataset.kq;
      if (id) { const x = state.kitchen.stock.find((s) => s.id === id); if (x) { x.qty = e.target.value.trim().slice(0, 24); e.target.blur(); commit(); } }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target || !e.target.id) return;
      if (e.target.id === 'ks-name') { e.preventDefault(); $('#ks-qty').focus(); }
      else if (e.target.id === 'ks-qty') { e.preventDefault(); stockAdd(); }
    });

    /* ---------------- phần dùng chung với app ---------------- */
    /** Băng nhắc ở tab Hôm nay khi trong tủ có đồ sắp hết hạn. */
    function todayBanner() {
      const s = K.stockSummary(state.kitchen.stock, today());
      const n = s.expired + s.soon;
      if (!n) return '';
      const what = s.soon && s.expired ? 'cần dùng sớm hoặc đã hết hạn' : s.soon ? 'sắp hết hạn' : 'đã hết hạn';
      return '<div class="banner kban" id="k-ban"><p>🥬 ' + n + ' món trong tủ ' + what + ': ' + esc(s.names.slice(0, 3).join(', ')) + (s.names.length > 3 ? '…' : '') + '</p><button type="button" data-k="gostock">Xem tủ</button></div>';
    }
    /** Đi chợ về: cất các món đã tick vào tủ đồ (chưa ghi hạn, sửa sau trong tab Bếp). */
    function stockFromTask(t) {
      const items = (t.checklist || []).filter((c) => c.done && !c.stocked);
      if (!items.length) { ctx.alertUser('🧺', 'Chưa có món nào để cất', 'Tick những món đã mua trong danh sách trước nhé.'); return 0; }
      let stock = state.kitchen.stock;
      items.forEach((c) => { const r = K.addStock(stock, { name: c.item, qty: c.qty }, 'st-' + uid(), today()); if (!r.error) { stock = r.stock; c.stocked = true; } });
      state.kitchen.stock = stock;
      ctx.save();
      ctx.alertUser('🧺', 'Đã cất ' + items.length + ' món vào tủ', 'Vào Bếp, Tủ đồ để ghi hạn dùng.', { label: 'Mở tủ đồ', fn: () => { close(); ui.sub = 'stock'; ctx.goTab('kitchen'); } });
      return items.length;
    }
    function openToday() { ui.sub = 'plan'; ui.week = K.weekStart(today()); ctx.goTab('kitchen'); setTimeout(() => { const c = $('#k-today'); if (c) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60); }

    return { render, todayBanner, stockFromTask, openToday };
  };
})();
