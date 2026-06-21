import { getToken } from './_auth.js';

const SCOPE = 'https://www.googleapis.com/auth/drive';

async function getOrCreateFolder(token, name) {
  const q = encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const d = await r.json();
  if (d.files?.length > 0) return d.files[0].id;

  const cr = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
  });
  return (await cr.json()).id;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  try {
    const { base64, filename = `photo_${Date.now()}.jpg`, folder = 'QudsunPhotos' } = req.body;
    const token = await getToken([SCOPE]);
    const folderId = await getOrCreateFolder(token, folder);

    const imageData = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const boundary = 'qd_boundary_7f3a';
    const meta = JSON.stringify({ name: filename, parents: [folderId] });

    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`),
      imageData,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const ur = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/related; boundary=${boundary}`,
        'content-length': String(body.length),
      },
      body,
    });
    const file = await ur.json();
    if (!file.id) throw new Error(file.error?.message || 'upload failed');

    await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    return res.json({ ok: true, fileId: file.id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
