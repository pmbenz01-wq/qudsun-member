import { getToken } from './_auth.js';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
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
        const rows = await read(token, 'Payments!A:C') ?? [];
        const payments = {};
        for (let i = 1; i < rows.length; i++) {
          if (rows[i][0] && rows[i][1]) payments[String(rows[i][0])] = { status: rows[i][1], paidAt: rows[i][2] ?? null };
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

      if (action === 'updatePayment') {
        await ensureSheet(token, 'Payments', ['เลขที่บิล', 'สถานะ', 'เวลา']);
        const col = await read(token, 'Payments!A:A') ?? [];
        let found = -1;
        for (let i = 1; i < col.length; i++) {
          if (String(col[i]?.[0] ?? '') === String(body.billNo)) { found = i + 1; break; }
        }
        if (found > 0) {
          if (body.status === 'unpaid') await deleteRow(token, 'Payments', found);
          else await update(token, `Payments!B${found}:C${found}`, [[body.status, body.paidAt ?? '']]);
        } else if (body.status !== 'unpaid') {
          await append(token, 'Payments!A:C', [[body.billNo, body.status, body.paidAt ?? '']]);
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
