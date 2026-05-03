export function cleanString(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s.length ? s : null;
}

export function normalizeCode(v) {
  const s = cleanString(v);
  if (!s) return null;
  return s.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9\-_.\/]/g, '');
}

export function parseArNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  s = s.replace(/\$/g, '').replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseIVA(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    if (v > 1) return v / 100;
    return v;
  }
  const s = String(v).replace('%', '').trim();
  const n = parseArNumber(s);
  if (n === null) return null;
  return n > 1 ? n / 100 : n;
}

export function isJunkRow(rowObj) {
  const values = Object.values(rowObj).map((v) => cleanString(v)).filter(Boolean);
  if (!values.length) return true;
  const full = values.join(' ').toLowerCase();
  return /(lista de precios|presupuesto|ferreteria|subtotal|total general|-----)/.test(full);
}
