// One-time migration endpoint — creates all qm_* tables in Supabase
// Call: POST /api/migrate with body { "password": "<supabase db password>" }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'missing password' });

  const PROJECT = 'njlnbuljqjiomykfketr';
  const host = `db.${PROJECT}.supabase.co`;

  const { default: pg } = await import('pg');
  const client = new pg.Client({
    host, port: 5432, database: 'postgres', user: 'postgres', password,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    const sql = `
      create table if not exists qm_bills (
        bill_no text primary key, date bigint, date_text text,
        seller text, phone text, kg text, baht text, json text,
        deleted boolean default false, created_at timestamptz default now()
      );
      create table if not exists qm_payments (
        bill_no text primary key, status text default 'unpaid',
        paid_at bigint, receipt_url text, slip_url text,
        vehicle_url text, slip_data jsonb, updated_at timestamptz default now()
      );
      create table if not exists qm_verified (
        phone text primary key, name text, updated_at timestamptz default now()
      );
      create table if not exists qm_customer_info (
        phone text primary key, bank_name text, bank_account text,
        note text, updated_at timestamptz default now()
      );
      create table if not exists qm_vehicle_plates (
        phone text primary key, plate text, updated_at timestamptz default now()
      );
      create table if not exists qm_sales (
        id text primary key, date bigint, buyer text,
        kg numeric, baht numeric, note text, receipt_url text,
        deleted boolean default false, created_at timestamptz default now()
      );
      alter table qm_bills    disable row level security;
      alter table qm_payments disable row level security;
      alter table qm_verified disable row level security;
      alter table qm_customer_info disable row level security;
      alter table qm_vehicle_plates disable row level security;
      alter table qm_sales    disable row level security;
    `;

    await client.query(sql);
    await client.end();

    // Verify tables exist
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const check = await fetch(`https://${PROJECT}.supabase.co/rest/v1/qm_sales?limit=0`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });

    res.json({ ok: true, verified: check.ok, status: check.status });
  } catch (err) {
    try { await client.end(); } catch {}
    res.status(500).json({ ok: false, error: err.message });
  }
}
