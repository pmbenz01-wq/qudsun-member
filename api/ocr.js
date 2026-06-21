export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const { base64, mode } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ ok: false, error: 'no key' });

  const prompt = mode === 'plate'
    ? 'อ่านป้ายทะเบียนรถในภาพ ตอบแค่ตัวอักษร/ตัวเลขบนป้าย และชื่อจังหวัด เช่น "1กจ 1558 ตราด" ไม่ต้องอธิบายเพิ่ม'
    : 'อ่านสลิปโอนเงินในภาพ สรุปแค่: ยอดโอน, วันเวลา, เลขอ้างอิง (ถ้ามี) เป็น 1-2 บรรทัดสั้นๆ ภาษาไทย';

  const clean = base64.replace(/^data:image\/\w+;base64,/, '');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: clean } },
        { type: 'text', text: prompt }
      ]}]
    })
  });
  const data = await r.json();
  const text = data.content?.[0]?.text?.trim();
  if (!text) return res.json({ ok: false });
  return res.json({ ok: true, ...(mode === 'plate' ? { plate: text } : { info: text }) });
}
