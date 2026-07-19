// ============================================================
// Qudsunfable 2 — หน้าบิล (จ่าย/ค้าง) + กระเป๋าเงิน
// ============================================================
'use strict';
window.QF2M = (() => {

const bt = (satang) => '฿' + Math.round(satang / 100).toLocaleString('th-TH');
const kgS = (n) => (+n).toLocaleString('th-TH', { maximumFractionDigits: 1 });
const dts = (s) => new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + ' ' + new Date(s).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

function shell(cls, title, inner, activeTab) {
  return `
  <div class="app ${cls}">
    <div class="hdr" style="display:flex;align-items:center;gap:12px;padding:16px 0 10px">
      <button class="backb" data-nav="home" style="border:1px solid #ECE3D6;background:#fff;border-radius:12px;padding:8px 13px;font:700 13px 'Prompt',sans-serif;cursor:pointer">‹ หน้าหลัก</button>
      <div style="font:800 18px 'Prompt',sans-serif">${title}</div></div>
    ${inner}
    <div class="tabbar">
      <div class="tab ${activeTab === 'home' ? 'tab-on' : ''}" data-nav="home"><i data-lucide="home"></i>หน้าหลัก</div>
      <div class="tab" data-nav="buy"><i data-lucide="shopping-cart"></i>รับซื้อ</div>
      <div class="tab" data-nav="sell"><i data-lucide="banknote"></i>ขาย</div>
      <div class="tab ${activeTab === 'wallet' ? 'tab-on' : ''}" data-nav="wallet"><i data-lucide="wallet"></i>กระเป๋า</div>
      <div class="tab ${activeTab === 'bills' ? 'tab-on' : ''}" data-nav="bills"><i data-lucide="receipt-text"></i>บิล</div>
    </div>
  </div>`;
}
function nav() { document.querySelectorAll('[data-nav]').forEach(el => el.onclick = () => go[el.dataset.nav]()); }

// ================= บิล =================
let BF = { type: '', status: '' };
async function renderBills() {
  loading(true);
  let rows;
  try { rows = await DB.bills({ type: BF.type || null, status: BF.status || null }); }
  catch (e) { loading(false); toast(e.message, true); return; }
  loading(false);
  const due = rows.filter(b => b.status === 'due');
  const pill = (v, l, key) => `<button class="fp ${BF[key] === v ? 'fp-on' : ''}" data-f="${key}:${v}" style="border:1.5px solid ${BF[key] === v ? '#E8692E' : '#ECE3D6'};background:${BF[key] === v ? '#FCEDE3' : '#fff'};color:${BF[key] === v ? '#C4491C' : '#6B4A38'};border-radius:99px;padding:7px 14px;font:600 12px 'Prompt',sans-serif;cursor:pointer">${l}</button>`;
  const inner = `
  ${due.length ? `<div class="wbar" style="background:linear-gradient(150deg,#3A2718,#241009);border-radius:18px;padding:14px 16px;color:#FBF7F1;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <div><div style="font:600 11px 'Anuphan',sans-serif;color:#C9B39E">ค้างจ่าย/ค้างรับรวม</div>
    <div class="tnum" style="font:800 22px 'Prompt',sans-serif">${bt(due.reduce((s, b) => s + +b.total_satang, 0))}</div></div>
    <div class="tnum" style="font:700 13px 'Prompt',sans-serif;background:rgba(232,105,46,.25);color:#F5B98F;border-radius:99px;padding:6px 13px">${due.length} บิล</div></div>` : ''}
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
    ${pill('', 'ทั้งหมด', 'type')}${pill('buy', 'ซื้อ', 'type')}${pill('sell', 'ขาย', 'type')}
    <span style="width:6px"></span>
    ${pill('', 'ทุกสถานะ', 'status')}${pill('due', 'ค้าง', 'status')}${pill('paid', 'จ่ายแล้ว', 'status')}
  </div>
  <div id="bl-list">${rows.length ? rows.map(b => {
    const who = b.type === 'buy' ? (b.customers?.name || '-') : (b.buyers?.name || '-');
    const sc = { due: ['#FCEDE3', '#C4491C', 'ค้าง'], paid: ['#E9F3EC', '#237947', 'จ่ายแล้ว'], canceled: ['#F0F0F0', '#8A8A8A', 'ยกเลิก'] }[b.status];
    return `<div class="card" data-bill="${b.id}" style="display:flex;align-items:center;gap:12px;margin-bottom:9px;cursor:pointer">
      <div style="width:42px;height:42px;border-radius:13px;flex:none;display:flex;align-items:center;justify-content:center;background:${b.type === 'buy' ? '#FCEDE3' : '#E9F3EC'};color:${b.type === 'buy' ? '#E8692E' : '#2F9B58'}"><i data-lucide="${b.type === 'buy' ? 'shopping-cart' : 'banknote'}"></i></div>
      <div style="flex:1;min-width:0"><div style="font:700 14px 'Prompt',sans-serif">${esc(b.code)} · ${esc(who)}</div>
      <div class="tnum" style="font:500 11.5px 'Anuphan',sans-serif;color:#8A7767">${kgS(b.total_kg)} กก. · ${dts(b.created_at)}</div></div>
      <div style="text-align:right"><div class="tnum" style="font:800 15px 'Prompt',sans-serif">${bt(b.total_satang)}</div>
      <span style="font:700 10px 'Prompt',sans-serif;background:${sc[0]};color:${sc[1]};border-radius:6px;padding:2px 8px">${sc[2]}</span></div></div>`;
  }).join('') : '<div class="muted" style="text-align:center;padding:30px">ไม่มีบิล</div>'}</div>`;
  root.innerHTML = shell('scr-bills', 'บิลทั้งหมด', inner, 'bills');
  icons(); nav();
  document.querySelectorAll('[data-f]').forEach(p => p.onclick = () => {
    const [k, v] = p.dataset.f.split(':');
    BF[k] = v; renderBills();
  });
  document.querySelectorAll('[data-bill]').forEach(c => c.onclick = () => billDetail(c.dataset.bill));
}

async function billDetail(id) {
  loading(true);
  let b;
  try { b = await DB.billDetail(id); } catch (e) { loading(false); toast(e.message, true); return; }
  const wallets = await DB.wallets();
  loading(false);
  const who = b.type === 'buy' ? (b.customers?.name || '-') : (b.buyers?.name || '-');
  const isBuy = b.type === 'buy';
  const ov = document.createElement('div');
  ov.className = 'scr-bills';
  ov.innerHTML = `
  <div style="position:fixed;inset:0;background:rgba(36,16,9,.5);z-index:200;display:flex;align-items:flex-end;justify-content:center" id="bd-bg">
    <div style="background:#FBF7F1;border-radius:24px 24px 0 0;width:100%;max-width:430px;max-height:88vh;overflow:auto;padding:20px 18px 28px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div style="font:800 18px 'Prompt',sans-serif">${esc(b.code)}</div>
        <span style="font:700 10.5px 'Prompt',sans-serif;background:${b.status === 'due' ? '#FCEDE3' : b.status === 'paid' ? '#E9F3EC' : '#F0F0F0'};color:${b.status === 'due' ? '#C4491C' : b.status === 'paid' ? '#237947' : '#8A8A8A'};border-radius:7px;padding:3px 10px">${b.status === 'due' ? (isBuy ? 'ค้างจ่าย' : 'ค้างรับ') : b.status === 'paid' ? 'ชำระแล้ว' : 'ยกเลิก'}</span>
        <button id="bd-close" style="margin-left:auto;border:none;background:#fff;border-radius:10px;width:34px;height:34px;cursor:pointer;font-size:16px">✕</button></div>
      <div class="muted" style="font:500 12.5px 'Anuphan',sans-serif;margin-bottom:12px">${isBuy ? 'ซื้อจาก' : 'ขายให้'} ${esc(who)} · ${dts(b.created_at)}</div>
      ${b.bill_items.map(it => `<div style="display:flex;justify-content:space-between;padding:8px 2px;border-bottom:1px solid #ECE3D6;font:500 13.5px 'Anuphan',sans-serif">
        <span>${esc(it.grade_name)} · <span class="tnum">${kgS(it.kg)} กก. × ${bt(it.price_satang)}</span></span>
        <b class="tnum" style="font-family:'Prompt',sans-serif">${bt(it.amount_satang)}</b></div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding:12px 2px;font:800 16px 'Prompt',sans-serif"><span>ยอดรวม</span><span class="tnum" style="color:#E8692E">${bt(b.total_satang)}</span></div>
      ${b.payments?.length ? `<div class="muted" style="font:600 11.5px 'Prompt',sans-serif;margin:6px 0 4px">การชำระ</div>` +
        b.payments.map(p => `<div style="display:flex;justify-content:space-between;font:500 12.5px 'Anuphan',sans-serif;padding:4px 2px">
          <span><span style="display:inline-block;width:9px;height:9px;border-radius:99px;background:${esc(p.wallets?.color || '#999')};margin-right:6px"></span>${esc(p.wallets?.name || '')}</span>
          <b class="tnum">${bt(p.amount_satang)}</b></div>`).join('') : ''}
      ${b.status === 'due' ? `
        <div style="font:700 13.5px 'Prompt',sans-serif;margin:14px 0 8px">${isBuy ? 'จ่ายเงินจากกระเป๋า' : 'รับเงินเข้ากระเป๋า'} <span class="muted" style="font:500 11px 'Anuphan',sans-serif">แบ่งได้หลายใบ · รวมต้องเท่ายอดบิล</span></div>
        ${wallets.map(w => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="display:inline-flex;width:30px;height:30px;border-radius:10px;background:${esc(w.color)};color:#fff;align-items:center;justify-content:center;flex:none"><i data-lucide="${esc(w.icon)}"></i></span>
          <div style="flex:1;font:600 12.5px 'Prompt',sans-serif">${esc(w.name)}<div class="muted tnum" style="font:500 10.5px 'Anuphan',sans-serif">มี ${bt(w.balance_satang)}</div></div>
          <input type="number" step="1" min="0" placeholder="0" data-split="${esc(w.code)}" class="tnum" style="width:110px;font:600 14px 'Prompt',sans-serif;padding:9px 10px;border:1.5px solid #ECE3D6;border-radius:11px;background:#fff;text-align:right"></div>`).join('')}
        <div style="display:flex;justify-content:space-between;font:600 12.5px 'Prompt',sans-serif;margin:4px 0 10px"><span>แบ่งแล้ว <span id="bd-sum" class="tnum">฿0</span> / ${bt(b.total_satang)}</span>
          <button id="bd-fill" style="border:none;background:#FCEDE3;color:#C4491C;border-radius:8px;padding:4px 10px;font:700 11px 'Prompt',sans-serif;cursor:pointer">ใส่เต็มใบแรก</button></div>
        <button class="bigbtn ${isBuy ? 'bb-pri' : 'bb-grn'}" id="bd-pay" style="width:100%">✓ ${isBuy ? 'ยืนยันจ่ายเงิน' : 'ยืนยันรับเงิน'}</button>` : ''}
      ${b.status !== 'canceled' ? `<button id="bd-cancel" style="width:100%;margin-top:10px;border:1.5px solid #E7C2BC;background:#fff;color:#C0392B;border-radius:14px;padding:12px;font:700 13px 'Prompt',sans-serif;cursor:pointer">ยกเลิกบิลนี้${b.status === 'paid' ? ' (คืนเงินกลับกระเป๋า)' : ''}</button>` : ''}
    </div></div>`;
  document.body.appendChild(ov);
  icons();
  const close = () => ov.remove();
  ov.querySelector('#bd-close').onclick = close;
  ov.querySelector('#bd-bg').addEventListener('click', e => { if (e.target.id === 'bd-bg') close(); });
  const sumEl = ov.querySelector('#bd-sum');
  const splits = () => [...ov.querySelectorAll('[data-split]')].map(i => ({ wallet_code: i.dataset.split, amount_satang: Math.round((parseFloat(i.value) || 0) * 100) })).filter(s => s.amount_satang > 0);
  ov.querySelectorAll('[data-split]').forEach(i => i.oninput = () => { sumEl.textContent = bt(splits().reduce((s, x) => s + x.amount_satang, 0)); });
  const fill = ov.querySelector('#bd-fill');
  if (fill) fill.onclick = () => {
    ov.querySelectorAll('[data-split]').forEach((i, idx) => i.value = idx === 0 ? (b.total_satang / 100) : '');
    sumEl.textContent = bt(+b.total_satang);
  };
  const pay = ov.querySelector('#bd-pay');
  if (pay) pay.onclick = async () => {
    const sp = splits();
    const tot = sp.reduce((s, x) => s + x.amount_satang, 0);
    if (tot !== +b.total_satang) { toast('ยอดแบ่งรวมต้องเท่ายอดบิล (' + bt(b.total_satang) + ')', true); return; }
    if (!(await pinGate('pin_on_pay'))) return;
    try { loading(true); await DB.payBill(b.id, sp); loading(false); toast('ชำระบิล ' + b.code + ' แล้ว'); close(); renderBills(); }
    catch (e) { loading(false); toast(e.message, true); }
  };
  const cc = ov.querySelector('#bd-cancel');
  if (cc) cc.onclick = async () => {
    if (!confirm('ยืนยันยกเลิกบิล ' + b.code + '?')) return;
    if (!(await pinGate('pin_on_delete'))) return;
    try { loading(true); await DB.cancelBill(b.id); loading(false); toast('ยกเลิกแล้ว'); close(); renderBills(); }
    catch (e) { loading(false); toast(e.message, true); }
  };
}

// ================= กระเป๋าเงิน =================
let selW = null;
async function renderWallet() {
  loading(true);
  let ws;
  try { ws = await DB.wallets(); } catch (e) { loading(false); toast(e.message, true); return; }
  loading(false);
  if (!selW) selW = ws[0]?.id;
  const total = ws.reduce((s, w) => s + +w.balance_satang, 0);
  const inner = `
  <div class="wbar" style="background:linear-gradient(150deg,#3A2718,#241009);border-radius:18px;padding:16px;color:#FBF7F1;margin-bottom:12px">
    <div style="font:600 11px 'Anuphan',sans-serif;color:#C9B39E">เงินรวมทุกกระเป๋า</div>
    <div class="tnum" style="font:800 26px 'Prompt',sans-serif">${bt(total)}</div></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
    ${ws.map(w => `<div class="card" data-w="${w.id}" style="cursor:pointer;${selW === w.id ? 'border-color:#E8692E;box-shadow:0 0 0 2px rgba(232,105,46,.2)' : ''}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="width:30px;height:30px;border-radius:10px;background:${esc(w.color)};color:#fff;display:inline-flex;align-items:center;justify-content:center"><i data-lucide="${esc(w.icon)}"></i></span>
        <span style="font:600 11.5px 'Prompt',sans-serif;color:#6B4A38">${esc(w.name)}</span></div>
      <div class="tnum" style="font:800 18px 'Prompt',sans-serif">${bt(w.balance_satang)}</div></div>`).join('')}
  </div>
  <div style="display:flex;gap:8px;margin-bottom:14px">
    <button class="bigbtn bb-acc" style="flex:1;padding:12px" id="wl-in">+ เติมเงิน</button>
    <button class="bigbtn" style="flex:1;padding:12px;background:#fff;color:#6B4A38;border:1.5px solid #ECE3D6" id="wl-out">− ถอน/จ่าย</button>
    <button class="bigbtn" style="flex:1;padding:12px;background:#fff;color:#6B4A38;border:1.5px solid #ECE3D6" id="wl-tf">⇄ โอนข้าม</button>
  </div>
  <div style="font:700 14px 'Prompt',sans-serif;margin-bottom:8px">รายการล่าสุด <span class="muted" style="font:500 11.5px 'Anuphan',sans-serif">${esc(ws.find(w => w.id === selW)?.name || '')}</span></div>
  <div id="wl-txns" class="muted" style="font:500 12.5px 'Anuphan',sans-serif">กำลังโหลด…</div>`;
  root.innerHTML = shell('scr-wallet', 'กระเป๋าเงิน', inner, 'wallet');
  icons(); nav();
  document.querySelectorAll('[data-w]').forEach(c => c.onclick = () => { selW = c.dataset.w; renderWallet(); });
  loadTx();
  document.getElementById('wl-in').onclick = () => txnModal(ws, 'in');
  document.getElementById('wl-out').onclick = () => txnModal(ws, 'out');
  document.getElementById('wl-tf').onclick = () => transferModal(ws);
}
async function loadTx() {
  try {
    const tx = await DB.walletTxns(selW);
    const el = document.getElementById('wl-txns');
    if (!el) return;
    el.innerHTML = tx.length ? tx.map(t => `
      <div style="display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #ECE3D6;border-radius:13px;padding:10px 12px;margin-bottom:7px">
        <span style="width:30px;height:30px;border-radius:10px;flex:none;display:inline-flex;align-items:center;justify-content:center;background:${t.kind === 'in' ? '#E9F3EC' : '#FCEDE3'};color:${t.kind === 'in' ? '#237947' : '#C4491C'}"><i data-lucide="${t.kind === 'in' ? 'arrow-down-left' : 'arrow-up-right'}"></i></span>
        <div style="flex:1;min-width:0"><div style="font:600 12.5px 'Prompt',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.note || (t.bills ? 'บิล ' + t.bills.code : '-'))}</div>
        <div class="muted tnum" style="font:500 10.5px 'Anuphan',sans-serif">${dts(t.created_at)} · เหลือ ${bt(t.balance_after)}</div></div>
        <b class="tnum" style="font:700 14px 'Prompt',sans-serif;color:${t.kind === 'in' ? '#237947' : '#C4491C'}">${t.kind === 'in' ? '+' : '−'}${bt(t.amount_satang)}</b></div>`).join('')
      : 'ยังไม่มีรายการ';
    icons();
  } catch (e) { toast(e.message, true); }
}
function modalShell(title, inner) {
  const ov = document.createElement('div');
  ov.innerHTML = `<div style="position:fixed;inset:0;background:rgba(36,16,9,.5);z-index:200;display:flex;align-items:flex-end;justify-content:center" id="m-bg">
    <div style="background:#FBF7F1;border-radius:24px 24px 0 0;width:100%;max-width:430px;padding:20px 18px 28px">
      <div style="display:flex;align-items:center;margin-bottom:12px"><div style="font:800 17px 'Prompt',sans-serif">${title}</div>
      <button id="m-close" style="margin-left:auto;border:none;background:#fff;border-radius:10px;width:34px;height:34px;cursor:pointer">✕</button></div>${inner}</div></div>`;
  document.body.appendChild(ov);
  ov.querySelector('#m-close').onclick = () => ov.remove();
  ov.querySelector('#m-bg').addEventListener('click', e => { if (e.target.id === 'm-bg') ov.remove(); });
  return ov;
}
const selCSS = `width:100%;font:600 14px 'Prompt',sans-serif;padding:12px;border:1.5px solid #ECE3D6;border-radius:12px;background:#fff;margin-bottom:10px`;
const inpCSS = `width:100%;font:600 15px 'Prompt',sans-serif;padding:12px;border:1.5px solid #ECE3D6;border-radius:12px;background:#fff;margin-bottom:10px`;
function txnModal(ws, kind) {
  const ov = modalShell(kind === 'in' ? 'เติมเงินเข้ากระเป๋า' : 'ถอน/จ่ายออกจากกระเป๋า', `
    <select id="m-w" style="${selCSS}">${ws.map(w => `<option value="${esc(w.code)}">${esc(w.name)} (${bt(w.balance_satang)})</option>`).join('')}</select>
    <input id="m-amt" type="number" step="0.01" placeholder="จำนวนเงิน (บาท)" class="tnum" style="${inpCSS}">
    <input id="m-note" placeholder="หมายเหตุ เช่น เงินตั้งต้น / ค่าน้ำมัน" style="${inpCSS}font-family:'Anuphan',sans-serif;font-weight:500">
    <button class="bigbtn ${kind === 'in' ? 'bb-grn' : 'bb-pri'}" id="m-go" style="width:100%">✓ ยืนยัน</button>`);
  ov.querySelector('#m-go').onclick = async () => {
    const amt = Math.round((parseFloat(ov.querySelector('#m-amt').value) || 0) * 100);
    if (amt <= 0) { toast('ใส่จำนวนเงินก่อนครับ', true); return; }
    if (kind === 'out' && !(await pinGate('pin_on_pay'))) return;
    try { loading(true); await DB.walletTxn(ov.querySelector('#m-w').value, kind, amt, ov.querySelector('#m-note').value.trim()); loading(false); ov.remove(); toast('บันทึกแล้ว'); renderWallet(); }
    catch (e) { loading(false); toast(e.message, true); }
  };
}
function transferModal(ws) {
  const ov = modalShell('โอนข้ามกระเป๋า', `
    <div class="muted" style="font:600 11.5px 'Prompt',sans-serif;margin-bottom:4px">จาก</div>
    <select id="m-from" style="${selCSS}">${ws.map(w => `<option value="${esc(w.code)}">${esc(w.name)} (${bt(w.balance_satang)})</option>`).join('')}</select>
    <div class="muted" style="font:600 11.5px 'Prompt',sans-serif;margin-bottom:4px">ไป</div>
    <select id="m-to" style="${selCSS}">${ws.map((w, i) => `<option value="${esc(w.code)}" ${i === 1 ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select>
    <input id="m-amt" type="number" step="0.01" placeholder="จำนวนเงิน (บาท)" class="tnum" style="${inpCSS}">
    <input id="m-note" placeholder="หมายเหตุ (ไม่บังคับ)" style="${inpCSS}font-family:'Anuphan',sans-serif;font-weight:500">
    <button class="bigbtn bb-pri" id="m-go" style="width:100%">⇄ โอนเลย</button>`);
  ov.querySelector('#m-go').onclick = async () => {
    const from = ov.querySelector('#m-from').value, to = ov.querySelector('#m-to').value;
    const amt = Math.round((parseFloat(ov.querySelector('#m-amt').value) || 0) * 100);
    if (from === to) { toast('เลือกกระเป๋าคนละใบครับ', true); return; }
    if (amt <= 0) { toast('ใส่จำนวนเงินก่อนครับ', true); return; }
    if (!(await pinGate('pin_on_pay'))) return;
    try { loading(true); await DB.walletTransfer(from, to, amt, ov.querySelector('#m-note').value.trim()); loading(false); ov.remove(); toast('โอนสำเร็จ'); renderWallet(); }
    catch (e) { loading(false); toast(e.message, true); }
  };
}

return { renderBills, renderWallet, billDetail };
})();
