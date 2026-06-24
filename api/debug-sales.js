// Debug: migrate sales from Supabase → Sheets with full response logging
import { getToken } from './_auth.js';

const SHEET_ID = (process.env.GOOGLE_SHEET_ID || '').replace(/^﻿/, '').trim();
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const BASE = `https://sheets.googleapis.com/v4/spreadsheets`;
const SB_URL = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

export default async function handler(req, res) {
  try {
    const token = await getToken([SCOPE]);
    const log = [];

    // 1. Fetch from Supabase
    const r = await fetch(`${SB_URL}/rest/v1/qm_sales?deleted=eq.false&order=date.desc`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Accept: 'application/json' },
    });
    const sales = await r.json();
    log.push(`Fetched ${sales.length} sales from Supabase`);
    if (sales.length > 0) log.push(`First sale: ${JSON.stringify(sales[0])}`);

    // 2. Clear Sales sheet
    const clearR = await fetch(`${BASE}/${SHEET_ID}/values/${encodeURIComponent('Sales')}:clear`, {
      method: 'POST', headers: { authorization: `Bearer ${token}` },
    });
    log.push(`Clear: ${clearR.status}`);

    // 3. Write headers
    const hdrR = await fetch(
      `${BASE}/${SHEET_ID}/values/${encodeURIComponent('Sales!A:H')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ values: [['id', 'date', 'dateText', 'buyer', 'kg', 'baht', 'receiptUrl', 'note']] }) },
    );
    const hdrD = await hdrR.json();
    log.push(`Headers: ${hdrR.status} updatedRange=${hdrD.updates?.updatedRange} err=${hdrD.error?.message}`);

    // 4. Append each sale
    for (let i = 0; i < sales.length; i++) {
      const s = sales[i];
      const row = [String(s.id ?? ''), s.date ?? '', '', s.buyer ?? '', s.kg ?? 0, s.baht ?? 0, s.receipt_url ?? '', s.note ?? ''];
      const ar = await fetch(
        `${BASE}/${SHEET_ID}/values/${encodeURIComponent('Sales!A:H')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ values: [row] }) },
      );
      const ad = await ar.json();
      log.push(`Sale[${i}] id="${s.id}" → status=${ar.status} updatedRange=${ad.updates?.updatedRange} err=${ad.error?.message}`);
    }

    // 5. Read back
    const readR = await fetch(`${BASE}/${SHEET_ID}/values/${encodeURIComponent('Sales!A:H')}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const readD = await readR.json();
    log.push(`Read back: ${readD.values?.length ?? 0} rows`);

    res.json({ ok: true, log });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
