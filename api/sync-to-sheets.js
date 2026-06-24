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

async function sheetRead(token, range) {
  const r = await fetch(`${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const d = await r.json();
  return d.error ? null : (d.values || []);
}

async function sheetAppend(token, range, values) {
  await fetch(
    `${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ values }) },
  );
}

async function sheetClear(token, sheetName) {
  await fetch(`${BASE}/${SHEET_ID}/values/${encodeURIComponent(sheetName)}:clear`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` },
  });
}

async function ensureSheet(token, sheetName, headers) {
  const rows = await sheetRead(token, `${sheetName}!A1:Z1`);
  if (rows === null) {
    await fetch(`${BASE}/${SHEET_ID}:batchUpdate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetName } } }] }),
    });
  }
  await sheetAppend(token, `${sheetName}!A1`, [headers]);
}

export default async function handler(req, res) {
  if (!SHEET_ID) return res.status(500).json({ ok: false, error: 'GOOGLE_SHEET_ID not set' });
  if (!SB_URL || !SB_KEY) return res.status(500).json({ ok: false, error: 'Supabase env not set' });

  try {
    const token = await getToken([SCOPE]);
    const log = [];

    // 1. Bills
    const bills = await sbGet('qm_bills', 'deleted=eq.false&order=date.desc&limit=2000');
    await sheetClear(token, 'Bills');
    await ensureSheet(token, 'Bills', ['billNo', 'date', 'dateText', 'seller', 'phone', 'kg', 'baht', 'json']);
    if (bills.length) {
      await sheetAppend(token, 'Bills!A2', bills.map(b => [
        b.bill_no ?? '', b.date ?? '', b.date_text ?? '',
        b.seller ?? '', b.phone ?? '', b.kg ?? '', b.baht ?? '', b.json ?? '',
      ]));
    }
    log.push(`Bills: ${bills.length}`);

    // 2. Payments
    const payments = await sbGet('qm_payments', 'select=*');
    await sheetClear(token, 'Payments');
    await ensureSheet(token, 'Payments', ['เลขที่บิล', 'สถานะ', 'เวลา', 'receiptUrl', 'slipUrl', 'vehicleUrl']);
    if (payments.length) {
      await sheetAppend(token, 'Payments!A2', payments.map(p => [
        p.bill_no ?? '', p.status ?? '', p.paid_at ?? '',
        p.receipt_url ?? '', p.slip_url ?? '', p.vehicle_url ?? '',
      ]));
    }
    log.push(`Payments: ${payments.length}`);

    // 3. Sales
    const sales = await sbGet('qm_sales', 'deleted=eq.false&order=date.desc');
    await sheetClear(token, 'Sales');
    await ensureSheet(token, 'Sales', ['id', 'date', 'dateText', 'buyer', 'kg', 'baht', 'receiptUrl', 'note']);
    if (sales.length) {
      await sheetAppend(token, 'Sales!A2', sales.map(s => [
        s.id ?? '', s.date ?? '', s.date_text ?? '',
        s.buyer ?? '', s.kg ?? '', s.baht ?? '', s.receipt_url ?? '', s.note ?? '',
      ]));
    }
    log.push(`Sales: ${sales.length}`);

    // 4. CustomerInfo
    const ci = await sbGet('qm_customer_info', 'select=*');
    await sheetClear(token, 'CustomerInfo');
    await ensureSheet(token, 'CustomerInfo', ['phone', 'bankName', 'bankAccount', 'note']);
    if (ci.length) {
      await sheetAppend(token, 'CustomerInfo!A2', ci.map(c => [
        c.phone ?? '', c.bank_name ?? '', c.bank_account ?? '', c.note ?? '',
      ]));
    }
    log.push(`CustomerInfo: ${ci.length}`);

    // 5. Verified
    const verified = await sbGet('qm_verified', 'select=*');
    await sheetClear(token, 'Verified');
    await ensureSheet(token, 'Verified', ['phone', 'name']);
    if (verified.length) {
      await sheetAppend(token, 'Verified!A2', verified.map(v => [v.phone ?? '', v.name ?? '']));
    }
    log.push(`Verified: ${verified.length}`);

    // 6. Plates
    const plates = await sbGet('qm_vehicle_plates', 'select=*');
    await sheetClear(token, 'Plates');
    await ensureSheet(token, 'Plates', ['phone', 'plate']);
    if (plates.length) {
      await sheetAppend(token, 'Plates!A2', plates.map(p => [p.phone ?? '', p.plate ?? '']));
    }
    log.push(`Plates: ${plates.length}`);

    res.json({ ok: true, migrated: log });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
