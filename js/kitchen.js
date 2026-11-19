/* Nhóm B: thực đơn tuần và tủ đồ nhà. Phần này chỉ có logic thuần (không đụng DOM, không đọc đồng hồ ngầm),
   nên chạy được cả trong trình duyệt (window.RemiKitchen) lẫn Node (để test).

   Dữ liệu (nằm trong state.kitchen, đồng bộ cùng phần còn lại):
     meals   { "2026-11-09|toi": [{ d: "lib:ca ri ga", n: "Cà ri gà", s: 4 }] }   thực đơn: ngày|bữa -> các món
     stock   [{ id, name, qty, exp: "2026-11-12" | "", added, u }]                tủ đồ nhà
     recipes [{ id, name, servings, items: [{ item, qty }], note, u }]            món của riêng mình
   Ngày luôn là chuỗi "YYYY-MM-DD" theo giờ địa phương; mọi phép cộng ngày làm trên UTC để không lệch vì giờ mùa hè. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./qty.js'));
  else root.RemiKitchen = factory(root.RemiQty);
})(typeof self !== 'undefined' ? self : this, function (Q) {
  'use strict';

  const SLOTS = [
    { id: 'sang', label: 'Sáng', emoji: '🌅' },
    { id: 'trua', label: 'Trưa', emoji: '☀️' },
    { id: 'toi', label: 'Tối', emoji: '🌙' },
  ];
  const SLOT_IDS = SLOTS.map((s) => s.id);
  const SOON_DAYS = 3; // còn từ 0 tới 3 ngày là "sắp hết hạn"
  const MIN_RATIO = 0.3; // gợi ý món khi có sẵn ít nhất 30% nguyên liệu chính
  const MAX = { name: 60, qty: 24, note: 500, items: 40, perSlot: 6, stock: 300, recipes: 200 };
  // Gia vị nhà nào cũng có: không tính vào tỉ lệ "có sẵn" khi gợi ý món, để món kho không bị thua chỉ vì thiếu nước mắm trong tủ đồ.
  const STAPLES = ['muoi', 'duong', 'nuoc mam', 'dau an', 'tieu xay', 'tieu', 'hat nem', 'bot ngot', 'nuoc tuong', 'giam'];

  /* ---------------- ngày ---------------- */
  const pad = (n) => String(n).padStart(2, '0');
  const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const isKey = (k) => KEY_RE.test(String(k || ''));
  function toUTC(key) {
    const m = KEY_RE.exec(key);
    if (!m) throw new Error('Ngày phải có dạng YYYY-MM-DD: ' + key);
    return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  }
  function fromUTC(ms) {
    const d = new Date(ms);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  const addDays = (key, n) => fromUTC(toUTC(key) + n * 86400000);
  const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);
  const weekdayOf = (key) => new Date(toUTC(key)).getUTCDay(); // 0 = Chủ nhật
  /** Thứ hai đầu tuần chứa ngày `key` (tuần kiểu Việt Nam: thứ hai đến chủ nhật). */
  const weekStart = (key) => addDays(key, -((weekdayOf(key) + 6) % 7));
  const weekDays = (start) => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(start, i));
  const localKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  /** Bữa đang tới theo giờ: trước 10h là bữa sáng, trước 15h là bữa trưa, còn lại bữa tối. */
  const slotForHour = (h) => (h < 10 ? 'sang' : h < 15 ? 'trua' : 'toi');
  const mealKey = (date, slot) => date + '|' + slot;
  function parseMealKey(k) {
    const p = String(k).split('|');
    return p.length === 2 && isKey(p[0]) && SLOT_IDS.indexOf(p[1]) >= 0 ? { date: p[0], slot: p[1] } : null;
  }

  /* ---------------- tên và định lượng ---------------- */
  /** "Thịt  Gà " và "thit ga" là một: bỏ dấu, chữ thường, gộp khoảng trắng. */
  function normName(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }
  const cap = (s) => { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };

  /** Đổi định lượng về đơn vị gốc để cộng trừ được: kg -> g, lít -> ml. Đơn vị đếm (củ, quả, muỗng...) giữ nguyên tên. */
  function toBase(qty) {
    const q = Q.parseQty(qty);
    if (!q) return null;
    const k = Q.unitKind(q.u);
    if (k === 'g') return { n: q.n, dim: 'g', label: 'g' };
    if (k === 'kg') return { n: q.n * 1000, dim: 'g', label: 'g' };
    if (k === 'ml') return { n: q.n, dim: 'ml', label: 'ml' };
    if (k === 'l') return { n: q.n * 1000, dim: 'ml', label: 'ml' };
    return { n: q.n, dim: 'u:' + normName(q.u), label: q.u, spoon: k === 'spoon' };
  }

  const r2 = (n) => Math.round(n * 100) / 100;
  /** Viết lại lượng cho dễ đọc: 1300 g -> "1,3 kg", 1500 ml -> "1,5 lít". */
  function fmtAmount(n, dim, label) {
    if (dim === 'g') return n >= 1000 ? Q.fmtQ(r2(n / 1000)) + ' kg' : Q.fmtQ(Math.round(n)) + ' g';
    if (dim === 'ml') return n >= 1000 ? Q.fmtQ(r2(n / 1000)) + ' lít' : Q.fmtQ(Math.round(n)) + ' ml';
    return Q.fmtQ(r2(n)) + (label ? ' ' + label : '');
  }

  /* Một "lượng" gồm nhiều phần không đổi được cho nhau (600 g + 2 củ) và các ghi chú chữ ("một ít"). */
  const newAmount = () => ({ parts: {}, labels: {}, free: [] });
  function addAmount(acc, qty, factor) {
    const b = toBase(qty);
    if (!b) {
      const t = String(qty == null ? '' : qty).trim();
      if (t && acc.free.indexOf(t) < 0) acc.free.push(t);
      return acc;
    }
    acc.parts[b.dim] = (acc.parts[b.dim] || 0) + b.n * (factor === undefined ? 1 : factor);
    if (!acc.labels[b.dim]) acc.labels[b.dim] = { label: b.label, spoon: !!b.spoon };
    return acc;
  }
  /** Làm tròn LÊN để mua đủ: gram, ml theo bước 5; muỗng theo nửa muỗng; củ, quả, gói theo số nguyên. */
  function roundUp(n, dim, spoon) {
    const e = 1e-9;
    if (dim === 'g' || dim === 'ml') return Math.ceil(n / 5 - e) * 5;
    if (spoon) return Math.ceil(n * 2 - e) / 2;
    return Math.ceil(n - e);
  }
  const DIM_ORDER = (a, b) => (a === 'g' ? -2 : a === 'ml' ? -1 : 0) - (b === 'g' ? -2 : b === 'ml' ? -1 : 0) || (a < b ? -1 : a > b ? 1 : 0);
  function amountText(acc, opts) {
    const round = !opts || opts.round !== false;
    const out = Object.keys(acc.parts).sort(DIM_ORDER).filter((d) => acc.parts[d] > 1e-9).map((d) => {
      const l = acc.labels[d] || { label: '' };
      return fmtAmount(round ? roundUp(acc.parts[d], d, l.spoon) : acc.parts[d], d, l.label);
    });
    return out.concat(acc.free).join(' + ');
  }

  /* ---------------- kho món ---------------- */
  function cleanItems(items) {
    return (Array.isArray(items) ? items : []).map((x) => ({
      item: String((x && x.item) || '').trim().slice(0, MAX.name),
      qty: String((x && x.qty) || '').trim().slice(0, MAX.qty),
    })).filter((x) => x.item).slice(0, MAX.items);
  }
  /** Món có sẵn từ web/data/dishes.json. Mã món dựa trên tên nên ổn định giữa các máy. */
  function libraryFrom(list) {
    return (Array.isArray(list) ? list : []).filter((d) => d && d.name).map((d) => ({
      id: 'lib:' + normName(d.name), name: cap(d.name), servings: Math.max(1, +d.servings || 4),
      items: cleanItems(d.items), aliases: (d.aliases || []).map(String), mine: false,
    }));
  }
  function recipeToDish(r) {
    return { id: r.id, name: cap(r.name), servings: Math.max(1, +r.servings || 4), items: cleanItems(r.items), note: r.note || '', aliases: [], mine: true };
  }
  /** Danh bạ món: món của tôi đứng trước món có sẵn. */
  function dishIndex(library, recipes) {
    const idx = {};
    (recipes || []).forEach((r) => { if (r && r.id) idx[r.id] = recipeToDish(r); });
    (library || []).forEach((d) => { if (!idx[d.id]) idx[d.id] = d; });
    return idx;
  }
  function allDishes(library, recipes) {
    const idx = dishIndex(library, recipes);
    return Object.keys(idx).map((k) => idx[k]).sort((a, b) => (b.mine - a.mine) || a.name.localeCompare(b.name, 'vi'));
  }
  /** Tìm món theo tên hoặc tên gọi khác, không phân biệt dấu. */
  function searchDishes(dishes, q) {
    const n = normName(q);
    if (!n) return dishes.slice();
    return dishes.filter((d) => normName(d.name).indexOf(n) >= 0 || d.aliases.some((a) => normName(a).indexOf(n) >= 0) ||
      d.items.some((x) => normName(x.item).indexOf(n) >= 0));
  }
  /** Kiểm tra món tự tạo trước khi lưu. Trả về chuỗi lỗi, hoặc '' nếu ổn. */
  function validateRecipe(r) {
    if (!r || !String(r.name || '').trim()) return 'Món cần có tên.';
    if (String(r.name).trim().length > MAX.name) return 'Tên món dài quá ' + MAX.name + ' ký tự.';
    if (!cleanItems(r.items).length) return 'Thêm ít nhất một nguyên liệu.';
    const s = +r.servings;
    if (!(s >= 1 && s <= 20)) return 'Số người ăn từ 1 đến 20.';
    return '';
  }

  /* ---------------- thực đơn tuần ---------------- */
  function weekEntries(meals, start) {
    const out = [];
    weekDays(start).forEach((date) => SLOT_IDS.forEach((slot) => {
      (meals[mealKey(date, slot)] || []).forEach((e) => out.push(Object.assign({ date, slot }, e)));
    }));
    return out;
  }
  /** Thêm một món vào một bữa. Trùng món trong cùng bữa thì cộng số người thay vì thêm dòng mới. */
  function addMeal(meals, date, slot, dish, servings) {
    const k = mealKey(date, slot), cur = (meals[k] || []).slice();
    const s = Math.max(1, Math.min(20, Math.round(+servings || dish.servings || 4)));
    const i = cur.findIndex((e) => e.d === dish.id);
    if (i >= 0) cur[i] = Object.assign({}, cur[i], { s: Math.min(20, cur[i].s + s) });
    else if (cur.length < MAX.perSlot) cur.push({ d: dish.id, n: dish.name, s });
    else return { meals, added: false };
    return { meals: Object.assign({}, meals, { [k]: cur }), added: true };
  }
  function removeMeal(meals, date, slot, index) {
    const k = mealKey(date, slot), cur = (meals[k] || []).filter((_, i) => i !== index);
    const out = Object.assign({}, meals);
    if (cur.length) out[k] = cur; else delete out[k];
    return out;
  }
  /** Chép các bữa của tuần `from` sang tuần `to`, chỉ điền vào bữa còn trống để không đè lên bữa đã lên kế hoạch. */
  function copyWeek(meals, from, to) {
    const out = Object.assign({}, meals);
    let count = 0;
    weekDays(from).forEach((date, i) => SLOT_IDS.forEach((slot) => {
      const src = meals[mealKey(date, slot)], dst = mealKey(addDays(to, i), slot);
      if (src && src.length && !(out[dst] && out[dst].length)) { out[dst] = src.map((e) => Object.assign({}, e)); count++; }
    }));
    return { meals: out, count };
  }
  function clearWeek(meals, start) {
    const out = Object.assign({}, meals);
    weekDays(start).forEach((date) => SLOT_IDS.forEach((slot) => { delete out[mealKey(date, slot)]; }));
    return out;
  }

  /** Gộp nguyên liệu của mọi món trong danh sách bữa thành một danh sách đi chợ, đã quy đổi đơn vị và co giãn theo số người. */
  function aggregate(entries, index) {
    const acc = {}, missing = [];
    (entries || []).forEach((e) => {
      const dish = index[e.d];
      if (!dish) { if (missing.indexOf(e.n) < 0) missing.push(e.n || e.d); return; }
      const factor = (+e.s || dish.servings) / dish.servings;
      dish.items.forEach((x) => {
        const key = normName(x.item);
        if (!acc[key]) acc[key] = { key, item: cap(x.item), amount: newAmount(), dishes: [] };
        addAmount(acc[key].amount, x.qty, factor);
        if (acc[key].dishes.indexOf(dish.name) < 0) acc[key].dishes.push(dish.name);
      });
    });
    const items = Object.keys(acc).map((k) => Object.assign(acc[k], { text: amountText(acc[k].amount) }))
      .sort((a, b) => a.item.localeCompare(b.item, 'vi'));
    return { items, missing };
  }

  /* ---------------- tủ đồ ---------------- */
  /** Tình trạng hạn dùng của một món trong tủ so với hôm nay. */
  function expiryStatus(item, today) {
    if (!item || !isKey(item.exp)) return { level: 'none', days: null, text: 'Không ghi hạn' };
    const days = daysBetween(today, item.exp);
    if (days < 0) return { level: 'expired', days, text: days === -1 ? 'Hết hạn hôm qua' : 'Hết hạn ' + (-days) + ' ngày trước' };
    if (days === 0) return { level: 'soon', days, text: 'Hết hạn hôm nay' };
    if (days <= SOON_DAYS) return { level: 'soon', days, text: days === 1 ? 'Hết hạn ngày mai' : 'Còn ' + days + ' ngày' };
    return { level: 'ok', days, text: 'Còn ' + days + ' ngày' };
  }
  const LEVEL_ORDER = { expired: 0, soon: 1, ok: 2, none: 3 };
  /** Đồ đã hết hạn lên đầu, rồi tới đồ sắp hết hạn, đồ không ghi hạn xuống cuối. */
  function sortStock(stock, today) {
    return (stock || []).slice().sort((a, b) => {
      const x = expiryStatus(a, today), y = expiryStatus(b, today);
      return (LEVEL_ORDER[x.level] - LEVEL_ORDER[y.level]) || ((x.days === null ? 0 : x.days) - (y.days === null ? 0 : y.days)) ||
        String(a.name).localeCompare(String(b.name), 'vi');
    });
  }
  function stockSummary(stock, today) {
    const s = { total: 0, expired: 0, soon: 0, names: [] };
    (stock || []).forEach((x) => {
      s.total++;
      const l = expiryStatus(x, today).level;
      if (l === 'expired') s.expired++;
      if (l === 'soon') s.soon++;
      if (l === 'expired' || l === 'soon') s.names.push(x.name);
    });
    return s;
  }
  /** Tổng lượng đang có theo từng nguyên liệu (bỏ qua đồ đã hết hạn). `unknown` = có món đó nhưng không ghi lượng. */
  function stockIndex(stock, today) {
    const idx = {};
    (stock || []).forEach((x) => {
      if (!x || !x.name || expiryStatus(x, today).level === 'expired') return;
      const k = normName(x.name);
      if (!idx[k]) idx[k] = { amount: newAmount(), unknown: false, names: [] };
      if (String(x.qty || '').trim()) addAmount(idx[k].amount, x.qty, 1); else idx[k].unknown = true;
      idx[k].names.push(x.name);
    });
    return idx;
  }
  /** Thêm đồ vào tủ. Cùng tên và cùng hạn thì cộng dồn lượng (nếu cộng được) thay vì thêm dòng trùng. */
  function addStock(stock, entry, newId, today) {
    const name = cap(String(entry.name || '').trim().slice(0, MAX.name));
    if (!name) return { stock, error: 'Nhập tên món đồ.' };
    const qty = String(entry.qty || '').trim().slice(0, MAX.qty);
    const exp = isKey(entry.exp) ? entry.exp : '';
    const list = (stock || []).slice();
    const i = list.findIndex((x) => normName(x.name) === normName(name) && (x.exp || '') === exp);
    if (i >= 0) {
      const a = toBase(list[i].qty), b = toBase(qty);
      if (a && b && a.dim === b.dim) {
        list[i] = Object.assign({}, list[i], { qty: fmtAmount(a.n + b.n, a.dim, a.label) });
        return { stock: list, merged: true, id: list[i].id };
      }
      if (!qty) return { stock: list, merged: true, id: list[i].id };
      if (!String(list[i].qty || '').trim()) { list[i] = Object.assign({}, list[i], { qty }); return { stock: list, merged: true, id: list[i].id }; }
    }
    if (list.length >= MAX.stock) return { stock, error: 'Tủ đồ đã đầy (' + MAX.stock + ' món).' };
    const item = { id: newId, name, qty, exp, added: today || '' };
    list.push(item);
    return { stock: list, merged: false, id: newId };
  }

  /** So danh sách đi chợ với tủ đồ: mỗi dòng biết cần mua thêm bao nhiêu và tủ đang có bao nhiêu. */
  function subtractStock(items, stock, today) {
    const idx = stockIndex(stock, today);
    return (items || []).map((it) => {
      const s = idx[it.key];
      if (!s) return Object.assign({}, it, { have: '', need: it.text, covered: false, partial: false });
      const need = newAmount();
      need.labels = it.amount.labels;
      let short = false;
      Object.keys(it.amount.parts).forEach((d) => {
        const rest = it.amount.parts[d] - (s.amount.parts[d] || 0);
        if (rest > 1e-9) { need.parts[d] = rest; short = true; }
      });
      // Tủ có món này nhưng không ghi lượng: coi như có, nhưng để người dùng tự quyết.
      const unknownOnly = s.unknown && !Object.keys(s.amount.parts).length && !s.amount.free.length;
      if (unknownOnly) return Object.assign({}, it, { have: 'Có trong tủ (chưa ghi lượng)', need: it.text, covered: true, partial: false, unsure: true });
      const haveText = amountText(s.amount, { round: false }) || 'Có trong tủ';
      if (!short) return Object.assign({}, it, { have: haveText, need: '', covered: true, partial: false });
      return Object.assign({}, it, { have: haveText, need: amountText(need), covered: false, partial: true });
    });
  }

  /** Nấu xong một món: trừ nguyên liệu khỏi tủ (dùng đồ gần hết hạn trước). Đồ không ghi lượng hoặc khác đơn vị thì giữ nguyên. */
  function consume(stock, dish, servings, today) {
    const list = (stock || []).map((x) => Object.assign({}, x));
    const factor = (+servings || dish.servings) / dish.servings;
    const used = [], removed = [];
    dish.items.forEach((ing) => {
      const b = toBase(ing.qty);
      if (!b) return;
      let left = b.n * factor;
      const key = normName(ing.item);
      const cands = sortStock(list.filter((x) => normName(x.name) === key && expiryStatus(x, today).level !== 'expired'), today);
      cands.forEach((x) => {
        if (left <= 1e-9) return;
        const h = toBase(x.qty);
        if (!h || h.dim !== b.dim) return;
        const take = Math.min(h.n, left);
        left -= take;
        const rest = h.n - take;
        if (used.indexOf(x.name) < 0) used.push(x.name);
        if (rest <= 1e-6) { x.qty = ''; x._gone = true; removed.push(x.name); }
        else x.qty = fmtAmount(rest, h.dim, h.label);
      });
    });
    return { stock: list.filter((x) => !x._gone), used, removed };
  }

  /* ---------------- gợi ý "hôm nay nấu gì" ---------------- */
  /** Xếp hạng món theo đồ đang có: nhiều nguyên liệu có sẵn hơn, dùng được đồ sắp hết hạn thì lên trước; vừa ăn trong 3 ngày qua thì xuống. */
  function suggest(dishes, stock, meals, today, opts) {
    opts = opts || {};
    const limit = opts.limit || 5;
    const idx = stockIndex(stock, today);
    if (!Object.keys(idx).length) return [];
    const soon = {};
    (stock || []).forEach((x) => { if (expiryStatus(x, today).level === 'soon') soon[normName(x.name)] = x.name; });
    const recent = {}, planned = {};
    for (let i = 1; i <= 3; i++) SLOT_IDS.forEach((sl) => (meals[mealKey(addDays(today, -i), sl)] || []).forEach((e) => { recent[e.d] = 1; }));
    SLOT_IDS.forEach((sl) => (meals[mealKey(today, sl)] || []).forEach((e) => { planned[e.d] = 1; }));
    const out = [];
    (dishes || []).forEach((d) => {
      if (!d.items.length || planned[d.id]) return;
      const main = d.items.filter((x) => STAPLES.indexOf(normName(x.item)) < 0);
      const base = main.length ? main : d.items;
      const have = base.filter((x) => idx[normName(x.item)]);
      if (!have.length) return;
      const missing = base.filter((x) => !idx[normName(x.item)]).map((x) => x.item);
      const useSoon = have.filter((x) => soon[normName(x.item)]).map((x) => soon[normName(x.item)]);
      const ratio = have.length / base.length;
      if (ratio < MIN_RATIO && !useSoon.length) return; // có 1/5 nguyên liệu thì chưa đáng gợi ý, trừ khi giúp dùng đồ sắp hỏng
      const score = ratio * 100 + useSoon.length * 15 - (recent[d.id] ? 25 : 0) + (d.mine ? 3 : 0);
      const reasons = ['Có sẵn ' + have.length + '/' + base.length + ' nguyên liệu chính'];
      if (useSoon.length) reasons.push('Dùng ' + useSoon.join(', ') + ' sắp hết hạn');
      if (recent[d.id]) reasons.push('Đã ăn trong 3 ngày qua');
      out.push({ dish: d, have: have.length, total: base.length, missing, useSoon, recent: !!recent[d.id], score, reasons });
    });
    return out.sort((a, b) => (b.score - a.score) || a.dish.name.localeCompare(b.dish.name, 'vi')).slice(0, limit);
  }

  /** Lời nhắc đồ sắp hết hạn: 18:00 hôm trước ngày hết hạn. `now` là mốc thời gian (ms), giờ địa phương. */
  function expiryReminders(stock, now, horizonMs) {
    const end = now + (horizonMs || 48 * 3600000), out = [];
    (stock || []).forEach((x) => {
      if (!x || !isKey(x.exp)) return;
      const m = KEY_RE.exec(x.exp);
      const at = new Date(+m[1], +m[2] - 1, +m[3] - 1, 18, 0, 0, 0).getTime();
      if (at > now && at < end) out.push({ key: 'k:' + x.id + ':' + x.exp, at, title: '🥬 ' + x.name + ' hết hạn ngày mai', body: 'Nấu ngay hôm nay để khỏi phí nhé.' });
    });
    return out;
  }

  /* ---------------- dữ liệu và đồng bộ ---------------- */
  /** Làm sạch dữ liệu đọc từ máy hoặc từ máy chủ: thiếu thì tạo, sai kiểu thì bỏ. */
  function normalizeKitchen(k) {
    k = k && typeof k === 'object' && !Array.isArray(k) ? k : {};
    const meals = {};
    if (k.meals && typeof k.meals === 'object' && !Array.isArray(k.meals)) {
      Object.keys(k.meals).forEach((key) => {
        if (!parseMealKey(key) || !Array.isArray(k.meals[key])) return;
        const list = k.meals[key].filter((e) => e && typeof e.d === 'string' && e.d).slice(0, MAX.perSlot)
          .map((e) => ({ d: e.d, n: String(e.n || '').slice(0, MAX.name), s: Math.max(1, Math.min(20, Math.round(+e.s) || 4)) }));
        if (list.length) meals[key] = list;
      });
    }
    const stock = (Array.isArray(k.stock) ? k.stock : []).filter((x) => x && x.id && String(x.name || '').trim()).slice(0, MAX.stock)
      .map((x) => Object.assign({}, x, { name: String(x.name).slice(0, MAX.name), qty: String(x.qty || '').slice(0, MAX.qty), exp: isKey(x.exp) ? x.exp : '' }));
    const recipes = (Array.isArray(k.recipes) ? k.recipes : []).filter((r) => r && r.id && String(r.name || '').trim()).slice(0, MAX.recipes)
      .map((r) => Object.assign({}, r, { name: String(r.name).slice(0, MAX.name), servings: Math.max(1, Math.min(20, +r.servings || 4)), items: cleanItems(r.items), note: String(r.note || '').slice(0, MAX.note) }));
    return { meals, stock, recipes };
  }

  /** Gộp phần bếp của hai máy. Tủ đồ và món của tôi gộp theo từng mục (`u` mới hơn thắng, có bia mộ);
      thực đơn gộp theo từng bữa với dấu thời gian `mealU`. */
  function mergeKitchen(L, R, lu, ru, deleted) {
    L = normalizeKitchen(L); R = normalizeKitchen(R); lu = lu || {}; ru = ru || {}; deleted = deleted || {};
    // Hai bên cùng dấu thời gian mà khác nội dung: chọn theo nội dung để hai máy luôn ra cùng một kết quả (gộp giao hoán).
    const later = (x, y, tx, ty) => tx > ty || (tx === ty && JSON.stringify(x) > JSON.stringify(y));
    const list = (a, b) => {
      const m = {};
      a.forEach((x) => { m[x.id] = x; });
      b.forEach((x) => { const y = m[x.id]; if (!y || later(x, y, x.u || 0, y.u || 0)) m[x.id] = x; });
      return Object.keys(m).map((id) => m[id]).filter((x) => !(deleted[x.id] && deleted[x.id] >= (x.u || 0)));
    };
    const meals = {}, mealU = {};
    new Set(Object.keys(L.meals).concat(Object.keys(R.meals), Object.keys(lu), Object.keys(ru))).forEach((k) => {
      const tl = lu[k] || 0, tr = ru[k] || 0;
      const fromR = tr === tl && (k in L.meals) && (k in R.meals) ? later(R.meals[k], L.meals[k], 0, 0) : tr > tl || (tr === tl && !(k in L.meals) && (k in R.meals));
      const v = fromR ? R.meals[k] : L.meals[k];
      if (v && v.length) meals[k] = v;
      if (tl || tr) mealU[k] = Math.max(tl, tr);
    });
    return { kitchen: { meals, stock: list(L.stock, R.stock), recipes: list(L.recipes, R.recipes) }, mealU };
  }

  return {
    SLOTS, SLOT_IDS, SOON_DAYS, MAX, STAPLES,
    addDays, daysBetween, weekdayOf, weekStart, weekDays, localKey, slotForHour, mealKey, parseMealKey, isKey,
    normName, toBase, fmtAmount, newAmount, addAmount, amountText,
    libraryFrom, recipeToDish, dishIndex, allDishes, searchDishes, validateRecipe,
    weekEntries, addMeal, removeMeal, copyWeek, clearWeek, aggregate,
    expiryStatus, sortStock, stockSummary, stockIndex, addStock, subtractStock, consume,
    suggest, expiryReminders, normalizeKitchen, mergeKitchen,
  };
});
