// Thống kê: chuỗi ngày, tỉ lệ hoàn thành, đếm theo ngày, huy hiệu.
// Đầu vào là mảng ngày dạng 'YYYY-MM-DD' theo giờ máy (không dùng UTC, tránh lệch ngày ở Việt Nam).
(function (root) {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');

  function dayKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function parseKey(k) {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  // Chuỗi ngày liên tiếp bình thường (mọi ngày đều tính).
  // Hôm nay chưa làm thì chuỗi vẫn giữ nguyên, chỉ đứt khi qua hết hôm nay.
  function computeStreak(days, today) {
    const set = new Set(days);
    let cursor = parseKey(dayKey(today || new Date()));
    if (!set.has(dayKey(cursor))) cursor = addDays(cursor, -1);

    let current = 0;
    while (set.has(dayKey(cursor))) {
      current++;
      cursor = addDays(cursor, -1);
    }

    let longest = 0, run = 0, prev = null;
    for (const k of [...set].sort()) {
      run = prev && dayKey(addDays(parseKey(prev), 1)) === k ? run + 1 : 1;
      if (run > longest) longest = run;
      prev = k;
    }
    return { current, longest };
  }

  // schedule: mảng thứ được chọn theo getDay (0=Chủ nhật, 1=Thứ 2, ... 6=Thứ 7).
  // Rỗng hoặc bỏ trống = mọi ngày.
  function isScheduled(d, schedule) {
    return !schedule || schedule.length === 0 || schedule.includes(d.getDay());
  }

  // Chuỗi hiện tại và dài nhất cho thói quen có lịch theo thứ.
  // Ngày không nằm trong lịch thì bỏ qua, không làm đứt chuỗi.
  // Hôm nay chưa làm thì chưa tính là đứt.
  function habitStreak(doneDays, schedule, today) {
    const done = new Set(doneDays);
    const end = parseKey(dayKey(today || new Date()));
    const todayKey = dayKey(end);
    if (done.size === 0) return { current: 0, longest: 0 };

    const first = parseKey([...done].sort()[0]);
    let longest = 0, run = 0;
    for (let d = first; d <= end; d = addDays(d, 1)) {
      const k = dayKey(d);
      if (done.has(k)) {
        run++;
        if (run > longest) longest = run;
      } else if (isScheduled(d, schedule) && k !== todayKey) {
        run = 0;
      }
    }
    return { current: run, longest };
  }

  // Tỉ lệ hoàn thành n ngày gần nhất (chỉ tính các ngày nằm trong lịch)
  function completionRate(doneDays, schedule, n, today) {
    const done = new Set(doneDays);
    const end = parseKey(dayKey(today || new Date()));
    let total = 0, ok = 0;
    for (let i = 0; i < n; i++) {
      const d = addDays(end, -i);
      if (!isScheduled(d, schedule)) continue;
      total++;
      if (done.has(dayKey(d))) ok++;
    }
    return { done: ok, total, pct: total ? Math.round((ok / total) * 100) : 0 };
  }

  // Đếm số lần theo từng ngày: ['2026-11-05','2026-11-05'] -> { '2026-11-05': 2 }
  function tally(days) {
    const out = {};
    for (const k of days) out[k] = (out[k] || 0) + 1;
    return out;
  }

  // n ngày gần nhất (cũ -> mới), dùng cho biểu đồ tuần (n=7) và tháng (n=30)
  function lastNDays(counts, n, today) {
    const end = parseKey(dayKey(today || new Date()));
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const k = dayKey(addDays(end, -i));
      out.push({ key: k, count: counts[k] || 0 });
    }
    return out;
  }
  // Dãy n ngày gần nhất (cũ -> mới). getter(key) trả số cho ngày 'YYYY-MM-DD'.
  function series(n, getter, today) {
    const end = parseKey(dayKey(today || new Date()));
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = addDays(end, -i);
      const k = dayKey(d);
      out.push({ key: k, day: d.getDate(), wd: d.getDay(), value: Number(getter(k)) || 0 });
    }
    return out;
  }

  const WD_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

  // Biểu đồ cột bằng SVG tự vẽ, không dùng thư viện.
  function barChartSvg(points, opts) {
    opts = opts || {};
    const W = 320, H = 150, padX = 6, padTop = 16, padBottom = 22;
    const n = points.length;
    const max = Math.max(opts.min || 1, ...points.map((p) => p.value));
    const chartH = H - padTop - padBottom;
    const slot = (W - padX * 2) / Math.max(1, n);
    const bw = Math.max(3, Math.min(26, slot * 0.62));
    const showVals = n <= 7;
    let out = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + (opts.label || 'Biểu đồ') + '">';
    out += '<line class="axis" x1="' + padX + '" y1="' + (padTop + chartH) + '" x2="' + (W - padX) + '" y2="' + (padTop + chartH) + '"/>';
    points.forEach((p, i) => {
      const x = padX + i * slot + (slot - bw) / 2;
      const h = p.value > 0 ? Math.max(3, Math.round((p.value / max) * chartH)) : 0;
      const y = padTop + chartH - h;
      if (h) out += '<rect class="bar" x="' + x.toFixed(1) + '" y="' + y + '" width="' + bw.toFixed(1) + '" height="' + h + '" rx="3"/>';
      if (showVals && p.value > 0) out += '<text class="val" x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 4) + '" text-anchor="middle">' + Math.round(p.value) + '</text>';
      if (n <= 7 || i % 5 === 0 || i === n - 1) out += '<text class="lbl" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + (n <= 7 ? WD_SHORT[p.wd] : p.day) + '</text>';
    });
    return out + '</svg>';
  }
    // ---- Huy hiệu (C3) ----
  const BADGE_DEFS = [
    { id: 'first',    emoji: '🌱', name: 'Bước đầu tiên',   desc: 'Làm xong một thói quen lần đầu',              metric: 'total',      target: 1 },
    { id: 'streak3',  emoji: '🔥', name: 'Khởi động',        desc: 'Giữ một thói quen 3 ngày liên tiếp',          metric: 'streak',     target: 3 },
    { id: 'streak7',  emoji: '🔥', name: 'Một tuần đều đặn', desc: 'Giữ một thói quen 7 ngày liên tiếp',          metric: 'streak',     target: 7 },
    { id: 'streak14', emoji: '🔥', name: 'Hai tuần bền bỉ',  desc: 'Giữ một thói quen 14 ngày liên tiếp',         metric: 'streak',     target: 14 },
    { id: 'streak30', emoji: '🏆', name: 'Một tháng kiên trì', desc: 'Giữ một thói quen 30 ngày liên tiếp',       metric: 'streak',     target: 30 },
    { id: 'water1',   emoji: '💧', name: 'Giọt đầu tiên',    desc: 'Uống đủ nước trong một ngày',                 metric: 'waterDays',  target: 1 },
    { id: 'water5',   emoji: '🥤', name: 'Thấm giọng',       desc: 'Uống đủ nước 5 ngày',                         metric: 'waterDays',  target: 5 },
    { id: 'water20',  emoji: '🌊', name: 'Biển xanh',        desc: 'Uống đủ nước 20 ngày',                        metric: 'waterDays',  target: 20 },
    { id: 'total25',  emoji: '⭐', name: '25 lần',           desc: 'Tổng cộng 25 lần làm thói quen',              metric: 'total',      target: 25 },
    { id: 'total100', emoji: '🏅', name: '100 lần',          desc: 'Tổng cộng 100 lần làm thói quen',             metric: 'total',      target: 100 },
    { id: 'multi3',   emoji: '🌟', name: 'Ngày trọn vẹn',    desc: 'Đạt mục tiêu 3 thói quen trong cùng một ngày', metric: 'multi',     target: 3 },
    { id: 'active14', emoji: '📅', name: 'Có mặt đều đặn',   desc: 'Có làm thói quen trong 14 ngày khác nhau',    metric: 'activeDays', target: 14 },
  ];

  // goalOf(h): số lần cần làm mỗi ngày của thói quen h.
  function badgeMetrics(habits, today, goalOf) {
    const t = today || new Date();
    let total = 0, streak = 0;
    const active = new Set(), waterSet = new Set(), perDay = {};
    habits.forEach((h) => {
      const log = h.log || {};
      const goal = Math.max(1, goalOf(h));
      const done = [];
      Object.keys(log).forEach((k) => {
        const v = Number(log[k]) || 0;
        if (v <= 0) return;
        total += v;
        active.add(k);
        if (v >= goal) {
          done.push(k);
          perDay[k] = (perDay[k] || 0) + 1;
          if (h.portionMl) waterSet.add(k);
        }
      });
      if (!h.once && done.length) streak = Math.max(streak, habitStreak(done, h.days, t).longest);
    });
    const multi = Object.keys(perDay).reduce((m, k) => Math.max(m, perDay[k]), 0);
    return { total, streak, waterDays: waterSet.size, multi, activeDays: active.size };
  }

  function evaluateBadges(habits, today, opts) {
    const goalOf = (opts && opts.goalOf) || ((h) => (h.times || []).length);
    const m = badgeMetrics(habits || [], today, goalOf);
    return BADGE_DEFS.map((b) => {
      const value = m[b.metric] || 0;
      return Object.assign({}, b, { value: Math.min(value, b.target), earned: value >= b.target });
    });
  }

  // Huy hiệu đã mở khoá lưu dạng { seeded: thời điểm, got: { id: thời điểm } }. Đã mở thì không bị thu hồi.
  function normBadges(v) {
    const out = { seeded: 0, got: {} };
    if (!v || typeof v !== 'object') return out;
    out.seeded = Number(v.seeded) || 0;
    if (v.got && typeof v.got === 'object') {
      Object.keys(v.got).forEach((id) => {
        const ts = Number(v.got[id]);
        if (ts > 0) out.got[id] = ts;
      });
    }
    return out;
  }

  // Gộp hai máy: lấy hợp, giữ thời điểm mở khoá sớm nhất.
  function mergeBadges(a, b) {
    a = normBadges(a); b = normBadges(b);
    const out = { seeded: Math.max(a.seeded, b.seeded), got: {} };
    new Set(Object.keys(a.got).concat(Object.keys(b.got))).forEach((id) => {
      out.got[id] = Math.min(a.got[id] || Infinity, b.got[id] || Infinity);
    });
    return out;
  }
  const BADGES = [
    { id: 'streak3', days: 3, name: 'Khởi động' },
    { id: 'streak7', days: 7, name: 'Một tuần đều đặn' },
    { id: 'streak30', days: 30, name: 'Một tháng bền bỉ' },
  ];

  function badgesFor(longest) {
    return BADGES.map((b) => ({ ...b, earned: longest >= b.days }));
  }

  const api = {
    dayKey, computeStreak, habitStreak, completionRate,
    series, barChartSvg,
    evaluateBadges, normBadges, mergeBadges, BADGE_DEFS,
    tally, lastNDays, badgesFor, BADGES,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RemiStats = api;
})(typeof window !== 'undefined' ? window : globalThis);