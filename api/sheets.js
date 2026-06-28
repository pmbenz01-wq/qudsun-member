import { getToken } from './_auth.js';

const SHEET_ID = (process.env.GOOGLE_SHEET_ID || '').replace(/^﻿/, '').trim();
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const BASE = `https://sheets.googleapis.com/v4/spreadsheets`;

async function read(token, range) {
  const r = await fetch(`${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const d = await r.json();
  if (d.error) return null; // sheet doesn't exist or other error
  return d.values || [];
}

async function append(token, range, values) {
  await fetch(
    `${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ values }),
    },
  );
}

async function update(token, range, values) {
  await fetch(
    `${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ values }),
    },
  );
}

async function clear(token, sheetName) {
  await fetch(`${BASE}/${SHEET_ID}/values/${encodeURIComponent(sheetName)}:clear`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
}

async function getSheetId(token, sheetName) {
  const r = await fetch(`${BASE}/${SHEET_ID}?fields=sheets.properties`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const d = await r.json();
  return d.sheets?.find(s => s.properties.title === sheetName)?.properties?.sheetId;
}

async function deleteRow(token, sheetName, rowNum) {
  const sheetId = await getSheetId(token, sheetName);
  if (sheetId === undefined) return;
  await fetch(`${BASE}/${SHEET_ID}:batchUpdate`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum },
        },
      }],
    }),
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

export default async function handler(req, res) {
  if (!SHEET_ID) return res.status(500).json({ ok: false, error: 'GOOGLE_SHEET_ID not set' });

  try {
    const token = await getToken([SCOPE]);

    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const action = req.query?.action;

      if (action === 'getPayments') {
        const rows = await read(token, 'Payments!A:F') ?? [];
        const payments = {};
        for (let i = 1; i < rows.length; i++) {
          if (rows[i][0] && rows[i][1]) payments[String(rows[i][0])] = {
            status: rows[i][1], paidAt: rows[i][2] ?? null,
            receiptUrl: rows[i][3] || null, slipUrl: rows[i][4] || null, vehicleUrl: rows[i][5] || null,
          };
        }
        return res.json({ ok: true, payments });
      }

      if (action === 'getPlates') {
        const rows = await read(token, 'Plates!A:B') ?? [];
        const plates = {};
        for (let i = 1; i < rows.length; i++) {
          if (rows[i][0]) plates[String(rows[i][0])] = String(rows[i][1] ?? '');
        }
        return res.json({ ok: true, plates });
      }

      if (action === 'getSales') {
        const rows = await read(token, 'Sales!A:H') ?? [];
        const sales = [];
        for (let i = 1; i < rows.length; i++) {
          if (rows[i][0]) sales.push({
            id: rows[i][0], date: rows[i][1] ? Number(rows[i][1]) : null,
            dateText: rows[i][2] || '', buyer: rows[i][3] || '',
            kg: rows[i][4] ? Number(rows[i][4]) : 0,
            baht: rows[i][5] ? Number(rows[i][5]) : 0,
            receiptUrl: rows[i][6] || '', note: rows[i][7] || '',
          });
        }
        return res.json({ ok: true, sales });
      }

      if (action === 'getCustomerInfo') {
        const rows = await read(token, 'CustomerInfo!A:D') ?? [];
        const info = {};
        for (let i = 1; i < rows.length; i++) {
          if (rows[i][0]) info[String(rows[i][0])] = { bankName: rows[i][1] || '', bankAccount: rows[i][2] || '', note: rows[i][3] || '' };
        }
        return res.json({ ok: true, info });
      }

      // Default: getBills
      const rows = await read(token, 'Bills!A:H') ?? [];
      const bills = [];
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0]) bills.push({ billNo: rows[i][0], date: rows[i][1], dateText: rows[i][2], seller: rows[i][3], phone: rows[i][4], kg: rows[i][5], baht: rows[i][6], json: rows[i][7] ?? '' });
      }
      return res.json({ ok: true, bills });
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = req.body;
      const action = body?.action;

      if (action === 'syncBill' || action === 'bill') {
        const bill = body.bill || body;
        await ensureSheet(token, 'Bills', ['billNo', 'date', 'dateText', 'seller', 'phone', 'kg', 'baht', 'json']);
        const col = await read(token, 'Bills!A:A') ?? [];
        let found = -1;
        for (let i = 1; i < col.length; i++) {
          if (String(col[i]?.[0] ?? '') === String(bill.billNo)) { found = i + 1; break; }
        }
        const row = [bill.billNo, bill.date ?? '', bill.dateText ?? '', bill.seller ?? '', bill.phone ?? '', bill.kg ?? '', bill.baht ?? '', bill.json ?? ''];
        if (found > 0) await update(token, `Bills!A${found}:H${found}`, [row]);
        else await append(token, 'Bills!A:H', [row]);
        return res.json({ ok: true });
      }

      if (action === 'deleteBill') {
        const col = await read(token, 'Bills!A:A') ?? [];
        let found = -1;
        for (let i = 1; i < col.length; i++) {
          if (String(col[i]?.[0] ?? '') === String(body.billNo)) { found = i + 1; break; }
        }
        if (found > 0) await deleteRow(token, 'Bills', found);
        return res.json({ ok: true });
      }

      if (action === 'updatePayment') {
        await ensureSheet(token, 'Payments', ['เลขที่บิล', 'สถานะ', 'เวลา', 'receiptUrl', 'slipUrl', 'vehicleUrl']);
        const col = await read(token, 'Payments!A:A') ?? [];
        let found = -1;
        for (let i = 1; i < col.length; i++) {
          if (String(col[i]?.[0] ?? '') === String(body.billNo)) { found = i + 1; break; }
        }
        const urlCols = [body.receiptUrl ?? '', body.slipUrl ?? '', body.vehicleUrl ?? ''];
        if (found > 0) {
          if (body.status === 'unpaid') await deleteRow(token, 'Payments', found);
          else await update(token, `Payments!B${found}:F${found}`, [[body.status, body.paidAt ?? '', ...urlCols]]);
        } else if (body.status !== 'unpaid') {
          await append(token, 'Payments!A:F', [[body.billNo, body.status, body.paidAt ?? '', ...urlCols]]);
        }
        return res.json({ ok: true });
      }

      if (action === 'updatePlates') {
        await ensureSheet(token, 'Plates', ['phone', 'plate']);
        await clear(token, 'Plates');
        const plates = body.plates || {};
        const rows = [['phone', 'plate'], ...Object.entries(plates)];
        if (rows.length > 1) await append(token, 'Plates!A1', rows);
        return res.json({ ok: true });
      }

      if (action === 'addSale') {
        await ensureSheet(token, 'Sales', ['id', 'date', 'dateText', 'buyer', 'kg', 'baht', 'receiptUrl', 'note']);
        const col = await read(token, 'Sales!A:A') ?? [];
        let found = -1;
        for (let i = 1; i < col.length; i++) {
          if (String(col[i]?.[0] ?? '') === String(body.id)) { found = i + 1; break; }
        }
        const row = [body.date ?? '', body.dateText ?? '', body.buyer ?? '', body.kg ?? 0, body.baht ?? 0, body.receiptUrl ?? '', body.note ?? ''];
        if (found > 0) await update(token, `Sales!B${found}:H${found}`, [row]);
        else await append(token, 'Sales!A:H', [[body.id, ...row]]);
        return res.json({ ok: true });
      }

      if (action === 'updateSale') {
        await ensureSheet(token, 'Sales', ['id', 'date', 'dateText', 'buyer', 'kg', 'baht', 'receiptUrl', 'note']);
        const col = await read(token, 'Sales!A:A') ?? [];
        let found = -1;
        for (let i = 1; i < col.length; i++) {
          if (String(col[i]?.[0] ?? '') === String(body.id)) { found = i + 1; break; }
        }
        if (found > 0) {
          const existing = (await read(token, `Sales!B${found}:H${found}`) ?? [[]])[0];
          const row = [
            existing[0] ?? '', existing[1] ?? '', existing[2] ?? '',
            existing[3] ?? '', existing[4] ?? '',
            body.receiptUrl !== undefined ? body.receiptUrl : (existing[5] ?? ''),
            body.note !== undefined ? body.note : (existing[6] ?? ''),
          ];
          await update(token, `Sales!B${found}:H${found}`, [row]);
        }
        return res.json({ ok: true });
      }

      if (action === 'deleteSale') {
        const col = await read(token, 'Sales!A:A') ?? [];
        let found = -1;
        for (let i = 1; i < col.length; i++) {
          if (String(col[i]?.[0] ?? '') === String(body.id)) { found = i + 1; break; }
        }
        if (found > 0) await deleteRow(token, 'Sales', found);
        return res.json({ ok: true });
      }

      if (action === 'forcePush') {
        // Force-overwrite all Sheets with data from the app (bills, payments, sales)
        const { bills = [], payments = {}, sales = [] } = body;
        const ranges = [];

        // Bills
        const billRows = [['billNo', 'date', 'dateText', 'seller', 'phone', 'kg', 'baht', 'json'],
          ...bills.map(b => [b.billNo ?? '', b.date ?? '', b.dateText ?? '', b.seller ?? '', b.phone ?? '', b.kg ?? '', b.baht ?? '', b.json ?? ''])];
        ranges.push({ range: `Bills!A1:H${billRows.length}`, values: billRows });

        // Payments
        const payRows = [['เลขที่บิล', 'สถานะ', 'เวลา', 'receiptUrl', 'slipUrl', 'vehicleUrl'],
          ...Object.entries(payments).map(([billNo, p]) => [billNo, p.status ?? '', p.paidAt ?? '', p.receiptUrl ?? '', p.slipUrl ?? '', p.vehicleUrl ?? ''])];
        ranges.push({ range: `Payments!A1:F${payRows.length}`, values: payRows });

        // Sales
        const saleRows = [['id', 'date', 'dateText', 'buyer', 'kg', 'baht', 'receiptUrl', 'note'],
          ...sales.map(s => [s.id ?? '', s.date ?? '', s.dateText ?? '', s.buyer ?? '', s.kg ?? 0, s.baht ?? 0, s.receiptUrl ?? '', s.note ?? ''])];
        ranges.push({ range: `Sales!A1:H${saleRows.length}`, values: saleRows });

        // Clear all 3 sheets then batch-write
        await fetch(`${BASE}/${SHEET_ID}/values:batchClear`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ ranges: ['Bills', 'Payments', 'Sales'] }),
        });
        const br = await fetch(`${BASE}/${SHEET_ID}/values:batchUpdate`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ valueInputOption: 'RAW', data: ranges }),
        });
        const bd = await br.json();
        if (bd.error) return res.json({ ok: false, error: bd.error.message });
        return res.json({ ok: true, bills: bills.length, payments: Object.keys(payments).length, sales: sales.length });
      }

      if (action === 'updateCustomerInfo') {
        await ensureSheet(token, 'CustomerInfo', ['phone', 'bankName', 'bankAccount', 'note']);
        const col = await read(token, 'CustomerInfo!A:A') ?? [];
        let found = -1;
        for (let i = 1; i < col.length; i++) {
          if (String(col[i]?.[0] ?? '') === String(body.phone)) { found = i + 1; break; }
        }
        const row = [body.bankName ?? '', body.bankAccount ?? '', body.note ?? ''];
        if (found > 0) await update(token, `CustomerInfo!B${found}:D${found}`, [row]);
        else await append(token, 'CustomerInfo!A:D', [[body.phone, ...row]]);
        return res.json({ ok: true });
      }

      if (action === 'verify') {
        await ensureSheet(token, 'Verified', ['phone', 'name']);
        const col = await read(token, 'Verified!A:A') ?? [];
        let found = -1;
        for (let i = 1; i < col.length; i++) {
          if (String(col[i]?.[0] ?? '') === String(body.phone)) { found = i + 1; break; }
        }
        if (found > 0) await update(token, `Verified!B${found}`, [[body.name ?? '']]);
        else await append(token, 'Verified!A:B', [[body.phone, body.name ?? '']]);
        return res.json({ ok: true });
      }

      return res.json({ ok: false, error: 'unknown action' });
    }

    res.status(405).json({ ok: false });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
