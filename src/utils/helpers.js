import { CATS, TIERS, REQUIRE_NAME } from './constants.js';

export const fmtKg   = n => !n ? '0' : (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
export const fmtBaht = n => (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtPrice = n => !n ? '0' : (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

export const timeStr = t => new Date(t).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
export const dateStr = t => new Date(t).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

export const catLabel  = k => { const c = CATS.find(x => x.key === k); return c ? c.label : k; };
export const catAccent = k => { const c = CATS.find(x => x.key === k); return c ? c.accent : '#999'; };

export const tierOf    = kg => TIERS.find(t => kg >= t.min) || TIERS[TIERS.length - 1];
export const nextTierOf = kg => { const i = TIERS.findIndex(t => kg >= t.min); return i > 0 ? TIERS[i - 1] : null; };

export function effectiveTier(total, verified) {
  const raw = tierOf(total);
  if (REQUIRE_NAME[raw.key] && !verified) {
    return TIERS.find(t => !REQUIRE_NAME[t.key] && total >= t.min) || TIERS[TIERS.length - 1];
  }
  return raw;
}

export function tierBadge(tier, size) {
  const lg = size === 'lg';
  return 'display:inline-flex;align-items:center;gap:5px;border-radius:20px;font-family:Prompt;font-weight:600;letter-spacing:.04em;'
    + (lg ? 'padding:6px 14px;font-size:13px;' : 'padding:3px 10px;font-size:11px;') + tier.badge;
}

export function agg(session) {
  const out = {};
  CATS.forEach(c => out[c.key] = { kg: 0, count: 0 });
  if (!session) return out;
  if (session.aggData) {
    CATS.forEach(c => { if (session.aggData[c.key]) out[c.key] = session.aggData[c.key]; });
    return out;
  }
  (session.entries || []).forEach(e => { if (out[e.cat]) { out[e.cat].kg += e.kg; out[e.cat].count++; } });
  return out;
}

export function grandKg(session) {
  return session ? (session.entries || []).reduce((a, e) => a + e.kg, 0) : 0;
}

export function grandBaht(session) {
  if (!session) return 0;
  return (session.entries || []).reduce((sum, e) => {
    const priceKey = e.customLabel ? `custom:${e.customLabel}` : e.cat;
    const price = (session.prices || {})[priceKey] ?? (session.prices || {})[e.cat] ?? 0;
    return sum + (e.kg || 0) * price;
  }, 0);
}

export function customLabelRows(session) {
  const map = {};
  (session?.entries || []).filter(e => e.cat === 'custom').forEach(e => {
    const lbl = e.customLabel || '';
    if (!map[lbl]) map[lbl] = { label: lbl, kg: 0, count: 0, priceKey: lbl ? 'custom:' + lbl : 'custom' };
    map[lbl].kg += e.kg;
    map[lbl].count++;
  });
  return Object.values(map);
}

export function billPayload(session) {
  const a = agg(session);
  const rows = CATS.filter(c => a[c.key].count > 0).map(c => ({
    k: c.key, c: a[c.key].count,
    w: Math.round(a[c.key].kg * 100) / 100,
    p: session.prices[c.key] || 0
  }));
  return { b: session.billNo, d: session.date, s: session.seller || '', sp: session.sellerPhone || '', r: rows, ca: session.confirmedAt };
}

export function encodeBill(session) {
  const json = JSON.stringify(billPayload(session));
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeBill(b64) {
  const json = decodeURIComponent(escape(atob(decodeURIComponent(b64))));
  const p = JSON.parse(json);
  const prices = {};
  const aggData = {};
  CATS.forEach(c => { prices[c.key] = 0; aggData[c.key] = { kg: 0, count: 0 }; });
  (p.r || []).forEach(row => { prices[row.k] = row.p; aggData[row.k] = { kg: row.w, count: row.c }; });
  return { billNo: p.b, date: p.d, seller: p.s, sellerPhone: p.sp || '', prices, aggData, entries: [], log: [], confirmed: true, confirmedAt: p.ca || Date.now() };
}

export function billLink(session) {
  const b64 = encodeBill(session);
  const base = location.href.split('#')[0];
  return base + '#bill=' + encodeURIComponent(b64);
}

export function billCode(session) {
  return session ? session.billNo.replace('QD', '').replace('-', ' ') : '';
}

export function newBillNo() {
  const t = Date.now();
  return 'QD' + new Date(t).toISOString().slice(2, 10).replace(/-/g, '') + '-' + String(Math.floor(Math.random() * 900) + 100);
}

export function newSaleBillNo() {
  const t = Date.now();
  return 'QS' + new Date(t).toISOString().slice(2, 10).replace(/-/g, '') + '-' + String(Math.floor(Math.random() * 900) + 100);
}

export function loadCustomers(history) {
  const map = {};
  (history || []).forEach(h => {
    const phone = String(h.phone || (h.data && h.data.sellerPhone) || '').trim();
    if (!phone) return;
    const kg = parseFloat(String(h.kg).replace(/,/g, '')) || 0;
    if (!map[phone]) map[phone] = { phone, name: '', totalKg: 0, billCount: 0, lastDate: 0 };
    const m = map[phone];
    m.totalKg += kg; m.billCount++;
    if ((h.date || 0) >= m.lastDate) { m.lastDate = h.date || 0; if (h.seller && h.seller !== '-') m.name = h.seller; }
  });
  return map;
}

export function customerStat(phone, history, verified) {
  phone = String(phone || '').trim();
  if (!phone) return null;
  const c = loadCustomers(history)[phone];
  const total = c ? c.totalKg : 0;
  return {
    phone, total, billCount: c ? c.billCount : 0, name: c ? c.name : '',
    tier: tierOf(total), next: nextTierOf(total),
    verified: !!verified[phone],
    effectiveTier: effectiveTier(total, !!verified[phone]),
  };
}
