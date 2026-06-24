export default async function handler(req, res) {
  try {
    const url = `${process.env.VITE_SUPABASE_URL}/rest/v1/qm_bills?select=count&limit=1`;
    const r = await fetch(url, {
      headers: {
        apikey: process.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
        Prefer: 'count=exact',
      },
    });
    res.status(200).json({ ok: r.ok, status: r.status, ts: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
