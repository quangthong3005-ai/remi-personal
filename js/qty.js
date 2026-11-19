/* Định lượng nguyên liệu: đọc "500g", "1,5 kg", "1/2 muỗng", tăng giảm theo bước hợp lý và co giãn theo số người ăn.
   Dùng được cả trong trình duyệt (window.RemiQty) lẫn Node (để test). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RemiQty = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const QTY_RE = /^\s*(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)\s*(.*)$/;

  /** "500g" -> {n: 500, u: "g"}; không bắt đầu bằng số (vd "một ít") -> null */
  function parseQty(s) {
    const m = QTY_RE.exec(String(s == null ? '' : s));
    if (!m) return null;
    let n;
    if (m[1].indexOf('/') >= 0) {
      const p = m[1].split('/');
      n = parseFloat(p[0]) / parseFloat(p[1]);
    } else {
      n = parseFloat(m[1].replace(',', '.'));
    }
    return isFinite(n) && n > 0 ? { n: n, u: m[2].trim() } : null;
  }

  function unitKind(u) {
    const x = String(u).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[.\s]/g, '');
    if (/^(g|gr|gram|grams)$/.test(x)) return 'g';
    if (/^(kg|kgs|kilogram|ky|ki)$/.test(x)) return 'kg';
    if (x === 'ml') return 'ml';
    if (/^(l|lit|litre|liter)$/.test(x)) return 'l';
    if (/^(muong|thia|tsp|tbsp)/.test(x)) return 'spoon';
    return 'count'; // củ, quả, cây, gói, hộp, bó, nhánh...
  }

  function fmtQ(n) {
    return String(Math.round(n * 100) / 100).replace('.', ',');
  }
  function qtyText(n, u) {
    return fmtQ(n) + (u ? ' ' + u : '');
  }

  function stepSize(n, kind) {
    if (kind === 'g') return n < 100 ? 10 : 50;
    if (kind === 'ml') return n < 200 ? 10 : 50;
    if (kind === 'kg' || kind === 'l') return n <= 1 ? 0.25 : 0.5;
    if (kind === 'spoon') return 0.5;
    return 1;
  }

  /** Ô trống hoặc đọc được thì chỉnh bằng nút +/- được; chữ tự do ("một ít") thì không. */
  function canStep(s) {
    return !String(s == null ? '' : s).trim() || !!parseQty(s);
  }

  /** Tăng (dir=1) hoặc giảm (dir=-1) một bước. Không bao giờ giảm xuống 0. */
  function stepQty(s, dir) {
    if (!String(s == null ? '' : s).trim()) return dir > 0 ? '1' : '';
    const q = parseQty(s);
    if (!q) return s;
    const n = q.n + dir * stepSize(q.n, unitKind(q.u));
    if (n <= 0.0001) return s;
    return qtyText(n, q.u);
  }

  /** Nhân định lượng với `ratio` (số người mới / số người cũ) rồi làm tròn theo từng loại đơn vị. */
  function scaleQty(s, ratio) {
    if (!ratio || ratio === 1) return s;
    const q = parseQty(s);
    if (!q) return s;
    const k = unitKind(q.u);
    const n = q.n * ratio;
    let r;
    if (k === 'g' || k === 'ml') r = n < 100 ? Math.round(n / 5) * 5 : Math.round(n / 10) * 10;
    else if (k === 'kg' || k === 'l') r = Math.round(n / 0.25) * 0.25;
    else if (k === 'spoon') r = Math.round(n / 0.5) * 0.5;
    else r = Math.round(n); // củ, quả, gói, hộp...: không mua được nửa gói nên làm tròn số nguyên
    if (r <= 0) r = k === 'g' || k === 'ml' ? 5 : k === 'kg' || k === 'l' ? 0.25 : k === 'spoon' ? 0.5 : 1;
    return qtyText(r, q.u);
  }

  return { parseQty: parseQty, unitKind: unitKind, stepQty: stepQty, scaleQty: scaleQty, canStep: canStep, fmtQ: fmtQ };
});
