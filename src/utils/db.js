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
