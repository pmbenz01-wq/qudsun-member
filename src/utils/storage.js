const KEYS = {
  session:  'qudsun_session',
  history:  'qudsun_history',
  pin:      'qudsun_pin',
  sheet:    'qudsun_sheet_url',
  verified: 'qudsun_verified',
};

export const storage = {
  loadSession:  () => { try { return JSON.parse(localStorage.getItem(KEYS.session) || 'null'); } catch { return null; } },
  saveSession:  s  => { try { if (s) localStorage.setItem(KEYS.session, JSON.stringify(s)); else localStorage.removeItem(KEYS.session); } catch {} },
  loadHistory:  () => { try { const h = JSON.parse(localStorage.getItem(KEYS.history) || '[]'); return Array.isArray(h) ? h : []; } catch { return []; } },
  saveHistory:  h  => { try { localStorage.setItem(KEYS.history, JSON.stringify(h)); } catch {} },
  loadPin:      () => localStorage.getItem(KEYS.pin) || '1234',
  savePin:      p  => { try { localStorage.setItem(KEYS.pin, p); } catch {} },
  loadSheet:    () => localStorage.getItem(KEYS.sheet) || '',
  saveSheet:    u  => { try { localStorage.setItem(KEYS.sheet, u); } catch {} },
  loadVerified: () => { try { return JSON.parse(localStorage.getItem(KEYS.verified) || '{}'); } catch { return {}; } },
  saveVerified: m  => { try { localStorage.setItem(KEYS.verified, JSON.stringify(m)); } catch {} },
};
