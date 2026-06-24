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

    // 1. Bills — upsert each bill by billNo
    try {
      const bills = await sbGet('qm_bills', 'deleted=eq.false&order=date.desc&limit=2000');
      await ensureSheet(token, 'Bills', ['billNo', 'date', 'dateText', 'seller', 'phone', 'kg', 'baht', 'json']);
      for (const b of bills) {
        await upsertRow(token, 'Bills', 'billNo', b.bill_no, [
          b.bill_no ?? '', b.date ?? '', b.date_text ?? '',
          b.seller ?? '', b.phone ?? '', b.kg ?? '', b.baht ?? '', b.json ?? '',
        ]);
      }
      log.push(`Bills: ${bills.length}`);
    } catch (e) { errors.push(`Bills: ${e.message}`); }

    // 2. Payments — upsert each payment by billNo
    try {
      const payments = await sbGet('qm_payments', 'select=*');
      await ensureSheet(token, 'Payments', ['เลขที่บิล', 'สถานะ', 'เวลา', 'receiptUrl', 'slipUrl', 'vehicleUrl']);
      for (const p of payments) {
        await upsertRow(token, 'Payments', 'billNo', p.bill_no, [
          p.bill_no ?? '', p.status ?? '', p.paid_at ?? '',
          p.receipt_url ?? '', p.slip_url ?? '', p.vehicle_url ?? '',
        ]);
      }
      log.push(`Payments: ${payments.length}`);
    } catch (e) { errors.push(`Payments: ${e.message}`); }

    // 3. Sales — clear then re-append all (avoid stale/duplicate rows)
    try {
      const sales = await sbGet('qm_sales', 'deleted=eq.false&order=date.desc');
      await clear(token, 'Sales');
      await append(token, 'Sales!A:H', [['id', 'date', 'dateText', 'buyer', 'kg', 'baht', 'receiptUrl', 'note']]);
      for (const s of sales) {
        const row = [s.id ?? '', s.date ?? '', '', s.buyer ?? '', s.kg ?? 0, s.baht ?? 0, s.receipt_url ?? '', s.note ?? ''];
        await append(token, 'Sales!A:H', [row]);
      }
      log.push(`Sales: ${sales.length}`);
    } catch (e) { errors.push(`Sales: ${e.message}`); }

    // 4. CustomerInfo — upsert by phone
    try {
      const ci = await sbGet('qm_customer_info', 'select=*');
      await ensureSheet(token, 'CustomerInfo', ['phone', 'bankName', 'bankAccount', 'note']);
      for (const c of ci) {
        await upsertRow(token, 'CustomerInfo', 'phone', c.phone, [
          c.phone ?? '', c.bank_name ?? '', c.bank_account ?? '', c.note ?? '',
        ]);
      }
      log.push(`CustomerInfo: ${ci.length}`);
    } catch (e) { errors.push(`CustomerInfo: ${e.message}`); }

    // 5. Verified — upsert by phone
    try {
      const verified = await sbGet('qm_verified', 'select=*');
      await ensureSheet(token, 'Verified', ['phone', 'name']);
      for (const v of verified) {
        await upsertRow(token, 'Verified', 'phone', v.phone, [v.phone ?? '', v.name ?? '']);
      }
      log.push(`Verified: ${verified.length}`);
    } catch (e) { errors.push(`Verified: ${e.message}`); }

    // 6. Plates — upsert by phone
    try {
      const plates = await sbGet('qm_vehicle_plates', 'select=*');
      await ensureSheet(token, 'Plates', ['phone', 'plate']);
      for (const p of plates) {
        await upsertRow(token, 'Plates', 'phone', p.phone, [p.phone ?? '', p.plate ?? '']);
      }
      log.push(`Plates: ${plates.length}`);
    } catch (e) { errors.push(`Plates: ${e.message}`); }

    res.json({ ok: errors.length === 0, migrated: log, errors });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
