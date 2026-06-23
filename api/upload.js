export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  try {
    const { base64, path } = req.body;
    if (!base64 || !path) return res.status(400).json({ ok: false, error: 'missing base64 or path' });

    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://njlnbuljqjiomykfketr.supabase.co';
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SERVICE_KEY) return res.status(500).json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY not set' });

    const raw = base64.replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(raw, 'base64');

    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/qudsun-photos/${path}`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
        'content-type': 'image/jpeg',
        'x-upsert': 'true',
      },
      body: buf,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return res.status(500).json({ ok: false, error: err });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/qudsun-photos/${path}`;
    return res.json({ ok: true, url: publicUrl });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
