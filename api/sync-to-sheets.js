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

async function sheetWrite(token, sheetName, rows) {
  // Use values.update (PUT) to write directly to a specific range — more reliable than append
  if (!rows.length) return;
  const numCols = rows[0].length;
  const lastCol = String.fromCharCode(64 + numCols); // e.g. 8 cols → H
  const range = `${sheetName}!A1:${lastCol}${rows.length}`;
  const r = await fetch(
    `${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ values: rows }),
    },
  );
  const d = await r.json();
  if (d.error) throw new Error(`sheetWrite ${sheetName}: ${d.error.message}`);
  return d;
}

async function ensureSheetExists(token, sheetName) {
  const r = await fetch(`${BASE}/${SHEET_ID}?fields=sheets.properties`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const d = await r.json();
  const exists = d.sheets?.some(s => s.properties.title === sheetName);
  if (!exists) {
    await fetch(`${BASE}/${SHEET_ID}:batchUpdate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetName } } }] }),
    });
  }
}

async function writeSheet(token, sheetName, headers, dataRows) {
  await ensureSheetExists(token, sheetName);
  const all = [headers, ...dataRows];
  await sheetWrite(token, sheetName, all);
}

export default async function handler(req, res) {
  if (!SHEET_ID) return res.status(500).json({ ok: false, error: 'GOOGLE_SHEET_ID not set' });
  if (!SB_URL || !SB_KEY) return res.status(500).json({ ok: false, error: 'Supabase env not set' });

  try {
    const token = await getToken([SCOPE]);
    const log = [];

    // 1. Bills
    const bills = await sbGet('qm_bills', 'deleted=eq.false&order=date.desc&limit=2000');
    await writeSheet(token, 'Bills',
      ['billNo', 'date', 'dateText', 'seller', 'phone', 'kg', 'baht', 'json'],
      bills.map(b => [b.bill_no ?? '', b.date ?? '', b.date_text ?? '', b.seller ?? '', b.phone ?? '', b.kg ?? '', b.baht ?? '', b.json ?? '']),
    );
    log.push(`Bills: ${bills.length}`);

    // 2. Payments
    const payments = await sbGet('qm_payments', 'select=*');
    await writeSheet(token, 'Payments',
      ['เลขที่บิล', 'สถานะ', 'เวลา', 'receiptUrl', 'slipUrl', 'vehicleUrl'],
      payments.map(p => [p.bill_no ?? '', p.status ?? '', p.paid_at ?? '', p.receipt_url ?? '', p.slip_url ?? '', p.vehicle_url ?? '']),
    );
    log.push(`Payments: ${payments.length}`);

    // 3. Sales
    const sales = await sbGet('qm_sales', 'deleted=eq.false&order=date.desc');
    await writeSheet(token, 'Sales',
      ['id', 'date', 'dateText', 'buyer', 'kg', 'baht', 'receiptUrl', 'note'],
      sales.map(s => [s.id ?? '', s.date ?? '', '', s.buyer ?? '', s.kg ?? '', s.baht ?? '', s.receipt_url ?? '', s.note ?? '']),
    );
    log.push(`Sales: ${sales.length}`);

    // 4. CustomerInfo
    const ci = await sbGet('qm_customer_info', 'select=*');
    await writeSheet(token, 'CustomerInfo',
      ['phone', 'bankName', 'bankAccount', 'note'],
      ci.map(c => [c.phone ?? '', c.bank_name ?? '', c.bank_account ?? '', c.note ?? '']),
    );
    log.push(`CustomerInfo: ${ci.length}`);

    // 5. Verified
    const verified = await sbGet('qm_verified', 'select=*');
    await writeSheet(token, 'Verified',
      ['phone', 'name'],
      verified.map(v => [v.phone ?? '', v.name ?? '']),
    );
    log.push(`Verified: ${verified.length}`);

    // 6. Plates
    const plates = await sbGet('qm_vehicle_plates', 'select=*');
    await writeSheet(token, 'Plates',
      ['phone', 'plate'],
      plates.map(p => [p.phone ?? '', p.plate ?? '']),
    );
    log.push(`Plates: ${plates.length}`);

    res.json({ ok: true, migrated: log });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
