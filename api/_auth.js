import { createSign } from 'crypto';

export async function getToken(scopes) {
  const strip = s => (s || '').replace(/^﻿/, '').trim();
  const email = strip(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const rawKey = strip(process.env.GOOGLE_PRIVATE_KEY);
  const key = rawKey.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey;
  if (!email || !key) throw new Error('Google credentials not configured (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY)');

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: email,
    scope: scopes.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');

  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const jwt = `${header}.${payload}.${sign.sign(key).toString('base64url')}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const d = await r.json();
  if (!d.access_token) throw new Error(d.error_description || 'Failed to obtain access token');
  return d.access_token;
}
