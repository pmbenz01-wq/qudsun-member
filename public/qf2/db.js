// ============================================================
// Qudsunfable 2 — data layer (Supabase)
// ============================================================
'use strict';
const sb = window.supabase.createClient(window.QF2_CONFIG.SUPABASE_URL, window.QF2_CONFIG.SUPABASE_ANON_KEY);

const DB = {
  profile: null,
  tenant: null,
  settings: null,

  un(r) {
    if (r.error) {
      const map = {
        'Invalid login credentials': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
        'User already registered': 'อีเมลนี้สมัครไว้แล้ว — ลองเข้าสู่ระบบ',
        'Password should be at least 6 characters.': 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร',
      };
      throw new Error(map[r.error.message] || r.error.message);
    }
    return r.data;
  },

  async session() { return (await sb.auth.getSession()).data.session; },
  async signIn(email, password) { return this.un(await sb.auth.signInWithPassword({ email, password })); },
  async signUp(email, password) { return this.un(await sb.auth.signUp({ email, password })); },
  async signOut() { await sb.auth.signOut(); this.profile = this.tenant = this.settings = null; },

  async loadContext() {
    const s = await this.session();
    if (!s) return null;
    this.profile = this.un(await sb.from('profiles').select('*').eq('user_id', s.user.id).maybeSingle());
    if (!this.profile) return 'setup';
    this.tenant = this.un(await sb.from('tenants').select('*').eq('id', this.profile.tenant_id).single());
    this.settings = this.un(await sb.from('settings').select('*').eq('tenant_id', this.profile.tenant_id).maybeSingle());
    return 'ready';
  },

  async bootstrapTenant(name, userName) { return this.un(await sb.rpc('bootstrap_tenant', { p_tenant_name: name, p_user_name: userName })); },
  async joinTenant(code, userName) { return this.un(await sb.rpc('join_tenant', { p_code: code, p_user_name: userName })); },
  async checkPin(pin) { return this.un(await sb.rpc('check_pin', { p_pin: pin })); },
  async setPin(pin) { return this.un(await sb.rpc('set_pin', { p_pin: pin })); },

  async members() { return this.un(await sb.from('profiles').select('*').eq('status', 'active').order('created_at')); },
  async wallets() { return this.un(await sb.from('wallets').select('*').order('sort')); },
  async grades() { return this.un(await sb.from('grades').select('*').eq('active', true).order('sort')); },

  // ---- Home dashboard ----
  async homeData() {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const d7 = new Date(d0.getTime() - 6 * 86400000);
    const [today, week, due, wallets] = await Promise.all([
      sb.from('bills').select('type,total_satang,total_kg').neq('status', 'canceled').gte('created_at', d0.toISOString()).then(r => this.un(r)),
      sb.from('bills').select('type,total_satang,created_at').neq('status', 'canceled').gte('created_at', d7.toISOString()).then(r => this.un(r)),
      sb.from('bills').select('total_satang').eq('status', 'due').eq('type', 'buy').then(r => this.un(r)),
      this.wallets(),
    ]);
    const sum = { buy: { n: 0, satang: 0, kg: 0 }, sell: { n: 0, satang: 0, kg: 0 } };
    for (const b of today) { const s = sum[b.type]; s.n++; s.satang += +b.total_satang; s.kg += +b.total_kg; }
    const days = [];
    const TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(d0.getTime() - i * 86400000);
      days.push({ key: d.toDateString(), label: TH[d.getDay()] + ' ' + d.getDate(), buy: 0, sell: 0 });
    }
    for (const b of week) {
      const k = new Date(b.created_at).toDateString();
      const day = days.find(x => x.key === k);
      if (day) day[b.type] += +b.total_satang;
    }
    return {
      sum, days,
      due: { n: due.length, satang: due.reduce((s, b) => s + +b.total_satang, 0) },
      wallets,
    };
  },
};
