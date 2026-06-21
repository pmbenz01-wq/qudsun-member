export default async function handler(req, res) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
  const key = process.env.GOOGLE_PRIVATE_KEY || '';
  const sheetId = process.env.GOOGLE_SHEET_ID || '';

  const keyInfo = {
    length: key.length,
    hasRealNewlines: key.includes('\n'),
    hasLiteralSlashN: key.includes('\\n'),
    startsCorrectly: key.trimStart().startsWith('-----BEGIN'),
    endsCorrectly: key.trimEnd().endsWith('-----'),
    first30: key.slice(0, 30),
  };

  // Test token request
  let tokenResult = null;
  try {
    const { createSign } = await import('crypto');
    const resolvedKey = key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })).toString('base64url');
    const sign = createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const jwt = `${header}.${payload}.${sign.sign(resolvedKey).toString('base64url')}`;
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });
    const d = await r.json();
    tokenResult = { ok: !!d.access_token, error: d.error, error_description: d.error_description };
  } catch (e) {
    tokenResult = { ok: false, error: e.message };
  }

  return res.json({ email: email.slice(0, 40), sheetId: sheetId.slice(0, 20), keyInfo, tokenResult });
}
