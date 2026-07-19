// ============================================================
// Qudsunfable 2 — data layer (Supabase)
// ============================================================
'use strict';
const sb = window.supabase.createClient(window.QF2_CONFIG.SUPABASE_URL, window.QF2_CONFIG.SUPABASE_ANON_KEY);

const DB = {
  profile: null, tenant: null, settings: null,

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
  async updateSettings(p) { return this.un(await sb.rpc('update_settings', { p })); },

  async members() { return this.un(await sb.from('profiles').select('*').eq('status', 'active').order('created_at')); },
  async wallets() { return this.un(await sb.from('wallets').select('*').order('sort')); },
  async grades() { return this.un(await sb.from('grades').select('*').eq('active', true).order('sort')); },
  async addGrade(name, color) {
    return this.un(await sb.from('grades').insert({ tenant_id: this.profile.tenant_id, name, color, sort: 99 }).select().single());
  },
  async saveGradePrices(rows) { // [{id, buy_satang, sell_satang}]
    for (const r of rows) this.un(await sb.from('grades').update({ buy_satang: r.buy_satang, sell_satang: r.sell_satang }).eq('id', r.id));
  },

  // ---- คู่ค้า ----
  async customers() { return this.un(await sb.from('customers').select('*').eq('status', 'active').order('created_at', { ascending: false })); },
  async addCustomer(name, phone) {
    return this.un(await sb.from('customers').insert({ tenant_id: this.profile.tenant_id, name, phone: phone || '' }).select().single());
  },
  async findOrCreateCustomer(name, phone) {
    const list = await this.customers();
    const hit = list.find(c => c.name === name && (!phone || c.phone === phone));
    return hit || await this.addCustomer(name, phone);
  },
  async buyers() { return this.un(await sb.from('buyers').select('*').eq('status', 'active').order('created_at', { ascending: false })); },
  async addBuyer(name, phone) {
    return this.un(await sb.from('buyers').insert({ tenant_id: this.profile.tenant_id, name, phone: phone || '' }).select().single());
  },
  async findOrCreateBuyer(name, phone) {
    const list = await this.buyers();
    const hit = list.find(c => c.name === name);
    return hit || await this.addBuyer(name, phone);
  },

  // ---- บิล ----
  async createBill(type, partyId, items, note, splits) {
    return this.un(await sb.rpc('create_bill', { p_type: type, p_party: partyId, p_items: items, p_note: note || '', p_splits: splits || null }));
  },
  async payBill(billId, splits) { return this.un(await sb.rpc('pay_bill', { p_bill: billId, p_splits: splits })); },
  async cancelBill(billId) { return this.un(await sb.rpc('cancel_bill', { p_bill: billId })); },
  async bills(filter) {
    let q = sb.from('bills').select('*, customers(name,phone), buyers(name,phone)').order('created_at', { ascending: false }).limit(200);
    if (filter?.type) q = q.eq('type', filter.type);
    if (filter?.status) q = q.eq('status', filter.status);
    return this.un(await q);
  },
  async billDetail(id) {
    const b = this.un(await sb.from('bills').select('*, customers(name,phone), buyers(name,phone), bill_items(*)').eq('id', id).single());
    b.payments = this.un(await sb.from('bill_payments').select('*, wallets(name,code,color)').eq('bill_id', id));
    return b;
  },

  // ---- กระเป๋า ----
  async walletTxn(code, kind, amountSatang, note) {
    return this.un(await sb.rpc('wallet_txn', { p_wallet_code: code, p_kind: kind, p_amount: amountSatang, p_note: note || '' }));
  },
  async walletTransfer(from, to, amountSatang, note) {
    return this.un(await sb.rpc('wallet_transfer', { p_from: from, p_to: to, p_amount: amountSatang, p_note: note || '' }));
  },
  async walletTxns(walletId) {
    return this.un(await sb.from('wallet_txns').select('*, bills(code,type)').eq('wallet_id', walletId).order('created_at', { ascending: false }).limit(100));
  },
  async allTxns() {
    return this.un(await sb.from('wallet_txns').select('*, bills(code,type), wallets(name,code,color)').order('created_at', { ascending: false }).limit(150));
  },

  // ---- พนักงาน ----
  async staff() { return this.un(await sb.from('staff').select('*').eq('status', 'active').order('created_at')); },
  async addStaff(row) { return this.un(await sb.from('staff').insert({ ...row, tenant_id: this.profile.tenant_id }).select().single()); },
  async updateStaff(id, row) { return this.un(await sb.from('staff').update(row).eq('id', id)); },
  async workdays(staffId) { return this.un(await sb.from('staff_workdays').select('*').eq('staff_id', staffId).order('work_date', { ascending: false })); },
  async addWorkday(staffId, date, kg) {
    return this.un(await sb.from('staff_workdays').insert({ tenant_id: this.profile.tenant_id, staff_id: staffId, work_date: date, kg: kg || 0 }));
  },
  async payStaff(staffId, amountSatang, walletCode, note) {
    return this.un(await sb.rpc('pay_staff', { p_staff: staffId, p_amount: amountSatang, p_wallet_code: walletCode, p_note: note || '' }));
  },

  async logs() { return this.un(await sb.from('activity_log').select('*').order('created_at', { ascending: false }).limit(200)); },

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
    return { sum, days, due: { n: due.length, satang: due.reduce((s, b) => s + +b.total_satang, 0) }, wallets };
  },
};
