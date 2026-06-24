// Migrate all Supabase data → Google Sheets (one-time or re-run to refresh)
// GET /api/sync-to-sheets
import { getToken } from './_auth.js';

const SHEET_ID = (process.env.GOOGLE_SHEET_ID || '').replace(/^﻿/, '').trim();
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const BASE = `https://sheets.googleapis.com/v4/spreadsheets`;
const SB_URL = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

async function sbGet(table, qs = '') {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${qs}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`Supabase ${table} ${r.status}: ${await r.text()}`);
  return r.json();
}

async function read(token, range) {
  const r = await fetch(`${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const d = await r.json();
  return d.error ? null : (d.values || []);
}

async function append(token, range, values) {
  const r = await fetch(
    `${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ values }) },
  );
  return r.json();
}

async function update(token, range, values) {
  const r = await fetch(
    `${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ values }) },
  );
  return r.json();
}

async function clear(token, sheetName) {
  await fetch(`${BASE}/${SHEET_ID}/values/${encodeURIComponent(sheetName)}:clear`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` },
  });
}

async function ensureSheet(token, sheetName, headers) {
  const rows = await read(token, `${sheetName}!A1:Z1`);
  if (rows === null) {
    await fetch(`${BASE}/${SHEET_ID}:batchUpdate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetName } } }] }),
    });
    await append(token, `${sheetName}!A1`, [headers]);
  } else if (rows.length === 0) {
    await append(token, `${sheetName}!A1`, [headers]);
  }
}

// Upsert a single row: update if key exists, append if not
async function upsertRow(token, sheetName, keyCol, keyVal, row) {
  const col = await read(token, `${sheetName}!A:A`) ?? [];
  let found = -1;
  for (let i = 1; i < col.length; i++) {
    if (String(col[i]?.[0] ?? '') === String(keyVal)) { found = i + 1; break; }
  }
  const numCols = row.length;
  const lastCol = String.fromCharCode(64 + numCols);
  if (found > 0) {
    await update(token, `${sheetName}!A${found}:${lastCol}${found}`, [row]);
  } else {
    await append(token, `${sheetName}!A:${lastCol}`, [row]);
  }
}

export default async function handler(req, res) {
  if (!SHEET_ID) return res.status(500).json({ ok: false, error: 'GOOGLE_SHEET_ID not set' });
  if (!SB_URL || !SB_KEY) return res.status(500).json({ ok: false, error: 'Supabase env not set' });

  try {
    const token = await getToken([SCOPE]);
    const log = [];
    const errors = [];

    // Clear all sheets first (batch clear — single API call)
    await fetch(`${BASE}/${SHEET_ID}/values:batchClear`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ranges: ['Bills', 'Payments', 'Sales', 'CustomerInfo', 'Verified', 'Plates'] }),
    });
    log.push('Cleared all sheets');

    // Fetch ALL data from Supabase first (before any Sheets writes)
    const [bills, payments, sales, ci, verified, plates] = await Promise.allSettled([
      sbGet('qm_bills', 'deleted=eq.false&order=date.desc&limit=2000'),
      sbGet('qm_payments', 'select=*'),
      sbGet('qm_sales', 'deleted=eq.false&order=date.desc'),
      sbGet('qm_customer_info', 'select=*'),
      sbGet('qm_verified', 'select=*'),
      sbGet('qm_vehicle_plates', 'select=*'),
    ]);

    // Use batchUpdate to write ALL sheets in ONE API call (avoids rate limits)
    const ranges = [];

    if (bills.status === 'fulfilled') {
      const rows = [['billNo', 'date', 'dateText', 'seller', 'phone', 'kg', 'baht', 'json'],
        ...bills.value.map(b => {
          // Strip base64 images from json to stay under Google Sheets 50k char cell limit
          let safeJson = '';
          try {
            if (b.json) {
              const parsed = JSON.parse(b.json);
              if (parsed?.data) { delete parsed.data.receiptUrl; delete parsed.data.slipUrl; delete parsed.data.vehicleUrl; }
              if (parsed?.receiptUrl) delete parsed.receiptUrl;
              const s = JSON.stringify(parsed);
              safeJson = s.length <= 49000 ? s : '';
            }
          } catch {}
          return [b.bill_no ?? '', b.date ?? '', b.date_text ?? '', b.seller ?? '', b.phone ?? '', b.kg ?? '', b.baht ?? '', safeJson];
        })];
      ranges.push({ range: `Bills!A1:H${rows.length}`, values: rows });
      log.push(`Bills: ${bills.value.length}`);
    } else { errors.push(`Bills: ${bills.reason?.message}`); }

    if (payments.status === 'fulfilled') {
      const rows = [['เลขที่บิล', 'สถานะ', 'เวลา', 'receiptUrl', 'slipUrl', 'vehicleUrl'],
        ...payments.value.map(p => [p.bill_no ?? '', p.status ?? '', p.paid_at ?? '', p.receipt_url ?? '', p.slip_url ?? '', p.vehicle_url ?? ''])];
      ranges.push({ range: `Payments!A1:F${rows.length}`, values: rows });
      log.push(`Payments: ${payments.value.length}`);
    } else { errors.push(`Payments: ${payments.reason?.message}`); }

    if (sales.status === 'fulfilled') {
      const rows = [['id', 'date', 'dateText', 'buyer', 'kg', 'baht', 'receiptUrl', 'note'],
        ...sales.value.map(s => [s.id ?? '', s.date ?? '', '', s.buyer ?? '', s.kg ?? 0, s.baht ?? 0, s.receipt_url ?? '', s.note ?? ''])];
      ranges.push({ range: `Sales!A1:H${rows.length}`, values: rows });
      log.push(`Sales: ${sales.value.length}`);
    } else { errors.push(`Sales: ${sales.reason?.message}`); }

    if (ci.status === 'fulfilled') {
      const rows = [['phone', 'bankName', 'bankAccount', 'note'],
        ...ci.value.map(c => [c.phone ?? '', c.bank_name ?? '', c.bank_account ?? '', c.note ?? ''])];
      ranges.push({ range: `CustomerInfo!A1:D${rows.length}`, values: rows });
      log.push(`CustomerInfo: ${ci.value.length}`);
    } else { errors.push(`CustomerInfo: ${ci.reason?.message}`); }

    if (verified.status === 'fulfilled') {
      const rows = [['phone', 'name'], ...verified.value.map(v => [v.phone ?? '', v.name ?? ''])];
      ranges.push({ range: `Verified!A1:B${rows.length}`, values: rows });
      log.push(`Verified: ${verified.value.length}`);
    } else { errors.push(`Verified: ${verified.reason?.message}`); }

    if (plates.status === 'fulfilled') {
      const rows = [['phone', 'plate'], ...plates.value.map(p => [p.phone ?? '', p.plate ?? ''])];
      ranges.push({ range: `Plates!A1:B${rows.length}`, values: rows });
      log.push(`Plates: ${plates.value.length}`);
    } else { errors.push(`Plates: ${plates.reason?.message}`); }

    // Single batch write — all sheets at once
    if (ranges.length > 0) {
      const batchR = await fetch(`${BASE}/${SHEET_ID}/values:batchUpdate`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ valueInputOption: 'RAW', data: ranges }),
      });
      const batchD = await batchR.json();
      if (batchD.error) errors.push(`batchUpdate: ${batchD.error.message}`);
      else log.push(`batchUpdate: wrote ${batchD.responses?.length ?? ranges.length} ranges`);
    }

    res.json({ ok: errors.length === 0, migrated: log, errors });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
