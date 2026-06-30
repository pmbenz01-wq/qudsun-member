import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const db = {
  // ─── Bills ────────────────────────────────────────────────────────────────
  async getBills() {
    const { data, error } = await supabase
      .from('qm_bills')
      .select('json')
      .eq('deleted', false)
      .order('date', { ascending: false })
      .limit(150);
    if (error) throw error;
    return data.map(row => {
      try { return JSON.parse(row.json); } catch { return null; }
    }).filter(Boolean);
  },

  async upsertBill(card) {
    const { error } = await supabase.from('qm_bills').upsert({
      bill_no: card.billNo,
      date: card.date,
      date_text: card.dateText,
      seller: card.seller || '',
      phone: card.phone || '',
      kg: card.kg,
      baht: card.baht,
      supervisor: card.supervisor || card.data?.supervisor || '',
      json: JSON.stringify(card),
      deleted: false,
    }, { onConflict: 'bill_no' });
    if (error) throw error;
  },

  async deleteBill(billNo) {
    const { error } = await supabase
      .from('qm_bills')
      .update({ deleted: true })
      .eq('bill_no', billNo);
    if (error) throw error;
  },

  async getDeletedBillNos() {
    const { data, error } = await supabase
      .from('qm_bills')
      .select('bill_no')
      .eq('deleted', true)
      .limit(500);
    if (error) throw error;
    return data.map(r => r.bill_no);
  },

  // ─── Payments ─────────────────────────────────────────────────────────────
  async getPayments() {
    const { data, error } = await supabase.from('qm_payments').select('*');
    if (error) throw error;
    const map = {};
    for (const row of data) {
      map[row.bill_no] = {
        status: row.status,
        paidAt: row.paid_at,
        receiptUrl: row.receipt_url || null,
        slipUrl: row.slip_url || null,
        vehicleUrl: row.vehicle_url || null,
        slipData: row.slip_data || null,
      };
    }
    return map;
  },

  async upsertPayment(billNo, pay) {
    const { error } = await supabase.from('qm_payments').upsert({
      bill_no: billNo,
      status: pay.status || 'unpaid',
      paid_at: pay.paidAt || null,
      receipt_url: pay.receiptUrl || null,
      slip_url: pay.slipUrl || null,
      vehicle_url: pay.vehicleUrl || null,
      slip_data: pay.slipData || null,
    }, { onConflict: 'bill_no' });
    if (error) throw error;
  },

  async deletePayment(billNo) {
    const { error } = await supabase.from('qm_payments').delete().eq('bill_no', billNo);
    if (error) throw error;
  },

  // ─── Verified ─────────────────────────────────────────────────────────────
  async getVerified() {
    const { data, error } = await supabase.from('qm_verified').select('*');
    if (error) throw error;
    const map = {};
    for (const row of data) map[row.phone] = row.name;
    return map;
  },

  async upsertVerified(phone, name) {
    const { error } = await supabase.from('qm_verified').upsert(
      { phone, name },
      { onConflict: 'phone' }
    );
    if (error) throw error;
  },

  async deleteVerified(phone) {
    const { error } = await supabase.from('qm_verified').delete().eq('phone', phone);
    if (error) throw error;
  },

  // ─── Customer Info ────────────────────────────────────────────────────────
  async getCustomerInfo() {
    const { data, error } = await supabase.from('qm_customer_info').select('*');
    if (error) throw error;
    const map = {};
    for (const row of data) {
      map[row.phone] = {
        bankName: row.bank_name || '',
        bankAccount: row.bank_account || '',
        fullName: row.full_name || '',
        note: row.note || '',
      };
    }
    return map;
  },

  async upsertCustomerInfo(phone, info) {
    const { error } = await supabase.from('qm_customer_info').upsert({
      phone,
      bank_name: info.bankName || null,
      bank_account: info.bankAccount || null,
      full_name: info.fullName || null,
      note: info.note || null,
    }, { onConflict: 'phone' });
    if (error) throw error;
  },

  async deleteCustomerInfo(phone) {
    const { error } = await supabase.from('qm_customer_info').delete().eq('phone', phone);
    if (error) throw error;
  },

  // ─── Vehicle Plates ───────────────────────────────────────────────────────
  async getVehiclePlates() {
    const { data, error } = await supabase.from('qm_vehicle_plates').select('*');
    if (error) throw error;
    const map = {};
    for (const row of data) map[row.phone] = row.plate;
    return map;
  },

  async upsertVehiclePlate(phone, plate) {
    const { error } = await supabase.from('qm_vehicle_plates').upsert(
      { phone, plate },
      { onConflict: 'phone' }
    );
    if (error) throw error;
  },

  // ─── Sales ────────────────────────────────────────────────────────────────
  async getSales() {
    const { data, error } = await supabase
      .from('qm_sales')
      .select('*')
      .eq('deleted', false)
      .order('date', { ascending: false });
    if (error) throw error;
    return data.map(row => ({
      id: row.id,
      date: row.date,
      buyer: row.buyer || '',
      kg: row.kg,
      baht: row.baht,
      note: row.note || '',
      receiptUrl: row.receipt_url || '',
    }));
  },

  async upsertSale(sale) {
    const { error } = await supabase.from('qm_sales').upsert({
      id: sale.id,
      date: sale.date,
      buyer: sale.buyer || '',
      kg: sale.kg,
      baht: sale.baht,
      note: sale.note || '',
      receipt_url: sale.receiptUrl || '',
      deleted: false,
    }, { onConflict: 'id' });
    if (error) throw error;
  },

  async deleteSale(id) {
    const { error } = await supabase.from('qm_sales').update({ deleted: true }).eq('id', id);
    if (error) throw error;
  },

  // ─── Sale Sessions ────────────────────────────────────────────────────────
  async getSaleSessions() {
    const { data, error } = await supabase
      .from('qm_sale_sessions')
      .select('json')
      .eq('deleted', false)
      .order('date', { ascending: false })
      .limit(150);
    if (error) throw error;
    return data.map(row => { try { return JSON.parse(row.json); } catch { return null; } }).filter(Boolean);
  },

  async upsertSaleSession(s) {
    const totalKg = (s.entries || []).reduce((sum, e) => sum + (e.kg || 0), 0);
    const totalBaht = (s.entries || []).reduce((sum, e) => sum + (e.kg || 0) * ((s.prices || {})[e.cat] || 0), 0);
    const { error } = await supabase.from('qm_sale_sessions').upsert({
      bill_no: s.billNo,
      date: new Date(s.date).toISOString(),
      customer: s.customerName || '',
      phone: s.customerPhone || '',
      kg: totalKg,
      baht: totalBaht,
      json: JSON.stringify(s),
      deleted: false,
    }, { onConflict: 'bill_no' });
    if (error) throw error;
  },

  async deleteSaleSession(billNo) {
    const { error } = await supabase.from('qm_sale_sessions').update({ deleted: true }).eq('bill_no', billNo);
    if (error) throw error;
  },

  // ─── App Settings (accounts, employees, supervisors) ─────────────────────
  async getSetting(key) {
    const { data, error } = await supabase.from('qm_app_settings').select('value').eq('key', key).maybeSingle();
    if (error) throw error;
    return data?.value ?? null;
  },

  async saveSetting(key, value) {
    const { error } = await supabase.from('qm_app_settings').upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    if (error) throw error;
  },

  // ─── History (Supabase-primary fetch) ────────────────────────────────────
  async fetchHistoryBills(limit = 300) {
    const { data, error } = await supabase
      .from('qm_bills')
      .select('bill_no, date, seller, phone, kg, baht')
      .eq('deleted', false)
      .order('date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data.map(row => ({
      type: 'buy',
      billNo: row.bill_no,
      date: row.date,
      name: row.seller || '',
      phone: row.phone || '',
      kg: row.kg || '',
      baht: row.baht || '',
    }));
  },

  async fetchHistorySaleSessions(limit = 300) {
    const { data, error } = await supabase
      .from('qm_sale_sessions')
      .select('bill_no, date, customer, phone, kg, baht')
      .eq('deleted', false)
      .order('date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data.map(row => ({
      type: 'sale',
      billNo: row.bill_no,
      date: row.date,
      name: row.customer || '',
      phone: row.phone || '',
      kg: row.kg || '',
      baht: row.baht || '',
    }));
  },

  async fetchBillsByPhones(phones, dateFrom, dateTo) {
    if (!phones || phones.length === 0) return [];
    const toMs = s => s ? new Date(s).getTime() : null;
    let q = supabase
      .from('qm_bills')
      .select('bill_no, date, seller, phone, kg, baht')
      .eq('deleted', false)
      .in('phone', phones)
      .order('date', { ascending: false });
    if (dateFrom) q = q.gte('date', toMs(dateFrom));
    if (dateTo) q = q.lte('date', toMs(dateTo));
    const { data, error } = await q;
    if (error) throw error;
    return data.map(row => ({
      billNo: row.bill_no,
      date: row.date,
      seller: row.seller || '',
      phone: row.phone || '',
      kg: row.kg || '',
      baht: row.baht || '',
    }));
  },

  async fetchBillsBySupervisor(supervisorName, dateFrom, dateTo) {
    if (!supervisorName) return [];
    const toMs = s => s ? new Date(s).getTime() : null;
    let q = supabase
      .from('qm_bills')
      .select('bill_no, date, seller, phone, kg, baht')
      .eq('deleted', false)
      .eq('supervisor', supervisorName)
      .order('date', { ascending: false });
    if (dateFrom) q = q.gte('date', toMs(dateFrom));
    if (dateTo) q = q.lte('date', toMs(dateTo));
    const { data, error } = await q;
    if (error) throw error;
    return data.map(row => ({
      billNo: row.bill_no,
      date: row.date,
      seller: row.seller || '',
      phone: row.phone || '',
      kg: row.kg || '',
      baht: row.baht || '',
    }));
  },

  // ─── Supervisor Earnings ──────────────────────────────────────────────────
  async saveEarning(earning) {
    const { error } = await supabase.from('qm_sup_earnings').upsert(earning, { onConflict: 'supervisor_name,date' });
    if (error) throw error;
  },

  async fetchEarnings(supervisorName) {
    const { data, error } = await supabase.from('qm_sup_earnings').select('*').eq('supervisor_name', supervisorName).order('date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async deleteEarning(id) {
    const { error } = await supabase.from('qm_sup_earnings').delete().eq('id', id);
    if (error) throw error;
  },

  // ─── Supervisor Payments ──────────────────────────────────────────────────
  async savePayment(payment) {
    const { error } = await supabase.from('qm_sup_payments').insert(payment);
    if (error) throw error;
  },

  async fetchPayments(supervisorName) {
    const { data, error } = await supabase.from('qm_sup_payments').select('*').eq('supervisor_name', supervisorName).order('paid_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async deletePayment(id) {
    const { error } = await supabase.from('qm_sup_payments').delete().eq('id', id);
    if (error) throw error;
  },

  // ─── Realtime ─────────────────────────────────────────────────────────────
  subscribeChanges(onSync) {
    const channel = supabase
      .channel('qudsun-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qm_bills' }, onSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qm_payments' }, onSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qm_verified' }, onSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qm_customer_info' }, onSync)
      .subscribe();
    return () => supabase.removeChannel(channel);
  },

  // ─── Storage ──────────────────────────────────────────────────────────────
  async uploadPhoto(base64DataUrl, path) {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ base64: base64DataUrl, path }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'upload failed');
    return data.url;
  },
};
