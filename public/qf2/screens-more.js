// ============================================================
// Qudsunfable 2 — ชุด 2: ลูกค้า พนักงาน ประวัติ รายงาน ตั้งค่า แจ้งเตือน
// ============================================================
'use strict';
window.QF2X = (() => {

const bt = (satang) => '฿' + Math.round(satang / 100).toLocaleString('th-TH');
const kgS = (n) => (+n).toLocaleString('th-TH', { maximumFractionDigits: 1 });
const dts = (s) => new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + ' ' + new Date(s).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
const cardCSS = 'background:#fff;border:1px solid #ECE3D6;border-radius:16px;padding:14px;margin-bottom:9px';
const inpCSS = `width:100%;font:600 14px 'Prompt',sans-serif;padding:12px;border:1.5px solid #ECE3D6;border-radius:12px;background:#fff;margin-bottom:10px;box-sizing:border-box`;
const labCSS = `font:600 11.5px 'Prompt',sans-serif;color:#8A7767;margin:2px 0 5px`;

function shell(title, inner) {
  return `
  <div class="app scr-bills">
    <div class="hdr" style="display:flex;align-items:center;gap:12px;padding:16px 0 10px">
      <button class="backb" data-nav="home" style="border:1px solid #ECE3D6;background:#fff;border-radius:12px;padding:8px 13px;font:700 13px 'Prompt',sans-serif;cursor:pointer">‹ หน้าหลัก</button>
      <div style="font:800 18px 'Prompt',sans-serif">${title}</div></div>
    ${inner}
    <div class="tabbar">
      <div class="tab" data-nav="home"><i data-lucide="home"></i>หน้าหลัก</div>
      <div class="tab" data-nav="buy"><i data-lucide="shopping-cart"></i>รับซื้อ</div>
      <div class="tab" data-nav="sell"><i data-lucide="banknote"></i>ขาย</div>
      <div class="tab" data-nav="wallet"><i data-lucide="wallet"></i>กระเป๋า</div>
      <div class="tab tab-on" data-nav="more"><i data-lucide="menu"></i>อื่น ๆ</div>
    </div>
  </div>`;
}
const nav = () => document.querySelectorAll('[data-nav]').forEach(el => el.onclick = () => go[el.dataset.nav]());
function modal(title, inner) {
  const ov = document.createElement('div');
  ov.innerHTML = `<div style="position:fixed;inset:0;background:rgba(36,16,9,.5);z-index:200;display:flex;align-items:flex-end;justify-content:center" id="m-bg">
    <div style="background:#FBF7F1;border-radius:24px 24px 0 0;width:100%;max-width:430px;max-height:88vh;overflow:auto;padding:20px 18px 28px">
      <div style="display:flex;align-items:center;margin-bottom:12px"><div style="font:800 17px 'Prompt',sans-serif">${title}</div>
      <button id="m-close" style="margin-left:auto;border:none;background:#fff;border-radius:10px;width:34px;height:34px;cursor:pointer">✕</button></div>${inner}</div></div>`;
  document.body.appendChild(ov);
  ov.querySelector('#m-close').onclick = () => ov.remove();
  ov.querySelector('#m-bg').addEventListener('click', e => { if (e.target.id === 'm-bg') ov.remove(); });
  return ov;
}

// ================= เมนูอื่น ๆ =================
function renderMore() {
  const items = [
    ['customers', 'users', '#FCEDE3', '#E8692E', 'ลูกค้า / ผู้ซื้อ', 'สวน · ล้ง/ตลาด'],
    ['staff', 'user-cog', '#E9F3EC', '#2F9B58', 'พนักงาน', 'ค่าแรง · คอม · โบนัส'],
    ['history', 'history', '#F1E9DC', '#8A6A4A', 'ประวัติ', 'ทุกความเคลื่อนไหว'],
    ['reports', 'bar-chart-3', '#EAF0FA', '#3B82D9', 'รายงาน', 'กราฟ · สรุปเกรด'],
    ['notif', 'bell', '#FCEDE3', '#C4491C', 'แจ้งเตือน', 'บิลค้าง · สรุปวัน'],
    ['settings', 'settings', '#ECECEC', '#5B5B5B', 'ตั้งค่า', 'ร้าน · ราคา · PIN'],
  ];
  const inner = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
    ${items.map(([k, ic, bg, fg, t, s]) => `<div class="card" data-nav="${k}" style="cursor:pointer;padding:16px 14px">
      <div style="width:38px;height:38px;border-radius:12px;background:${bg};color:${fg};display:flex;align-items:center;justify-content:center;margin-bottom:9px"><i data-lucide="${ic}"></i></div>
      <div style="font:700 14px 'Prompt',sans-serif">${t}</div>
      <div style="font:500 11px 'Anuphan',sans-serif;color:#8A7767">${s}</div></div>`).join('')}
  </div>`;
  root.innerHTML = shell('อื่น ๆ', inner);
  icons(); nav();
}

// ================= ลูกค้า / ผู้ซื้อ =================
let custTab = 'customers';
async function renderCustomers() {
  loading(true);
  let list;
  try { list = custTab === 'customers' ? await DB.customers() : await DB.buyers(); }
  catch (e) { loading(false); toast(e.message, true); return; }
  loading(false);
  const inner = `
  <div style="display:flex;gap:8px;margin-bottom:12px">
    <button data-ct="customers" style="flex:1;border:1.5px solid ${custTab === 'customers' ? '#E8692E' : '#ECE3D6'};background:${custTab === 'customers' ? '#FCEDE3' : '#fff'};color:${custTab === 'customers' ? '#C4491C' : '#6B4A38'};border-radius:12px;padding:10px;font:700 13px 'Prompt',sans-serif;cursor:pointer">🧑‍🌾 ลูกค้า/สวน</button>
    <button data-ct="buyers" style="flex:1;border:1.5px solid ${custTab === 'buyers' ? '#2F9B58' : '#ECE3D6'};background:${custTab === 'buyers' ? '#E9F3EC' : '#fff'};color:${custTab === 'buyers' ? '#237947' : '#6B4A38'};border-radius:12px;padding:10px;font:700 13px 'Prompt',sans-serif;cursor:pointer">�of ล้ง/ตลาด</button>
  </div>
  <button class="bigbtn bb-acc" id="c-add" style="width:100%;margin-bottom:12px">+ เพิ่ม${custTab === 'customers' ? 'ลูกค้า' : 'ผู้ซื้อ'}</button>
  ${list.length ? list.map(c => `<div class="card" data-cid="${c.id}" style="${cardCSS};display:flex;align-items:center;gap:12px;cursor:pointer">
    <div style="width:40px;height:40px;border-radius:99px;background:#FCEDE3;color:#C4491C;display:flex;align-items:center;justify-content:center;font:700 15px 'Prompt',sans-serif">${esc((c.name || '?')[0])}</div>
    <div style="flex:1"><div style="font:700 14px 'Prompt',sans-serif">${esc(c.name)}</div>
    <div class="tnum" style="font:500 11.5px 'Anuphan',sans-serif;color:#8A7767">${esc(c.phone || 'ไม่มีเบอร์')}${c.bank ? ' · ' + esc(c.bank) + ' ' + esc(c.bank_no || '') : ''}</div></div>
    <i data-lucide="chevron-right" style="color:#C9B39E"></i></div>`).join('')
  : '<div class="muted" style="text-align:center;padding:26px;font:500 13px \'Anuphan\',sans-serif">ยังไม่มีรายชื่อ</div>'}`;
  root.innerHTML = shell('ลูกค้า / ผู้ซื้อ', inner);
  icons(); nav();
  document.querySelectorAll('[data-ct]').forEach(b => b.onclick = () => { custTab = b.dataset.ct; renderCustomers(); });
  document.getElementById('c-add').onclick = () => custForm(null);
  document.querySelectorAll('[data-cid]').forEach(c => c.onclick = () => custForm(list.find(x => x.id === c.dataset.cid)));
}
function custForm(c) {
  const isCust = custTab === 'customers';
  const ov = modal(c ? 'แก้ไข' + (isCust ? 'ลูกค้า' : 'ผู้ซื้อ') : 'เพิ่ม' + (isCust ? 'ลูกค้า' : 'ผู้ซื้อ'), `
    <div style="${labCSS}">ชื่อ *</div><input id="m-name" style="${inpCSS}" value="${esc(c?.name || '')}">
    <div style="${labCSS}">เบอร์โทร</div><input id="m-phone" style="${inpCSS}" value="${esc(c?.phone || '')}">
    ${isCust ? `<div style="${labCSS}">ธนาคาร</div><input id="m-bank" style="${inpCSS}" value="${esc(c?.bank || '')}" placeholder="เช่น กสิกรไทย">
    <div style="${labCSS}">เลขบัญชี</div><input id="m-bankno" style="${inpCSS}" value="${esc(c?.bank_no || '')}">` : ''}
    <button class="bigbtn bb-pri" id="m-save" style="width:100%">✓ บันทึก</button>
    ${c ? '<button id="m-del" style="width:100%;margin-top:10px;border:1.5px solid #E7C2BC;background:#fff;color:#C0392B;border-radius:14px;padding:12px;font:700 13px \'Prompt\',sans-serif;cursor:pointer">ปิดการใช้งาน</button>' : ''}`);
  ov.querySelector('#m-save').onclick = async () => {
    const name = ov.querySelector('#m-name').value.trim();
    if (!name) { toast('ใส่ชื่อก่อนครับ', true); return; }
    const patch = { name, phone: ov.querySelector('#m-phone').value.trim() };
    if (isCust) { patch.bank = ov.querySelector('#m-bank').value.trim(); patch.bank_no = ov.querySelector('#m-bankno').value.trim(); }
    try {
      loading(true);
      const tbl = isCust ? 'customers' : 'buyers';
      if (c) DB.un(await sb.from(tbl).update(patch).eq('id', c.id));
      else DB.un(await sb.from(tbl).insert({ ...patch, tenant_id: DB.profile.tenant_id }));
      loading(false); ov.remove(); toast('บันทึกแล้ว'); renderCustomers();
    } catch (e) { loading(false); toast(e.message, true); }
  };
  const del = ov.querySelector('#m-del');
  if (del) del.onclick = async () => {
    if (!confirm('ปิดการใช้งานรายชื่อนี้?')) return;
    try { loading(true); DB.un(await sb.from(isCust ? 'customers' : 'buyers').update({ status: 'inactive' }).eq('id', c.id)); loading(false); ov.remove(); toast('ปิดแล้ว'); renderCustomers(); }
    catch (e) { loading(false); toast(e.message, true); }
  };
}

// ================= พนักงาน =================
async function renderStaff() {
  loading(true);
  let list, days = {};
  try {
    list = await DB.staff();
    for (const s of list) days[s.id] = await DB.workdays(s.id);
  } catch (e) { loading(false); toast(e.message, true); return; }
  loading(false);
  const base = +(DB.settings?.base_day_satang || 30000);
  const com = +(DB.settings?.com_kg_satang || 50);
  const calc = (s) => {
    const wd = days[s.id] || [];
    const b = (+s.base_day_satang || base) * wd.length;
    const c = (+s.com_kg_satang || com) * wd.reduce((x, d) => x + +d.kg, 0);
    const total = b + c + (+s.bonus_satang || 0);
    return { days: wd.length, kg: wd.reduce((x, d) => x + +d.kg, 0), total, remain: total - (+s.paid_satang || 0) };
  };
  const inner = `
  <button class="bigbtn bb-acc" id="st-add" style="width:100%;margin-bottom:12px">+ เพิ่มพนักงาน</button>
  ${list.length ? list.map(s => {
    const c = calc(s);
    return `<div class="card" style="${cardCSS}">
    <div style="display:flex;align-items:center;gap:10px">
      <div style="width:40px;height:40px;border-radius:99px;background:#E9F3EC;color:#237947;display:flex;align-items:center;justify-content:center;font:700 15px 'Prompt',sans-serif">${esc((s.name || '?')[0])}</div>
      <div style="flex:1"><div style="font:700 14px 'Prompt',sans-serif">${esc(s.name)} <span class="muted" style="font:500 11px 'Anuphan',sans-serif">${esc(s.role || '')}</span></div>
      <div class="tnum" style="font:500 11.5px 'Anuphan',sans-serif;color:#8A7767">${c.days} วัน · ${kgS(c.kg)} กก. · โบนัส ${bt(s.bonus_satang)}</div></div>
      <div style="text-align:right"><div class="tnum" style="font:800 15px 'Prompt',sans-serif;color:${c.remain > 0 ? '#C4491C' : '#237947'}">${bt(c.remain)}</div>
      <div class="muted" style="font:500 10px 'Anuphan',sans-serif">ค้างจ่าย</div></div></div>
    <div style="display:flex;gap:7px;margin-top:10px">
      <button data-wd="${s.id}" style="flex:1;border:1px solid #ECE3D6;background:#fff;border-radius:10px;padding:8px;font:700 11.5px 'Prompt',sans-serif;cursor:pointer">+ ลงวันทำงาน</button>
      <button data-pay="${s.id}" data-remain="${c.remain}" style="flex:1;border:none;background:#E8692E;color:#fff;border-radius:10px;padding:8px;font:700 11.5px 'Prompt',sans-serif;cursor:pointer">จ่ายค่าแรง</button>
      <button data-edit="${s.id}" style="border:1px solid #ECE3D6;background:#fff;border-radius:10px;padding:8px 12px;cursor:pointer"><i data-lucide="pencil" style="width:14px;height:14px"></i></button>
    </div></div>`;
  }).join('') : '<div class="muted" style="text-align:center;padding:26px;font:500 13px \'Anuphan\',sans-serif">ยังไม่มีพนักงาน</div>'}`;
  root.innerHTML = shell('พนักงาน', inner);
  icons(); nav();
  document.getElementById('st-add').onclick = () => staffForm(null);
  document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => staffForm(list.find(x => x.id === b.dataset.edit)));
  document.querySelectorAll('[data-wd]').forEach(b => b.onclick = () => workdayForm(list.find(x => x.id === b.dataset.wd)));
  document.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => payForm(list.find(x => x.id === b.dataset.pay), +b.dataset.remain));
}
function staffForm(s) {
  const ov = modal(s ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงาน', `
    <div style="${labCSS}">ชื่อ *</div><input id="m-name" style="${inpCSS}" value="${esc(s?.name || '')}">
    <div style="${labCSS}">หน้าที่</div><input id="m-role" style="${inpCSS}" value="${esc(s?.role || '')}" placeholder="เช่น มือตัด / คนชั่ง">
    <div style="${labCSS}">ค่าแรง/วัน (บาท) — เว้นว่าง = ใช้ค่าร้าน (${(+(DB.settings?.base_day_satang || 30000) / 100)})</div>
    <input id="m-base" type="number" class="tnum" style="${inpCSS}" value="${s && +s.base_day_satang ? s.base_day_satang / 100 : ''}">
    <div style="${labCSS}">คอม/กก. (บาท) — เว้นว่าง = ใช้ค่าร้าน (${(+(DB.settings?.com_kg_satang || 50) / 100)})</div>
    <input id="m-com" type="number" step="0.01" class="tnum" style="${inpCSS}" value="${s && +s.com_kg_satang ? s.com_kg_satang / 100 : ''}">
    <div style="${labCSS}">โบนัส (บาท)</div><input id="m-bonus" type="number" class="tnum" style="${inpCSS}" value="${s ? s.bonus_satang / 100 : ''}">
    <button class="bigbtn bb-pri" id="m-save" style="width:100%">✓ บันทึก</button>
    ${s ? '<button id="m-del" style="width:100%;margin-top:10px;border:1.5px solid #E7C2BC;background:#fff;color:#C0392B;border-radius:14px;padding:12px;font:700 13px \'Prompt\',sans-serif;cursor:pointer">ปิดการใช้งาน</button>' : ''}`);
  ov.querySelector('#m-save').onclick = async () => {
    const name = ov.querySelector('#m-name').value.trim();
    if (!name) { toast('ใส่ชื่อก่อนครับ', true); return; }
    const row = {
      name, role: ov.querySelector('#m-role').value.trim(),
      base_day_satang: Math.round((parseFloat(ov.querySelector('#m-base').value) || 0) * 100),
      com_kg_satang: Math.round((parseFloat(ov.querySelector('#m-com').value) || 0) * 100),
      bonus_satang: Math.round((parseFloat(ov.querySelector('#m-bonus').value) || 0) * 100),
    };
    try {
      loading(true);
      if (s) await DB.updateStaff(s.id, row); else await DB.addStaff(row);
      loading(false); ov.remove(); toast('บันทึกแล้ว'); renderStaff();
    } catch (e) { loading(false); toast(e.message, true); }
  };
  const del = ov.querySelector('#m-del');
  if (del) del.onclick = async () => {
    if (!confirm('ปิดการใช้งานพนักงานคนนี้?')) return;
    try { loading(true); await DB.updateStaff(s.id, { status: 'inactive' }); loading(false); ov.remove(); toast('ปิดแล้ว'); renderStaff(); }
    catch (e) { loading(false); toast(e.message, true); }
  };
}
function workdayForm(s) {
  const today = new Date().toISOString().slice(0, 10);
  const ov = modal('ลงวันทำงาน — ' + esc(s.name), `
    <div style="${labCSS}">วันที่</div><input id="m-date" type="date" value="${today}" style="${inpCSS}">
    <div style="${labCSS}">กก. ที่ทำได้วันนั้น (ใช้คิดคอม)</div><input id="m-kg" type="number" step="0.1" class="tnum" style="${inpCSS}" placeholder="0">
    <button class="bigbtn bb-grn" id="m-save" style="width:100%">✓ บันทึกวันทำงาน</button>`);
  ov.querySelector('#m-save').onclick = async () => {
    try {
      loading(true);
      await DB.addWorkday(s.id, ov.querySelector('#m-date').value, parseFloat(ov.querySelector('#m-kg').value) || 0);
      loading(false); ov.remove(); toast('ลงวันทำงานแล้ว'); renderStaff();
    } catch (e) { loading(false); toast(e.message.includes('duplicate') ? 'วันนี้ลงไว้แล้ว' : e.message, true); }
  };
}
async function payForm(s, remain) {
  const ws = await DB.wallets();
  const ov = modal('จ่ายค่าแรง — ' + esc(s.name), `
    <div class="muted tnum" style="font:600 13px 'Prompt',sans-serif;margin-bottom:8px">ค้างจ่าย ${bt(remain)}</div>
    <div style="${labCSS}">จำนวนเงิน (บาท)</div><input id="m-amt" type="number" step="0.01" class="tnum" style="${inpCSS}" value="${remain > 0 ? (remain / 100) : ''}">
    <div style="${labCSS}">จ่ายจากกระเป๋า</div>
    <select id="m-w" style="${inpCSS}">${ws.map(w => `<option value="${esc(w.code)}" ${w.code === 'C1' ? 'selected' : ''}>${esc(w.name)} (${bt(w.balance_satang)})</option>`).join('')}</select>
    <input id="m-note" placeholder="หมายเหตุ เช่น งวดครึ่งเดือน" style="${inpCSS}font-family:'Anuphan',sans-serif;font-weight:500">
    <button class="bigbtn bb-pri" id="m-save" style="width:100%">✓ จ่ายค่าแรง</button>`);
  ov.querySelector('#m-save').onclick = async () => {
    const amt = Math.round((parseFloat(ov.querySelector('#m-amt').value) || 0) * 100);
    if (amt <= 0) { toast('ใส่จำนวนเงินก่อนครับ', true); return; }
    if (!(await pinGate('pin_on_pay'))) return;
    try { loading(true); await DB.payStaff(s.id, amt, ov.querySelector('#m-w').value, ov.querySelector('#m-note').value.trim()); loading(false); ov.remove(); toast('จ่ายค่าแรงแล้ว'); renderStaff(); }
    catch (e) { loading(false); toast(e.message, true); }
  };
}

// ================= ประวัติ =================
async function renderHistory() {
  loading(true);
  let logs;
  try { logs = await DB.logs(); } catch (e) { loading(false); toast(e.message, true); return; }
  loading(false);
  const IC = { 'bill.create': ['receipt-text', '#FCEDE3', '#C4491C'], 'bill.pay': ['credit-card', '#E9F3EC', '#237947'], 'bill.cancel': ['x-circle', '#F5E3E0', '#C0392B'], 'wallet.txn': ['arrow-left-right', '#EAF0FA', '#2C69B0'], 'wallet.transfer': ['shuffle', '#EAF0FA', '#2C69B0'], 'staff.pay': ['hand-coins', '#E9F3EC', '#237947'] };
  const inner = logs.length ? logs.map(l => {
    const ic = IC[l.action] || ['activity', '#F1E9DC', '#8A6A4A'];
    return `<div style="display:flex;gap:11px;align-items:flex-start;background:#fff;border:1px solid #ECE3D6;border-radius:14px;padding:11px 13px;margin-bottom:8px">
      <span style="width:32px;height:32px;border-radius:11px;flex:none;display:inline-flex;align-items:center;justify-content:center;background:${ic[1]};color:${ic[2]}"><i data-lucide="${ic[0]}"></i></span>
      <div><div style="font:600 13px 'Anuphan',sans-serif">${esc(l.detail || l.action)}</div>
      <div class="muted tnum" style="font:500 10.5px 'Anuphan',sans-serif">${dts(l.created_at)}</div></div></div>`;
  }).join('') : '<div class="muted" style="text-align:center;padding:26px">ยังไม่มีประวัติ</div>';
  root.innerHTML = shell('ประวัติ', inner);
  icons(); nav();
}

// ================= รายงาน =================
let repDays = 7;
async function renderReports() {
  loading(true);
  let bills, items;
  try { [bills, items] = await Promise.all([DB.rangeBills(repDays), DB.gradeReport(repDays)]); }
  catch (e) { loading(false); toast(e.message, true); return; }
  loading(false);
  const sum = { buy: 0, sell: 0, buyKg: 0, sellKg: 0 };
  for (const b of bills) { sum[b.type] += +b.total_satang; sum[b.type + 'Kg'] += +b.total_kg; }
  // รายวัน
  const days = [];
  const TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  for (let i = repDays - 1; i >= 0; i--) {
    const d = new Date(d0.getTime() - i * 86400000);
    days.push({ key: d.toDateString(), label: repDays > 7 ? String(d.getDate()) : TH[d.getDay()] + ' ' + d.getDate(), buy: 0, sell: 0 });
  }
  for (const b of bills) {
    const k = new Date(b.created_at).toDateString();
    const day = days.find(x => x.key === k);
    if (day) day[b.type] += +b.total_satang;
  }
  const max = Math.max(1, ...days.map(x => Math.max(x.buy, x.sell)));
  // ต่อเกรด
  const byGrade = {};
  for (const it of items) {
    const t = it.bills.type;
    byGrade[it.grade_name] = byGrade[it.grade_name] || { buyKg: 0, sellKg: 0, buySat: 0, sellSat: 0 };
    byGrade[it.grade_name][t + 'Kg'] += +it.kg;
    byGrade[it.grade_name][t + 'Sat'] += +it.amount_satang;
  }
  const inner = `
  <div style="display:flex;gap:8px;margin-bottom:12px">
    ${[7, 30].map(d => `<button data-rd="${d}" style="flex:1;border:1.5px solid ${repDays === d ? '#E8692E' : '#ECE3D6'};background:${repDays === d ? '#FCEDE3' : '#fff'};color:${repDays === d ? '#C4491C' : '#6B4A38'};border-radius:12px;padding:9px;font:700 13px 'Prompt',sans-serif;cursor:pointer">${d} วัน</button>`).join('')}
  </div>
  <div class="wbar" style="background:linear-gradient(150deg,#3A2718,#241009);border-radius:18px;padding:16px;color:#FBF7F1;margin-bottom:12px;display:flex;justify-content:space-between">
    <div><div style="font:600 11px 'Anuphan',sans-serif;color:#C9B39E">รับซื้อ</div><div class="tnum" style="font:800 19px 'Prompt',sans-serif;color:#F5B98F">${bt(sum.buy)}</div><div class="tnum" style="font:500 10.5px 'Anuphan',sans-serif;color:#C9B39E">${kgS(sum.buyKg)} กก.</div></div>
    <div><div style="font:600 11px 'Anuphan',sans-serif;color:#C9B39E">ขาย</div><div class="tnum" style="font:800 19px 'Prompt',sans-serif;color:#7ED494">${bt(sum.sell)}</div><div class="tnum" style="font:500 10.5px 'Anuphan',sans-serif;color:#C9B39E">${kgS(sum.sellKg)} กก.</div></div>
    <div><div style="font:600 11px 'Anuphan',sans-serif;color:#C9B39E">กำไร</div><div class="tnum" style="font:800 19px 'Prompt',sans-serif;color:${sum.sell - sum.buy >= 0 ? '#7ED494' : '#F5A0A8'}">${sum.sell - sum.buy >= 0 ? '+' : '−'}${bt(Math.abs(sum.sell - sum.buy))}</div><div class="tnum" style="font:500 10.5px 'Anuphan',sans-serif;color:#C9B39E">คงเหลือ ${kgS(Math.max(0, sum.buyKg - sum.sellKg))} กก.</div></div>
  </div>
  <div class="card" style="${cardCSS}">
    <div style="display:flex;align-items:flex-end;gap:${repDays > 7 ? 2 : 6}px;height:110px">${days.map(x => `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
        <div style="display:flex;align-items:flex-end;gap:2px;height:92px">
          <div style="width:${repDays > 7 ? 4 : 9}px;border-radius:4px;background:#E8692E;height:${Math.round(x.buy / max * 92)}px"></div>
          <div style="width:${repDays > 7 ? 4 : 9}px;border-radius:4px;background:#3FBF6B;height:${Math.round(x.sell / max * 92)}px"></div></div>
        ${repDays <= 7 ? `<div style="font:600 9.5px 'Prompt',sans-serif;color:#8A7767">${x.label}</div>` : ''}</div>`).join('')}
    </div></div>
  <div style="font:700 14px 'Prompt',sans-serif;margin:12px 0 8px">สรุปตามเกรด</div>
  ${Object.keys(byGrade).length ? Object.entries(byGrade).map(([g, v]) => `
    <div class="card" style="${cardCSS};display:flex;justify-content:space-between;align-items:center">
      <div style="font:700 13.5px 'Prompt',sans-serif">${esc(g)}</div>
      <div style="text-align:right;font:500 11.5px 'Anuphan',sans-serif;color:#6B4A38" class="tnum">
        ซื้อ ${kgS(v.buyKg)} กก. (${bt(v.buySat)})<br>ขาย ${kgS(v.sellKg)} กก. (${bt(v.sellSat)})</div></div>`).join('')
  : '<div class="muted" style="text-align:center;padding:20px">ยังไม่มีข้อมูล</div>'}`;
  root.innerHTML = shell('รายงาน', inner);
  icons(); nav();
  document.querySelectorAll('[data-rd]').forEach(b => b.onclick = () => { repDays = +b.dataset.rd; renderReports(); });
}

// ================= แจ้งเตือน =================
async function renderNotif() {
  loading(true);
  let due;
  try { due = await DB.bills({ status: 'due' }); } catch (e) { loading(false); toast(e.message, true); return; }
  loading(false);
  const inner = due.length ? due.map(b => {
    const who = b.type === 'buy' ? (b.customers?.name || '-') : (b.buyers?.name || '-');
    return `<div class="card" data-bid="${b.id}" style="${cardCSS};display:flex;gap:11px;align-items:center;cursor:pointer">
      <span style="width:36px;height:36px;border-radius:12px;flex:none;display:inline-flex;align-items:center;justify-content:center;background:#FCEDE3;color:#C4491C"><i data-lucide="alarm-clock"></i></span>
      <div style="flex:1"><div style="font:700 13.5px 'Prompt',sans-serif">${b.type === 'buy' ? 'ค้างจ่าย' : 'ค้างรับ'} ${esc(b.code)} · ${esc(who)}</div>
      <div class="muted tnum" style="font:500 11px 'Anuphan',sans-serif">${dts(b.created_at)}</div></div>
      <b class="tnum" style="font:800 14.5px 'Prompt',sans-serif;color:#C4491C">${bt(b.total_satang)}</b></div>`;
  }).join('') : `<div style="text-align:center;padding:40px 20px">
    <div style="font-size:40px">🎉</div>
    <div style="font:700 15px 'Prompt',sans-serif;margin-top:8px">ไม่มีบิลค้าง</div>
    <div class="muted" style="font:500 12.5px 'Anuphan',sans-serif">เคลียร์หมดแล้ว เยี่ยมมาก!</div></div>`;
  root.innerHTML = shell('แจ้งเตือน', inner);
  icons(); nav();
  document.querySelectorAll('[data-bid]').forEach(c => c.onclick = () => QF2M.billDetail(c.dataset.bid));
}

// ================= ตั้งค่า =================
async function renderSettings() {
  const t = DB.tenant, st = DB.settings || {};
  let grades = [];
  try { grades = await DB.grades(); } catch (e) {}
  const isOwner = DB.profile?.role === 'owner';
  const inner = `
  ${isOwner ? `<div class="card" style="${cardCSS}">
    <div style="font:700 13.5px 'Prompt',sans-serif;margin-bottom:8px">🎟️ รหัสเชิญพนักงาน</div>
    <div class="tnum" style="font:800 24px 'JetBrains Mono',monospace;letter-spacing:.15em;text-align:center;background:#FFF6EF;border:1.5px dashed #E8692E;border-radius:12px;padding:12px;color:#C4491C;user-select:all">${esc(t.invite_code)}</div>
    <div class="muted" style="font:500 11px 'Anuphan',sans-serif;margin-top:6px">พนักงานสมัครบัญชีแล้วเลือก "เข้าร่วมร้าน" ด้วยรหัสนี้</div></div>` : ''}
  <div class="card" style="${cardCSS}">
    <div style="font:700 13.5px 'Prompt',sans-serif;margin-bottom:8px">🏪 ข้อมูลร้าน</div>
    <div style="${labCSS}">ชื่อร้าน</div><input id="s-name" style="${inpCSS}" value="${esc(t.name)}" ${isOwner ? '' : 'disabled'}>
    <div style="${labCSS}">เบอร์โทร</div><input id="s-phone" style="${inpCSS}" value="${esc(t.phone1 || '')}" ${isOwner ? '' : 'disabled'}>
    <div style="${labCSS}">ธนาคาร (ขึ้นบนใบเสร็จ)</div><input id="s-bank" style="${inpCSS}" value="${esc(t.bank || '')}" placeholder="เช่น กสิกรไทย" ${isOwner ? '' : 'disabled'}>
    <div style="${labCSS}">เลขบัญชี</div><input id="s-bankno" style="${inpCSS}" value="${esc(t.bank_no || '')}" ${isOwner ? '' : 'disabled'}>
    ${isOwner ? '<button class="bigbtn bb-pri" id="s-save" style="width:100%;padding:12px">บันทึกข้อมูลร้าน</button>' : ''}</div>
  <div class="card" style="${cardCSS}">
    <div style="font:700 13.5px 'Prompt',sans-serif;margin-bottom:8px">🍈 ราคาตั้งต้นต่อเกรด (บาท/กก.)</div>
    <div style="display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:6px;font:600 10.5px 'Prompt',sans-serif;color:#8A7767;margin-bottom:4px"><span>เกรด</span><span>รับซื้อ</span><span>ขาย</span></div>
    ${grades.map(g => `<div style="display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:6px;margin-bottom:6px;align-items:center">
      <span style="font:600 12.5px 'Prompt',sans-serif"><span style="display:inline-block;width:9px;height:9px;border-radius:99px;background:${esc(g.color)};margin-right:5px"></span>${esc(g.name)}</span>
      <input type="number" step="0.5" class="tnum" data-gb="${g.id}" value="${+g.buy_satang ? g.buy_satang / 100 : ''}" style="font:600 13px 'Prompt',sans-serif;padding:8px;border:1.5px solid #ECE3D6;border-radius:10px;background:#fff;width:100%;box-sizing:border-box" ${isOwner ? '' : 'disabled'}>
      <input type="number" step="0.5" class="tnum" data-gs="${g.id}" value="${+g.sell_satang ? g.sell_satang / 100 : ''}" style="font:600 13px 'Prompt',sans-serif;padding:8px;border:1.5px solid #ECE3D6;border-radius:10px;background:#fff;width:100%;box-sizing:border-box" ${isOwner ? '' : 'disabled'}></div>`).join('')}
    ${isOwner ? '<button class="bigbtn bb-grn" id="s-grades" style="width:100%;padding:12px;margin-top:4px">บันทึกราคา</button>' : ''}</div>
  ${isOwner ? `<div class="card" style="${cardCSS}">
    <div style="font:700 13.5px 'Prompt',sans-serif;margin-bottom:8px">👷 ค่าแรงตั้งต้น</div>
    <div style="${labCSS}">ค่าแรงฐาน/วัน (บาท)</div><input id="s-base" type="number" class="tnum" style="${inpCSS}" value="${+(st.base_day_satang || 30000) / 100}">
    <div style="${labCSS}">คอม/กก. (บาท)</div><input id="s-com" type="number" step="0.01" class="tnum" style="${inpCSS}" value="${+(st.com_kg_satang || 50) / 100}">
    <button class="bigbtn bb-grn" id="s-wage" style="width:100%;padding:12px">บันทึกค่าแรง</button></div>
  <div class="card" style="${cardCSS}">
    <div style="font:700 13.5px 'Prompt',sans-serif;margin-bottom:8px">🔒 PIN ร้าน (4 หลัก)</div>
    <div class="muted" style="font:500 11.5px 'Anuphan',sans-serif;margin-bottom:8px">${st.pin_hash ? 'ตั้ง PIN ไว้แล้ว — ใส่ใหม่เพื่อเปลี่ยน' : 'ยังไม่ได้ตั้ง — ตั้งแล้วจะถามตอนเข้าแอป/จ่ายเงิน/ยกเลิกบิล'}</div>
    <input id="s-pin" type="text" inputmode="numeric" maxlength="4" class="tnum" style="${inpCSS}" placeholder="เช่น 1234">
    <button class="bigbtn bb-pri" id="s-setpin" style="width:100%;padding:12px">${st.pin_hash ? 'เปลี่ยน PIN' : 'ตั้ง PIN'}</button></div>` : ''}
  <button id="s-logout" style="width:100%;border:1.5px solid #E7C2BC;background:#fff;color:#C0392B;border-radius:14px;padding:13px;font:700 13.5px 'Prompt',sans-serif;cursor:pointer;margin-bottom:10px">ออกจากระบบ</button>`;
  root.innerHTML = shell('ตั้งค่า', inner);
  icons(); nav();
  const sv = document.getElementById('s-save');
  if (sv) sv.onclick = async () => {
    try {
      loading(true);
      await DB.updateTenant({ name: document.getElementById('s-name').value.trim(), phone1: document.getElementById('s-phone').value.trim(), bank: document.getElementById('s-bank').value.trim(), bank_no: document.getElementById('s-bankno').value.trim() });
      DB.tenant.name = document.getElementById('s-name').value.trim();
      loading(false); toast('บันทึกข้อมูลร้านแล้ว');
    } catch (e) { loading(false); toast(e.message, true); }
  };
  const gv = document.getElementById('s-grades');
  if (gv) gv.onclick = async () => {
    try {
      loading(true);
      const rows = grades.map(g => ({
        id: g.id,
        buy_satang: Math.round((parseFloat(document.querySelector(`[data-gb="${g.id}"]`).value) || 0) * 100),
        sell_satang: Math.round((parseFloat(document.querySelector(`[data-gs="${g.id}"]`).value) || 0) * 100),
      }));
      await DB.saveGradePrices(rows);
      loading(false); toast('บันทึกราคาแล้ว');
    } catch (e) { loading(false); toast(e.message, true); }
  };
  const wv = document.getElementById('s-wage');
  if (wv) wv.onclick = async () => {
    try {
      loading(true);
      await DB.updateSettings({
        base_day_satang: Math.round((parseFloat(document.getElementById('s-base').value) || 300) * 100),
        com_kg_satang: Math.round((parseFloat(document.getElementById('s-com').value) || 0.5) * 100),
      });
      DB.settings = { ...DB.settings, base_day_satang: Math.round((parseFloat(document.getElementById('s-base').value) || 300) * 100), com_kg_satang: Math.round((parseFloat(document.getElementById('s-com').value) || 0.5) * 100) };
      loading(false); toast('บันทึกค่าแรงแล้ว');
    } catch (e) { loading(false); toast(e.message, true); }
  };
  const pv = document.getElementById('s-setpin');
  if (pv) pv.onclick = async () => {
    const pin = document.getElementById('s-pin').value.trim();
    if (!/^\d{4}$/.test(pin)) { toast('PIN ต้องเป็นตัวเลข 4 หลัก', true); return; }
    try {
      loading(true);
      await DB.setPin(pin);
      DB.settings = { ...DB.settings, pin_hash: 'set' };
      loading(false); toast('ตั้ง PIN แล้ว');
    } catch (e) { loading(false); toast(e.message, true); }
  };
  document.getElementById('s-logout').onclick = async () => {
    sessionStorage.removeItem('qf2_unlocked');
    await DB.signOut();
    location.reload();
  };
}

return { renderMore, renderCustomers, renderStaff, renderHistory, renderReports, renderNotif, renderSettings };
})();
