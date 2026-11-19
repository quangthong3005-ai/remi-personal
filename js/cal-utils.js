/* Remi - Nhóm D: tiện ích lịch nâng cao (không phụ thuộc app.js).
 * Sự kiện: { id, title, start, end, allDay?, description?, location? }
 * start/end là số mili-giây (epoch) hoặc chuỗi ISO. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RemiCal = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN = 60000;
  const toMs = (v) => (typeof v === 'number' ? v : new Date(v).getTime());

  /* ---- 1. Kéo thả: làm tròn giờ ---- */
  function snap(ms, stepMin = 15) {
    const s = stepMin * MIN;
    return Math.round(ms / s) * s;
  }
  // Dời sự kiện giữ nguyên độ dài
  function moveEvent(ev, newStart, stepMin = 15) {
    const dur = toMs(ev.end) - toMs(ev.start);
    const start = snap(toMs(newStart), stepMin);
    return { ...ev, start, end: start + dur };
  }

  /* ---- 2. Báo trùng giờ ---- */
  function overlaps(a, b) {
    return toMs(a.start) < toMs(b.end) && toMs(b.start) < toMs(a.end);
  }
  // Trả về danh sách cặp trùng [a, b]. Bỏ qua sự kiện cả ngày.
  function findConflicts(events) {
    const list = events.filter((e) => !e.allDay)
      .slice().sort((x, y) => toMs(x.start) - toMs(y.start));
    const out = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (toMs(list[j].start) >= toMs(list[i].end)) break;
        out.push([list[i], list[j]]);
      }
    }
    return out;
  }
  // Kiểm tra một sự kiện mới/đang kéo có trùng gì không (bỏ qua chính nó theo id)
  function conflictsWith(ev, events) {
    return events.filter((o) => o.id !== ev.id && !o.allDay && overlaps(ev, o));
  }

  /* ---- 3. Tìm giờ trống ---- */
  // Khoảng trống giữa các khoảng bận. Đơn vị tuỳ ý (phút hoặc ms), miễn cùng đơn vị với from/to/min.
  function freeGaps(intervals, from, to, min) {
    const busy = intervals.map((i) => [toMs(i[0]), toMs(i[1])])
      .filter((i) => i[1] > from && i[0] < to).sort((a, b) => a[0] - b[0]);
    const out = [];
    let cur = from;
    for (const [s, e] of busy) {
      if (s - cur >= min) out.push({ start: cur, end: s });
      cur = Math.max(cur, e);
    }
    if (to - cur >= min) out.push({ start: cur, end: to });
    return out;
  }
  // day: Date bất kỳ trong ngày cần tìm. Trả về [{start, end}] (ms)
  function findFreeSlots(events, day, opts = {}) {
    const { fromHour = 8, toHour = 22, minMinutes = 30 } = opts;
    const d = new Date(day);
    const winStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), fromHour).getTime();
    const winEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), toHour).getTime();
    const busy = events.filter((e) => !e.allDay).map((e) => [e.start, e.end]);
    return freeGaps(busy, winStart, winEnd, minMinutes * MIN);
  }

  /* ---- 4. Xuất / nhập .ics ---- */
  const pad = (n) => String(n).padStart(2, '0');
  const fmtUTC = (ms) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
      `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  };
  const fmtDate = (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  };
  const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;')
    .replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const unesc = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

  // Gập dòng tối đa 75 byte theo RFC 5545
  function fold(line) {
    const enc = new TextEncoder(), dec = new TextDecoder();
    const bytes = enc.encode(line);
    if (bytes.length <= 75) return line;
    const parts = [];
    let i = 0, limit = 75;
    while (i < bytes.length) {
      let end = Math.min(i + limit, bytes.length);
      while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--; // không cắt giữa ký tự UTF-8
      parts.push(dec.decode(bytes.slice(i, end)));
      i = end; limit = 74;
    }
    return parts.join('\r\n ');
  }

  function toICS(events, opts = {}) {
    const name = opts.name || 'Remi';
    const now = fmtUTC(opts.now ?? Date.now());
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${name}//Lich//VI`,
      'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(name)}`];
    for (const e of events) {
      const s = toMs(e.start), en = toMs(e.end);
      L.push('BEGIN:VEVENT', `UID:${e.id ?? s}@remi`, `DTSTAMP:${now}`);
      if (e.allDay) {
        L.push(`DTSTART;VALUE=DATE:${fmtDate(s)}`, `DTEND;VALUE=DATE:${fmtDate(en)}`);
      } else {
        // floating: giờ "treo", hiện đúng số giờ ghi trong việc ở mọi múi giờ (server không biết múi giờ của người dùng)
        const f = (ms) => (e.floating ? fmtUTC(ms).slice(0, -1) : fmtUTC(ms));
        L.push(`DTSTART:${f(s)}`, `DTEND:${f(en)}`);
      }
      L.push(`SUMMARY:${esc(e.title)}`);
      if (e.repeat === 'daily') L.push('RRULE:FREQ=DAILY');
      else if (e.repeat === 'weekly') L.push('RRULE:FREQ=WEEKLY');
      if (e.description) L.push(`DESCRIPTION:${esc(e.description)}`);
      if (e.location) L.push(`LOCATION:${esc(e.location)}`);
      if (e.leadMin > 0) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${Math.round(e.leadMin)}M`, 'END:VALARM');
      L.push('END:VEVENT');
    }
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }

  function parseICSTime(val, params) {
    if (/VALUE=DATE/i.test(params) || /^\d{8}$/.test(val)) {
      const m = val.match(/^(\d{4})(\d{2})(\d{2})/);
      return { ms: new Date(+m[1], m[2] - 1, +m[3]).getTime(), allDay: true };
    }
    const m = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
    if (!m) return null;
    const [, y, mo, d, h, mi, s, z] = m.map((x, i) => (i && i < 7 ? +x : x));
    const ms = z ? Date.UTC(y, mo - 1, d, h, mi, s) : new Date(y, mo - 1, d, h, mi, s).getTime();
    return { ms, allDay: false };
  }

  function parseDuration(v) {
    const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v);
    if (!m) return null;
    return ((+m[1] || 0) * 7 * 86400 + (+m[2] || 0) * 86400 + (+m[3] || 0) * 3600 + (+m[4] || 0) * 60 + (+m[5] || 0)) * 1000;
  }

  function parseICS(text) {
    const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
    const events = [];
    let cur = null, inAlarm = false;
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
      if (line === 'END:VEVENT') {
        if (cur && cur.start != null) {
          if (cur.end == null) cur.end = cur.start + (cur.durMs != null ? cur.durMs : (cur.allDay ? 86400000 : 0));
          delete cur.durMs;
          events.push(cur);
        }
        cur = null; continue;
      }
      if (!cur) continue;
      if (line === 'BEGIN:VALARM') { inAlarm = true; continue; }
      if (line === 'END:VALARM') { inAlarm = false; continue; }
      if (inAlarm) continue;
      const i = line.indexOf(':');
      if (i < 0) continue;
      const [key, ...pp] = line.slice(0, i).split(';');
      const params = pp.join(';'), val = line.slice(i + 1);
      switch (key.toUpperCase()) {
        case 'UID': cur.id = val; break;
        case 'SUMMARY': cur.title = unesc(val); break;
        case 'DESCRIPTION': cur.description = unesc(val); break;
        case 'LOCATION': cur.location = unesc(val); break;
        case 'RRULE': cur.rrule = val; break;
        case 'DURATION': cur.durMs = parseDuration(val); break;
        case 'DTSTART': { const t = parseICSTime(val, params); if (t) { cur.start = t.ms; cur.allDay = t.allDay; } break; }
        case 'DTEND': { const t = parseICSTime(val, params); if (t) cur.end = t.ms; break; }
      }
    }
    return events;
  }

  return { snap, moveEvent, overlaps, findConflicts, conflictsWith, findFreeSlots, freeGaps, toICS, parseICS };
});
