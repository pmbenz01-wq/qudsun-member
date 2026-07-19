// ============================================================
// Qudsunfable 2 — app (Phase 1: Auth → Setup → Lock → Home)
// ============================================================
'use strict';
const root = document.getElementById('root');
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const baht = (satang) => '฿' + Math.round(satang / 100).toLocaleString('th-TH');
const kgF = (kg) => (+kg).toLocaleString('th-TH', { maximumFractionDigits: 0 });
const icons = () => { if (window.lucide) try { lucide.createIcons(); } catch (e) {} };

function toast(msg, err) {
  document.querySelectorAll('.qf-toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'qf-toast' + (err ? ' err' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}
function loading(on) {
  document.querySelectorAll('.qf-load').forEach(t => t.remove());
  if (on) { const d = document.createElement('div'); d.className = 'qf-load'; d.innerHTML = '<span></span>'; document.body.appendChild(d); }
}

// ============ AUTH (อีเมล+รหัสผ่าน สไตล์ Login Bold) ============
let authMode = 'in';
function renderAuth() {
  root.innerHTML = `
  <div class="app scr-login scr-auth">
    <span class="ghostbg">QF</span>
    <div class="top"><div class="logo">QF</div><div class="brand">QUDSUNFABLE</div><div class="tag">ระบบรับซื้อ-ขายทุเรียน</div></div>
    <div class="sheet">
      <div class="wel">${authMode === 'in' ? 'ยินดีต้อนรับกลับ' : 'สร้างบัญชีใหม่'}</div>
      <div class="welsub">${authMode === 'in' ? 'เข้าสู่ระบบด้วยอีเมลของร้าน' : 'สมัครแล้วสร้างร้านได้ทันที'}</div>
      <div class="field"><div class="flab">อีเมล</div><input id="au-email" type="email" placeholder="you@example.com" autocomplete="username"></div>
      <div class="field"><div class="flab">รหัสผ่าน</div><input id="au-pass" type="password" placeholder="อย่างน้อย 6 ตัวอักษร" autocomplete="current-password"></div>
      <div class="errmsg2" id="au-err"></div>
      <button class="prim" id="au-go">${authMode === 'in' ? 'เข้าสู่ระบบ' : 'สมัครใหม่'}</button>
      <div class="swap" id="au-swap">${authMode === 'in' ? 'ยังไม่มีบัญชี? <b>สมัครใหม่</b>' : 'มีบัญชีแล้ว? <b>เข้าสู่ระบบ</b>'}</div>
      <div class="foot" style="margin-top:auto">Qudsunfable · v2.0</div>
    </div>
  </div>`;
  icons();
  $('#au-swap').onclick = () => { authMode = authMode === 'in' ? 'up' : 'in'; renderAuth(); };
  $('#au-pass').addEventListener('keydown', e => { if (e.key === 'Enter') $('#au-go').click(); });
  $('#au-go').onclick = async () => {
    const email = $('#au-email').value.trim(), password = $('#au-pass').value;
    $('#au-err').textContent = '';
    if (!email || !password) { $('#au-err').textContent = 'กรอกอีเมลและรหัสผ่านก่อน'; return; }
    try {
      loading(true);
      if (authMode === 'up') await DB.signUp(email, password);
      else await DB.signIn(email, password);
      await route();
    } catch (e) { $('#au-err').textContent = e.message; }
    finally { loading(false); }
  };
}

// ============ SETUP (สร้างร้าน / เข้าร่วม) ============
let setupMode = 'create';
function renderSetup() {
  root.innerHTML = `
  <div class="app scr-login scr-auth">
    <span class="ghostbg">QF</span>
    <div class="top"><div class="logo">QF</div><div class="brand">QUDSUNFABLE</div><div class="tag">อีกนิดเดียว!</div></div>
    <div class="sheet">
      <div class="wel">ตั้งค่าร้านของคุณ</div>
      <div class="welsub">เลือกอย่างใดอย่างหนึ่ง</div>
      <div class="who">
        <button class="wcard ${setupMode === 'create' ? 'on' : ''}" id="su-create"><div class="wa">🏪</div><div class="wn">สร้างร้านใหม่</div><div class="ws">ฉันเป็นเจ้าของ</div></button>
        <button class="wcard ${setupMode === 'join' ? 'on' : ''}" id="su-join"><div class="wa">🤝</div><div class="wn">เข้าร่วมร้าน</div><div class="ws">มีรหัสเชิญ</div></button>
      </div>
      <div class="field"><div class="flab">ชื่อของคุณ</div><input id="su-name" placeholder="เช่น พี่เบนซ์"></div>
      <div class="field" id="su-f2">${setupMode === 'create'
        ? '<div class="flab">ชื่อร้าน/ล้ง</div><input id="su-shop" placeholder="เช่น ล้งทุเรียนพี่เบนซ์">'
        : '<div class="flab">รหัสเชิญ (ขอจากเจ้าของร้าน)</div><input id="su-code" placeholder="เช่น a1b2c3d4">'}</div>
      <div class="errmsg2" id="su-err"></div>
      <button class="prim" id="su-go">เริ่มใช้งาน</button>
      <div class="swap" id="su-out"><b>ออกจากระบบ</b></div>
    </div>
  </div>`;
  icons();
  $('#su-create').onclick = () => { setupMode = 'create'; renderSetup(); };
  $('#su-join').onclick = () => { setupMode = 'join'; renderSetup(); };
  $('#su-out').onclick = async () => { await DB.signOut(); route(); };
  $('#su-go').onclick = async () => {
    $('#su-err').textContent = '';
    try {
      loading(true);
      if (setupMode === 'create') await DB.bootstrapTenant($('#su-shop').value, $('#su-name').value);
      else await DB.joinTenant($('#su-code').value, $('#su-name').value);
      await route();
    } catch (e) { $('#su-err').textContent = e.message; }
    finally { loading(false); }
  };
}

// ============ LOCK (เลือกผู้ใช้ + PIN — ตามดีไซน์) ============
let pinBuf = '', lockUsers = [], lockPick = 0;
function renderLock() {
  const dots = [0, 1, 2, 3].map(i => i < pinBuf.length ? 'dot on' : 'dot').join('"></div><div class="');
  root.innerHTML = `
  <div class="app scr-login">
    <span class="ghostbg">QF</span>
    <div class="top"><div class="logo">QF</div><div class="brand">${esc(DB.tenant?.name || 'QUDSUNFABLE')}</div><div class="tag">ใส่ PIN ร้านเพื่อเข้าใช้งาน</div></div>
    <div class="sheet">
      <div class="wel">ยินดีต้อนรับกลับ</div>
      <div class="welsub">เลือกผู้ใช้แล้วใส่ PIN เพื่อเข้าสู่ระบบ</div>
      <div class="who">${lockUsers.slice(0, 3).map((u, i) => `
        <button class="wcard ${i === lockPick ? 'on' : ''}" data-pick="${i}">
          <div class="wa">${u.role === 'owner' ? '👑' : '🧑‍🌾'}</div>
          <div class="wn">${esc(u.name)}</div>
          <div class="ws">${u.role === 'owner' ? 'เจ้าของร้าน' : 'พนักงาน'}</div>
        </button>`).join('')}</div>
      <div class="pinlab">ใส่ PIN 4 หลัก</div>
      <div class="dots"><div class="${dots}"></div></div>
      <div class="errmsg" id="lk-err"></div>
      <div class="pad">
        ${['1','2','3','4','5','6','7','8','9','ล้าง','0','⌫'].map(k => `<button class="key" data-k="${k}">${k}</button>`).join('')}
      </div>
      <div class="foot">ลืม PIN? เจ้าของร้านตั้งใหม่ได้ในตั้งค่า · v2.0</div>
    </div>
  </div>`;
  icons();
  root.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { lockPick = +b.dataset.pick; renderLock(); });
  root.querySelectorAll('[data-k]').forEach(b => b.onclick = async () => {
    const k = b.dataset.k;
    if (k === 'ล้าง') pinBuf = '';
    else if (k === '⌫') pinBuf = pinBuf.slice(0, -1);
    else if (pinBuf.length < 4) pinBuf += k;
    if (pinBuf.length === 4) {
      try {
        loading(true);
        const ok = await DB.checkPin(pinBuf);
        pinBuf = '';
        if (!ok) { renderLock(); $('#lk-err').textContent = 'PIN ไม่ถูกต้อง'; loading(false); return; }
        sessionStorage.setItem('qf2_unlocked', '1');
        sessionStorage.setItem('qf2_operator', lockUsers[lockPick]?.name || '');
        loading(false);
        renderHome();
      } catch (e) { loading(false); pinBuf = ''; renderLock(); $('#lk-err').textContent = e.message; }
    } else renderLock();
  });
}

// ============ HOME ============
async function renderHome() {
  loading(true);
  let d;
  try { d = await DB.homeData(); } catch (e) { loading(false); toast(e.message, true); return; }
  loading(false);
  const max = Math.max(1, ...d.days.map(x => Math.max(x.buy, x.sell)));
  const totalW = d.wallets.reduce((s, w) => s + +w.balance_satang, 0);
  const profit = d.sum.sell.satang - d.sum.buy.satang;
  const remKg = d.sum.buy.kg - d.sum.sell.kg;
  const dateTH = new Date().toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  root.innerHTML = `
  <div class="app scr-home">
    <div class="hdr"><div class="logo">QF</div><div><div class="hname">${esc(DB.tenant.name)}</div><div class="hsub">ระบบรับซื้อ-ขายทุเรียน</div></div>
      <button class="bell" id="h-bell"><i data-lucide="bell"></i></button></div>
    <div class="hero"><span class="heroglow"></span>
      <div class="herotop"><span class="herolab"><i data-lucide="sparkles" style="width:14px;height:14px"></i> สรุปวันนี้</span><span class="datepill tnum">${dateTH}</span></div>
      <div class="herocols">
        <div class="hcol"><div class="hcap"><span class="dot" style="background:#E8692E"></span>รับซื้อ</div><div class="hval tnum">${baht(d.sum.buy.satang)}</div><div class="hunit tnum">${kgF(d.sum.buy.kg)} กก. · ${d.sum.buy.n} บิล</div></div>
        <div class="hdiv"></div>
        <div class="hcol"><div class="hcap"><span class="dot" style="background:#3FBF6B"></span>ขาย</div><div class="hval tnum">${baht(d.sum.sell.satang)}</div><div class="hunit tnum">${kgF(d.sum.sell.kg)} กก. · ${d.sum.sell.n} บิล</div></div>
      </div>
      <div class="profit"><span class="pl">กำไรวันนี้ · คงเหลือ ${kgF(Math.max(0, remKg))} กก.</span>
        <span class="pv tnum"><i data-lucide="trending-up" style="width:15px;height:15px"></i>${profit >= 0 ? '+' : '−'}${baht(Math.abs(profit))}</span></div>
    </div>
    ${d.due.n ? `<div class="due"><div class="dico"><i data-lucide="receipt-text"></i></div>
      <div><div class="dt">บิลค้างจ่าย</div><div class="dsub tnum">${d.due.n} บิล · รวม ${baht(d.due.satang)}</div></div>
      <button class="paybtn" id="h-pay">ไปจ่าย <i data-lucide="arrow-right"></i></button></div>` : ''}
    <div class="qa">
      <button class="qcard" style="background:linear-gradient(150deg,#EE7A40,#D24E1C)" id="h-buy"><div class="qic"><i data-lucide="shopping-cart"></i></div><div class="qname">รับซื้อ</div><div class="qsub">เปิดบิล · จดกิโล</div><span class="qcta" style="color:#D24E1C">เปิดบิลใหม่ <i data-lucide="arrow-right"></i></span></button>
      <button class="qcard" style="background:linear-gradient(150deg,#48A968,#2F7E48)" id="h-sell"><div class="qic"><i data-lucide="banknote"></i></div><div class="qname">ขาย</div><div class="qsub">บันทึกขายวันนี้</div><span class="qcta" style="color:#2F7E48">บันทึกขาย <i data-lucide="arrow-right"></i></span></button>
    </div>
    <div class="sec"><span class="sect">กระเป๋าเงิน <span class="sectsum tnum">รวม ${baht(totalW)}</span></span><a class="seemore" id="h-wallet">ดูทั้งหมด <i data-lucide="chevron-right"></i></a></div>
    <div class="wscroll">${d.wallets.map(w => `
      <div class="wcard"><div class="wtop"><div class="wdot" style="background:${esc(w.color)}"><i data-lucide="${esc(w.icon)}"></i></div><div class="wlab">${esc(w.name)}</div></div><div class="wval tnum">${baht(w.balance_satang)}</div></div>`).join('')}</div>
    <div class="sec"><span class="sect">แนวโน้ม 7 วัน</span><span class="seemore">ดูรายงาน <i data-lucide="chevron-right"></i></span></div>
    <div class="chartcard"><div class="bars">${d.days.map(x => `
      <div class="bcol"><div class="bpair"><div class="bar" style="background:#E8692E;height:${Math.round(x.buy / max * 92)}px"></div><div class="bar" style="background:#3FBF6B;height:${Math.round(x.sell / max * 92)}px"></div></div><div class="bday">${x.label}</div></div>`).join('')}</div>
      <div class="legend"><span><span class="ldot" style="background:#E8692E"></span>รับซื้อ</span><span><span class="ldot" style="background:#3FBF6B"></span>ขาย</span></div></div>
    <div class="sec"><span class="sect">โมดูลอื่น ๆ</span></div>
    <div class="mgrid">
      <div class="mtile" data-soon="ลูกค้า"><div class="mtic" style="background:#FCEDE3;color:#E8692E"><i data-lucide="users"></i></div><div><div class="mtn">ลูกค้า</div><div class="mts">ทะเบียน · ธนาคาร</div></div></div>
      <div class="mtile" data-soon="พนักงาน"><div class="mtic" style="background:#E9F3EC;color:#2F9B58"><i data-lucide="user-cog"></i></div><div><div class="mtn">พนักงาน</div><div class="mts">ค่าแรง · โบนัส</div></div></div>
      <div class="mtile" data-soon="ประวัติบิล"><div class="mtic" style="background:#F1E9DC;color:#8A6A4A"><i data-lucide="history"></i></div><div><div class="mtn">ประวัติบิล</div><div class="mts">ซื้อ + ขายทั้งหมด</div></div></div>
      <div class="mtile" data-soon="ตั้งค่า"><div class="mtic" style="background:#ECECEC;color:#5B5B5B"><i data-lucide="settings"></i></div><div><div class="mtn">ตั้งค่า</div><div class="mts">เรท · หมวด · PIN</div></div></div>
    </div>
    <div class="swap" id="h-out" style="text-align:center;margin:18px 0 6px;font:600 12px 'Anuphan',sans-serif;color:#8A7767;cursor:pointer">ออกจากระบบ</div>
    <div class="tabbar">
      <div class="tab tab-on"><i data-lucide="home"></i>หน้าหลัก</div>
      <div class="tab" id="t-buy"><i data-lucide="shopping-cart"></i>รับซื้อ</div>
      <div class="tab" id="t-sell"><i data-lucide="banknote"></i>ขาย</div>
      <div class="tab" id="t-wallet"><i data-lucide="wallet"></i>กระเป๋า</div>
      <div class="tab" data-soon="อื่น ๆ"><i data-lucide="menu"></i>อื่น ๆ</div>
    </div>
  </div>`;
  icons();
  const soon = (n) => toast(n + ' — กำลังสร้างในเฟสถัดไป');
  root.querySelectorAll('[data-soon]').forEach(el => el.onclick = () => soon(el.dataset.soon));
  ['h-buy', 't-buy'].forEach(id => $('#' + id).onclick = () => soon('หน้ารับซื้อ'));
  ['h-sell', 't-sell'].forEach(id => $('#' + id).onclick = () => soon('หน้าขาย'));
  ['h-wallet', 't-wallet'].forEach(id => { const el = $('#' + id); if (el) el.onclick = () => soon('หน้ากระเป๋าเงิน'); });
  const pay = $('#h-pay'); if (pay) pay.onclick = () => soon('หน้าบิลค้างจ่าย');
  $('#h-bell').onclick = () => soon('แจ้งเตือน');
  $('#h-out').onclick = async () => { sessionStorage.removeItem('qf2_unlocked'); await DB.signOut(); route(); };
}

// ============ ROUTER ============
async function route() {
  loading(true);
  try {
    const st = await DB.loadContext();
    loading(false);
    if (!st) { renderAuth(); return; }
    if (st === 'setup') { renderSetup(); return; }
    // มีร้านแล้ว: ถ้าตั้ง PIN ไว้และยังไม่ปลดล็อก → หน้า PIN
    if (DB.settings?.pin_hash && sessionStorage.getItem('qf2_unlocked') !== '1') {
      lockUsers = await DB.members();
      lockPick = 0; pinBuf = '';
      renderLock();
      return;
    }
    renderHome();
  } catch (e) {
    loading(false);
    renderAuth();
    setTimeout(() => toast(e.message, true), 100);
  }
}
route();
