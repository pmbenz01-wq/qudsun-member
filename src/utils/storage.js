const KEYS = {
  session:     'qudsun_session',
  history:     'qudsun_history',
  pin:         'qudsun_pin',
  sheet:       'qudsun_sheet_url',
  verified:    'qudsun_verified',
  supervisors:   'qudsun_supervisors',
  employeePin:   'qudsun_employee_pin',
  employees:     'qudsun_employees',
  pinnedCats:    'qudsun_pinned_cats',
};

const DEFAULT_PINS = ['AB', 'etc', 'taksai', 'hongyen', 'sutthai'];
const DEFAULT_EMPLOYEES = [{ pin: '2525', name: 'จด1' }];

export const storage = {
  loadSession:  () => { try { return JSON.parse(localStorage.getItem(KEYS.session) || 'null'); } catch { return null; } },
  saveSession:  s  => { try { if (s) localStorage.setItem(KEYS.session, JSON.stringify(s)); else localStorage.removeItem(KEYS.session); } catch {} },
  loadHistory:  () => { try { const h = JSON.parse(localStorage.getItem(KEYS.history) || '[]'); return Array.isArray(h) ? h : []; } catch { return []; } },
  saveHistory:  h  => { try { localStorage.setItem(KEYS.history, JSON.stringify(h)); } catch {} },
  loadPin:      () => localStorage.getItem(KEYS.pin) || '7594',
  savePin:      p  => { try { localStorage.setItem(KEYS.pin, p); } catch {} },
  loadSheet:    () => localStorage.getItem(KEYS.sheet) || '',
  saveSheet:    u  => { try { localStorage.setItem(KEYS.sheet, u); } catch {} },
  loadVerified:     () => { try { return JSON.parse(localStorage.getItem(KEYS.verified) || '{}'); } catch { return {}; } },
  saveVerified:     m  => { try { localStorage.setItem(KEYS.verified, JSON.stringify(m)); } catch {} },
  loadSupervisors:  () => { try { return JSON.parse(localStorage.getItem(KEYS.supervisors) || '{}'); } catch { return {}; } },
  saveSupervisors:  m  => { try { localStorage.setItem(KEYS.supervisors, JSON.stringify(m)); } catch {} },
  loadEmployeePin:  () => localStorage.getItem(KEYS.employeePin) || '2525',
  saveEmployeePin:  p  => { try { localStorage.setItem(KEYS.employeePin, p); } catch {} },
  loadEmployees: () => {
    try {
      const raw = localStorage.getItem(KEYS.employees);
      if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) return arr; }
      // migrate from old single employeePin
      const old = localStorage.getItem(KEYS.employeePin);
      if (old) return [{ pin: old, name: 'พนักงาน' }];
      return DEFAULT_EMPLOYEES;
    } catch { return DEFAULT_EMPLOYEES; }
  },
  saveEmployees: arr => { try { localStorage.setItem(KEYS.employees, JSON.stringify(arr)); } catch {} },
  loadPinnedCats:   () => { try { const v = JSON.parse(localStorage.getItem(KEYS.pinnedCats) || 'null'); return Array.isArray(v) ? v : DEFAULT_PINS; } catch { return DEFAULT_PINS; } },
  savePinnedCats:   v  => { try { localStorage.setItem(KEYS.pinnedCats, JSON.stringify(v)); } catch {} },
};
