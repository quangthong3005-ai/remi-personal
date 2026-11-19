/* Bộ hiểu câu nói tiếng Việt chạy hoàn toàn trên máy (không gọi mạng, không gửi dữ liệu đi đâu).
   Dựa trên luật, nên nhanh, đoán được và không bịa. Đây vừa là phương án chạy ngay,
   vừa là "mốc" để đo model tự huấn luyện: model mới chỉ đáng dùng khi vượt được mốc này.
   Dùng được trong trình duyệt (window.RemiLocalParse) và Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./qty.js'));
  else root.RemiLocalParse = factory(root.RemiQty);
})(typeof self !== 'undefined' ? self : this, function (Q) {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');

  /** Bỏ dấu tiếng Việt nhưng GIỮ NGUYÊN độ dài, để vị trí khớp được dùng cắt đúng chữ trong câu gốc. */
  function fold(s) {
    return String(s).normalize('NFC').split('').map((ch) => {
      let b = ch.normalize('NFD')[0];
      if (b === 'đ' || b === 'Đ') b = 'd';
      return b;
    }).join('').toLowerCase();
  }

  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const iso = (d) => ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  function parseNow(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
    if (!m) throw new Error('now phải có dạng YYYY-MM-DDTHH:mm');
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  }
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const WD_WORD = { hai: 1, ba: 2, tu: 3, nam: 4, sau: 5, bay: 6, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6 };
  const POD_DEFAULT_TIME = { sang: '07:00', trua: '12:00', chieu: '17:00', toi: '21:00', dem: '22:00' };

  const HABIT_VERBS = [
    ['uong nuoc', 'Uống nước', '💧'], ['di bo', 'Đi bộ', '🏃'], ['chay bo', 'Chạy bộ', '🏃'], ['gian co', 'Giãn cơ', '🧘'],
    ['doc sach', 'Đọc sách', '📖'], ['thien', 'Thiền', '🧘'], ['tap yoga', 'Tập yoga', '🧘'], ['yoga', 'Tập yoga', '🧘'],
    ['hit dat', 'Hít đất', '💪'], ['plank', 'Plank', '💪'], ['tap gym', 'Tập gym', '💪'], ['uong vitamin', 'Uống vitamin', '💊'],
    ['uong thuoc', 'Uống thuốc', '💊'], ['viet nhat ky', 'Viết nhật ký', '✍️'],
  ];
  const UNIT_VN = { phut: 'phút', trang: 'trang', buoc: 'bước', km: 'km', cai: 'cái', lan: 'lần' };

  function hour24(h, pod, shopping) {
    if (pod === 'sang') return h === 12 ? 0 : h;
    if (pod === 'trua') return h >= 10 && h <= 12 ? h : h <= 4 ? h + 12 : h;
    if (pod === 'chieu' || pod === 'toi') return h < 12 ? h + 12 : h;
    if (pod === 'dem') return h === 12 ? 0 : h >= 6 && h < 12 ? h + 12 : h;
    if (h >= 13 || h === 12) return h;
    if (shopping && h >= 4 && h <= 9) return h + 12; // đi chợ, nấu ăn lúc "7h" nghĩa là buổi tối
    if (h >= 6) return h;
    return h + 12; // 1h đến 5h không nói gì thêm: hiểu là buổi chiều
  }

  function createParser(dishes) {
    const dishIndex = (dishes || []).map((d) => ({
      d,
      keys: [d.name].concat(d.aliases || []).map(fold).sort((a, b) => b.length - a.length),
    }));

    function parse(text, nowStr) {
      const orig = String(text).normalize('NFC').trim();
      const f = fold(orig);
      const now = parseNow(nowStr);
      const spans = [];
      let g = f; // bản sao để che những đoạn đã nhận, tránh khớp trùng
      const take = (re) => {
        const m = re.exec(g);
        if (!m) return null;
        spans.push([m.index, m.index + m[0].length]);
        g = g.slice(0, m.index) + ' '.repeat(m[0].length) + g.slice(m.index + m[0].length);
        return m;
      };

      /* nhắc trước */
      let lead = null;
      const lm = take(/(?:(?:nhac|bao|nhac nho)\s*(?:toi|tui|minh|em|giup)?\s*)?truoc\s*(?:toi|tui|minh|em)?\s*(\d+(?:[.,]\d+)?)\s*(phut|p|tieng|gio|h)\b(\s*ruoi)?/);
      if (lm) {
        const n = parseFloat(lm[1].replace(',', '.'));
        lead = Math.round(/^(phut|p)$/.test(lm[2]) ? n : n * 60) + (lm[3] ? 30 : 0);
      }

      /* số người ăn */
      let servings = 4;
      const sm = take(/\bcho\s*(\d{1,2})\s*nguoi\b/);
      if (sm) servings = Math.max(1, Math.min(20, +sm[1]));

      /* lặp lại */
      let repeat = 'none', recurring = false, repeatPod = null, weeklyWd = null;
      let m;
      if ((m = take(/\b(?:moi|hang)\s*ngay\b|\bngay nao cung\b/))) { repeat = 'daily'; recurring = true; }
      else if ((m = take(/\bmoi\s+(sang|trua|chieu|toi|dem)\b/))) { repeat = 'daily'; recurring = true; repeatPod = m[1]; }
      else if ((m = take(/\bmoi\s+thu\s+(hai|ba|tu|nam|sau|bay|[2-7])\b/))) { repeat = 'weekly'; recurring = true; weeklyWd = WD_WORD[m[1]]; }
      else if ((m = take(/\bmoi\s+(?:chu nhat|cn)\b/))) { repeat = 'weekly'; recurring = true; weeklyWd = 0; }
      else if ((m = take(/\b(?:moi|hang)\s*tuan\b/))) { repeat = 'weekly'; recurring = true; }

      /* danh sách ngày trong tuần của thói quen: "thứ 2, 4, 6", "cuối tuần", "ngày thường" */
      let days = null;
      const dl = /\bthu\s*([2-7])((?:\s*(?:,|;|va|-|\/)\s*(?:thu\s*)?[2-7])+)\b/.exec(g);
      if (dl) {
        days = (dl[1] + dl[2]).match(/[2-7]/g).map((x) => WD_WORD[x]);
        spans.push([dl.index, dl.index + dl[0].length]);
        g = g.slice(0, dl.index) + ' '.repeat(dl[0].length) + g.slice(dl.index + dl[0].length);
        recurring = true;
      } else if (take(/\bcuoi tuan\b/)) { days = [6, 0]; recurring = true; }
      else if (take(/\bngay thuong\b/)) { days = [1, 2, 3, 4, 5]; recurring = true; }

      /* giờ tương đối: "sau 20 phút", "2 tiếng nữa" */
      let relative = null;
      // "thứ 2 tuần sau 11 giờ" và "thứ sáu 4 giờ" không phải "sau 11 giờ": che chữ "sau" của "tuần sau" và "thứ sáu" khi tìm giờ tương đối
      const gr = g.replace(/((?:tuan|thu)\s+)sau/g, (m, a) => a + '###');
      const rm = /\bsau\s*(\d+(?:[.,]\d+)?)\s*(phut|tieng|gio)(\s*ruoi)?\b/.exec(gr) || /\b(\d+(?:[.,]\d+)?)\s*(phut|tieng|gio)(\s*ruoi)?\s*nua\b/.exec(gr);
      if (rm) {
        spans.push([rm.index, rm.index + rm[0].length]);
        g = g.slice(0, rm.index) + ' '.repeat(rm[0].length) + g.slice(rm.index + rm[0].length);
        const n = parseFloat(rm[1].replace(',', '.'));
        relative = Math.round(rm[2] === 'phut' ? n : n * 60) + (rm[3] ? 30 : 0);
      }

      /* giờ */
      let time = null;
      const TIME_RE = /(?:luc\s*)?(?:(sang|trua|chieu|toi|dem)\s+)?(\d{1,2})\s*(?:h|:|gio)\s*(\d{1,2})?(?:\s*(sang|trua|chieu|toi|dem)\b)?/g;
      let tm;
      while (!relative && (tm = TIME_RE.exec(g))) {
        const before = g[tm.index - 1];
        if (before && /[\d:/]/.test(before)) continue;
        const h = +tm[2], mi = tm[3] === undefined ? 0 : +tm[3];
        if (h > 24 || mi > 59) continue;
        time = { h, mi, pod: tm[4] || tm[1] || null };
        spans.push([tm.index, tm.index + tm[0].length]);
        g = g.slice(0, tm.index) + ' '.repeat(tm[0].length) + g.slice(tm.index + tm[0].length);
        break;
      }

      /* ngày */
      let date = null, dayPod = null, explicitToday = false;
      const today = midnight(now);
      let dm;
      if ((dm = take(/\bngay kia\b/))) date = addDays(today, 2);
      else if ((dm = take(/\b(?:(sang|trua|chieu|toi|dem)\s+)?(?:ngay\s+)?mai\b/))) { date = addDays(today, 1); dayPod = dm[1] || null; }
      else if ((dm = take(/\b(?:hom nay|(sang|trua|chieu|toi|dem)\s+nay)\b/))) { date = today; dayPod = dm[1] || null; explicitToday = true; }
      else if ((dm = take(/\b(?:vao\s+)?(?:thu\s+(hai|ba|tu|nam|sau|bay|[2-7])|chu nhat|cn)\b(?:\s*(tuan sau|tuan toi|tuan nay|nay))?/))) {
        const wd = dm[1] === undefined ? 0 : WD_WORD[dm[1]];
        date = nextWeekday(today, wd, dm[2] && /sau|toi/.test(dm[2]));
      } else if ((dm = take(/\bngay\s+(\d{1,2})(?:\s*[\/-]\s*(\d{1,2}))?\b/))) {
        const d = +dm[1];
        const mo = dm[2] ? +dm[2] - 1 : now.getMonth();
        let cand = new Date(now.getFullYear(), mo, d);
        if (cand < today) cand = dm[2] ? new Date(now.getFullYear() + 1, mo, d) : new Date(now.getFullYear(), mo + 1, d);
        date = cand;
      }
      if (!date && weeklyWd !== null) date = nextWeekday(today, weeklyWd, false);

      /* phân loại */
      const water = /\buong\s+(?:du\s+)?(?:\d+(?:[.,]\d+)?\s*(?:lit|l|ml)\s+)?nuoc\b/.test(f);
      let verb = null;
      for (const v of HABIT_VERBS) if (new RegExp('\\b' + v[0] + '\\b').test(f)) { verb = v; break; }
      if (water) verb = HABIT_VERBS[0];
      const isHabit = water || (verb && recurring);

      let dish = null, dishSurface = '';
      if (!isHabit) {
        for (const di of dishIndex) {
          for (const k of di.keys) {
            const i = f.indexOf(k);
            if (i >= 0 && (!dish || k.length > dish.k.length)) dish = { d: di.d, k, i };
          }
        }
        if (dish) dishSurface = orig.slice(dish.i, dish.i + dish.k.length);
      }
      const shopping = !isHabit && (/\b(?:di cho|di sieu thi|mua sam|di mua|mua)\b/.test(f) || (/\bnau\b/.test(f) && !!dish));

      const out = {
        intent: isHabit ? 'habit' : 'task', title: '', emoji: '📌', when: null, repeat: 'none', leadMinutes: 0,
        shopping: false, servings: 4, assumption: '', summary: '', checklist: [], tips: [], habit: null,
      };

      if (isHabit) {
        const pod = time ? (time.pod) : repeatPod;
        let times = ['07:00'];
        if (time) times = [pad(hour24(time.h, pod, false) % 24) + ':' + pad(time.mi)];
        else if (repeatPod) times = [POD_DEFAULT_TIME[repeatPod]];
        out.habit = { recurring, times, days: days || [0, 1, 2, 3, 4, 5, 6], spread: null };
        if (water) {
          const lm2 = /(\d+(?:[.,]\d+)?)\s*(lit|l|ml)\b/.exec(f);
          const cm = /\bchia\s*(?:lam|thanh|ra)?\s*(\d{1,2})\s*(?:lan|cu|buoi|dot)\b/.exec(f);
          let ml = null;
          if (lm2) { const n = parseFloat(lm2[1].replace(',', '.')); ml = lm2[2] === 'ml' ? n : n * 1000; }
          let count = cm ? Math.max(1, Math.min(20, +cm[1])) : null;
          if (ml === null) ml = count ? count * 250 : 2000;      // không nói tổng lượng: mỗi lần 250 ml
          if (!count) count = Math.max(1, Math.ceil(ml / 250));
          let from = null, to = 'bed';
          // khoảng giờ rõ ràng: "từ 1h-5h", "8h đến 9h tối". Giờ bắt đầu theo quy tắc giờ trần; chỉ "sáng" ở cuối mới kéo giờ đầu về buổi sáng.
          const wm = /\b(\d{1,2})\s*(?:h|gio)?\s*(\d{2})?\s*(?:-|den)\s*(\d{1,2})\s*(?:h|gio)\s*(\d{2})?\s*(sang|trua|chieu|toi)?/.exec(f);
          if (wm) {
            const sH = +wm[1], eH = +wm[3], ePod = wm[5] || null;
            let s24 = ePod === 'sang' ? (sH === 12 ? 0 : sH) : hour24(sH, null, false);
            let e24 = hour24(eH, ePod, false) % 24;
            if (e24 <= s24 && !ePod && e24 + 12 < 24) e24 += 12;
            from = pad(s24) + ':' + pad(wm[2] ? +wm[2] : 0);
            to = pad(e24) + ':' + pad(wm[4] ? +wm[4] : 0);
          } else {
            const tt = /\bden\s*(\d{1,2})\s*(?:h|gio)\s*(\d{2})?\s*(sang|trua|chieu|toi)?/.exec(f);
            if (tt) {
              let h = +tt[1];
              if (h < 12 && (tt[3] === 'toi' || tt[3] === 'chieu' || !tt[3])) h += 12;
              to = pad(h % 24) + ':' + pad(tt[2] ? +tt[2] : 0);
            }
          }
          const fromNow = /\b(tu bay gio|tu day|bay gio)\b/.test(f);
          out.habit.times = [];
          out.habit.ml = ml;
          out.habit.spread = { count, from: from || (fromNow || !recurring ? 'now' : 'wake'), to };
        }
        const label = verb ? verb[1] : 'Thói quen';
        let extra = '';
        if (water) {
          const lm3 = /(\d+(?:[.,]\d+)?)\s*(lit|l)\b/.exec(f);
          if (lm3) extra = ' ' + lm3[1].replace('.', ',') + ' lít';
        } else {
          const qm = /(\d+)\s*(phut|trang|buoc|km|cai|lan)\b/.exec(f);
          if (qm) extra = ' ' + qm[1] + ' ' + UNIT_VN[qm[2]];
        }
        out.title = label + extra;
        out.emoji = verb ? verb[2] : '🎯';
        return out;
      }

      /* việc thường */
      const shoppingCtx = shopping;
      let when;
      if (relative !== null) {
        when = new Date(now.getTime() + relative * 60000);
      } else if (time) {
        const pod = time.pod || dayPod || repeatPod;
        const h = hour24(time.h, pod, shoppingCtx);
        when = new Date((date || today).getFullYear(), (date || today).getMonth(), (date || today).getDate(), h % 24, time.mi);
        if (!date && when <= now) when = addDays(when, 1);
      } else {
        const base = date || addDays(today, now.getHours() >= 9 ? 1 : 0);
        when = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 9, 0);
      }
      out.when = iso(when);
      out.repeat = repeat;
      out.leadMinutes = lead !== null ? lead : (shopping ? 60 : 0);
      out.shopping = shopping;

      if (shopping) {
        out.servings = servings;
        out.emoji = '🛒';
        if (dish) {
          out.title = 'Đi chợ nấu ' + dishSurface;
          const base = dish.d.servings || 4;
          out.checklist = dish.d.items.map((x) => ({ item: x.item, qty: Q.scaleQty(x.qty, servings / base) }));
        }
      }
      if (!out.title) out.title = cleanTitle(orig, f, spans);
      return out;
    }
    return { parse };
  }

  function nextWeekday(today, wd, nextWeek) {
    if (nextWeek) {
      const dow = today.getDay();
      const nextMon = addDays(today, (8 - dow) % 7 || 7);
      return addDays(nextMon, wd === 0 ? 6 : wd - 1);
    }
    let diff = (wd - today.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    return addDays(today, diff);
  }

  const FILLER_RE = /^(?:nhac nho|nhac|nho|dung quen)\s*(?:toi|tui|minh|em|giup)?\s*(?:(?:la|phai)\s*)?/;
  const TRAIL = new Set(['nha', 'nhé', 'nhen', 'nhỉ', 'nhá']); // so khớp trên chữ gốc có dấu, để "nhà" không bị coi là "nha"
  function cleanTitle(orig, f, spans) {
    const keep = [];
    spans.sort((a, b) => a[0] - b[0]);
    let pos = 0;
    for (const [s, e] of spans) { if (s > pos) keep.push(orig.slice(pos, s)); pos = Math.max(pos, e); }
    keep.push(orig.slice(pos));
    let t = keep.join(' ').replace(/\s+/g, ' ').trim();
    const ft = fold(t), fm = FILLER_RE.exec(ft);
    if (fm && fm[0].length) t = t.slice(fm[0].length).trim();
    t = t.replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '');
    let toks = t.split(' ').filter((x) => !['luc', 'vao'].includes(fold(x)));
    while (toks.length > 1 && TRAIL.has(toks[toks.length - 1].replace(/[.,!]+$/, '').toLowerCase())) toks.pop();
    t = toks.join(' ').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '');
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Việc mới';
  }

  return { createParser, fold };
});
