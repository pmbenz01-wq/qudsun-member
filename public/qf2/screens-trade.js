// ============================================================
// Qudsunfable 2 — หน้ารับซื้อ + ขาย (จดกิโลรายเข่ง → สรุปตั้งราคา → บิล)
// ============================================================
'use strict';
window.QF2T = (() => {

// state ของ workflow (ใช้ร่วม buy/sell)
let W = null;
function newW(type) {
  W = {
    type,                       // 'buy' | 'sell'
    step: 'start',              // start | record | summary | done
    name: '', phone: '',
    partyId: null,
    grades: [], activeGrade: null,
    entries: [],                // {grade, kg}
    prices: {},                 // grade -> baht string
    input: '',
    adding: false, manage: false, newCat: '',
    bill: null,                 // ผลจาก create_bill
    receiveNow: true,           // sell: รับเงินเข้ากระเป๋าทันที
    receiveWallet: 'B1',
  };
}

const kgS = (n) => (+n).toLocaleString('th-TH', { maximumFractionDigits: 1 });
const bt = (satang) => '฿' + Math.round(satang / 100).toLocaleString('th-TH');
const btd = (satang) => (satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function catStats(g) {
  const es = W.entries.filter(e => e.grade === g);
  return { kg: es.reduce((s, e) => s + e.kg, 0), n: es.length };
}
function defPrice(gname) {
  const g = W.grades.find(x => x.name === gname);
  const sat = g ? +(W.type === 'buy' ? g.buy_satang : g.sell_satang) : 0;
  return sat > 0 ? String(sat / 100) : '';
}
function sumRows() {
  const gs = [...new Set(W.entries.map(e => e.grade))];
  return gs.map(gname => {
    const st = catStats(gname);
    const g = W.grades.find(x => x.name === gname);
    const price = W.prices[gname] !== undefined ? W.prices[gname] : defPrice(gname);
    const satang = Math.round(st.kg * (parseFloat(price) || 0) * 100);
    return { name: gname, color: g?.color || '#E8692E', kg: st.kg, n: st.n, price, satang };
  });
}
const grand = () => sumRows().reduce((s, r) => s + r.satang, 0);

// ---------- render หลัก ----------
async function render(type) {
  if (!W || W.type !== type) {
    newW(type);
    loading(true);
    try { W.grades = await DB.grades(); W.activeGrade = W.grades[0]?.name || null; }
    catch (e) { loading(false); toast(e.message, true); return; }
    loading(false);
  }
  const isBuy = W.type === 'buy';
  const title = isBuy ? 'รับซื้อ' : 'ขาย';
  const acc = isBuy ? '#E8692E' : '#2F9B58';
  const stepIdx = { start: 1, record: 2, summary: 3, done: 4 }[W.step];

  let body = '';
  if (W.step === 'start') body = startBody(isBuy);
  if (W.step === 'record') body = recordBody(acc);
  if (W.step === 'summary') body = summaryBody(acc, isBuy);
  if (W.step === 'done') body = doneBody(isBuy);

  root.innerHTML = `
  <div class="app scr-buy">
    <div class="hdr"><button class="backb" id="w-back">‹ ${W.step === 'start' ? 'หน้าหลัก' : 'ย้อน'}</button>
      <div><div class="billno tnum">${W.bill ? esc(W.bill.code) : 'บิล' + title + 'ใหม่'}</div>
      <div class="bdate">${new Date().toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div></div>
      <div class="rolechip" style="margin-left:auto;background:#fff;border:1.5px solid #ECE3D6;border-radius:99px;padding:6px 12px;font:600 11.5px 'Prompt',sans-serif">${esc(DB.profile?.name || '')}</div></div>
    <div class="steps">${[1, 2, 3, 4].map(i => `<div class="step ${i <= stepIdx ? 'step-on' : ''}"></div>`).join('')}</div>
    ${body}
    <div class="tabbar">
      <div class="tab" data-nav="home"><i data-lucide="home"></i>หน้าหลัก</div>
      <div class="tab ${isBuy ? 'tab-on' : ''}" data-nav="buy"><i data-lucide="shopping-cart"></i>รับซื้อ</div>
      <div class="tab ${!isBuy ? 'tab-on' : ''}" data-nav="sell"><i data-lucide="banknote"></i>ขาย</div>
      <div class="tab" data-nav="wallet"><i data-lucide="wallet"></i>กระเป๋า</div>
      <div class="tab" data-nav="bills"><i data-lucide="receipt-text"></i>บิล</div>
    </div>
  </div>`;
  icons();
  wire(type, isBuy);
}

function startBody(isBuy) {
  const who = isBuy ? 'ลูกค้า/สวน' : 'ผู้ซื้อ (ล้ง/ตลาด)';
  return `
  <div class="card"><div class="flab">ชื่อ${who}</div>
    <input class="finp" id="w-name" value="${esc(W.name)}" placeholder="เช่น ${isBuy ? 'สวนลุงหมาน' : 'ล้งเจ๊หงส์'}">
    <div class="flab" style="margin-top:12px">เบอร์โทร (ไม่บังคับ)</div>
    <input class="finp tnum" id="w-phone" value="${esc(W.phone)}" placeholder="08x-xxx-xxxx">
    <div class="flab" style="margin-top:14px">เลือกจากรายชื่อเดิม — แตะเพื่อเลือก</div>
    <div class="qpick" id="w-qpick"><span class="qp">กำลังโหลด…</span></div></div>
  <div style="margin-top:14px"><button class="bigbtn bb-pri" id="w-start">เริ่มจดกิโล →</button></div>`;
}

function recordBody(acc) {
  const totKg = W.entries.reduce((s, e) => s + e.kg, 0);
  const active = W.activeGrade;
  const actEntries = W.entries.map((e, i) => ({ ...e, i })).filter(e => e.grade === active).slice(-8).reverse();
  return `
  <div class="wbar"><div><div class="wl">รวมน้ำหนักทั้งหมด · ${esc(W.name)}</div><div class="wv tnum">${kgS(totKg)} <span class="wu">กก.</span></div></div>
    <div style="text-align:right"><div class="wl">จำนวนเข่ง</div><div class="wv tnum">${W.entries.length}</div></div></div>
  <div class="cgrid ${W.manage ? 'managing' : ''}">${W.grades.map(g => {
    const st = catStats(g.name);
    return `<div class="cat ${g.name === active ? 'cat-on' : ''}" data-cat="${esc(g.name)}">
      <div class="catl"><span class="catdot" style="background:${esc(g.color)}"></span>${esc(g.name)}</div>
      <div class="catn tnum">${kgS(st.kg)}</div><div class="cats tnum">${st.n} เข่ง</div></div>`;
  }).join('')}</div>
  <div class="catbar">${W.adding
    ? `<input class="finp" style="flex:1;padding:9px 12px;font-size:14px" id="w-newcat" placeholder="ชื่อหมวดใหม่ เช่น เกรดพรีเมียม" value="${esc(W.newCat)}">
       <button class="cbtn cbtn-acc" id="w-addcat-ok">เพิ่ม</button><button class="cbtn" id="w-addcat-no">ยกเลิก</button>`
    : `<button class="cbtn" id="w-addcat">+ เพิ่มหมวดใหม่</button>`}</div>
  <div class="card padcard"><div class="padhd"><span class="padt" style="color:${acc}">● กำลังจด: ${esc(active || '-')}</span><span class="padh">เคาะตัวเลข แล้วกด "บันทึกเข่ง"</span></div>
    <div class="disp tnum">${esc(W.input || '0')} <span class="dunit">กก.</span></div>
    <div class="keys">${['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'].map(k => `<div class="key" data-key="${k}">${k}</div>`).join('')}</div>
    ${actEntries.length ? `<div class="flab" style="margin-top:12px">เข่งล่าสุดใน ${esc(active)}</div>
      <div class="entries">${actEntries.map(e => `<span class="ent tnum">${kgS(e.kg)} กก.<span class="entx" data-del="${e.i}">✕</span></span>`).join('')}</div>` : ''}
  </div>
  <div class="stick"><button class="bigbtn ${W.input ? 'bb-acc' : 'bb-dis'}" style="flex:1" id="w-save">+ บันทึกเข่งนี้</button>
    <button class="bigbtn ${W.entries.length ? 'bb-pri' : 'bb-dis'}" style="flex:1.2" id="w-sum">ดูสรุป &amp; ตั้งราคา →</button></div>`;
}

function summaryBody(acc, isBuy) {
  const rows = sumRows();
  const totKg = W.entries.reduce((s, e) => s + e.kg, 0);
  return `
  <div class="wbar"><div><div class="wl">${esc(W.name)}${W.phone ? ' · ' + esc(W.phone) : ''}</div>
    <div class="wv tnum">${kgS(totKg)} <span class="wu">กก. · ${W.entries.length} เข่ง</span></div></div></div>
  ${rows.map(r => `<div class="srow"><div style="flex:1">
      <div class="srn"><span class="catdot" style="background:${esc(r.color)}"></span> ${esc(r.name)}</div>
      <div class="srs tnum">${kgS(r.kg)} กก. · ${r.n} เข่ง</div></div>
    <input class="pinp tnum" type="number" step="0.5" placeholder="฿/กก." data-price="${esc(r.name)}" value="${esc(r.price)}">
    <div class="srt tnum">${bt(r.satang)}</div></div>`).join('')}
  <div class="total"><div class="tl">ยอดรวมบิลนี้</div><div class="tv tnum">${bt(grand())}</div></div>
  ${!isBuy ? `<div class="card" style="margin-top:12px;display:flex;align-items:center;gap:10px">
    <input type="checkbox" id="w-recv" ${W.receiveNow ? 'checked' : ''} style="width:20px;height:20px;accent-color:#2F9B58">
    <label for="w-recv" style="font:600 13.5px 'Prompt',sans-serif">รับเงินเข้ากระเป๋า B ทันที <span class="muted" style="font:500 11.5px 'Anuphan',sans-serif">(ไม่ติ๊ก = บิลค้างรับ)</span></label></div>` : ''}
  <div class="stick"><button class="bigbtn ${grand() > 0 ? (isBuy ? 'bb-pri' : 'bb-grn') : 'bb-dis'}" id="w-confirm">✓ ยืนยันบิล ${bt(grand())}</button></div>`;
}

function doneBody(isBuy) {
  const rows = sumRows();
  const totKg = W.entries.reduce((s, e) => s + e.kg, 0);
  return `
  <div class="donecard"><div class="dico">✓</div><div class="dbill tnum">${esc(W.bill.code)}</div>
    <div class="muted" style="font:500 13px 'Anuphan',sans-serif">บันทึกบิล${isBuy ? 'รับซื้อ' : 'ขาย'}เรียบร้อย${isBuy ? ' · สถานะ: ค้างจ่าย' : (W.receiveNow ? ' · รับเงินแล้ว' : ' · ค้างรับ')}</div>
    <div style="margin-top:14px">
      <div class="drow"><span class="drl">${isBuy ? 'ลูกค้า' : 'ผู้ซื้อ'}</span><span class="drv">${esc(W.name)}${W.phone ? ' · ' + esc(W.phone) : ''}</span></div>
      <div class="drow"><span class="drl">น้ำหนักรวม</span><span class="drv tnum">${kgS(totKg)} กก. · ${W.entries.length} เข่ง</span></div>
      ${rows.map(r => `<div class="drow"><span class="drl">${esc(r.name)} · ${kgS(r.kg)} กก. × ฿${esc(r.price)}</span><span class="drv tnum">${bt(r.satang)}</span></div>`).join('')}
      <div class="drow" style="border-bottom:none"><span class="drv">ยอดรวม</span><span class="drv tnum" style="color:#E8692E;font-size:18px">${bt(grand())}</span></div>
    </div>
    <div class="acts">
      <button class="act" id="w-print"><i data-lucide="printer"></i> ปริ้นบิล</button>
      ${isBuy ? '<button class="act" id="w-topay"><i data-lucide="credit-card"></i> ไปหน้าจ่ายเงิน</button>' : ''}
      <button class="act" data-nav="home"><i data-lucide="home"></i> หน้าหลัก</button>
    </div></div>
  <div style="margin-top:14px"><button class="bigbtn bb-acc" id="w-new">+ เปิดบิลใหม่</button></div>`;
}

// ---------- ใบเสร็จ (print) ----------
function receiptHTML() {
  const rows = sumRows();
  const totKg = W.entries.reduce((s, e) => s + e.kg, 0);
  const gs = [...new Set(W.entries.map(e => e.grade))];
  const t = DB.tenant || {};
  return `<div class="rov"><div><div class="paper">
    <div class="rhd"><div class="rlogo">QF<span class="rlsm">ทุเรียน</span></div>
      <div><div class="rtitle"><b>${esc(t.name || 'QUDSUNFABLE')}</b></div><div class="rsubt">Premium Durian</div>
      <div class="rmeta">ผู้จด: <b>${esc(DB.profile?.name || '')}</b></div></div>
      <div class="rright"><div class="rdoc">${W.type === 'buy' ? 'ใบรับซื้อทุเรียน' : 'ใบขายทุเรียน'}</div>
        <div class="rno tnum">เลขที่ ${esc(W.bill.code)}</div>
        <div class="rno">${new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
        <span class="rcust">● ${esc(W.name)}${W.phone ? ' · ' + esc(W.phone) : ''}</span></div></div>
    <div class="rhr"></div>
    <div class="rgroups">${gs.map(g => {
      const ws = W.entries.filter(e => e.grade === g);
      return `<div class="rgrp"><span class="rchipg">${esc(g)} — ${ws.length} เข่ง</span>
        <span class="rchips">${ws.map(e => `<span class="rchip tnum">${kgS(e.kg)}</span>`).join('')}</span></div>`;
    }).join('')}</div>
    <table class="rtb"><thead><tr><th>หมวด</th><th>น้ำหนัก</th><th>ราคา/กก.</th><th>รวม (฿)</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><div class="rcn">${esc(r.name)}</div><div class="rcs">${r.n} เข่ง</div></td>
        <td>${kgS(r.kg)}</td><td>${esc(r.price)}</td><td>${btd(r.satang)}</td></tr>`).join('')}
      <tr class="rtrow"><td><div>รวม</div><div class="rcs">${W.entries.length} เข่ง</div></td><td>${kgS(totKg)}</td><td></td><td>${btd(grand())}</td></tr>
    </tbody></table>
    ${t.bank ? `<div class="rbank"><i data-lucide="landmark"></i> โอน: ${esc(t.bank)} <b class="tnum">${esc(t.bank_no)}</b></div>` : ''}
    <div class="rsigs"><div class="rsig"><div style="height:26px"></div><div class="rsigl">ลายเซ็นผู้ขาย</div></div>
      <div class="rsig"><div style="height:26px"></div><div class="rsigl">ลายเซ็นผู้ซื้อ</div></div></div>
    <div class="rfoot"><div class="rfx">ขอบคุณที่ไว้วางใจ · ${esc(t.name || '')}${t.phone1 ? '<br>โทร. ' + esc(t.phone1) : ''}</div></div>
  </div>
  <div class="rbtns no-print"><button class="bigbtn bb-pri" style="flex:1" id="r-print"><i data-lucide="printer"></i> ปริ้น</button>
    <button class="bigbtn" style="flex:1;background:#fff;color:#6B4A38" id="r-close">ปิด</button></div>
  </div></div>`;
}

// ---------- wire events ----------
function wire(type, isBuy) {
  document.querySelectorAll('[data-nav]').forEach(el => el.onclick = () => go[el.dataset.nav]());
  const back = document.getElementById('w-back');
  if (back) back.onclick = () => {
    if (W.step === 'record') { W.step = 'start'; render(type); }
    else if (W.step === 'summary') { W.step = 'record'; render(type); }
    else { W = null; go.home(); }
  };

  if (W.step === 'start') {
    (isBuy ? DB.customers() : DB.buyers()).then(list => {
      const el = document.getElementById('w-qpick');
      if (!el) return;
      el.innerHTML = list.slice(0, 8).map(c => `<span class="qp" data-pick="${esc(c.name)}" data-pickphone="${esc(c.phone || '')}">${esc(c.name)}${c.phone ? ' · ' + esc(c.phone) : ''}</span>`).join('') || '<span class="qp">ยังไม่มีรายชื่อ — พิมพ์ชื่อใหม่ได้เลย</span>';
      el.querySelectorAll('[data-pick]').forEach(q => q.onclick = () => {
        document.getElementById('w-name').value = q.dataset.pick;
        document.getElementById('w-phone').value = q.dataset.pickphone;
      });
    }).catch(() => {});
    document.getElementById('w-start').onclick = () => {
      W.name = document.getElementById('w-name').value.trim();
      W.phone = document.getElementById('w-phone').value.trim();
      if (!W.name) { toast('ใส่ชื่อก่อนนะครับ', true); return; }
      W.step = 'record'; render(type);
    };
  }

  if (W.step === 'record') {
    document.querySelectorAll('[data-cat]').forEach(c => c.onclick = () => { W.activeGrade = c.dataset.cat; render(type); });
    document.querySelectorAll('[data-key]').forEach(k => k.onclick = () => {
      const v = k.dataset.key;
      if (v === '⌫') W.input = W.input.slice(0, -1);
      else if (v === '.') { if (!W.input.includes('.')) W.input = (W.input || '0') + '.'; }
      else if (W.input.replace('.', '').length < 5) W.input += v;
      render(type);
    });
    document.querySelectorAll('[data-del]').forEach(x => x.onclick = () => { W.entries.splice(+x.dataset.del, 1); render(type); });
    const addBtn = document.getElementById('w-addcat');
    if (addBtn) addBtn.onclick = () => { W.adding = true; render(type); };
    const okBtn = document.getElementById('w-addcat-ok');
    if (okBtn) okBtn.onclick = async () => {
      const name = document.getElementById('w-newcat').value.trim();
      if (!name) return;
      try {
        loading(true);
        const PAL = ['#E8692E', '#2F9B58', '#C79A3C', '#B65C4F', '#2A6FDB', '#7A7440', '#8C1F2F', '#A07A26'];
        const g = await DB.addGrade(name, PAL[W.grades.length % PAL.length]);
        W.grades.push(g); W.activeGrade = name; W.adding = false; W.newCat = '';
        loading(false); render(type);
      } catch (e) { loading(false); toast(e.message, true); }
    };
    const noBtn = document.getElementById('w-addcat-no');
    if (noBtn) noBtn.onclick = () => { W.adding = false; render(type); };
    document.getElementById('w-save').onclick = () => {
      const kg = parseFloat(W.input);
      if (!kg || kg <= 0) { toast('เคาะน้ำหนักก่อนนะครับ', true); return; }
      W.entries.push({ grade: W.activeGrade, kg });
      W.input = '';
      render(type);
    };
    document.getElementById('w-sum').onclick = () => {
      if (!W.entries.length) { toast('ยังไม่มีเข่งเลยครับ', true); return; }
      W.step = 'summary'; render(type);
    };
  }

  if (W.step === 'summary') {
    document.querySelectorAll('[data-price]').forEach(inp => {
      inp.oninput = () => {
        W.prices[inp.dataset.price] = inp.value;
        const rows = sumRows();
        const r = rows.find(x => x.name === inp.dataset.price);
        inp.parentElement.querySelector('.srt').textContent = bt(r.satang);
        document.querySelector('.total .tv').textContent = bt(grand());
        const cf = document.getElementById('w-confirm');
        cf.textContent = '✓ ยืนยันบิล ' + bt(grand());
        cf.className = 'bigbtn ' + (grand() > 0 ? (isBuy ? 'bb-pri' : 'bb-grn') : 'bb-dis');
      };
    });
    const recv = document.getElementById('w-recv');
    if (recv) recv.onchange = () => { W.receiveNow = recv.checked; };
    document.getElementById('w-confirm').onclick = async () => {
      const rows = sumRows();
      if (rows.some(r => !(parseFloat(r.price) > 0))) { toast('ตั้งราคาให้ครบทุกหมวดก่อนครับ', true); return; }
      try {
        loading(true);
        const party = isBuy ? await DB.findOrCreateCustomer(W.name, W.phone) : await DB.findOrCreateBuyer(W.name, W.phone);
        W.partyId = party.id;
        const items = rows.map(r => ({ grade: r.name, kg: r.kg, price_satang: Math.round(parseFloat(r.price) * 100) }));
        const splits = (!isBuy && W.receiveNow) ? [{ wallet_code: W.receiveWallet, amount_satang: rows.reduce((s, r) => s + r.satang, 0) }] : null;
        W.bill = await DB.createBill(W.type, W.partyId, items, '', splits);
        W.step = 'done';
        loading(false); render(type);
        toast('บันทึกบิล ' + W.bill.code + ' สำเร็จ');
      } catch (e) { loading(false); toast(e.message, true); }
    };
  }

  if (W.step === 'done') {
    document.getElementById('w-new').onclick = () => { W = null; render(type); };
    const pr = document.getElementById('w-print');
    if (pr) pr.onclick = () => {
      const d = document.createElement('div');
      d.innerHTML = receiptHTML();
      d.className = 'scr-buy';
      document.body.appendChild(d);
      icons();
      d.querySelector('#r-close').onclick = () => d.remove();
      d.querySelector('#r-print').onclick = () => window.print();
    };
    const tp = document.getElementById('w-topay');
    if (tp) tp.onclick = () => { W = null; go.bills(); };
  }
}

return { renderBuy: () => render('buy'), renderSell: () => render('sell') };
})();
