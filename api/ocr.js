export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const { base64, mode } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ ok: false, error: 'no key' });

  const prompt = mode === 'plate'
    ? 'อ่านป้ายทะเบียนรถในภาพ ตอบแค่ตัวอักษร/ตัวเลขบนป้าย และชื่อจังหวัด เช่น "1กจ 1558 ตราด" ไม่ต้องอธิบายเพิ่ม'
    : 'อ่านสลิปโอนเงินในภาพ แล้วตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น รูปแบบ: {"amount":"ยอดโอน เช่น 1000.00","sender":"ชื่อผู้โอน","recipient":"ชื่อผู้รับ","datetime":"วันเวลา เช่น 22 มิ.ย. 69 17:21","ref":"เลขอ้างอิง"} ถ้าไม่มีข้อมูลให้ใส่ ""';

  const clean = base64.replace(/^data:image\/\w+;base64,/, '');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: clean } },
        { type: 'text', text: prompt }
      ]}]
    })
  });
  const data = await r.json();
  if (data.error) return res.status(500).json({ ok: false, error: data.error.type, message: data.error.message });
  const text = data.content?.[0]?.text?.trim();
  if (!text) return res.json({ ok: false, error: 'no_text' });

  if (mode === 'plate') return res.json({ ok: true, plate: text });

  try {
    const jsonStr = text.match(/\{[\s\S]*\}/)?.[0];
    const slipData = JSON.parse(jsonStr);
    const info = [
      slipData.amount && `ยอด: ${slipData.amount} บาท`,
      slipData.sender && `ผู้โอน: ${slipData.sender}`,
      slipData.recipient && `ผู้รับ: ${slipData.recipient}`,
      slipData.datetime && `เวลา: ${slipData.datetime}`,
      slipData.ref && `อ้างอิง: ${slipData.ref}`,
    ].filter(Boolean).join('\n');
    return res.json({ ok: true, info, slipData });
  } catch {
    return res.json({ ok: true, info: text });
  }
}
