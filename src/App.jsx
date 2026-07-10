import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation, useParams, Routes, Route, Navigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { CATS, TIERS, REQUIRE_NAME } from './utils/constants.js';
import {
  fmtKg, fmtBaht, fmtPrice, timeStr, dateStr,
  catLabel, catAccent, tierOf, tierBadge,
  agg, grandKg, grandBaht, customLabelRows, billLink, billCode, newBillNo, newSaleBillNo,
  loadCustomers, customerStat, decodeBill
} from './utils/helpers.js';
import { storage } from './utils/storage.js';
import { db } from './utils/db.js';
import { savePhoto, loadPhoto, resizeImage } from './utils/photoDB.js';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// ─── Keypad ───────────────────────────────────────────────────────────────────
function Keypad({ value, onChange, onConfirm, confirmLabel }) {
  const D = { border: '1px solid #E4D7BC', background: '#FBF6EC', borderRadius: 13, padding: '18px 0', fontFamily: 'Prompt', fontWeight: 500, fontSize: 24, color: '#3F2D1E', cursor: 'pointer' };
  const F = { border: '1px solid #E0D2B4', background: '#F3E9D2', borderRadius: 13, padding: '18px 0', fontSize: 22, color: '#7A5A22', cursor: 'pointer' };
  const keys = [
    { ch: '1', s: D }, { ch: '2', s: D }, { ch: '3', s: D },
    { ch: '4', s: D }, { ch: '5', s: D }, { ch: '6', s: D },
    { ch: '7', s: D }, { ch: '8', s: D }, { ch: '9', s: D },
    { ch: '.', s: F }, { ch: '0', s: D }, { ch: '⌫', s: F },
  ];
  const press = ch => {
    if (ch === '⌫') { onChange(value.slice(0, -1)); return; }
    if (ch === '.') { if (!value.includes('.')) onChange((value || '0') + '.'); return; }
    const v = value === '0' ? ch : value + ch;
    if (v.length <= 7) onChange(v);
  };
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {keys.map(k => <button key={k.ch} onClick={() => press(k.ch)} style={k.s}>{k.ch}</button>)}
      </div>
    </div>
  );
}

function hashColor(str) {
  const palette = ['#E07B54','#5B9BD5','#6DAA73','#B07DB0','#D4A843','#5BA8A0','#C06070','#7B8FC4','#9A7B4F','#6DAA8A'];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

// ─── PinModal ─────────────────────────────────────────────────────────────────
function PinModal({ title, error, value, onKey, onCancel }) {
  const S = { border: '1px solid #E4D7BC', background: '#FBF6EC', borderRadius: 13, padding: '16px 0', fontFamily: 'Prompt', fontWeight: 500, fontSize: 22, color: '#3F2D1E', cursor: 'pointer' };
  const F = { border: '1px solid #E0D2B4', background: '#F3E9D2', borderRadius: 13, padding: '16px 0', fontSize: 20, color: '#7A5A22', cursor: 'pointer' };
  const keys = ['1','2','3','4','5','6','7','8','9','⌫','0','✓'];
  return (
    <div className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(42,33,24,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, animation: 'fadeIn .2s' }}>
      <div style={{ background: '#FFFDF8', borderRadius: 20, padding: 24, width: '100%', maxWidth: 340, animation: 'popIn .25s' }}>
        <div style={{ textAlign: 'center', marginBottom: 6, fontSize: 26 }}>🔒</div>
        <h3 style={{ textAlign: 'center', fontFamily: 'Prompt', fontWeight: 500, fontSize: 18, margin: '0 0 4px', color: '#4A3526' }}>ใส่รหัสเพื่อแก้ไข</h3>
        <p style={{ textAlign: 'center', fontSize: 13, color: '#9A8662', margin: '0 0 16px' }}>{title}</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
          {[0,1,2,3].map(i => <span key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < value.length ? '#C9A24B' : '#E4D7BC', border: '1.5px solid #C9A24B', display: 'inline-block' }} />)}
        </div>
        <p style={{ textAlign: 'center', fontSize: 12, color: '#C0392B', minHeight: 16, margin: '0 0 10px' }}>{error}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {keys.map(k => <button key={k} onClick={() => onKey(k === '⌫' ? 'del' : k === '✓' ? 'ok' : k)} style={k === '⌫' || k === '✓' ? F : S}>{k}</button>)}
        </div>
        <button onClick={onCancel} style={{ width: '100%', marginTop: 12, border: 'none', background: 'transparent', color: '#9A8662', fontSize: 14, cursor: 'pointer', padding: 8 }}>ยกเลิก</button>
      </div>
    </div>
  );
}

// ─── NumModal ─────────────────────────────────────────────────────────────────
function NumModal({ title, unit, value, onChange, onSave, onCancel, onDelete, saveLabel, canDelete }) {
  return (
    <div className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(42,33,24,.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fadeIn .2s' }}>
      <div style={{ background: '#FFFDF8', borderRadius: '22px 22px 0 0', padding: '20px 18px calc(20px + env(safe-area-inset-bottom))', width: '100%', maxWidth: 480, animation: 'slideUp .28s' }}>
        <div style={{ width: 42, height: 4, background: '#E0D2B4', borderRadius: 4, margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontWeight: 600, color: '#4A3526' }}>{title}</span>
          {canDelete && <button onClick={onDelete} style={{ border: '1px solid #E0B4A2', background: '#FBEEE8', color: '#B5503A', borderRadius: 10, padding: '7px 12px', fontSize: 13, cursor: 'pointer' }}>🗑 ลบเข่งนี้</button>}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, background: '#FBF6EC', borderRadius: 14, padding: 14, marginBottom: 14 }}>
          <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 40, color: '#3F2D1E' }}>{value || '0'}</span>
          <span style={{ fontSize: 15, color: '#A6925E' }}>{unit}</span>
        </div>
        <Keypad value={value} onChange={onChange} />
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button onClick={onCancel} style={{ flex: 1, border: '1px solid #E4D7BC', background: '#fff', borderRadius: 13, padding: 15, fontSize: 15, color: '#7A6450', cursor: 'pointer' }}>ยกเลิก</button>
          <button onClick={onSave} style={{ flex: 2, border: 'none', borderRadius: 13, padding: 15, background: 'linear-gradient(135deg,#C9A24B,#A8763E)', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>{saveLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div className="no-print" style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', zIndex: 70, background: '#2A2118', color: '#F6EEDD', padding: '12px 20px', borderRadius: 30, fontSize: 14, boxShadow: '0 8px 20px rgba(0,0,0,.25)', animation: 'popIn .25s', whiteSpace: 'nowrap' }}>
      {msg}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────
function Header() {
  return (
    <div className="no-print" style={{ background: '#FBF6EC', borderBottom: '1px solid #E4D7BC', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <img src="/logo.jpg" alt="Qudsun" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} />
      <div>
        <div style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 15, color: '#4A3526', letterSpacing: '.04em' }}>QUDSUN</div>
        <div style={{ fontSize: 10, color: '#A6925E', letterSpacing: '.1em' }}>ระบบรับซื้อทุเรียน</div>
      </div>
    </div>
  );
}

// ─── TierBadge ────────────────────────────────────────────────────────────────
const TIER_GRAD = {
  silver: { bg: 'linear-gradient(105deg,#B0B8C0 0%,#E2E6EA 45%,#9AA3AC 100%)', color: '#3A3F45' },
  gold:   { bg: 'linear-gradient(105deg,#A8780A 0%,#E8C040 45%,#B8900C 100%)', color: '#fff' },
  ruby:   { bg: 'linear-gradient(105deg,#6B0018 0%,#B02030 50%,#780020 100%)', color: '#FFD8DC' },
  crown:  { bg: 'linear-gradient(105deg,#0D0620 0%,#2A0E5C 45%,#C9A024 100%)', color: '#FFE88A' },
};
function TierBadge({ tier, size }) {
  const lg = size === 'lg';
  const g = TIER_GRAD[tier.key] || TIER_GRAD.silver;
  return (
    <span style={{
      display: 'inline-block', borderRadius: 6,
      padding: lg ? '5px 18px' : '2px 10px',
      fontSize: lg ? 13 : 10,
      fontFamily: 'Prompt', fontWeight: 700, letterSpacing: '.12em',
      textTransform: 'uppercase',
      background: g.bg, color: g.color,
      boxShadow: '0 1px 4px rgba(0,0,0,.18)',
    }}>
      {tier.label}
    </span>
  );
}
function tierBgColor(t) {
  const m = t.badge.match(/background:([^;]+)/); return m ? m[1].trim() : '#F0E9DA';
}
function tierTextColor(t) {
  const m = t.badge.match(/color:([^;]+)/); return m ? m[1].trim() : '#A6925E';
}
function tierBorder(t) {
  const m = t.badge.match(/border:([^;]+)/); return m ? m[1].trim() : 'none';
}

// ─── LoginScreen ──────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, error, onErrorClear }) {
  const [value, setValue] = useState('');
  const D = { border: '1px solid #E4D7BC', background: '#FBF6EC', borderRadius: 13, padding: '18px 0', fontFamily: 'Prompt', fontWeight: 500, fontSize: 22, color: '#3F2D1E', cursor: 'pointer' };
  const F = { border: '1px solid #E0D2B4', background: '#F3E9D2', borderRadius: 13, padding: '18px 0', fontSize: 20, color: '#7A5A22', cursor: 'pointer' };
  const keys = ['1','2','3','4','5','6','7','8','9','⌫','0','✓'];

  const handleKey = k => {
    onErrorClear();
    if (k === '⌫') { setValue(v => v.slice(0, -1)); return; }
    if (k === '✓') { if (value.length >= 4) onLogin(value); return; }
    setValue(v => {
      if (v.length >= 4) return v;
      const next = v + k;
      if (next.length === 4) setTimeout(() => { onLogin(next); setValue(''); }, 120);
      return next;
    });
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#EFE6D4', padding: 24 }}>
      <img src="/logo.jpg" alt="Qudsun" style={{ width: 80, borderRadius: 16, marginBottom: 14 }} />
      <div style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 22, color: '#4A3526', marginBottom: 2 }}>QUDSUN</div>
      <div style={{ fontSize: 13, color: '#A6925E', marginBottom: 28, letterSpacing: '.08em' }}>ระบบรับซื้อทุเรียน</div>
      <div style={{ background: '#FFFDF8', borderRadius: 20, padding: '22px 20px', width: '100%', maxWidth: 320, boxShadow: '0 12px 32px rgba(95,70,40,.12)' }}>
        <h3 style={{ textAlign: 'center', fontFamily: 'Prompt', fontWeight: 500, fontSize: 17, margin: '0 0 16px', color: '#4A3526' }}>ใส่รหัสเข้าใช้งาน</h3>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 6 }}>
          {[0,1,2,3].map(i => <span key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < value.length ? '#C9A24B' : '#E4D7BC', border: '1.5px solid #C9A24B', display: 'inline-block', transition: 'background .15s' }} />)}
        </div>
        <p style={{ textAlign: 'center', fontSize: 12, color: '#C0392B', minHeight: 18, margin: '0 0 12px' }}>{error}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {keys.map(k => <button key={k} onClick={() => handleKey(k)} style={k === '⌫' || k === '✓' ? F : D}>{k}</button>)}
        </div>
      </div>
      <p style={{ marginTop: 20, fontSize: 11, color: '#B7A684' }}>ผู้ดูแลระบบ: ใส่รหัส Admin · พนักงาน: ใส่รหัส Employee</p>
    </div>
  );
}

// ─── RecorderModal ────────────────────────────────────────────────────────────
function RecorderModal({ onSave, onSkip }) {
  const [name, setName] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(42,33,24,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, animation: 'fadeIn .2s' }}>
      <div style={{ background: '#FFFDF8', borderRadius: 20, padding: 24, width: '100%', maxWidth: 320, animation: 'popIn .25s' }}>
        <div style={{ textAlign: 'center', fontSize: 28, marginBottom: 8 }}>✍️</div>
        <h3 style={{ textAlign: 'center', fontFamily: 'Prompt', fontWeight: 500, fontSize: 17, margin: '0 0 4px', color: '#4A3526' }}>ชื่อผู้บันทึก</h3>
        <p style={{ textAlign: 'center', fontSize: 12, color: '#9A8662', margin: '0 0 16px' }}>ชื่อจะแสดงบนทุกบิลที่บันทึกในรอบนี้</p>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSave(name.trim()); }}
          placeholder="เช่น พี่โอ๋, น้องมิ้น…"
          style={{ width: '100%', border: '1.5px solid #E4D7BC', borderRadius: 12, padding: 14, fontSize: 16, color: '#3F2D1E', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onSkip} style={{ flex: 1, border: '1px solid #E4D7BC', background: '#fff', borderRadius: 12, padding: 12, fontSize: 14, color: '#9A8662', cursor: 'pointer' }}>ข้าม</button>
          <button onClick={() => name.trim() && onSave(name.trim())} style={{ flex: 2, border: 'none', background: name.trim() ? '#3F2D1E' : '#C8B998', color: '#F6EEDD', borderRadius: 12, padding: 12, fontWeight: 600, fontSize: 15, cursor: name.trim() ? 'pointer' : 'default' }}>ยืนยัน →</button>
        </div>
      </div>
    </div>
  );
}

// ─── EmployeeManager ──────────────────────────────────────────────────────────
function EmployeeManager({ employees, onSave, onCancel }) {
  const [list, setList] = useState(employees.map(e => ({ ...e, id: Math.random() })));
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ pin: '', name: '' });
  const [formErr, setFormErr] = useState('');

  const openAdd = () => { setAdding(true); setEditId(null); setForm({ pin: '', name: '' }); setFormErr(''); };
  const openEdit = item => { setEditId(item.id); setAdding(false); setForm({ pin: item.pin, name: item.name }); setFormErr(''); };
  const closeForm = () => { setAdding(false); setEditId(null); setFormErr(''); };

  const saveForm = () => {
    const p = form.pin.trim(), n = form.name.trim();
    if (!p || p.length < 4) { setFormErr('PIN ต้องมี 4 หลัก'); return; }
    if (!/^\d{4,}$/.test(p)) { setFormErr('PIN ตัวเลขเท่านั้น'); return; }
    if (!n) { setFormErr('ต้องใส่ชื่อ'); return; }
    const dup = list.find(e => e.pin === p && e.id !== editId);
    if (dup) { setFormErr(`PIN ${p} ซ้ำกับ "${dup.name}"`); return; }
    if (editId) {
      setList(l => l.map(e => e.id === editId ? { ...e, pin: p, name: n } : e));
    } else {
      setList(l => [...l, { pin: p, name: n, id: Math.random() }]);
    }
    closeForm();
  };

  const remove = id => setList(l => l.filter(e => e.id !== id));

  const rowStyle = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#FBF6EC', borderRadius: 11, marginBottom: 8, border: '1px solid #EDE0C8' };
  const btnSm = (bg, color) => ({ border: 'none', background: bg, color, borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'Prompt' });
  const inp = { width: '100%', border: '1.5px solid #E4D7BC', borderRadius: 10, padding: '10px 12px', fontSize: 15, color: '#3F2D1E', outline: 'none', boxSizing: 'border-box', marginBottom: 8 };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(42,33,24,.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 18, animation: 'fadeIn .2s' }}>
      <div style={{ background: '#FFFDF8', borderRadius: 20, padding: 22, width: '100%', maxWidth: 380, maxHeight: '85dvh', display: 'flex', flexDirection: 'column', animation: 'popIn .25s' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontFamily: 'Prompt', fontWeight: 600, fontSize: 17, color: '#4A3526' }}>👥 จัดการพนักงาน</h3>
          <button onClick={openAdd} style={{ border: 'none', background: '#3F2D1E', color: '#F6EEDD', borderRadius: 10, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>+ เพิ่ม</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12 }}>
          {list.length === 0 && <p style={{ textAlign: 'center', color: '#B7A684', fontSize: 13 }}>ยังไม่มีพนักงาน</p>}
          {list.map(emp => (
            <div key={emp.id} style={rowStyle}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#3F2D1E' }}>{emp.name}</div>
                <div style={{ fontSize: 12, color: '#A6925E', letterSpacing: '0.1em' }}>PIN: {'●'.repeat(emp.pin.length)}</div>
              </div>
              <button onClick={() => openEdit(emp)} style={btnSm('#F3E9D2', '#7A5A22')}>แก้ไข</button>
              <button onClick={() => remove(emp.id)} style={btnSm('#FBEEE8', '#B5503A')}>ลบ</button>
            </div>
          ))}

          {(adding || editId) && (
            <div style={{ background: '#F0E9D8', borderRadius: 13, padding: 14, marginTop: 8, border: '1.5px solid #DDD0B0' }}>
              <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: '#4A3526' }}>{editId ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงานใหม่'}</p>
              <input style={inp} placeholder="ชื่อพนักงาน เช่น จด1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <input style={inp} placeholder="PIN 4 หลัก" type="number" maxLength={4} value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value.slice(0, 4) }))} />
              {formErr && <p style={{ color: '#C0392B', fontSize: 12, margin: '-4px 0 8px' }}>{formErr}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={closeForm} style={{ flex: 1, border: '1px solid #E4D7BC', background: '#fff', borderRadius: 10, padding: 10, fontSize: 13, color: '#9A8662', cursor: 'pointer' }}>ยกเลิก</button>
                <button onClick={saveForm} style={{ flex: 2, border: 'none', background: '#3F2D1E', color: '#F6EEDD', borderRadius: 10, padding: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>บันทึก</button>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, border: '1px solid #E4D7BC', background: '#fff', borderRadius: 12, padding: 12, fontSize: 14, color: '#9A8662', cursor: 'pointer' }}>ยกเลิก</button>
          <button onClick={() => onSave(list.map(({ pin, name }) => ({ pin, name })))} style={{ flex: 2, border: 'none', background: '#3F2D1E', color: '#F6EEDD', borderRadius: 12, padding: 12, fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>บันทึกทั้งหมด ✓</button>
        </div>
      </div>
    </div>
  );
}

// ─── HomeView ─────────────────────────────────────────────────────────────────
function HomeView({ session, history, saleHistory, payments, pendingPurchaseCount, syncing, syncStatus, onSyncNow, onOpenSheet, onNew, onResume, onGoCustomers, onGoDashboard, onGoSupervisors, onGoSales, onNewSale, saleSession, onResumeSale, onChangePin, onSetEmployeePin, onOpenHistory, onOpenSaleHistory, onPayment, onDeleteBill, onDeleteSaleBill, pin, verified, supervisors, isEmployee, onLogout, onExport, onImport, onGoHistory, onResetData, onGoWallet }) {
  const customerCount = Object.keys(loadCustomers(history)).length;
  const supervisorCount = Object.values(supervisors || {}).filter(Boolean).reduce((set, n) => (set.add(n), set), new Set()).size;
  const nUnpaidPurchase = pendingPurchaseCount !== null && pendingPurchaseCount !== undefined
    ? pendingPurchaseCount
    : history.filter(b => { const p = payments[b.billNo]; return !p || p.status === 'unpaid'; }).length;
  const nRecentSale = saleHistory.length;
  if (isEmployee) {
    return (
      <div style={{ flex: 1, maxWidth: 480, width: '100%', margin: '0 auto', padding: '32px 14px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 16, color: '#4A3526' }}>โหมดพนักงาน</div>
          <div style={{ fontSize: 12, color: '#9A8662' }}>เปิดบิล → จดกิโล → ปริ้น เท่านั้น</div>
        </div>
        <button onClick={onNew} style={{ border: 'none', borderRadius: 16, padding: '22px 14px', background: 'linear-gradient(135deg,#5C4326,#3F2D1E)', color: '#F6EEDD', cursor: 'pointer', textAlign: 'left' }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>＋</div>
          <div style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 18 }}>เปิดบิลใหม่</div>
          <div style={{ fontSize: 12, opacity: .7, marginTop: 2 }}>บันทึกรับซื้อทุเรียน</div>
        </button>
        {session && (
          <button onClick={onResume} style={{ border: '2px solid #C9A24B', borderRadius: 16, padding: '20px 14px', background: '#FFFDF8', color: '#4A3526', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>↩</div>
            <div style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 18 }}>ทำบิลต่อ</div>
            <div style={{ fontSize: 12, color: '#A6925E', marginTop: 2 }}>{session.billNo}</div>
          </button>
        )}
        <button onClick={onLogout} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 13, padding: '12px 16px', cursor: 'pointer', fontSize: 14, color: '#9A8662', marginTop: 8 }}>
          ออกจากระบบ
        </button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, maxWidth: 720, width: '100%', margin: '0 auto', padding: '16px 14px 40px' }}>
      {syncStatus && (
        <div onClick={onSyncNow} style={{ marginBottom: 10, padding: '8px 14px', borderRadius: 10, background: syncStatus.startsWith('⚠') ? '#FFF0F0' : '#F0FFF4', border: `1px solid ${syncStatus.startsWith('⚠') ? '#FFBBBB' : '#B8E6C8'}`, fontSize: 12, color: syncStatus.startsWith('⚠') ? '#C0392B' : '#2E7D32', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{syncStatus}</span>
          <span style={{ fontSize: 11, opacity: 0.7 }}>{syncing ? '…' : 'กดซิงก์อีกครั้ง'}</span>
        </div>
      )}
      {/* Primary action: Buy or Sell */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <button onClick={onNew} style={{ flex: 1, border: 'none', borderRadius: 18, padding: '22px 14px', background: 'linear-gradient(135deg,#5C4326,#3F2D1E)', color: '#F6EEDD', cursor: 'pointer', textAlign: 'left' }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📥</div>
          <div style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 19 }}>รับซื้อ</div>
          <div style={{ fontSize: 12, opacity: .7, marginTop: 3 }}>บันทึกรับซื้อทุเรียน</div>
        </button>
        <button onClick={onNewSale} style={{ flex: 1, border: 'none', borderRadius: 18, padding: '22px 14px', background: 'linear-gradient(135deg,#2E5C1A,#4A7A2E)', color: '#F0FAE8', cursor: 'pointer', textAlign: 'left' }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📤</div>
          <div style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 19 }}>ขาย</div>
          <div style={{ fontSize: 12, opacity: .75, marginTop: 3 }}>ออกใบเสร็จขายทุเรียน</div>
        </button>
      </div>

      {/* Resume in-progress buy bill */}
      {session && (() => {
        const entries = session.entries || [];
        const totalEntries = entries.length;
        const totalKg = entries.reduce((s, e) => s + (parseFloat(e.kg) || 0), 0);
        return (
          <button onClick={onResume} style={{ width: '100%', border: '2px solid #C9A24B', borderRadius: 14, padding: '14px 16px', background: '#FFFDF8', color: '#4A3526', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 22 }}>↩</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 15 }}>ทำบิลรับซื้อต่อ</div>
              <div style={{ fontSize: 12, color: '#A6925E', marginTop: 1 }}>
                {session.billNo}{totalEntries > 0 ? ` · ${totalEntries} เข่ง · ${totalKg % 1 === 0 ? totalKg : totalKg.toFixed(1)} กก.` : ' · ยังไม่มีเข่ง'}
              </div>
            </div>
            <span style={{ color: '#C9A24B', fontSize: 18 }}>›</span>
          </button>
        );
      })()}
      {/* Resume in-progress sale bill */}
      {saleSession && (() => {
        const entries = saleSession.entries || [];
        const totalKg = entries.reduce((s, e) => s + (parseFloat(e.kg) || 0), 0);
        return (
          <button onClick={onResumeSale} style={{ width: '100%', border: '2px solid #4A7A2E', borderRadius: 14, padding: '14px 16px', background: '#F5FAF0', color: '#2E5C1A', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 22 }}>↩</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 15 }}>ทำบิลขายต่อ</div>
              <div style={{ fontSize: 12, color: '#6A9A4E', marginTop: 1 }}>
                {saleSession.billNo}{entries.length > 0 ? ` · ${entries.length} เข่ง · ${totalKg % 1 === 0 ? totalKg : totalKg.toFixed(1)} กก.` : ' · ยังไม่มีเข่ง'}
                {saleSession.customerName ? ` · ${saleSession.customerName}` : ''}
              </div>
            </div>
            <span style={{ color: '#4A7A2E', fontSize: 18 }}>›</span>
          </button>
        );
      })()}



      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <button onClick={onGoCustomers} style={{ flex: 1, border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 14, padding: '15px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>👥</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: '#4A3526' }}>ทะเบียนลูกค้า</div>
            <div style={{ fontSize: 12, color: '#9A8662' }}>{syncing && customerCount === 0 ? '…' : `${customerCount} ราย`}</div>
          </div>
          <span style={{ marginLeft: 'auto', color: '#C9A24B', fontSize: 18 }}>›</span>
        </button>
        <button onClick={onGoSupervisors} style={{ flex: 1, border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 14, padding: '15px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>🧑‍💼</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: '#4A3526' }}>ผู้ดูแล</div>
            <div style={{ fontSize: 12, color: '#9A8662' }}>{syncing && supervisorCount === 0 ? '…' : `${supervisorCount} คน`}</div>
          </div>
          <span style={{ marginLeft: 'auto', color: '#C9A24B', fontSize: 18 }}>›</span>
        </button>
      </div>

      <button onClick={onGoHistory} style={{ width: '100%', border: '1.5px solid #C9A24B', background: 'linear-gradient(135deg,#FFFBF0,#FFF3D4)', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <span style={{ fontSize: 22 }}>📋</span>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#5B3A29' }}>ประวัติบิล</div>
          <div style={{ fontSize: 12, color: '#9A7A4A' }}>ซื้อ / ขาย · ทั้งหมด</div>
        </div>
        <span style={{ marginLeft: 'auto', color: '#C9A24B', fontSize: 18 }}>›</span>
      </button>

      {!isEmployee && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <button onClick={onGoDashboard} style={{ flex: 1, border: `1.5px solid ${nUnpaidPurchase > 0 ? '#C0392B' : '#8A5E00'}`, background: nUnpaidPurchase > 0 ? 'linear-gradient(135deg,#FFF5F5,#FDECEA)' : 'linear-gradient(135deg,#FFFBF0,#FFF3D4)', borderRadius: 14, padding: '14px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🧾</span>
              <div style={{ textAlign: 'left', flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#5B3A29' }}>ยอดซื้อ</div>
                <div style={{ fontSize: 12, color: nUnpaidPurchase > 0 ? '#C0392B' : '#9A7A4A', fontWeight: nUnpaidPurchase > 0 ? 700 : 400 }}>
                  {pendingPurchaseCount === null ? 'กำลังโหลด...' : nUnpaidPurchase > 0 ? `รอจ่าย ${nUnpaidPurchase} บิล` : 'ชำระครบแล้ว'}
                </div>
              </div>
              <span style={{ color: '#C9A24B', fontSize: 18 }}>›</span>
            </button>
            <button onClick={onGoSales} style={{ flex: 1, border: '1.5px solid #2E5C1A', background: 'linear-gradient(135deg,#F5FAF0,#EBF5E0)', borderRadius: 14, padding: '14px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>📤</span>
              <div style={{ textAlign: 'left', flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#2E5C1A' }}>ยอดขาย</div>
                <div style={{ fontSize: 12, color: '#6A9A4E' }}>{nRecentSale > 0 ? `${nRecentSale} บิล` : 'ยังไม่มีบิล'}</div>
              </div>
              <span style={{ color: '#4A7A2E', fontSize: 18 }}>›</span>
            </button>
          </div>
          <button onClick={onGoWallet} style={{ width: '100%', border: '1.5px solid #2E7D32', background: 'linear-gradient(135deg,#F1F8F1,#E8F5E9)', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <span style={{ fontSize: 22 }}>💰</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#1B5E20' }}>กระเป๋าเงิน</div>
              <div style={{ fontSize: 12, color: '#4CAF50' }}>จ่ายทุเรียน · รับขาย · ค่าใช้จ่าย</div>
            </div>
            <span style={{ marginLeft: 'auto', color: '#2E7D32', fontSize: 18 }}>›</span>
          </button>
        </>
      )}

      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 8px' }}>
          <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 13, letterSpacing: '.14em', color: '#A6925E' }}>ตั้งค่า</span>
          <div style={{ flex: 1, height: 1, background: '#E4D7BC' }} />
        </div>
        <button onClick={onChangePin} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 13, padding: '13px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🔒</span>
          <span style={{ fontSize: 14, color: '#4A3526', fontWeight: 500 }}>เปลี่ยนรหัส Admin PIN</span>
        </button>
        <button onClick={onSetEmployeePin} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 13, padding: '13px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🧑‍💼</span>
          <span style={{ fontSize: 14, color: '#4A3526', fontWeight: 500 }}>จัดการพนักงาน</span>
        </button>
        <button onClick={onOpenSheet} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 13, padding: '13px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>📊</span>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 14, color: '#4A3526', fontWeight: 500 }}>Google Sheet · ซิงก์อัตโนมัติ</div>
            {syncStatus && <div style={{ fontSize: 12, color: syncStatus.startsWith('⚠') ? '#C0392B' : '#9A8662', marginTop: 2 }}>{syncStatus}</div>}
          </div>
          <button onClick={e => { e.stopPropagation(); onSyncNow(); }} disabled={syncing} style={{ border: '1px solid #D8C8A8', background: '#F3E9D2', borderRadius: 9, padding: '6px 10px', fontSize: 12, color: '#7A5A22', cursor: 'pointer', opacity: syncing ? 0.5 : 1 }}>
            {syncing ? '…' : '↺ ซิงก์'}
          </button>
        </button>
        {!isEmployee && (
          <button onClick={onResetData} style={{ border: '1px solid #F5C6C6', background: '#FFF8F8', borderRadius: 13, padding: '13px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🗑️</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 14, color: '#C0392B', fontWeight: 500 }}>รีเซ็ตข้อมูลทั้งหมด</div>
              <div style={{ fontSize: 11, color: '#E57373', marginTop: 1 }}>ล้างบิล / รายรับ / ค่าคอม · คงข้อมูลลูกค้า</div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── CustomLabelManager ───────────────────────────────────────────────────────
function PinEditor({ customCatLabels, onSave, onCancel }) {
  const [labels, setLabels] = useState([...(customCatLabels || [])]);
  const [newLabel, setNewLabel] = useState('');
  const [editIdx, setEditIdx] = useState(null);
  const [editVal, setEditVal] = useState('');

  const move = (i, dir) => {
    const next = [...labels];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setLabels(next);
  };

  const add = () => {
    const v = newLabel.trim();
    if (!v || labels.includes(v)) return;
    setLabels(p => [...p, v]);
    setNewLabel('');
  };

  const startEdit = (i) => { setEditIdx(i); setEditVal(labels[i]); };

  const saveEdit = (i) => {
    const v = editVal.trim();
    if (v && !labels.some((l, j) => j !== i && l === v)) {
      setLabels(p => p.map((l, j) => j === i ? v : l));
    }
    setEditIdx(null);
  };

  return (
    <div className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 65, background: 'rgba(42,33,24,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, animation: 'fadeIn .2s' }}>
      <div style={{ background: '#FFFDF8', borderRadius: 20, padding: 22, width: '100%', maxWidth: 380, maxHeight: '85dvh', display: 'flex', flexDirection: 'column', animation: 'popIn .25s' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 17, margin: 0, color: '#4A3526' }}>🏷️ จัดการหมวดกำหนดเอง</h3>
          <button onClick={onCancel} style={{ border: 'none', background: 'none', fontSize: 20, color: '#9A8662', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <p style={{ fontSize: 12, color: '#9A8662', margin: '0 0 14px' }}>แตะชื่อเพื่อแก้ไข · ลูกศรเรียงลำดับ · ถังขยะลบ</p>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 14 }}>
          {labels.map((lbl, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px', background: '#FBF6EC', borderRadius: 10, marginBottom: 7, border: '1px solid #E4D7BC' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#7C8C9A', flexShrink: 0 }} />
              {editIdx === i ? (
                <input
                  autoFocus
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(i); if (e.key === 'Escape') setEditIdx(null); }}
                  onBlur={() => saveEdit(i)}
                  style={{ flex: 1, border: '1.5px solid #C9A24B', borderRadius: 7, padding: '4px 8px', fontSize: 14, fontWeight: 600, outline: 'none', fontFamily: 'inherit', color: '#2A2118', background: '#fff' }}
                />
              ) : (
                <span onClick={() => startEdit(i)} style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#4A3526', cursor: 'text' }}>{lbl}</span>
              )}
              <button onClick={() => move(i, -1)} disabled={i === 0} style={{ border: '1px solid #E4D7BC', background: '#fff', borderRadius: 7, padding: '4px 8px', fontSize: 13, cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? .3 : 1 }}>↑</button>
              <button onClick={() => move(i, 1)} disabled={i === labels.length - 1} style={{ border: '1px solid #E4D7BC', background: '#fff', borderRadius: 7, padding: '4px 8px', fontSize: 13, cursor: i === labels.length - 1 ? 'default' : 'pointer', opacity: i === labels.length - 1 ? .3 : 1 }}>↓</button>
              <button onClick={() => setLabels(p => p.filter((_, j) => j !== i))} style={{ border: '1px solid #E0B4A2', background: '#FBEEE8', borderRadius: 7, padding: '4px 8px', fontSize: 13, color: '#B5503A', cursor: 'pointer' }}>🗑</button>
            </div>
          ))}
          {labels.length === 0 && <div style={{ textAlign: 'center', fontSize: 13, color: '#B7A684', padding: '16px 0' }}>ยังไม่มีหมวดกำหนดเอง</div>}
        </div>

        <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
          <input
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="ชื่อหมวดใหม่…"
            style={{ flex: 1, border: '1.5px solid #C9A24B', borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none', background: '#FBF6EC', color: '#2A2118' }}
          />
          <button onClick={add} disabled={!newLabel.trim()} style={{ border: 'none', background: newLabel.trim() ? '#C9A24B' : '#D8C8A8', color: '#fff', borderRadius: 10, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: newLabel.trim() ? 'pointer' : 'default' }}>+ เพิ่ม</button>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, border: '1px solid #E4D7BC', background: '#fff', borderRadius: 12, padding: 13, color: '#7A6450', cursor: 'pointer', fontSize: 14 }}>ยกเลิก</button>
          <button onClick={() => onSave(labels)} style={{ flex: 2, border: 'none', background: '#3F2D1E', color: '#F6EEDD', borderRadius: 12, padding: 13, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>บันทึก</button>
        </div>
      </div>
    </div>
  );
}

// ─── RecordView ───────────────────────────────────────────────────────────────
// ─── VehicleModal ─────────────────────────────────────────────────────────────
function VehicleModal({ plate, photoUrl, onSave, onPhoto, onClose }) {
  const [text, setText] = useState(plate || '');
  const [ocrStatus, setOcrStatus] = useState(null); // null | 'reading' | 'done' | 'fail'
  const fileRef = useRef();
  const galleryRef = useRef();

  async function runOcr(file) {
    setOcrStatus('reading');
    try {
      const dataUrl = await resizeImage(file, 800);
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ base64: dataUrl, mode: 'plate' }),
      });
      const data = await res.json();
      if (data.ok && data.plate) { setText(data.plate.trim()); setOcrStatus('done'); }
      else setOcrStatus('fail');
    } catch { setOcrStatus('fail'); }
  }

  return (
    <div className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(42,33,24,.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 0 env(safe-area-inset-bottom)', animation: 'fadeIn .2s' }}>
      <div style={{ background: '#FFFDF8', borderRadius: '20px 20px 0 0', padding: '20px 18px 28px', width: '100%', maxWidth: 480, boxShadow: '0 -8px 30px rgba(42,33,24,.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 17, color: '#3F2D1E' }}>🚗 ทะเบียนรถ</span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#9A8662' }}>✕</button>
        </div>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            value={text}
            onChange={e => setText(e.target.value.toUpperCase())}
            placeholder={ocrStatus === 'reading' ? 'กำลังอ่านทะเบียน…' : 'เช่น กข 1234 กทม'}
            disabled={ocrStatus === 'reading'}
            style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${ocrStatus === 'done' ? '#7EB87E' : '#D8C8A8'}`, borderRadius: 12, padding: '13px 14px', fontSize: 18, fontFamily: 'Prompt', fontWeight: 600, letterSpacing: '.1em', color: '#2A2118', background: ocrStatus === 'reading' ? '#F5F0E8' : '#FBF6EC', opacity: ocrStatus === 'reading' ? .7 : 1 }}
            autoFocus={!ocrStatus}
          />
          {ocrStatus === 'reading' && (
            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#A6925E' }}>กำลังอ่าน…</span>
          )}
          {ocrStatus === 'done' && (
            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#5A9A5A' }}>✓ อ่านแล้ว แก้ได้</span>
          )}
          {ocrStatus === 'fail' && (
            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#C0704A' }}>อ่านไม่ชัด พิมพ์เอง</span>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
          onChange={e => { const file = e.target.files[0]; if (!file) return; onPhoto(file); runOcr(file); e.target.value = ''; }} />
        <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const file = e.target.files[0]; if (!file) return; onPhoto(file); runOcr(file); e.target.value = ''; }} />
        <div style={{ display: 'flex', gap: 8, marginBottom: photoUrl ? 10 : 14 }}>
          <button onClick={() => fileRef.current?.click()} style={{ flex: 1, border: '1.5px dashed #C9A24B', background: '#FBF3E2', borderRadius: 12, padding: '13px 0', fontSize: 14, fontWeight: 600, color: '#7A5A22', cursor: 'pointer' }}>
            📷 ถ่ายภาพ
          </button>
          <button onClick={() => galleryRef.current?.click()} style={{ flex: 1, border: '1.5px dashed #9AB87A', background: '#F2F8EC', borderRadius: 12, padding: '13px 0', fontSize: 14, fontWeight: 600, color: '#4A7A2A', cursor: 'pointer' }}>
            🖼 อัพโหลด
          </button>
        </div>
        {photoUrl && (
          <img src={photoUrl} alt="ทะเบียนรถ" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 10, border: '1px solid #E4D7BC', marginBottom: 14, display: 'block' }} />
        )}
        <button onClick={() => { onSave(text); onClose(); }} style={{ width: '100%', border: 'none', borderRadius: 13, padding: 15, background: 'linear-gradient(135deg,#C9A24B,#A8763E)', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', boxShadow: '0 6px 16px rgba(168,118,62,.28)' }}>
          บันทึกทะเบียน
        </button>
      </div>
    </div>
  );
}

const THAI_BANKS = [
  'กสิกรไทย (KBank)', 'ไทยพาณิชย์ (SCB)', 'กรุงเทพ (BBL)', 'กรุงไทย (KTB)',
  'กรุงศรีอยุธยา (BAY)', 'ออมสิน (GSB)', 'ธ.ก.ส. (BAAC)', 'ทหารไทยธนชาต (TTB)',
  'เกียรตินาคินภัทร (KKP)', 'ซีไอเอ็มบีไทย (CIMB)', 'ยูโอบี (UOB)',
  'แลนด์ แอนด์ เฮ้าส์ (LH)', 'ธอส. (GHB)', 'พร้อมเพย์', 'อื่นๆ',
];

function BankModal({ bankName, bankAccount, fullName, onSave, onClose }) {
  const isCustom = bankName && !THAI_BANKS.includes(bankName);
  const [selectVal, setSelectVal] = useState(isCustom ? 'อื่นๆ' : (bankName || ''));
  const [customBank, setCustomBank] = useState(isCustom ? bankName : '');
  const [acct, setAcct] = useState(bankAccount || '');
  const [fName, setFName] = useState(fullName || '');
  const name = selectVal === 'อื่นๆ' ? customBank : selectVal;
  const inp = { width: '100%', boxSizing: 'border-box', border: '1.5px solid #D8C8A8', borderRadius: 12, padding: '12px 14px', fontSize: 15, fontFamily: 'Prompt', color: '#2A2118', background: '#FBF6EC', marginBottom: 10 };
  const selStyle = { ...inp, appearance: 'none', WebkitAppearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath fill=\'%239A8662\' d=\'M5 6L0 0h10z\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center', paddingRight: 36, color: selectVal ? '#2A2118' : '#9A8662' };
  return (
    <div className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(42,33,24,.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 0 env(safe-area-inset-bottom)', animation: 'fadeIn .2s' }}>
      <div style={{ background: '#FFFDF8', borderRadius: '20px 20px 0 0', padding: '20px 18px 28px', width: '100%', maxWidth: 480, boxShadow: '0 -8px 30px rgba(42,33,24,.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 17, color: '#3F2D1E' }}>🏦 ข้อมูลธนาคาร</span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#9A8662' }}>✕</button>
        </div>
        <input value={fName} onChange={e => setFName(e.target.value)} placeholder="ชื่อ-นามสกุลเจ้าของบัญชี" style={inp} />
        <select value={selectVal} onChange={e => setSelectVal(e.target.value)} style={selStyle}>
          <option value="">เลือกธนาคาร</option>
          {THAI_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        {selectVal === 'อื่นๆ' && (
          <input value={customBank} onChange={e => setCustomBank(e.target.value)} placeholder="พิมชื่อธนาคาร..." style={inp} autoFocus />
        )}
        <input value={acct} onChange={e => setAcct(e.target.value.replace(/\D/g, ''))} placeholder="เลขบัญชี / เบอร์พร้อมเพย์" inputMode="numeric" style={{ ...inp, fontFamily: 'Prompt', letterSpacing: '.06em', fontSize: 16 }} />
        <button onClick={() => { onSave(name.trim(), acct.trim(), fName.trim()); onClose(); }} style={{ width: '100%', border: 'none', borderRadius: 13, padding: 15, background: 'linear-gradient(135deg,#5A7FA8,#3A5F88)', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', boxShadow: '0 6px 16px rgba(58,95,136,.28)' }}>
          บันทึกข้อมูลธนาคาร
        </button>
      </div>
    </div>
  );
}

function RecordView({ session, activeCat, input, onInput, onCommit, onPickCat, onGoHome, onGoSummary, onEditSeller, onEditEntry, verified, history, customLabel, onCustomLabelChange, pinnedCats, onOpenPinEditor, vehiclePhotoUrl, onVehiclePlate, onVehiclePhoto, customerInfo, onSaveCustomerInfo, onChangeDate, customCatLabels, onAddCustomCatLabel, onRemoveCustomCatLabel, hiddenCats, onHideCat, onShowAllCats }) {
  const aggData = agg(session);
  const customLabelAgg = {};
  (session?.entries || []).forEach(e => {
    if (e.cat === 'custom' && e.customLabel) {
      if (!customLabelAgg[e.customLabel]) customLabelAgg[e.customLabel] = { kg: 0, count: 0 };
      customLabelAgg[e.customLabel].kg += e.kg;
      customLabelAgg[e.customLabel].count++;
    }
  });
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [addingNewLabel, setAddingNewLabel] = useState(false);
  const [newLabelText, setNewLabelText] = useState('');
  const newLabelInputRef = React.useRef(null);
  const sellerPhone = session?.sellerPhone || '';
  const bankInfo = (customerInfo || {})[sellerPhone] || {};
  const totalKg = grandKg(session);
  const totalCount = (session?.entries || []).length;
  const recent = (session?.entries || []).filter(e => {
    if (e.cat !== activeCat) return false;
    if (activeCat === 'custom' && customLabel) return (e.customLabel || '') === customLabel;
    return true;
  }).reverse();
  const stat = sellerPhone ? customerStat(sellerPhone, history, verified) : null;
  const tier = stat ? stat.effectiveTier : null;
  const sellerText = (session?.seller || session?.sellerPhone) ? `${session.seller || ''}${session.sellerPhone ? (session.seller ? ' · ' : '') + session.sellerPhone : ''}` : 'ผู้ขาย —';
  const supervisorText = session?.supervisor ? `👤 ผู้ดูแล: ${session.supervisor}` : '';
  const recorderText = session?.recorder ? `✍️ ผู้บันทึก: ${session.recorder}` : '';
  const mainCats = CATS.filter(c => c.key !== 'custom' && !(hiddenCats || []).includes(c.key));
  const vehiclePlate = session?.vehiclePlate || '';

  return (
    <div style={{ flex: 1, maxWidth: 880, width: '100%', margin: '0 auto', padding: '14px 14px 130px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button onClick={onGoHome} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#7A6450', cursor: 'pointer' }}>‹ หน้าหลัก</button>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#4A3526' }}>{session?.billNo}</span>
          {onChangeDate ? (
            <input type="date"
              value={session?.date ? (() => { const d = new Date(session.date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })() : ''}
              onChange={e => { if (e.target.value) { const [y,m,d] = e.target.value.split('-').map(Number); const prev = new Date(session.date); const nd = new Date(y,m-1,d,prev.getHours(),prev.getMinutes(),prev.getSeconds()); onChangeDate(nd.getTime()); } }}
              style={{ fontSize: 12, color: '#DC743C', border: 'none', background: 'none', padding: 0, cursor: 'pointer', outline: 'none', fontWeight: 600 }} />
          ) : (
            <span style={{ fontSize: 12, color: '#9A8662' }}>{session ? dateStr(session.date) : ''}</span>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {tier && tier.key !== 'silver' && <TierBadge tier={tier} />}
          <button onClick={onEditSeller} style={{ border: '1px dashed #D8C8A8', background: '#FBF6EC', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#7A5A22', cursor: 'pointer' }}>แก้ไข</button>
        </div>
      </div>

      {/* sticky info bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {session?.recorder && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#EEF4EE', border: '1px solid #C4D9C4', borderRadius: 20, padding: '5px 12px' }}>
            <span style={{ fontSize: 13 }}>✍️</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#3D6B3D' }}>{session.recorder}</span>
          </div>
        )}
        {session?.supervisor && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#FBF3E2', border: '1px solid #E0C97A', borderRadius: 20, padding: '5px 12px' }}>
            <span style={{ fontSize: 13 }}>👤</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#7A5A22' }}>{session.supervisor}</span>
          </div>
        )}
        <div onClick={onEditSeller} style={{ display: 'flex', alignItems: 'center', gap: 5, background: (session?.seller || session?.sellerPhone) ? '#F0EAFA' : '#F5F5F5', border: `1px solid ${(session?.seller || session?.sellerPhone) ? '#C9B8E8' : '#D0C8C0'}`, borderRadius: 20, padding: '5px 12px', cursor: 'pointer' }}>
          <span style={{ fontSize: 13 }}>🧺</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: (session?.seller || session?.sellerPhone) ? '#5A3E8A' : '#9A8878' }}>
            {session?.seller || session?.sellerPhone || '+ เพิ่มลูกค้า'}
          </span>
        </div>
        <div onClick={() => setVehicleModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: vehiclePlate ? '#FFF3E0' : '#F5F5F5', border: `1px solid ${vehiclePlate ? '#FFB74D' : '#D0C8C0'}`, borderRadius: 20, padding: '5px 12px', cursor: 'pointer' }}>
          {(vehiclePhotoUrl || session?.vehicleSupaUrl)
            ? <img src={vehiclePhotoUrl || session?.vehicleSupaUrl} style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} alt="" />
            : <span style={{ fontSize: 13 }}>🚗</span>
          }
          <span style={{ fontSize: 13, fontWeight: 600, color: vehiclePlate ? '#BF360C' : '#9A8878' }}>
            {vehiclePlate || '+ ทะเบียนรถ'}
          </span>
        </div>
        {onSaveCustomerInfo && (
          <div onClick={() => sellerPhone ? setBankModalOpen(true) : alert('เพิ่มลูกค้าก่อนบันทึกข้อมูลธนาคาร')} style={{ display: 'flex', alignItems: 'center', gap: 5, background: bankInfo.bankAccount ? '#E8EEF8' : '#F5F5F5', border: `1px solid ${bankInfo.bankAccount ? '#90CAF9' : '#D0C8C0'}`, borderRadius: 20, padding: '5px 12px', cursor: 'pointer' }}>
            <span style={{ fontSize: 13 }}>🏦</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: bankInfo.bankAccount ? '#1A4D80' : '#9A8878' }}>
              {bankInfo.bankAccount ? `${bankInfo.bankName || ''} ${bankInfo.bankAccount}`.trim() : '+ ธนาคาร'}
            </span>
          </div>
        )}
      </div>
      {vehicleModalOpen && (
        <VehicleModal
          plate={vehiclePlate}
          photoUrl={vehiclePhotoUrl || session?.vehicleSupaUrl}
          onSave={onVehiclePlate}
          onPhoto={file => { onVehiclePhoto(file); }}
          onClose={() => setVehicleModalOpen(false)}
        />
      )}
      {bankModalOpen && (
        <BankModal
          bankName={bankInfo.bankName || ''}
          bankAccount={bankInfo.bankAccount || ''}
          fullName={bankInfo.fullName || ''}
          onSave={(bName, bAcct, bFull) => onSaveCustomerInfo(sellerPhone, { ...bankInfo, bankName: bName, bankAccount: bAcct, fullName: bFull })}
          onClose={() => setBankModalOpen(false)}
        />
      )}

      <div style={{ background: 'linear-gradient(135deg,#5C4326,#3F2D1E)', color: '#F6EEDD', borderRadius: 16, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, boxShadow: '0 8px 20px rgba(63,45,30,.22)' }}>
        <div>
          <span style={{ fontSize: 12, opacity: .7, letterSpacing: '.08em', display: 'block' }}>รวมน้ำหนักทั้งหมด</span>
          <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 30, lineHeight: 1.1 }}>{fmtKg(totalKg)} <span style={{ fontSize: 15, opacity: .7 }}>กก.</span></span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 12, opacity: .7, display: 'block' }}>จำนวนเข่ง</span>
          <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 22 }}>{totalCount}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 8 }}>
        {mainCats.map(c => {
          const d = aggData[c.key];
          const active = activeCat === c.key;
          return (
            <div key={c.key} style={{ position: 'relative' }}>
              <button onClick={() => onPickCat(c.key)} style={{ width: '100%', border: active ? `2px solid ${c.accent}` : '1px solid #E4D7BC', background: active ? '#FFFDF8' : '#FBF6EC', borderRadius: 12, padding: '10px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: active ? `0 4px 12px ${c.accent}40` : 'none' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.accent, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{c.label}</span>
                </span>
                <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 16, marginTop: 3 }}>{fmtKg(d.kg)}</span>
                <span style={{ fontSize: 10, opacity: .7 }}>{d.count} เข่ง</span>
              </button>
              {onHideCat && d.count === 0 && <button onClick={() => onHideCat(c.key)} style={{ position: 'absolute', top: 3, right: 3, border: 'none', background: 'rgba(160,144,128,.18)', borderRadius: 8, width: 18, height: 18, fontSize: 9, cursor: 'pointer', color: '#9A8662', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>}
            </div>
          );
        })}
        {(customCatLabels || []).map(lbl => {
          const d = customLabelAgg[lbl] || { kg: 0, count: 0 };
          const active = activeCat === 'custom' && customLabel === lbl;
          const accent = hashColor(lbl);
          return (
            <div key={lbl} style={{ position: 'relative' }}>
              <button onClick={() => { onCustomLabelChange(lbl); onPickCat('custom'); }} style={{ width: '100%', border: active ? `2px solid ${accent}` : '1px solid #E4D7BC', background: active ? '#FFFDF8' : '#FBF6EC', borderRadius: 12, padding: '10px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: active ? `0 4px 12px ${accent}40` : 'none' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{lbl}</span>
                </span>
                <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 16, marginTop: 3 }}>{fmtKg(d.kg)}</span>
                <span style={{ fontSize: 10, opacity: .7 }}>{d.count} เข่ง</span>
              </button>
              {onRemoveCustomCatLabel && <button onClick={() => onRemoveCustomCatLabel(lbl)} style={{ position: 'absolute', top: 3, right: 3, border: 'none', background: 'rgba(160,144,128,.18)', borderRadius: 8, width: 18, height: 18, fontSize: 9, cursor: 'pointer', color: '#9A8662', lineHeight: '18px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>}
            </div>
          );
        })}
      </div>
      {/* Add new custom label */}
      {onAddCustomCatLabel && (
        <div style={{ marginBottom: 12 }}>
          {addingNewLabel ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                ref={newLabelInputRef}
                value={newLabelText}
                onChange={e => setNewLabelText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newLabelText.trim()) { onAddCustomCatLabel(newLabelText.trim()); setNewLabelText(''); setAddingNewLabel(false); } if (e.key === 'Escape') { setNewLabelText(''); setAddingNewLabel(false); } }}
                placeholder="ชื่อหมวดใหม่…"
                autoFocus
                style={{ flex: 1, border: '1px solid #C9A24B', borderRadius: 12, padding: '8px 12px', fontSize: 14, fontWeight: 600, outline: 'none', fontFamily: 'inherit', color: '#4A3526' }}
              />
              <button onClick={() => { if (newLabelText.trim()) { onAddCustomCatLabel(newLabelText.trim()); setNewLabelText(''); setAddingNewLabel(false); } }} style={{ border: 'none', borderRadius: 12, padding: '8px 14px', background: '#C9A24B', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>บันทึก</button>
              <button onClick={() => { setNewLabelText(''); setAddingNewLabel(false); }} style={{ border: '1px solid #E4D7BC', borderRadius: 12, padding: '8px 12px', background: '#FBF6EC', color: '#9A8662', fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setAddingNewLabel(true)} style={{ padding: '6px 14px', borderRadius: 16, border: '1px dashed #C9A24B', background: '#FBF6EC', color: '#9A8662', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>+ เพิ่มหมวดใหม่</button>
              {(customCatLabels || []).length > 0 && onOpenPinEditor && (
                <button onClick={onOpenPinEditor} style={{ padding: '6px 12px', borderRadius: 16, border: '1px solid #E4D7BC', background: '#fff', color: '#7A6450', fontSize: 13, cursor: 'pointer' }}>⚙ จัดการ</button>
              )}
              {(hiddenCats || []).length > 0 && onShowAllCats && (
                <button onClick={onShowAllCats} style={{ padding: '6px 12px', borderRadius: 16, border: '1px solid #C9A24B', background: '#FBF3DF', color: '#7A5A22', fontSize: 13, cursor: 'pointer' }}>↩ แสดงทั้งหมด</button>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ background: '#FFFDF8', border: '1px solid #E4D7BC', borderRadius: 18, padding: 16, boxShadow: '0 4px 14px rgba(95,70,40,.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, color: '#4A3526' }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: catAccent(activeCat), display: 'inline-block' }} />
            กำลังจด: {activeCat === 'custom' ? (customLabel || 'หมวดพิเศษ') : catLabel(activeCat)}
          </span>
          <span style={{ fontSize: 12, color: '#9A8662' }}>เคาะตัวเลข แล้วกด "บันทึกเข่ง"</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, background: '#FBF6EC', borderRadius: 14, padding: 14, marginBottom: 14, minHeight: 60 }}>
          <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 42, color: '#3F2D1E', lineHeight: 1 }}>{input || '0'}</span>
          <span style={{ fontSize: 16, color: '#A6925E' }}>กก.</span>
        </div>
        <Keypad value={input} onChange={onInput} onConfirm={onCommit} />
      </div>

      {recent.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <span style={{ fontSize: 12, color: '#A6925E', letterSpacing: '.08em' }}>เข่งล่าสุด ({activeCat === 'custom' ? (customLabel || 'หมวดพิเศษ') : catLabel(activeCat)}) — แตะเพื่อแก้/ลบ</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {recent.map(e => (
              <button key={e.id} onClick={() => onEditEntry(e)} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 10, padding: '8px 12px', fontSize: 14, color: '#4A3526', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'Prompt', fontWeight: 500 }}>{fmtKg(e.kg)}</span>
                <span style={{ fontSize: 11, color: '#B7A684' }}>กก. · {timeStr(e.t)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="no-print" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 25, background: '#FBF6EC', borderTop: '1px solid #E4D7BC', padding: 'calc(env(safe-area-inset-bottom) + 10px) 14px 10px', display: 'flex', gap: 10 }}>
        <button
          onClick={onCommit}
          disabled={!input || parseFloat(input) <= 0}
          style={{ flex: 1, border: 'none', borderRadius: 13, padding: 15, background: (!input || parseFloat(input) <= 0) ? '#D9CDB8' : 'linear-gradient(135deg,#C9A24B,#A8763E)', color: (!input || parseFloat(input) <= 0) ? '#A89880' : '#fff', fontWeight: 700, fontSize: 16, cursor: (!input || parseFloat(input) <= 0) ? 'not-allowed' : 'pointer', transition: 'background .2s' }}>
          ＋ บันทึกเข่งนี้
        </button>
        <button onClick={onGoSummary} style={{ flex: 1, border: 'none', borderRadius: 13, padding: 15, background: '#3F2D1E', color: '#F6EEDD', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>ดูสรุป & ตั้งราคา →</button>
      </div>
    </div>
  );
}

// ─── SummaryView ──────────────────────────────────────────────────────────────
function SummaryView({ session, onGoRecord, onGoConfirm, onSetPrice, logOpen, onToggleLog, customLabel }) {
  const aggData = agg(session);
  const stdRows = CATS.filter(c => c.key !== 'custom' && aggData[c.key].count > 0);
  const custRows = customLabelRows(session);
  const totalKg = grandKg(session);
  const totalBaht = grandBaht(session);
  const allPriced = (stdRows.length + custRows.length) > 0 &&
    stdRows.every(c => (session?.prices[c.key] || 0) > 0) &&
    custRows.every(r => (session?.prices[r.priceKey] || session?.prices['custom'] || 0) > 0);
  const log = session?.log || [];

  return (
    <div style={{ flex: 1, maxWidth: 820, width: '100%', margin: '0 auto', padding: '16px 14px 120px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={onGoRecord} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#7A6450', cursor: 'pointer' }}>‹ กลับไปจด</button>
        <h2 style={{ fontFamily: 'Prompt', fontWeight: 400, fontSize: 20, color: '#4A3526', margin: 0 }}>สรุปยอด · ตั้งราคา</h2>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: '#9A8662' }}>แตะช่อง "ราคา" เพื่อใส่ราคารับซื้อวันนี้ของแต่ละหมวด · ยอดรวมคำนวณให้อัตโนมัติ</p>

      <div style={{ background: '#FFFDF8', border: '1px solid #E4D7BC', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 14px rgba(95,70,40,.06)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr .7fr 1fr 1.1fr 1.2fr', background: '#F3E9D2', padding: '11px 14px', fontSize: 12, fontWeight: 600, color: '#7A5A22' }}>
          <span>หมวด</span><span style={{ textAlign: 'center' }}>เข่ง</span><span style={{ textAlign: 'right' }}>น้ำหนัก</span><span style={{ textAlign: 'right' }}>ราคา/กก.</span><span style={{ textAlign: 'right' }}>ยอด (฿)</span>
        </div>
        {stdRows.map(c => {
          const d = aggData[c.key];
          const price = session?.prices[c.key] || 0;
          return (
            <div key={c.key} style={{ display: 'grid', gridTemplateColumns: '1.3fr .7fr 1fr 1.1fr 1.2fr', alignItems: 'center', padding: '12px 14px', borderTop: '1px solid #EFE4CD' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: 14, color: '#4A3526' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.accent, display: 'inline-block', flexShrink: 0 }} />{c.label}
              </span>
              <span style={{ textAlign: 'center', fontSize: 13, color: '#9A8662' }}>{d.count}</span>
              <span style={{ textAlign: 'right', fontFamily: 'Prompt', fontSize: 14 }}>{fmtKg(d.kg)}</span>
              <button onClick={() => onSetPrice(c.key)} style={{ textAlign: 'right', border: price ? '1px solid #E4D7BC' : '1.5px dashed #C9A24B', background: price ? '#FFFDF8' : '#FBF3DF', borderRadius: 8, padding: '5px 8px', fontSize: 13, color: price ? '#3F2D1E' : '#9A7A12', cursor: 'pointer', fontFamily: 'Prompt' }}>
                {price ? fmtPrice(price) : 'ตั้งราคา'}
              </button>
              <span style={{ textAlign: 'right', fontFamily: 'Prompt', fontWeight: 500, fontSize: 14, color: '#3F2D1E' }}>{price ? fmtBaht(d.kg * price) : '—'}</span>
            </div>
          );
        })}
        {custRows.map(r => {
          const price = session?.prices[r.priceKey] || session?.prices['custom'] || 0;
          return (
            <div key={r.priceKey} style={{ display: 'grid', gridTemplateColumns: '1.3fr .7fr 1fr 1.1fr 1.2fr', alignItems: 'center', padding: '12px 14px', borderTop: '1px solid #EFE4CD' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: 14, color: '#4A3526' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#7C8C9A', display: 'inline-block', flexShrink: 0 }} />{r.label || 'หมวดพิเศษ'}
              </span>
              <span style={{ textAlign: 'center', fontSize: 13, color: '#9A8662' }}>{r.count}</span>
              <span style={{ textAlign: 'right', fontFamily: 'Prompt', fontSize: 14 }}>{fmtKg(r.kg)}</span>
              <button onClick={() => onSetPrice(r.priceKey)} style={{ textAlign: 'right', border: price ? '1px solid #E4D7BC' : '1.5px dashed #C9A24B', background: price ? '#FFFDF8' : '#FBF3DF', borderRadius: 8, padding: '5px 8px', fontSize: 13, color: price ? '#3F2D1E' : '#9A7A12', cursor: 'pointer', fontFamily: 'Prompt' }}>
                {price ? fmtPrice(price) : 'ตั้งราคา'}
              </button>
              <span style={{ textAlign: 'right', fontFamily: 'Prompt', fontWeight: 500, fontSize: 14, color: '#3F2D1E' }}>{price ? fmtBaht(r.kg * price) : '—'}</span>
            </div>
          );
        })}
        {stdRows.length === 0 && custRows.length === 0 && <div style={{ padding: '20px 14px', textAlign: 'center', color: '#B7A684', fontSize: 14 }}>ยังไม่มีรายการ — กลับไปบันทึกก่อน</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr .7fr 1fr 1.1fr 1.2fr', alignItems: 'center', padding: 14, background: '#3F2D1E', color: '#F6EEDD' }}>
          <span style={{ fontWeight: 600, gridColumn: 'span 2' }}>รวมทั้งสิ้น</span>
          <span style={{ textAlign: 'right', fontFamily: 'Prompt', fontWeight: 500 }}>{fmtKg(totalKg)}</span>
          <span style={{ textAlign: 'right', fontSize: 12, opacity: .65 }}>บาท</span>
          <span style={{ textAlign: 'right', fontFamily: 'Prompt', fontWeight: 600, fontSize: 18 }}>{fmtBaht(totalBaht)}</span>
        </div>
      </div>

      <button onClick={onToggleLog} style={{ flex: 1, width: '100%', border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 13, padding: 14, fontWeight: 600, fontSize: 14, color: '#7A6450', cursor: 'pointer', marginTop: 16 }}>
        📋 ประวัติการบันทึก/แก้ไข ({log.length})
      </button>

      {logOpen && (
        <div style={{ marginTop: 12, background: '#FBF6EC', border: '1px solid #E4D7BC', borderRadius: 14, padding: '6px 4px', maxHeight: 280, overflowY: 'auto' }}>
          {log.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 12px', borderBottom: '1px solid #EFE4CD', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 16 }}>{l.kind === 'add' ? '＋' : l.kind === 'edit' ? '✏️' : l.kind === 'delete' ? '🗑' : l.kind === 'price' ? '💰' : l.kind === 'confirm' ? '✓' : l.kind === 'verify' ? '★' : '📌'}</span>
              <div>
                <div style={{ fontSize: 13, color: '#4A3526' }}>{l.text}</div>
                <div style={{ fontSize: 11, color: '#B7A684' }}>{timeStr(l.t)}</div>
              </div>
            </div>
          ))}
          {log.length === 0 && <div style={{ padding: '12px 14px', color: '#B7A684', fontSize: 13 }}>ยังไม่มีประวัติ</div>}
        </div>
      )}

      <button onClick={onGoConfirm} style={{ width: '100%', marginTop: 18, border: 'none', borderRadius: 15, padding: 18, background: 'linear-gradient(135deg,#C9A24B,#A8763E)', color: '#fff', fontWeight: 700, fontSize: 18, cursor: 'pointer', boxShadow: '0 8px 18px rgba(168,118,62,.3)' }}>
        ส่งให้ลูกค้าตรวจสอบ →
      </button>
      {!allPriced && (stdRows.length + custRows.length) > 0 && (
        <p style={{ textAlign: 'center', fontSize: 12, color: '#B7A684', marginTop: 8 }}>⚠ ยังมีบางหมวดที่ยังไม่ได้ตั้งราคา</p>
      )}
    </div>
  );
}

// ─── ConfirmView ──────────────────────────────────────────────────────────────
function ConfirmView({ session, verified, history, onConfirm, onGoSummary, customLabel }) {
  const aggData = agg(session);
  const stdRows = CATS.filter(c => c.key !== 'custom' && aggData[c.key].count > 0);
  const custRows = customLabelRows(session);
  const totalKg = grandKg(session);
  const totalBaht = grandBaht(session);
  const stat = session?.sellerPhone ? customerStat(session.sellerPhone, history, verified) : null;
  const tier = stat ? stat.effectiveTier : null;

  return (
    <div style={{ flex: 1, background: '#F4ECDD', padding: '18px 14px 60px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', background: '#FFFDF8', borderRadius: 20, boxShadow: '0 12px 32px rgba(95,70,40,.16)', overflow: 'hidden', animation: 'popIn .35s' }}>
        <div style={{ background: '#FBF6EC', padding: 22, textAlign: 'center', borderBottom: '1px solid #E4D7BC' }}>
          <img src="/logo.jpg" style={{ width: 120, height: 'auto', borderRadius: 10 }} alt="Qudsun" />
          <h2 style={{ fontFamily: 'Prompt', fontWeight: 400, fontSize: 20, margin: '14px 0 4px', color: '#4A3526' }}>กรุณาตรวจสอบยอดของท่าน</h2>
          <p style={{ fontSize: 13, color: '#9A8662', margin: 0 }}>
            {session?.billNo} · {session ? dateStr(session.date) : ''} · ผู้ขาย {session?.seller || '—'}
            {session?.sellerPhone ? ` · ${session.sellerPhone}` : ''}
          </p>
          {tier && tier.key !== 'silver' && <div style={{ marginTop: 10 }}><TierBadge tier={tier} size="lg" /></div>}
        </div>
        <div style={{ padding: '8px 18px' }}>
          {stdRows.map(c => {
            const d = aggData[c.key];
            const price = session?.prices[c.key] || 0;
            return (
              <div key={c.key} style={{ display: 'flex', alignItems: 'center', padding: '13px 0', borderBottom: '1px solid #EFE4CD', gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.accent, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontWeight: 600, color: '#4A3526', flex: 1 }}>{c.label}</span>
                <span style={{ fontFamily: 'Prompt', color: '#9A8662', fontSize: 14 }}>{fmtKg(d.kg)} กก. × {fmtPrice(price)} บาท</span>
                <span style={{ fontFamily: 'Prompt', fontWeight: 600, color: '#3F2D1E', minWidth: 84, textAlign: 'right' }}>฿{fmtBaht(d.kg * price)}</span>
              </div>
            );
          })}
          {custRows.map(r => {
            const price = session?.prices[r.priceKey] || session?.prices['custom'] || 0;
            return (
              <div key={r.priceKey} style={{ display: 'flex', alignItems: 'center', padding: '13px 0', borderBottom: '1px solid #EFE4CD', gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#7C8C9A', display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontWeight: 600, color: '#4A3526', flex: 1 }}>{r.label || 'หมวดพิเศษ'}</span>
                <span style={{ fontFamily: 'Prompt', color: '#9A8662', fontSize: 14 }}>{fmtKg(r.kg)} กก. × {fmtPrice(price)} บาท</span>
                <span style={{ fontFamily: 'Prompt', fontWeight: 600, color: '#3F2D1E', minWidth: 84, textAlign: 'right' }}>฿{fmtBaht(r.kg * price)}</span>
              </div>
            );
          })}
        </div>
        <div style={{ background: '#3F2D1E', color: '#F6EEDD', padding: '20px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12, opacity: .7 }}>รวม {fmtKg(totalKg)} กก.</div>
            <div style={{ fontSize: 13, opacity: .7 }}>ยอดสุทธิที่ต้องชำระ</div>
          </div>
          <span style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 30 }}>฿{fmtBaht(totalBaht)}</span>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={onConfirm} style={{ width: '100%', border: 'none', borderRadius: 14, padding: 18, background: 'linear-gradient(135deg,#3E8E5A,#2E7048)', color: '#fff', fontWeight: 700, fontSize: 18, cursor: 'pointer', boxShadow: '0 8px 18px rgba(46,112,72,.3)' }}>✓ ยืนยัน — ตัวเลขถูกต้อง</button>
          <button onClick={onGoSummary} style={{ width: '100%', border: '1px solid #E0B4A2', background: '#FBEEE8', borderRadius: 14, padding: 15, color: '#B5503A', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>มีข้อผิดพลาด — กลับไปแก้ไข</button>
        </div>
      </div>
    </div>
  );
}

// ─── PrintView ────────────────────────────────────────────────────────────────
function PrintView({ session, readonly, isHandoff, verified, history, payments, onGoSummary, onGoBack, onFinish, onStartEdit, customLabel, vehiclePhotoUrl, onSaveSlip, onUploadEvidence, onReusePhoto, onBulkUpload, onSaveCustomerInfo, supervisors, customerInfo }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(null); // null | 'receipt' | 'slip' | 'vehicle'

  // Find photos from previous bills of the same customer
  const priorPhotos = useMemo(() => {
    const phone = session?.sellerPhone || session?.phone;
    if (!phone || !history || !payments) return {};
    const result = {};
    for (const h of history) {
      const hPhone = h.sellerPhone || h.phone;
      if (hPhone === phone && h.billNo !== session?.billNo) {
        const pay = payments[h.billNo];
        if (pay?.vehicleUrl && !result.vehicleUrl) result.vehicleUrl = pay.vehicleUrl;
        if (pay?.receiptUrl && !result.receiptUrl) result.receiptUrl = pay.receiptUrl;
        if (pay?.slipUrl && !result.slipUrl) result.slipUrl = pay.slipUrl;
      }
    }
    return result;
  }, [session?.sellerPhone, session?.phone, session?.billNo, history, payments]);
  const [slipOcr, setSlipOcr] = useState(null); // null | { file, dataUrl, bankName, bankAccount, note, loading, slipData? }
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [sharing, setSharing] = useState(false);

  const handleShareBill = async () => {
    setSharing(true);
    try {
      const el = document.querySelector('.bill-doc');
      if (!el) return;
      const canvas = await html2canvas(el, { scale: 2.5, useCORS: true, logging: false, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height / canvas.width) * pdfW;
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
      const blob = pdf.output('blob');
      const fileName = `บิล_${session?.billNo || 'Qudsun'}.pdf`;
      const file = new File([blob], fileName, { type: 'application/pdf' });
      const EPSON_LINE = 'https://line.me/R/ti/p/@245mycrd';
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        setTimeout(() => window.open(EPSON_LINE, '_blank'), 800);
      }
    } catch (e) { if (e?.name !== 'AbortError') console.error(e); }
    setSharing(false);
  };
  const receiptUpRef = useRef();
  const slipUpRef = useRef();
  const vehicleUpRef = useRef();
  const link = session ? billLink(session) : '';
  const code = session ? billCode(session) : '';
  const aggData = agg(session);
  const stdRows = CATS.filter(c => c.key !== 'custom' && aggData[c.key].count > 0);
  const custRows = customLabelRows(session);
  const rows = [...stdRows, ...custRows.map(r => ({ key: r.priceKey, label: r.label || 'หมวดพิเศษ', accent: '#7C8C9A', _isCustomLabel: true, _custRow: r }))];
  const totalKg = grandKg(session);
  const totalBaht = grandBaht(session);
  const confirmTime = session?.confirmedAt ? timeStr(session.confirmedAt) : '';
  const stat = session?.sellerPhone ? customerStat(session.sellerPhone, history, verified) : null;
  const tier = stat ? stat.effectiveTier : null;

  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { width: 180, margin: 1, color: { dark: '#2A2118', light: '#FFFFFF' } })
      .then(setQrDataUrl).catch(() => {});
  }, [link]);

  useEffect(() => {
    if (readonly || isHandoff) return;
    const t = setTimeout(async () => {
      if (onSaveSlip) {
        try {
          const el = document.querySelector('.bill-doc');
          if (el) {
            const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false });
            onSaveSlip(canvas.toDataURL('image/jpeg', 0.9));
          }
        } catch {}
      }
      window.print();
    }, 800);
    return () => clearTimeout(t);
  }, []);

  const doCopy = () => {
    try { navigator.clipboard.writeText(link); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleUp = useCallback(async (type, file) => {
    if (!file || !onUploadEvidence) return;
    setUploading(type);
    try { await onUploadEvidence(type, file); } finally { setUploading(null); }
  }, [onUploadEvidence]);

  const handleSlipOcr = useCallback(async (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      const phone = session?.sellerPhone || '';
      const existing = customerInfo?.[phone] || {};
      setSlipOcr({ file, dataUrl, bankName: existing.bankName || '', bankAccount: existing.bankAccount || '', note: existing.note || '', loading: true });
      try {
        const ocrRes = await fetch('/api/ocr', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ base64: dataUrl, mode: 'slip' }) });
        const ocrData = await ocrRes.json();
        if (ocrData.ok && ocrData.slipData) {
          const sd = ocrData.slipData;
          const recipientText = sd.recipient || '';
          const bankMatch = recipientText.match(/ธ\.[ก-๙]+|ธนาคาร[ก-๙\s]+/);
          const accountMatch = recipientText.match(/[xX\d]{3,}[-xX\d]+/);
          const nameClean = recipientText.replace(/ธ\.[ก-๙]+.*/, '').replace(/[xX\d]{3,}[-xX\d]+.*/, '').trim();
          setSlipOcr(prev => prev ? { ...prev, loading: false, slipData: sd,
            bankName: bankMatch?.[0] || prev.bankName,
            bankAccount: accountMatch?.[0] || prev.bankAccount,
            note: nameClean || prev.note } : null);
        } else {
          setSlipOcr(prev => prev ? { ...prev, loading: false } : null);
        }
      } catch {
        setSlipOcr(prev => prev ? { ...prev, loading: false } : null);
      }
    };
    reader.readAsDataURL(file);
  }, [session, customerInfo]);

  const confirmSlipSave = useCallback(async () => {
    if (!slipOcr) return;
    const phone = session?.sellerPhone || '';
    if (phone && onSaveCustomerInfo && (slipOcr.bankName || slipOcr.bankAccount || slipOcr.note)) {
      onSaveCustomerInfo(phone, { bankName: slipOcr.bankName, bankAccount: slipOcr.bankAccount, note: slipOcr.note });
    }
    const f = slipOcr.file;
    setSlipOcr(null);
    await handleUp('slip', f);
  }, [slipOcr, session, onSaveCustomerInfo, handleUp]);

  const skipSlipSave = useCallback(async () => {
    if (!slipOcr) return;
    const f = slipOcr.file;
    setSlipOcr(null);
    await handleUp('slip', f);
  }, [slipOcr, handleUp]);

  return (
    <div className="print-view-root" style={{ flex: 1, padding: '18px 14px 60px' }}>
      <div className="no-print" style={{ maxWidth: 620, margin: '0 auto 18px' }}>
        {readonly ? (
          <>
            {(() => {
              const phone = session?.sellerPhone || '';
              const info = customerInfo?.[phone] || {};
              const verifiedName = verified?.[phone];
              const supervisor = session?.supervisor || supervisors?.[phone] || '';
              return (
                <div style={{ background: '#FFFDF8', border: '1px solid #E4D7BC', borderRadius: 16, padding: '16px 18px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 18 }}>👁</span>
                    <span style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 14, color: '#7A5A22' }}>ดูบิลย้อนหลัง</span>
                    {onStartEdit && <button onClick={onStartEdit} style={{ marginLeft: 'auto', border: 'none', background: 'linear-gradient(135deg,#5C4326,#3F2D1E)', color: '#F6EEDD', borderRadius: 9, padding: '5px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✏️ แก้ไข</button>}
                    {!onStartEdit && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#B7A684' }}>ยืนยัน {confirmTime}</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px' }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#B7A684', marginBottom: 1 }}>ชื่อ</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#3F2D1E' }}>{verifiedName || session?.seller || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: '#B7A684', marginBottom: 1 }}>เบอร์โทร</div>
                      <div style={{ fontSize: 13, color: '#3F2D1E', fontFamily: 'Prompt' }}>{phone || '—'}</div>
                    </div>
                    {supervisor ? <div>
                      <div style={{ fontSize: 10, color: '#B7A684', marginBottom: 1 }}>ผู้ดูแล</div>
                      <div style={{ fontSize: 13, color: '#3F2D1E' }}>{supervisor}</div>
                    </div> : null}
                    {info.bankName || info.bankAccount ? <>
                      <div>
                        <div style={{ fontSize: 10, color: '#B7A684', marginBottom: 1 }}>ธนาคาร</div>
                        <div style={{ fontSize: 13, color: '#3F2D1E' }}>{info.bankName || '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#B7A684', marginBottom: 1 }}>เลขบัญชี</div>
                        <div style={{ fontSize: 13, color: '#3F2D1E', fontFamily: 'Prompt', letterSpacing: '.04em' }}>{info.bankAccount || '—'}</div>
                      </div>
                      {info.note ? <div style={{ gridColumn: '1/-1' }}>
                        <div style={{ fontSize: 10, color: '#B7A684', marginBottom: 1 }}>ชื่อผู้รับ / หมายเหตุ</div>
                        <div style={{ fontSize: 13, color: '#3F2D1E' }}>{info.note}</div>
                      </div> : null}
                    </> : null}
                  </div>
                </div>
              );
            })()}
            {(() => {
              const pay = payments?.[session?.billNo];
              const noPhoto = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 80, borderRadius: 10, border: '1.5px dashed #D8C8A8', color: '#C0A87A', fontSize: 11, gap: 4 };
              const upBtn = { border: 'none', background: 'rgba(168,118,62,.12)', color: '#7A5A22', borderRadius: 6, padding: '2px 8px', fontSize: 10, cursor: 'pointer', marginTop: 4 };
              return (
              <div style={{ background: '#FFFDF8', border: '1px solid #E4D7BC', borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: '#A6925E', fontWeight: 600, flex: 1 }}>รูปหลักฐาน</span>
                  {onBulkUpload && (
                    <button onClick={() => setShowBulkUpload(true)}
                      style={{ border: 'none', background: '#3F2D1E', color: '#F6EEDD', borderRadius: 10, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'Prompt' }}>
                      📎 อัปโหลดหลักฐาน
                    </button>
                  )}
                </div>
                <input ref={receiptUpRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { handleUp('receipt', e.target.files[0]); e.target.value = ''; }} />
                <input ref={slipUpRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) handleSlipOcr(f); }} />
                <input ref={vehicleUpRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { handleUp('vehicle', e.target.files[0]); e.target.value = ''; }} />
                {/* Row 1: ใบเสร็จ + สลิป */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: '#9A8662', marginBottom: 4 }}>📄 ใบเสร็จลายเซ็น</div>
                    {pay?.receiptUrl
                      ? <div style={{ position: 'relative' }}>
                          <a href={pay.receiptUrl} target="_blank" rel="noreferrer"><img src={pay.receiptUrl} alt="ใบเสร็จ" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 10, border: '1px solid #C8E6C9', display: 'block' }} /></a>
                          {onUploadEvidence && <button onClick={() => receiptUpRef.current?.click()} style={{ position: 'absolute', top: 4, right: 4, ...upBtn }}>{uploading === 'receipt' ? '…' : 'เปลี่ยน'}</button>}
                        </div>
                      : <div>
                          <div style={{ ...noPhoto, cursor: onUploadEvidence ? 'pointer' : 'default', border: onUploadEvidence ? '1.5px dashed #C9A24B' : noPhoto.border }} onClick={() => onUploadEvidence && receiptUpRef.current?.click()}>
                            {uploading === 'receipt' ? 'กำลัง upload…' : onUploadEvidence ? <><span>📤</span><span style={{ fontSize: 10 }}>แตะเพื่ออัพโหลด</span></> : 'ไม่มีรูป'}
                          </div>
                          {onReusePhoto && priorPhotos.receiptUrl && (
                            <button onClick={() => onReusePhoto('receipt', priorPhotos.receiptUrl)} style={{ marginTop: 4, width: '100%', border: '1px solid #C9A24B', background: '#FFFDF8', color: '#8A5E00', borderRadius: 8, padding: '5px 0', fontSize: 11, cursor: 'pointer', fontFamily: 'Prompt' }}>📋 ใช้รูปเดิม</button>
                          )}
                        </div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: '#9A8662', marginBottom: 4 }}>💸 สลิปโอน</div>
                    {pay?.slipUrl
                      ? <div style={{ position: 'relative' }}>
                          <a href={pay.slipUrl} target="_blank" rel="noreferrer"><img src={pay.slipUrl} alt="สลิป" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 10, border: '1px solid #C8E6C9', display: 'block' }} /></a>
                          {onUploadEvidence && <button onClick={() => slipUpRef.current?.click()} style={{ position: 'absolute', top: 4, right: 4, ...upBtn }}>{uploading === 'slip' ? '…' : 'เปลี่ยน'}</button>}
                        </div>
                      : <div>
                          <div style={{ ...noPhoto, cursor: onUploadEvidence ? 'pointer' : 'default', border: onUploadEvidence ? '1.5px dashed #C9A24B' : noPhoto.border }} onClick={() => onUploadEvidence && slipUpRef.current?.click()}>
                            {uploading === 'slip' ? 'กำลัง upload…' : onUploadEvidence ? <><span>📤</span><span style={{ fontSize: 10 }}>แตะเพื่ออัพโหลด</span></> : 'ไม่มีรูป'}
                          </div>
                          {onReusePhoto && priorPhotos.slipUrl && (
                            <button onClick={() => onReusePhoto('slip', priorPhotos.slipUrl)} style={{ marginTop: 4, width: '100%', border: '1px solid #C9A24B', background: '#FFFDF8', color: '#8A5E00', borderRadius: 8, padding: '5px 0', fontSize: 11, cursor: 'pointer', fontFamily: 'Prompt' }}>📋 ใช้รูปเดิม</button>
                          )}
                        </div>}
                  </div>
                </div>
                {/* Row 2: ทะเบียนรถ full-width */}
                <div>
                  <div style={{ fontSize: 11, color: '#9A8662', marginBottom: 4 }}>🚗 ทะเบียนรถ {session?.vehiclePlate ? `· ${session.vehiclePlate}` : ''}</div>
                  {(() => {
                    const vUrl = pay?.vehicleUrl || session?.vehicleSupaUrl || vehiclePhotoUrl;
                    return vUrl
                      ? <div style={{ position: 'relative' }}>
                          <a href={vUrl} target="_blank" rel="noreferrer"><img src={vUrl} alt="ทะเบียน" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 10, border: '1px solid #E4D7BC', display: 'block' }} /></a>
                          {onUploadEvidence && <button onClick={() => vehicleUpRef.current?.click()} style={{ position: 'absolute', top: 4, right: 4, ...upBtn }}>{uploading === 'vehicle' ? '…' : 'เปลี่ยน'}</button>}
                        </div>
                      : <div>
                          <div style={{ ...noPhoto, cursor: onUploadEvidence ? 'pointer' : 'default', border: onUploadEvidence ? '1.5px dashed #C9A24B' : noPhoto.border }} onClick={() => onUploadEvidence && vehicleUpRef.current?.click()}>
                            {uploading === 'vehicle' ? 'กำลัง upload…' : onUploadEvidence ? <><span>📤</span><span style={{ fontSize: 10 }}>แตะเพื่ออัพโหลด</span></> : 'ไม่มีรูป'}
                          </div>
                          {onReusePhoto && priorPhotos.vehicleUrl && (
                            <button onClick={() => onReusePhoto('vehicle', priorPhotos.vehicleUrl)} style={{ marginTop: 4, width: '100%', border: '1px solid #C9A24B', background: '#FFFDF8', color: '#8A5E00', borderRadius: 8, padding: '5px 0', fontSize: 11, cursor: 'pointer', fontFamily: 'Prompt' }}>📋 ใช้รูปเดิม</button>
                          )}
                        </div>;
                  })()}
                </div>
                {payments?.[session?.billNo]?.slipData && (() => {
                  const sd = payments[session.billNo].slipData;
                  return (
                    <div style={{ marginTop: 10, background: '#EFF8F1', borderRadius: 10, padding: '8px 12px', fontSize: 11.5, color: '#2E7D32', lineHeight: 1.8 }}>
                      {sd.amount && <div>ยอด: {sd.amount} บาท</div>}
                      {sd.sender && <div>ผู้โอน: {sd.sender}</div>}
                      {sd.recipient && <div>ผู้รับ: {sd.recipient}</div>}
                      {sd.datetime && <div>เวลา: {sd.datetime}</div>}
                      {sd.ref && <div>อ้างอิง: {sd.ref}</div>}
                    </div>
                  );
                })()}
              </div>
            ); })()}
          </>
        ) : (
          <div style={{ background: '#E7F4EC', border: '1px solid #BFE0CC', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 24 }}>✓</span>
            <div>
              <div style={{ fontWeight: 600, color: '#2E7048' }}>ลูกค้ายืนยันยอดแล้ว</div>
              <div style={{ fontSize: 12.5, color: '#5C8A6E' }}>{confirmTime}</div>
            </div>
          </div>
        )}
        {isHandoff && (
          <div style={{ background: '#FBF3DF', border: '1px solid #E6CF94', borderRadius: 14, padding: '14px 16px', marginBottom: 16, fontSize: 13, color: '#7A5A22' }}>
            📥 บิลนี้รับเข้ามาจากแท็บเล็ต — พร้อมสั่งปริ้นจากเครื่องนี้ได้เลย
          </div>
        )}
        <button onClick={() => window.print()} style={{ width: '100%', border: 'none', borderRadius: 15, padding: 18, background: 'linear-gradient(135deg,#5C4326,#3F2D1E)', color: '#F6EEDD', fontWeight: 700, fontSize: 18, cursor: 'pointer', boxShadow: '0 8px 18px rgba(63,45,30,.26)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          🖨 ปริ้นบิลจากเครื่องนี้
        </button>
        <p style={{ textAlign: 'center', fontSize: 12, color: '#9A8662', margin: '8px 0 0' }}>เครื่องนี้ต้องต่อกับเครื่องปริ้น · ขนาดกระดาษ A5 (ครึ่ง A4)</p>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {readonly ? (
            <button onClick={onGoBack} style={{ width: '100%', border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 12, padding: 14, fontSize: 15, color: '#7A6450', cursor: 'pointer' }}>‹ กลับ</button>
          ) : (
            <>
              <button onClick={onGoSummary} style={{ flex: 1, border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 12, padding: 13, fontSize: 14, color: '#7A6450', cursor: 'pointer' }}>‹ กลับไปแก้</button>
              <button onClick={onFinish} style={{ flex: 1, border: 'none', background: '#C9A24B', color: '#fff', borderRadius: 12, padding: 13, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>เสร็จสิ้น · บันทึกบิล</button>
            </>
          )}
        </div>
      </div>

      {/* The Bill A5 */}
      <div className="bill-doc-wrapper" style={{ maxWidth: 420, margin: '0 auto' }}>
      <div className="bill-doc" style={{ background: '#fff', border: '1px solid #E4D7BC', borderRadius: 6, boxShadow: '0 10px 30px rgba(95,70,40,.14)', padding: '22px 22px 18px', color: '#2A2118', fontSize: 13 }}>
        <div className="bill-doc-header" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, borderBottom: '2px solid #2A2118', paddingBottom: 12 }}>
          <img src="/logo.jpg" className="bill-doc-logo" style={{ width: 72, height: 72, borderRadius: 8, objectFit: 'cover' }} alt="Qudsun" />
          <div style={{ flex: 1 }}>
            <div className="bill-doc-title" style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 19, letterSpacing: '.04em' }}>ทุเรียนคัดสรร <span style={{ color: '#8A6A2E' }}>QUDSUN</span></div>
            <div style={{ fontSize: 12.5, color: '#5A4A38', marginTop: 2 }}>Premium Durian Selection</div>
            {(() => {
              const plate = session?.vehiclePlate || '';
              const recorder = session?.recorder || '';
              const supervisor = session?.supervisor || (supervisors || {})[session?.sellerPhone || ''] || '';
              const items = [
                plate && { label: 'ทะเบียน', value: plate },
                recorder && { label: 'ผู้จด', value: recorder },
                supervisor && { label: 'ผู้ดูแล', value: supervisor },
              ].filter(Boolean);
              if (!items.length) return null;
              return (
                <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 1, fontSize: 11 }}>
                  {items.map(it => (
                    <div key={it.label}><span style={{ color: '#9A8662' }}>{it.label}: </span><b>{it.value}</b></div>
                  ))}
                </div>
              );
            })()}
          </div>
          <div style={{ textAlign: 'right', minWidth: 130 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>ใบรับซื้อทุเรียน</div>
            <div style={{ fontSize: 12, color: '#5A4A38', marginBottom: 6 }}>เลขที่ {session?.billNo}</div>
            <div style={{ fontSize: 12, color: '#3A2A18', lineHeight: 1.8 }}>
              <div>{session ? dateStr(session.date) : ''}</div>
              {tier ? (() => {
                const g = TIER_GRAD[tier.key] || TIER_GRAD.silver;
                return (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: g.bg, color: g.color, borderRadius: 5, padding: '4px 10px', boxShadow: '0 1px 3px rgba(0,0,0,.18)', marginTop: 2, whiteSpace: 'nowrap' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.color, opacity: .7, flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, fontSize: 12 }}>{session?.seller || '—'}{session?.sellerPhone ? ` · ${session.sellerPhone}` : ''}</span>
                  </div>
                );
              })() : <span><b>{session?.seller || '—'}</b>{session?.sellerPhone ? ` · ${session.sellerPhone}` : ''}</span>}
            </div>
          </div>
        </div>
        {(() => {
          const entries = session?.entries || [];
          if (entries.length === 0) return null;
          const grouped = {};
          entries.forEach(e => {
            const gKey = e.cat === 'custom' ? ('custom:' + (e.customLabel || '')) : e.cat;
            if (!grouped[gKey]) grouped[gKey] = { catKey: e.cat, label: e.customLabel || null, ents: [] };
            grouped[gKey].ents.push(e);
          });
          return (
            <>
              <style>{`
                @media print {
                  .bill-entries-root { margin-top: 6px !important; margin-bottom: 6px !important; }
                  .bill-entries-group { margin-bottom: 4px !important; }
                  .bill-entry-label { font-size: 9px !important; margin-bottom: 3px !important; }
                  .bill-entry-grid { gap: 2px !important; }
                  .bill-entry-chip { padding: 3px 6px !important; border-radius: 3px !important; line-height: 1.1 !important; }
                  .bill-entry-kg { font-size: 11px !important; }
                }
              `}</style>
              <div className="bill-entries-root" style={{ marginTop: 10, marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: '6px 14px', alignItems: 'flex-start' }}>
                {Object.entries(grouped).map(([gKey, grp]) => {
                  const catObj = CATS.find(c => c.key === grp.catKey);
                  const label = grp.label ? grp.label : (catObj?.label || grp.catKey);
                  return (
                    <div key={gKey} className="bill-entries-group" style={{ marginBottom: 0 }}>
                      <div className="bill-entry-label" style={{ fontSize: 15, color: '#8A7A66', fontWeight: 600, marginBottom: 5, letterSpacing: '.03em' }}>{label} — {grp.ents.length} เข่ง</div>
                      <div className="bill-entry-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, max-content)', gap: 5 }}>
                        {grp.ents.map((e, i) => (
                          <div key={e.id || i} className="bill-entry-chip" style={{ border: '1px solid #D8C8A8', borderRadius: 6, padding: '7px 12px', background: '#FFFDF8', textAlign: 'center', lineHeight: 1.15 }}>
                            <span className="bill-entry-kg" style={{ fontWeight: 700, fontSize: 20, color: '#2A2118' }}>{fmtKg(e.kg)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F0E9DA' }}>
              <th style={{ textAlign: 'left', padding: '7px 8px', border: '1px solid #C9BBA0' }}>หมวด</th>
              <th style={{ textAlign: 'right', padding: '7px 8px', border: '1px solid #C9BBA0' }}>น้ำหนัก</th>
              <th style={{ textAlign: 'right', padding: '7px 8px', border: '1px solid #C9BBA0' }}>ราคา/กก.</th>
              <th style={{ textAlign: 'right', padding: '7px 8px', border: '1px solid #C9BBA0' }}>รวม (฿)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(c => {
              const isCustomLabel = c._isCustomLabel;
              const d = isCustomLabel ? c._custRow : aggData[c.key];
              const price = isCustomLabel
                ? (session?.prices[c.key] || session?.prices['custom'] || 0)
                : (session?.prices[c.key] || 0);
              return (
                <tr key={c.key}>
                  <td style={{ padding: '6px 8px', border: '1px solid #C9BBA0' }}>
                    <div>{c.label}</div>
                    {d.count > 0 && <div style={{ fontSize: 11, color: '#8A7A66', marginTop: 1 }}>{d.count} เข่ง</div>}
                  </td>
                  <td style={{ padding: '6px 8px', border: '1px solid #C9BBA0', textAlign: 'right' }}>{fmtKg(d.kg)}</td>
                  <td style={{ padding: '6px 8px', border: '1px solid #C9BBA0', textAlign: 'right' }}>{fmtPrice(price)}</td>
                  <td style={{ padding: '6px 8px', border: '1px solid #C9BBA0', textAlign: 'right' }}>{price ? fmtBaht(d.kg * price) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: '#2A2118', color: '#fff' }}>
              <td style={{ padding: 8, fontWeight: 700 }}>
                <div>รวม</div>
                <div style={{ fontSize: 11, opacity: .75, fontWeight: 400, marginTop: 1 }}>{(session?.entries || []).length} เข่ง</div>
              </td>
              <td style={{ padding: 8, textAlign: 'right', fontWeight: 700 }}>{fmtKg(totalKg)}</td>
              <td style={{ padding: 8 }} />
              <td style={{ padding: 8, textAlign: 'right', fontWeight: 700 }}>{fmtBaht(totalBaht)}</td>
            </tr>
          </tfoot>
        </table>
        {(() => {
          const bInfo = (customerInfo || {})[session?.sellerPhone || ''] || {};
          if (!bInfo.bankAccount) return null;
          return (
            <div style={{ marginTop: 10, padding: '7px 12px', background: '#EEF3FA', border: '1px solid #B8CEE8', borderRadius: 6, fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, color: '#3A5F88' }}>🏦 โอนค่าทุเรียน:</span>
              {bInfo.bankName && <span style={{ color: '#3A5580' }}>{bInfo.bankName}</span>}
              <span style={{ fontFamily: 'Prompt', fontWeight: 700, letterSpacing: '.05em', color: '#1A3A60' }}>{bInfo.bankAccount}</span>
              {(bInfo.fullName || bInfo.note) && <span style={{ color: '#6A7A8A' }}>· {bInfo.fullName || bInfo.note}</span>}
            </div>
          );
        })()}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 36, gap: 20 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ height: 48 }} />
            <div style={{ borderTop: '1px dotted #2A2118', paddingTop: 8, fontSize: 12 }}>ลายเซ็นผู้ขาย</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ height: 48 }} />
            <div style={{ borderTop: '1px dotted #2A2118', paddingTop: 8, fontSize: 12 }}>ลายเซ็นผู้ซื้อ</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <div>
            <div style={{ fontSize: 11.5, color: '#8A7A66' }}>ขอบคุณที่ไว้วางใจ · ทุเรียนคัดสรร Qudsun</div>
            <div style={{ fontSize: 11.5, color: '#8A7A66', marginTop: 2 }}>โทร. 094-149-1914 (วิน) · 082-691-4414 (เบนซ์)</div>
          </div>
          <img src="/qr-bill.png" alt="QR" style={{ width: 88, height: 88, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
        </div>
      </div>
      </div>

      {showBulkUpload && session && (
        <TransferSlipModal bill={session}
          onConfirm={(slipUrl, slipData, receiptUrl, plateUrl) => {
            onBulkUpload(receiptUrl, slipUrl, plateUrl);
            setShowBulkUpload(false);
          }}
          onClose={() => setShowBulkUpload(false)} />
      )}

      {slipOcr && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setSlipOcr(null); }}>
          <div style={{ background: '#FFFDF8', width: '100%', maxWidth: 520, margin: '0 auto', borderRadius: '20px 20px 0 0', padding: '22px 18px 36px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 16, color: '#3F2D1E', marginBottom: 3 }}>ตรวจสอบข้อมูลก่อนบันทึก</div>
            <div style={{ fontSize: 12, color: '#9A8662', marginBottom: 12 }}>แก้ไขข้อมูลธนาคาร แล้วกด "บันทึก" เพื่อ save ลงโปรไฟล์ลูกค้า</div>

            <img src={slipOcr.dataUrl} alt="สลิป" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 10, border: '1px solid #E4D7BC', background: '#f5f5f5', display: 'block', marginBottom: 12 }} />

            {slipOcr.loading && (
              <div style={{ textAlign: 'center', color: '#B7A684', fontSize: 13, padding: '12px 0' }}>⏳ กำลังอ่านข้อมูลสลิป…</div>
            )}

            {!slipOcr.loading && slipOcr.slipData && (() => {
              const sd = slipOcr.slipData;
              return (
                <div style={{ background: '#EFF8F1', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#2E7D32', marginBottom: 14, lineHeight: 1.9 }}>
                  {sd.amount && <div>💰 ยอด: <b>{sd.amount}</b> บาท</div>}
                  {sd.sender && <div>📤 ผู้โอน: {sd.sender}</div>}
                  {sd.recipient && <div>📥 ผู้รับ: {sd.recipient}</div>}
                  {sd.datetime && <div>🕐 เวลา: {sd.datetime}</div>}
                  {sd.ref && <div>📋 อ้างอิง: {sd.ref}</div>}
                </div>
              );
            })()}

            {!slipOcr.loading && !slipOcr.slipData && (
              <div style={{ background: '#FFF8E1', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#8A6E0A', marginBottom: 14 }}>
                ⚠️ อ่านข้อมูลจากสลิปไม่ได้ กรอกเองด้านล่างได้เลย
              </div>
            )}

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#9A8662', marginBottom: 3 }}>ธนาคาร</div>
              <input value={slipOcr.bankName}
                onChange={e => setSlipOcr(s => s ? { ...s, bankName: e.target.value } : s)}
                placeholder="เช่น ธ.กสิกรไทย, ธนาคารกรุงไทย"
                style={{ width: '100%', border: '1.5px solid #E4D7BC', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontFamily: 'Prompt', background: '#fff', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#9A8662', marginBottom: 3 }}>เลขบัญชี</div>
              <input value={slipOcr.bankAccount}
                onChange={e => setSlipOcr(s => s ? { ...s, bankAccount: e.target.value } : s)}
                placeholder="xxx-x-xxxxx-x"
                style={{ width: '100%', border: '1.5px solid #E4D7BC', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontFamily: 'Prompt', background: '#fff', boxSizing: 'border-box', letterSpacing: '.04em' }} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, color: '#9A8662', marginBottom: 3 }}>ชื่อผู้รับ / หมายเหตุ</div>
              <input value={slipOcr.note}
                onChange={e => setSlipOcr(s => s ? { ...s, note: e.target.value } : s)}
                placeholder="ชื่อเจ้าของบัญชี"
                style={{ width: '100%', border: '1.5px solid #E4D7BC', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontFamily: 'Prompt', background: '#fff', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={confirmSlipSave} disabled={slipOcr.loading}
                style={{ flex: 1, background: '#6B8E4E', color: '#fff', border: 'none', borderRadius: 12, padding: '13px 0', fontSize: 14, fontFamily: 'Prompt', fontWeight: 600, cursor: 'pointer', opacity: slipOcr.loading ? 0.6 : 1 }}>
                {slipOcr.loading ? 'รอสักครู่…' : '✓ บันทึกและอัพโหลด'}
              </button>
              <button onClick={skipSlipSave} disabled={slipOcr.loading}
                style={{ background: '#F0EAE0', color: '#7A5A22', border: 'none', borderRadius: 12, padding: '13px 16px', fontSize: 13, fontFamily: 'Prompt', cursor: 'pointer', opacity: slipOcr.loading ? 0.6 : 1 }}>
                ข้ามไป
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BatchTransferModal ────────────────────────────────────────────────────────
function BatchTransferModal({ bills, onConfirm, onClose }) {
  const [slip, setSlip] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const totalBaht = bills.reduce((s, b) => s + (parseFloat(String(b.baht || '0').replace(/,/g, '')) || 0), 0);

  const uploadSlip = async (file) => {
    if (!file) return null;
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = async (e) => {
        try {
          const base64 = e.target.result;
          const path = `QudsunTransfers/${Date.now()}_batch.jpg`;
          const res = await fetch('/api/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ base64, path }) });
          const d = await res.json();
          if (!d.ok) reject(new Error(d.error || 'อัปโหลดไม่สำเร็จ'));
          else resolve(d.url);
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
      reader.readAsDataURL(file);
    });
  };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      let slipUrl = null;
      if (slip) { setUploading(true); slipUrl = await uploadSlip(slip); setUploading(false); }
      onConfirm(slipUrl);
    } catch(e) { alert('เกิดข้อผิดพลาด: ' + e.message); setBusy(false); setUploading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: '#FFFDF8', borderRadius: '20px 20px 0 0', padding: '20px 18px 32px', width: '100%', maxWidth: 480, maxHeight: '85dvh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 16, color: '#3F2D1E', flex: 1 }}>📎 จ่ายรวม {bills.length} บิล</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9A8662' }}>✕</button>
        </div>

        <div style={{ background: '#F9F5EC', borderRadius: 12, padding: '10px 12px', marginBottom: 14, maxHeight: 160, overflowY: 'auto' }}>
          {bills.map(b => (
            <div key={b.billNo} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, marginBottom: 6, borderBottom: '1px solid #EDE0CC', fontSize: 13 }}>
              <span style={{ color: '#5B3A29' }}>{b.seller || 'ไม่ระบุ'} · {b.billNo}</span>
              <span style={{ fontWeight: 600, color: '#3F2D1E' }}>฿{parseFloat(String(b.baht || '0').replace(/,/g, '')).toLocaleString()}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14, color: '#C0392B', paddingTop: 4 }}>
            <span>รวม</span><span>฿{totalBaht.toLocaleString()}</span>
          </div>
        </div>

        <div style={{ fontSize: 13, color: '#7A5A22', fontWeight: 600, marginBottom: 8 }}>สลิปโอนเงิน (ไม่บังคับ)</div>
        <WalletSlipUpload file={slip} uploading={uploading} onUpload={f => setSlip(f)} />

        <button onClick={handleConfirm} disabled={busy}
          style={{ width: '100%', background: busy ? '#aaa' : '#3F2D1E', color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'Prompt', marginTop: 12 }}>
          {busy ? (uploading ? 'กำลังอัปโหลด…' : 'กำลังบันทึก…') : `✅ ยืนยันโอน ${bills.length} บิล · ฿${totalBaht.toLocaleString()}`}
        </button>
      </div>
    </div>
  );
}

// ─── DashboardView ────────────────────────────────────────────────────────────
function TransferSlipModal({ bill, onConfirm, onClose }) {
  const [step, setStep] = useState(1); // 1=ใบเสร็จ 2=สลิป 3=ทะเบียน 4=สรุป
  const [receiptUrl, setReceiptUrl] = useState(null);
  const [slipUrl, setSlipUrl] = useState(null);
  const [plateUrl, setPlateUrl] = useState(null);

  const cam1 = useRef(); const gal1 = useRef();
  const cam2 = useRef(); const gal2 = useRef();
  const cam3 = useRef(); const gal3 = useRef();

  const readFile = setter => e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = ev => setter(ev.target.result);
    r.readAsDataURL(f); e.target.value = '';
  };

  const STEPS = [
    { num: 1, label: 'ใบเสร็จลายเซ็น', emoji: '📄', hint: 'บังคับ — ถ่ายหรืออัปโหลด', url: receiptUrl, setUrl: setReceiptUrl, cam: cam1, gal: gal1, required: true },
    { num: 2, label: 'สลิปโอนเงิน',     emoji: '💸', hint: 'บังคับ — ถ่ายหรืออัปโหลด', url: slipUrl,    setUrl: setSlipUrl,    cam: cam2, gal: gal2, required: true },
    { num: 3, label: 'ทะเบียนรถ',        emoji: '🚗', hint: 'ไม่บังคับ — กดข้ามได้',   url: plateUrl,   setUrl: setPlateUrl,   cam: cam3, gal: gal3, required: false },
  ];
  const cur = STEPS[step - 1];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(42,33,24,.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: '#FFFDF8', borderRadius: '20px 20px 0 0', padding: '20px 18px 32px', width: '100%', maxWidth: 480, boxShadow: '0 -8px 30px rgba(42,33,24,.2)', maxHeight: '92dvh', overflowY: 'auto' }}>

        {/* Progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          {[1,2,3,4].map(s => (
            <React.Fragment key={s}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
                background: step > s ? '#5A9A6A' : step === s ? '#3F2D1E' : '#E4D7BC',
                color: step >= s ? '#F6EEDD' : '#9A8662' }}>
                {step > s ? '✓' : s === 4 ? '📋' : s}
              </div>
              {s < 4 && <div style={{ flex: 1, height: 2, background: step > s ? '#5A9A6A' : '#E4D7BC', borderRadius: 1 }} />}
            </React.Fragment>
          ))}
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#9A8662', marginLeft: 6, flexShrink: 0 }}>✕</button>
        </div>

        {/* Bill info */}
        <div style={{ background: '#F0E9DA', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          <div style={{ fontWeight: 700, color: '#2A2118' }}>{bill.seller || '—'}</div>
          <div style={{ color: '#5A4A38' }}>{bill.billNo} · ฿{bill.baht}</div>
        </div>

        {/* Steps 1–3: upload */}
        {step <= 3 && (
          <>
            <div style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 15, color: '#3F2D1E', marginBottom: 2 }}>{cur.emoji} {cur.label}</div>
            <div style={{ fontSize: 12, color: '#9A8662', marginBottom: 14 }}>{cur.hint}</div>

            <input ref={cur.cam} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={readFile(cur.setUrl)} />
            <input ref={cur.gal} type="file" accept="image/*" style={{ display: 'none' }} onChange={readFile(cur.setUrl)} />

            {cur.url ? (
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <img src={cur.url} alt={cur.label} style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 12, border: '2px solid #5A9A6A', background: '#f5f5f5', display: 'block' }} />
                <button onClick={() => cur.setUrl(null)} style={{ position: 'absolute', top: 8, right: 8, border: 'none', background: 'rgba(0,0,0,.45)', color: '#fff', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 16, lineHeight: '28px', textAlign: 'center' }}>×</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button onClick={() => cur.cam.current?.click()} style={{ flex: 1, border: '1.5px dashed #C9A24B', background: '#FBF6EC', borderRadius: 12, padding: '20px 0', fontSize: 14, fontWeight: 600, color: '#7A5A22', cursor: 'pointer' }}>📷 ถ่ายรูป</button>
                <button onClick={() => cur.gal.current?.click()} style={{ flex: 1, border: '1.5px dashed #5A9A6A', background: '#EFF8F1', borderRadius: 12, padding: '20px 0', fontSize: 14, fontWeight: 600, color: '#2E7D32', cursor: 'pointer' }}>🖼 อัปโหลด</button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              {step > 1 && (
                <button onClick={() => setStep(step - 1)} style={{ border: '1px solid #E4D7BC', background: '#fff', borderRadius: 12, padding: '13px 14px', fontSize: 13, color: '#7A6450', cursor: 'pointer' }}>←</button>
              )}
              <button
                onClick={() => setStep(step + 1)}
                disabled={cur.required && !cur.url}
                style={{ flex: 1, border: 'none', borderRadius: 12, padding: '13px 0', fontSize: 15, fontWeight: 700, cursor: (cur.required && !cur.url) ? 'default' : 'pointer',
                  background: (cur.required && !cur.url) ? '#C8C0B0' : '#3F2D1E', color: '#F6EEDD' }}>
                {step === 3 ? (cur.url ? 'ดูสรุป →' : 'ข้าม →') : 'ถัดไป →'}
              </button>
            </div>
          </>
        )}

        {/* Step 4: Review all */}
        {step === 4 && (
          <>
            <div style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 15, color: '#3F2D1E', marginBottom: 14 }}>📋 ตรวจสอบหลักฐาน</div>
            <div style={{ display: 'grid', gridTemplateColumns: plateUrl ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10, marginBottom: 18 }}>
              {[
                { label: 'ใบเสร็จ', url: receiptUrl },
                { label: 'สลิป',    url: slipUrl },
                plateUrl ? { label: 'ทะเบียน', url: plateUrl } : null,
              ].filter(Boolean).map(({ label, url }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <img src={url} alt={label} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, border: '1.5px solid #E4D7BC', display: 'block', marginBottom: 5 }} />
                  <div style={{ fontSize: 11, color: '#7A6450', fontWeight: 600 }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep(3)} style={{ border: '1px solid #E4D7BC', background: '#fff', borderRadius: 12, padding: '13px 14px', fontSize: 13, color: '#7A6450', cursor: 'pointer' }}>← แก้ไข</button>
              <button onClick={() => onConfirm(slipUrl, null, receiptUrl, plateUrl)}
                style={{ flex: 1, border: 'none', borderRadius: 12, padding: '13px 0', background: '#5A9A6A', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>
                ✓ ยืนยันโอนแล้ว
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CancelPaymentModal({ bill, pin, onConfirm, onClose }) {
  const [pinVal, setPinVal] = useState('');
  const [note, setNote] = useState('');
  const [pinErr, setPinErr] = useState('');
  const keys = ['1','2','3','4','5','6','7','8','9','⌫','0','✓'];
  const S = { border: '1px solid #E4D7BC', background: '#FBF6EC', borderRadius: 11, padding: '13px 0', fontSize: 20, color: '#3F2D1E', cursor: 'pointer' };
  const F = { border: '1px solid #E0D2B4', background: '#F3E9D2', borderRadius: 11, padding: '13px 0', fontSize: 18, color: '#7A5A22', cursor: 'pointer' };
  const handleKey = k => {
    if (k === '⌫') { setPinVal(v => v.slice(0, -1)); setPinErr(''); return; }
    if (k === '✓') {
      if (pinVal.length < 4) return;
      if (pinVal !== pin) { setPinErr('รหัสไม่ถูกต้อง'); setPinVal(''); return; }
      if (!note.trim()) { setPinErr('กรุณาใส่หมายเหตุ'); return; }
      onConfirm(note.trim());
      return;
    }
    if (pinVal.length < 4) setPinVal(v => v + k);
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(42,33,24,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div style={{ background: '#FFFDF8', borderRadius: 20, padding: '22px 18px', width: '100%', maxWidth: 340 }}>
        <div style={{ textAlign: 'center', fontSize: 24, marginBottom: 4 }}>🔒</div>
        <h3 style={{ textAlign: 'center', fontFamily: 'Prompt', fontWeight: 500, fontSize: 16, margin: '0 0 4px', color: '#4A3526' }}>ยกเลิกการชำระ</h3>
        <p style={{ textAlign: 'center', fontSize: 12, color: '#9A8662', margin: '0 0 12px' }}>{bill.billNo} · ฿{bill.baht}</p>
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="หมายเหตุ (บังคับ) เช่น โอนผิด, แก้ไขยอด" rows={2}
          style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #E4D7BC', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', resize: 'none', marginBottom: 12, outline: 'none' }} />
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 6 }}>
          {[0,1,2,3].map(i => <span key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: i < pinVal.length ? '#C9A24B' : '#E4D7BC', border: '1.5px solid #C9A24B', display: 'inline-block' }} />)}
        </div>
        <p style={{ textAlign: 'center', fontSize: 11, color: '#C0392B', minHeight: 14, margin: '0 0 8px' }}>{pinErr}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7, marginBottom: 10 }}>
          {keys.map(k => <button key={k} onClick={() => handleKey(k)} style={k === '⌫' || k === '✓' ? F : S}>{k}</button>)}
        </div>
        <button onClick={onClose} style={{ width: '100%', border: 'none', background: 'none', color: '#9A8662', fontSize: 13, cursor: 'pointer', padding: 6 }}>ยกเลิก</button>
      </div>
    </div>
  );
}

function DeleteBillModal({ bill, pin, onConfirm, onClose }) {
  const [pinVal, setPinVal] = useState('');
  const [pinErr, setPinErr] = useState('');
  const keys = ['1','2','3','4','5','6','7','8','9','⌫','0','✓'];
  const S = { border: '1px solid #E4D7BC', background: '#FBF6EC', borderRadius: 11, padding: '13px 0', fontSize: 20, color: '#3F2D1E', cursor: 'pointer' };
  const F = { border: '1px solid #E0D2B4', background: '#F3E9D2', borderRadius: 11, padding: '13px 0', fontSize: 18, color: '#7A5A22', cursor: 'pointer' };
  const handleKey = k => {
    if (k === '⌫') { setPinVal(v => v.slice(0, -1)); setPinErr(''); return; }
    if (k === '✓') {
      if (pinVal.length < 4) return;
      if (pinVal !== pin) { setPinErr('รหัสไม่ถูกต้อง'); setPinVal(''); return; }
      onConfirm();
      return;
    }
    if (pinVal.length < 4) setPinVal(v => v + k);
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(42,33,24,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div style={{ background: '#FFFDF8', borderRadius: 20, padding: '22px 18px', width: '100%', maxWidth: 340 }}>
        <div style={{ textAlign: 'center', fontSize: 24, marginBottom: 4 }}>🗑️</div>
        <h3 style={{ textAlign: 'center', fontFamily: 'Prompt', fontWeight: 500, fontSize: 16, margin: '0 0 4px', color: '#C0392B' }}>ลบบิล</h3>
        <p style={{ textAlign: 'center', fontSize: 12, color: '#9A8662', margin: '0 0 4px' }}>{bill.seller || '—'}</p>
        <p style={{ textAlign: 'center', fontSize: 12, color: '#9A8662', margin: '0 0 14px' }}>{bill.billNo} · ฿{bill.baht}</p>
        <p style={{ textAlign: 'center', fontSize: 11, color: '#C0392B', margin: '0 0 14px', background: '#FDECEA', borderRadius: 8, padding: '8px 12px' }}>
          บิลจะถูกลบถาวรและไม่สามารถกู้คืนได้
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 6 }}>
          {[0,1,2,3].map(i => <span key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: i < pinVal.length ? '#C0392B' : '#E4D7BC', border: '1.5px solid #C0392B', display: 'inline-block' }} />)}
        </div>
        <p style={{ textAlign: 'center', fontSize: 11, color: '#C0392B', minHeight: 14, margin: '0 0 8px' }}>{pinErr}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7, marginBottom: 10 }}>
          {keys.map(k => <button key={k} onClick={() => handleKey(k)} style={k === '⌫' || k === '✓' ? F : S}>{k}</button>)}
        </div>
        <button onClick={onClose} style={{ width: '100%', border: 'none', background: 'none', color: '#9A8662', fontSize: 13, cursor: 'pointer', padding: 6 }}>ยกเลิก</button>
      </div>
    </div>
  );
}

function ResetDataModal({ pin, onConfirm, onClose }) {
  const [pinVal, setPinVal] = useState('');
  const [pinErr, setPinErr] = useState('');
  const [busy, setBusy] = useState(false);
  const keys = ['1','2','3','4','5','6','7','8','9','⌫','0','✓'];
  const S = { border: '1px solid #E4D7BC', background: '#FBF6EC', borderRadius: 11, padding: '13px 0', fontSize: 20, color: '#3F2D1E', cursor: 'pointer' };
  const F = { border: '1px solid #E0D2B4', background: '#F3E9D2', borderRadius: 11, padding: '13px 0', fontSize: 18, color: '#7A5A22', cursor: 'pointer' };
  const handleKey = async k => {
    if (busy) return;
    if (k === '⌫') { setPinVal(v => v.slice(0, -1)); setPinErr(''); return; }
    if (k === '✓') {
      if (pinVal.length < 4) return;
      if (pinVal !== pin) { setPinErr('รหัสไม่ถูกต้อง'); setPinVal(''); return; }
      setBusy(true);
      try { await onConfirm(); } catch (e) { setPinErr('เกิดข้อผิดพลาด: ' + e.message); setBusy(false); }
      return;
    }
    if (pinVal.length < 4) setPinVal(v => v + k);
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(42,33,24,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div style={{ background: '#FFFDF8', borderRadius: 20, padding: '22px 18px', width: '100%', maxWidth: 340 }}>
        <div style={{ textAlign: 'center', fontSize: 28, marginBottom: 4 }}>⚠️</div>
        <h3 style={{ textAlign: 'center', fontFamily: 'Prompt', fontWeight: 600, fontSize: 16, margin: '0 0 6px', color: '#C0392B' }}>รีเซ็ตข้อมูลทั้งหมด</h3>
        <div style={{ background: '#FDECEA', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#7B1D1D', lineHeight: 1.7 }}>
          <b>จะล้างข้อมูลต่อไปนี้:</b><br />
          • บิลซื้อ / บิลขาย ทั้งหมด<br />
          • การชำระเงินทุกบิล<br />
          • รายรับ / การจ่ายเงินผู้ดูแล<br />
          • ค่าคอมรายโล &amp; เงินเดือนผู้ดูแล<br />
          <br />
          <b>ข้อมูลที่จะคงอยู่:</b><br />
          • ข้อมูลลูกค้า, ชื่อที่ยืนยัน, ทะเบียนรถ<br />
          • รายชื่อผู้ดูแล / พนักงาน / บัญชี
        </div>
        {busy ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#9A8662', fontSize: 14 }}>กำลังล้างข้อมูล…</div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 6 }}>
              {[0,1,2,3].map(i => <span key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: i < pinVal.length ? '#C0392B' : '#E4D7BC', border: '1.5px solid #C0392B', display: 'inline-block' }} />)}
            </div>
            <p style={{ textAlign: 'center', fontSize: 11, color: '#C0392B', minHeight: 14, margin: '0 0 8px' }}>{pinErr || 'กรอก Admin PIN เพื่อยืนยัน'}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7, marginBottom: 10 }}>
              {keys.map(k => <button key={k} onClick={() => handleKey(k)} style={k === '⌫' || k === '✓' ? F : S}>{k}</button>)}
            </div>
          </>
        )}
        <button onClick={onClose} disabled={busy} style={{ width: '100%', border: 'none', background: 'none', color: '#9A8662', fontSize: 13, cursor: 'pointer', padding: 6, opacity: busy ? 0.4 : 1 }}>ยกเลิก</button>
      </div>
    </div>
  );
}

function DashboardView({ payments, pin, onPayment, onBatchPayment, onDeleteBill, onGoHome, onOpenHistory, isEmployee }) {
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [transferBill, setTransferBill] = useState(null);
  const [cancelBill, setCancelBill] = useState(null);
  const [deleteBill, setDeleteBill] = useState(null);
  const [billsData, setBillsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [batchMode, setBatchMode] = useState(false);
  const [selectedBills, setSelectedBills] = useState(new Set());
  const [batchModalBills, setBatchModalBills] = useState(null);
  const loadBills = useCallback(() => {
    setLoading(true);
    db.getBills().then(d => { setBillsData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  useEffect(() => { loadBills(); }, [loadBills]);

  const STATUS = {
    unpaid:      { label: 'ยังไม่โอน', color: '#E07A5F', bg: '#FDECEA', text: '#C0392B' },
    transferred: { label: 'โอนแล้ว',   color: '#5A9A6A', bg: '#E6F4EA', text: '#2E7D32' },
    cash:        { label: 'เงินสด',    color: '#5A7FA8', bg: '#E8EEF8', text: '#1A4D80' },
  };

  const toDateStr = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

  const allDayBills = billsData
    .filter(h => { if (!h.date) return false; if (statusFilter === 'unpaid') return true; const ds = toDateStr(h.date); return ds >= startDate && ds <= endDate; })
    .map(h => ({ ...h, pay: payments[h.billNo] || { status: 'unpaid' } }))
    .sort((a, b) => (b.date || 0) - (a.date || 0));

  const dayBills = statusFilter === 'unpaid' ? allDayBills.filter(b => b.pay.status === 'unpaid')
    : statusFilter === 'paid' ? allDayBills.filter(b => b.pay.status !== 'unpaid')
    : allDayBills;

  const totalKg   = allDayBills.reduce((s, b) => s + (parseFloat((b.kg || '0').replace(/,/g, '')) || 0), 0);
  const totalBaht = allDayBills.reduce((s, b) => s + (parseFloat((b.baht || '0').replace(/,/g, '')) || 0), 0);
  const nUnpaid   = allDayBills.filter(b => b.pay.status === 'unpaid').length;
  const nPaid     = allDayBills.length - nUnpaid;

  const selectedBaht = [...selectedBills].reduce((s, bn) => {
    const b = allDayBills.find(x => x.billNo === bn);
    return s + (b ? parseFloat(String(b.baht || '0').replace(/,/g, '')) || 0 : 0);
  }, 0);

  const toggleBill = (billNo) => {
    const next = new Set(selectedBills);
    if (next.has(billNo)) next.delete(billNo); else next.add(billNo);
    setSelectedBills(next);
  };

  const fmt    = n => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtKg2 = n => n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  return (
    <div style={{ flex: 1, padding: '14px 14px 60px', maxWidth: 620, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <button onClick={onGoHome} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#7A6450' }}>‹</button>
          <span style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 18, color: '#3F2D1E' }}>ยอดซื้อ</span>
          <button onClick={loadBills} disabled={loading} style={{ marginLeft: 'auto', border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: '#7A6450', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>⟳ รีเฟรช</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }}
            style={{ flex: 1, border: '1px solid #E4D7BC', borderRadius: 8, padding: '6px 8px', fontSize: 12, fontFamily: 'Prompt', color: '#4A3526', background: '#FFFDF8' }} />
          <span style={{ color: '#9A8662', fontSize: 13 }}>→</span>
          <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); if (e.target.value < startDate) setStartDate(e.target.value); }}
            style={{ flex: 1, border: '1px solid #E4D7BC', borderRadius: 8, padding: '6px 8px', fontSize: 12, fontFamily: 'Prompt', color: '#4A3526', background: '#FFFDF8' }} />
        </div>
      </div>

      {/* Summary card */}
      <div style={{ background: '#FFFDF8', border: '1px solid #E4D7BC', borderRadius: 16, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div style={{ background: '#FFF3E0', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: '#8A5E00', marginBottom: 4 }}>📥 ซื้อรวม</div>
            <div style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 17, color: '#4A3526' }}>{fmtKg2(totalKg)} กก.</div>
            <div style={{ fontSize: 13, color: '#7A5A22', marginTop: 2 }}>฿{fmt(totalBaht)}</div>
            {dayBills.length > 0 && <div style={{ fontSize: 10, color: '#B7A684', marginTop: 4 }}>{dayBills.length} บิล</div>}
          </div>
          <div style={{ background: nUnpaid > 0 ? '#FDECEA' : '#E6F4EA', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: nUnpaid > 0 ? '#8A0000' : '#1B5E20', marginBottom: 4 }}>{nUnpaid > 0 ? '⏳ ค้างชำระ' : '✅ ชำระครบ'}</div>
            <div style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 17, color: nUnpaid > 0 ? '#C0392B' : '#1B5E20' }}>{nUnpaid > 0 ? `${nUnpaid} บิล` : `${nPaid} บิล`}</div>
            <div style={{ fontSize: 13, color: nUnpaid > 0 ? '#C0392B' : '#2E7D32', marginTop: 2 }}>{nUnpaid > 0 ? `จ่ายแล้ว ${nPaid} บิล` : 'จ่ายครบแล้ว'}</div>
          </div>
        </div>
      </div>

      {/* Filter tabs + batch mode */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        {[['all','ทั้งหมด'], ['unpaid','รอจ่าย'], ['paid','จ่ายแล้ว']].map(([v,l]) => (
          <button key={v} onClick={() => { setStatusFilter(v); setBatchMode(false); setSelectedBills(new Set()); }}
            style={{ padding: '6px 12px', borderRadius: 20, border: `1.5px solid ${statusFilter === v ? '#5B3A29' : '#E4D7BC'}`, background: statusFilter === v ? '#5B3A29' : '#FFFDF8', color: statusFilter === v ? '#fff' : '#7A6450', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {l}{v === 'unpaid' && nUnpaid > 0 ? ` (${nUnpaid})` : ''}
          </button>
        ))}
        {!isEmployee && nUnpaid > 0 && (
          <button onClick={() => { setBatchMode(!batchMode); setSelectedBills(new Set()); if (!batchMode && statusFilter === 'paid') setStatusFilter('unpaid'); }}
            style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 20, border: `1.5px solid ${batchMode ? '#DC743C' : '#E4D7BC'}`, background: batchMode ? '#FFF3E6' : '#FFFDF8', color: batchMode ? '#DC743C' : '#7A6450', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {batchMode ? '✕ ยกเลิก' : '☑ เลือกหลายบิล'}
          </button>
        )}
      </div>

      {loading && <div style={{ textAlign: 'center', color: '#B7A684', fontSize: 13, padding: '20px 0' }}>กำลังโหลด…</div>}
      {!loading && dayBills.length === 0 && (
        <div style={{ textAlign: 'center', color: '#B7A684', fontSize: 13, padding: '20px 0' }}>ไม่มีบิลในช่วงวันที่เลือก</div>
      )}

      {dayBills.map(b => {
        const st = STATUS[b.pay.status] || STATUS.unpaid;
        const billTime = b.date ? new Date(b.date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.' : '';
        const billDateLabel = b.date ? new Date(b.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '';
        const isUnpaid = b.pay.status === 'unpaid';
        const isSelected = selectedBills.has(b.billNo);
        return (
          <div key={b.billNo}
            onClick={batchMode && isUnpaid ? () => toggleBill(b.billNo) : undefined}
            style={{ background: isSelected ? '#FFF3E6' : '#FFFDF8', border: `1px solid ${isSelected ? '#DC743C' : '#E4D7BC'}`, borderLeft: `4px solid ${isSelected ? '#DC743C' : st.color}`, borderRadius: 14, marginBottom: 10, overflow: 'hidden', cursor: batchMode && isUnpaid ? 'pointer' : 'default', position: 'relative' }}>
            <div style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              {b.pay.slipUrl && (
                <a href={b.pay.slipUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                  <img src={b.pay.slipUrl} alt="สลิป" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid #C8E6C9', flexShrink: 0, display: 'block' }} />
                </a>
              )}
              <button onClick={() => onOpenHistory && onOpenHistory(b)}
                style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: onOpenHistory ? 'pointer' : 'default' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#2A2118' }}>{b.seller || '—'}</div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.text, fontWeight: 600 }}>{st.label}</span>
                </div>
                <div style={{ fontSize: 12, color: '#8A7A66' }}>{b.billNo} · {b.kg} กก.{billDateLabel ? ` · ${billDateLabel}` : ''}{billTime ? ` · ${billTime}` : ''}</div>
              </button>
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                {batchMode && isUnpaid
                  ? <div style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${isSelected ? '#DC743C' : '#C8B89A'}`, background: isSelected ? '#DC743C' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#fff' }}>{isSelected ? '✓' : ''}</div>
                  : <div style={{ fontWeight: 700, fontSize: 16, color: '#3F2D1E' }}>฿{b.baht}</div>
                }
                {!isEmployee && !batchMode && <button onClick={(e) => { e.stopPropagation(); setDeleteBill(b); }} style={{ border: 'none', background: 'none', padding: '2px 4px', cursor: 'pointer', fontSize: 14, color: '#C8B89A', lineHeight: 1 }}>🗑</button>}
              </div>
            </div>
            </div>
            {!isEmployee && !batchMode && (
            <div style={{ padding: '0 16px 14px' }}>
              {b.pay.status === 'unpaid' ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={(e) => { e.stopPropagation(); setTransferBill(b); }}
                    style={{ flex: 2, border: 'none', borderRadius: 10, padding: '9px 0', background: '#3F2D1E', color: '#F6EEDD', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                    📎 อัปโหลดหลักฐาน
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onPayment(b.billNo, 'cash'); }}
                    style={{ flex: 1, border: '1px solid #5A7FA8', borderRadius: 10, padding: '9px 0', background: '#E8EEF8', color: '#1A4D80', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                    💵 เงินสด
                  </button>
                </div>
              ) : (
                <button onClick={(e) => { e.stopPropagation(); setCancelBill(b); }}
                  style={{ width: '100%', border: '1px solid #D0C8C0', borderRadius: 10, padding: '8px 0', background: '#fff', color: '#8A7A66', fontSize: 12, cursor: 'pointer' }}>
                  🔒 ยกเลิกการชำระ
                </button>
              )}
            </div>
            )}
          </div>
        );
      })}

      {/* Batch sticky bar */}
      {batchMode && selectedBills.size > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#3F2D1E', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, zIndex: 50, boxShadow: '0 -2px 12px rgba(0,0,0,.2)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#F6EEDD', fontSize: 13, fontWeight: 600 }}>เลือก {selectedBills.size} บิล</div>
            <div style={{ color: '#DC743C', fontSize: 12 }}>฿{selectedBaht.toLocaleString()}</div>
          </div>
          <button onClick={() => {
            const bills = allDayBills.filter(b => selectedBills.has(b.billNo));
            setBatchModalBills(bills);
          }} style={{ background: '#DC743C', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            📎 จ่ายรวม
          </button>
        </div>
      )}

      {batchModalBills && (
        <BatchTransferModal bills={batchModalBills}
          onConfirm={(slipUrl) => {
            onBatchPayment(batchModalBills.map(b => b.billNo), slipUrl);
            setBatchModalBills(null); setBatchMode(false); setSelectedBills(new Set());
          }}
          onClose={() => setBatchModalBills(null)} />
      )}

      {transferBill && (
        <TransferSlipModal bill={transferBill}
          onConfirm={(slipPhotoUrl, slipData, receiptUrl, plateUrl) => { onPayment(transferBill.billNo, 'transferred', slipPhotoUrl, slipData, null, receiptUrl, plateUrl); setTransferBill(null); }}
          onClose={() => setTransferBill(null)} />
      )}
      {cancelBill && (
        <CancelPaymentModal bill={cancelBill} pin={pin}
          onConfirm={note => { onPayment(cancelBill.billNo, 'unpaid', null, null, note); setCancelBill(null); }}
          onClose={() => setCancelBill(null)} />
      )}
      {deleteBill && (
        <DeleteBillModal bill={deleteBill} pin={pin}
          onConfirm={() => { onDeleteBill(deleteBill.billNo); setDeleteBill(null); }}
          onClose={() => setDeleteBill(null)} />
      )}
    </div>
  );
}

// ─── SalesView ────────────────────────────────────────────────────────────────
function AddSaleModal({ date, accounts, onSave, onClose, onSaveAccount }) {
  const [account, setAccount] = useState(accounts[0] || '');
  const [isNew, setIsNew] = useState(accounts.length === 0);
  const [newAcct, setNewAcct] = useState('');
  const [kg, setKg] = useState('');
  const [baht, setBaht] = useState('');
  const [status, setStatus] = useState('cash');
  const [receiptPreview, setReceiptPreview] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const camRef = useRef();
  const galleryRef = useRef();

  const handleReceiptFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setReceiptPreview(dataUrl);
      try {
        const res = await fetch('/api/drive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ base64: dataUrl, filename: `sale_receipt_${Date.now()}.jpg`, folder: 'QudsunSaleReceipts' }) });
        const data = await res.json();
        setReceiptUrl(data.ok && data.fileId ? `https://drive.google.com/uc?id=${data.fileId}` : dataUrl);
      } catch { setReceiptUrl(dataUrl); }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!baht && !kg) return;
    const acct = isNew ? newAcct.trim() : account;
    if (isNew && acct) onSaveAccount(acct);
    setLoading(true);
    await onSave({ account: acct, kg: Number(kg) || 0, baht: Number(baht) || 0, receiptUrl, status, date });
    setLoading(false);
  };

  const inp = { width: '100%', border: '1.5px solid #E4D7BC', borderRadius: 8, padding: '11px 12px', fontSize: 15, fontFamily: 'Prompt', background: '#fff', boxSizing: 'border-box' };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#FFFDF8', width: '100%', maxWidth: 520, margin: '0 auto', borderRadius: '20px 20px 0 0', padding: '22px 18px 36px', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 16, color: '#3F2D1E', marginBottom: 14 }}>เพิ่มยอดขาย</div>

        <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { handleReceiptFile(e.target.files[0]); e.target.value = ''; }} />
        <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { handleReceiptFile(e.target.files[0]); e.target.value = ''; }} />

        {receiptPreview ? (
          <div style={{ marginBottom: 14, position: 'relative' }}>
            <img src={receiptPreview} alt="ใบเสร็จ" style={{ width: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 10, border: '1px solid #E4D7BC', background: '#f5f5f5', display: 'block' }} />
            <button onClick={() => { setReceiptPreview(''); setReceiptUrl(''); }} style={{ position: 'absolute', top: 6, right: 6, border: 'none', background: 'rgba(0,0,0,.4)', color: '#fff', borderRadius: '50%', width: 26, height: 26, cursor: 'pointer', fontSize: 15, lineHeight: '26px' }}>×</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button onClick={() => camRef.current?.click()} style={{ flex: 1, border: '1.5px dashed #C9A24B', background: 'none', borderRadius: 10, padding: '10px 0', fontSize: 13, color: '#7A5A22', cursor: 'pointer' }}>📷 ถ่ายรูปใบเสร็จ</button>
            <button onClick={() => galleryRef.current?.click()} style={{ flex: 1, border: '1.5px dashed #9AB87A', background: 'none', borderRadius: 10, padding: '10px 0', fontSize: 13, color: '#4A7A2E', cursor: 'pointer' }}>🖼 อัพโหลด</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#9A8662', marginBottom: 4 }}>น้ำหนัก (กก.)</div>
            <input value={kg} onChange={e => setKg(e.target.value)} type="number" placeholder="0.00" inputMode="decimal" autoFocus style={inp} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#9A8662', marginBottom: 4 }}>ยอดขาย (บาท)</div>
            <input value={baht} onChange={e => setBaht(e.target.value)} type="number" placeholder="0.00" inputMode="decimal" style={inp} />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: '#9A8662', marginBottom: 4 }}>เลขบัญชีที่รับเงิน</div>
          {!isNew ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={account} onChange={e => {
                if (e.target.value === '__new__') { setIsNew(true); setNewAcct(''); }
                else setAccount(e.target.value);
              }} style={{ ...inp, flex: 1 }}>
                {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                <option value="__new__">+ เพิ่มบัญชีใหม่</option>
              </select>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={newAcct} onChange={e => setNewAcct(e.target.value)} placeholder="เช่น 012-3-45678-9 ธ.กสิกร" style={{ ...inp, flex: 1 }} />
              {accounts.length > 0 && (
                <button onClick={() => { setIsNew(false); setAccount(accounts[0]); }} style={{ border: '1px solid #E4D7BC', background: '#F5F0E8', borderRadius: 8, padding: '0 12px', fontSize: 13, color: '#7A5A22', cursor: 'pointer' }}>เลือก</button>
              )}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: '#9A8662', marginBottom: 6 }}>สถานะการรับเงิน</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { key: 'cash',        label: '💵 เงินสด',         active: '#2E7D32', activeBg: '#E8F5E9' },
              { key: 'transferred', label: '✅ โอนแล้ว',         active: '#1565C0', activeBg: '#E3F2FD' },
              { key: 'pending',     label: '⏳ ยังไม่ได้โอน',   active: '#E65100', activeBg: '#FFF3E0' },
            ].map(opt => (
              <button key={opt.key} onClick={() => setStatus(opt.key)}
                style={{ flex: 1, border: `2px solid ${status === opt.key ? opt.active : '#E4D7BC'}`, background: status === opt.key ? opt.activeBg : '#fff', borderRadius: 10, padding: '10px 4px', fontSize: 12, fontFamily: 'Prompt', fontWeight: 600, color: status === opt.key ? opt.active : '#9A8662', cursor: 'pointer' }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSave} disabled={loading || (!baht && !kg)}
            style={{ flex: 1, background: '#6B8E4E', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 0', fontSize: 15, fontFamily: 'Prompt', fontWeight: 600, cursor: 'pointer', opacity: (!baht && !kg) ? 0.5 : 1 }}>
            {loading ? 'กำลังบันทึก…' : '✓ บันทึกยอดขาย'}
          </button>
          <button onClick={onClose} style={{ background: '#F0EAE0', color: '#7A5A22', border: 'none', borderRadius: 12, padding: '14px 16px', fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
        </div>
      </div>
    </div>
  );
}

function SalesView({ accounts, pin, onGoHome, onAddSale, onDeleteSale, onUpdateSale, onSaveAccount, onOpenHistory, onNewSaleSession, isEmployee }) {
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [addOpen, setAddOpen] = useState(false);
  const [billsData, setBillsData] = useState([]);
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([db.getBills(), db.getSales()])
      .then(([bills, sl]) => { setBillsData(bills); setSalesData(sl); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  useEffect(() => { loadData(); }, [loadData]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePinVal, setDeletePinVal] = useState('');
  const [deletePinErr, setDeletePinErr] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [uploadingSaleId, setUploadingSaleId] = useState(null);
  const receiptInputRef = useRef();
  const uploadTargetRef = useRef(null);

  const handleSaleReceiptUpload = (file, saleId) => {
    if (!file) return;
    setUploadingSaleId(saleId);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      try {
        const res = await fetch('/api/drive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ base64: dataUrl, filename: `sale_bill_${Date.now()}.jpg`, folder: 'QudsunSaleBills' }) });
        const data = await res.json();
        const url = data.ok && data.fileId ? `https://drive.google.com/uc?id=${data.fileId}` : dataUrl;
        await onUpdateSale(saleId, { receiptUrl: url });
      } catch {
        await onUpdateSale(saleId, { receiptUrl: dataUrl });
      }
      setUploadingSaleId(null);
    };
    reader.readAsDataURL(file);
  };

  const toDateStr = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

  const inBills = billsData.filter(h => { if (!h.date) return false; const ds = toDateStr(h.date); return ds >= startDate && ds <= endDate; });
  const inKg = inBills.reduce((sum, h) => sum + (grandKg(h.data) || 0), 0);
  const inBaht = inBills.reduce((sum, h) => sum + (grandBaht(h.data) || 0), 0);

  const outSales = (salesData || []).filter(s => { if (!s.date) return false; const ds = toDateStr(s.date); return ds >= startDate && ds <= endDate; }).sort((a, b) => b.date - a.date);
  const outKg = outSales.reduce((sum, s) => sum + (Number(s.kg) || 0), 0);
  const outBaht = outSales.reduce((sum, s) => sum + (Number(s.baht) || 0), 0);

  const profit = outBaht - inBaht;

  return (
    <div style={{ flex: 1, padding: '14px 14px 60px', maxWidth: 620, margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <button onClick={onGoHome} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#7A6450' }}>‹</button>
          <span style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 18, color: '#3F2D1E' }}>ยอดขาย</span>
          <button onClick={loadData} disabled={loading} style={{ marginLeft: 'auto', border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: '#7A6450', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>⟳ รีเฟรช</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }}
            style={{ flex: 1, border: '1px solid #E4D7BC', borderRadius: 8, padding: '6px 8px', fontSize: 12, fontFamily: 'Prompt', color: '#4A3526', background: '#FFFDF8' }} />
          <span style={{ color: '#9A8662', fontSize: 13 }}>→</span>
          <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); if (e.target.value < startDate) setStartDate(e.target.value); }}
            style={{ flex: 1, border: '1px solid #E4D7BC', borderRadius: 8, padding: '6px 8px', fontSize: 12, fontFamily: 'Prompt', color: '#4A3526', background: '#FFFDF8' }} />
        </div>
      </div>

      {/* Summary */}
      <div style={{ background: '#FFFDF8', border: '1px solid #E4D7BC', borderRadius: 16, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div style={{ background: '#FFF3E0', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: '#8A5E00', marginBottom: 4 }}>📥 ขาเข้า (รับซื้อ)</div>
            <div style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 17, color: '#4A3526' }}>{fmtKg(inKg)} กก.</div>
            <div style={{ fontSize: 13, color: '#7A5A22', marginTop: 2 }}>฿{fmtBaht(inBaht)}</div>
            {inBills.length > 0 && <div style={{ fontSize: 10, color: '#B7A684', marginTop: 4 }}>{inBills.length} บิล</div>}
          </div>
          <div style={{ background: '#E8F5E9', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: '#2E7D32', marginBottom: 4 }}>📤 ขาออก (ขาย)</div>
            <div style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 17, color: '#1B5E20' }}>{fmtKg(outKg)} กก.</div>
            <div style={{ fontSize: 13, color: '#2E7D32', marginTop: 2 }}>฿{fmtBaht(outBaht)}</div>
            {outSales.length > 0 && <div style={{ fontSize: 10, color: '#81C784', marginTop: 4 }}>{outSales.length} รายการ</div>}
          </div>
        </div>
        <div style={{ borderTop: '1px solid #E4D7BC', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#9A8662' }}>กำไร / ขาดทุน</div>
            {inKg > 0 && outKg > 0 && (
              <div style={{ fontSize: 10, color: '#B7A684', marginTop: 2 }}>น้ำหนักต่าง {fmtKg(Math.abs(inKg - outKg))} กก.</div>
            )}
          </div>
          <div style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 22, color: profit >= 0 ? '#2E7D32' : '#C62828' }}>
            {profit >= 0 ? '+' : '-'}฿{fmtBaht(Math.abs(profit))}
          </div>
        </div>
      </div>

      {/* ขาออก */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#4A3526' }}>รายการขาย</span>
        <div style={{ flex: 1, height: 1, background: '#E4D7BC' }} />
        {!isEmployee && onNewSaleSession && <button onClick={onNewSaleSession} style={{ border: 'none', background: 'linear-gradient(135deg,#4A7A2E,#2E5C1A)', color: '#fff', borderRadius: 10, padding: '7px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'Prompt', fontWeight: 600 }}>🧾 ใบขายใหม่</button>}
        {!isEmployee && <button onClick={() => setAddOpen(true)} style={{ border: '1px solid #6B8E4E', background: '#fff', color: '#4A6E30', borderRadius: 10, padding: '7px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'Prompt' }}>+ เพิ่ม</button>}
      </div>

      {outSales.length === 0 && (
        <div style={{ textAlign: 'center', color: '#B7A684', fontSize: 13, padding: '20px 0' }}>ยังไม่มีรายการขาย</div>
      )}
      {outSales.map(s => {
        const st = s.note || 'cash';
        const nextSt = st === 'cash' ? 'transferred' : st === 'transferred' ? 'pending' : 'cash';
        const stMap = {
          cash:        { label: '💵 เงินสด',       bg: '#E8F5E9', color: '#2E7D32', border: '#C8E6C9' },
          transferred: { label: '✅ โอนแล้ว',       bg: '#E3F2FD', color: '#1565C0', border: '#90CAF9' },
          pending:     { label: '⏳ ยังไม่ได้โอน', bg: '#FFF3E0', color: '#E65100', border: '#FFB74D' },
        };
        const badge = stMap[st] || stMap.cash;
        const expanded = expandedId === s.id;
        const timeStr = s.date ? new Date(s.date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.' : '';
        const saleDateLabel = s.date ? new Date(s.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '';
        return (
          <div key={s.id} style={{ background: '#FFFDF8', border: `1px solid ${badge.border}`, borderRadius: 14, marginBottom: 10, overflow: 'hidden' }}>
            <button onClick={() => setExpandedId(expanded ? null : s.id)}
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#1B5E20' }}>{fmtKg(Number(s.kg))} กก. · ฿{fmtBaht(Number(s.baht))}</span>
                  <span style={{ borderRadius: 20, padding: '2px 9px', fontSize: 11, fontFamily: 'Prompt', fontWeight: 600, background: badge.bg, color: badge.color }}>{badge.label}</span>
                </div>
                <div style={{ fontSize: 11.5, color: '#9A8662', marginTop: 3 }}>
                  {saleDateLabel ? `${saleDateLabel} · ` : ''}{timeStr}{s.buyer ? ` · ${s.buyer}` : ''}
                </div>
              </div>
              <span style={{ color: '#C9A24B', fontSize: 16, transition: 'transform .2s', display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none' }}>›</span>
            </button>
            {expanded && (
              <div style={{ padding: '0 16px 14px', borderTop: '1px solid #F0E8D8' }}>
                {s.receiptUrl ? (
                  <a href={s.receiptUrl} target="_blank" rel="noreferrer">
                    <img src={s.receiptUrl} alt="ใบเสร็จ" style={{ width: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 10, border: '1px solid #E4D7BC', background: '#f5f5f5', display: 'block', marginBottom: 10, marginTop: 10 }} />
                  </a>
                ) : !isEmployee ? (
                  <div style={{ marginTop: 10, marginBottom: 10 }}>
                    <button onClick={() => { uploadTargetRef.current = s.id; receiptInputRef.current?.click(); }}
                      disabled={uploadingSaleId === s.id}
                      style={{ width: '100%', border: '1.5px dashed #C9A24B', borderRadius: 10, padding: '10px 0', background: '#FFFBF0', color: '#7A5A22', fontSize: 13, cursor: 'pointer', fontFamily: 'Prompt' }}>
                      {uploadingSaleId === s.id ? '⏳ กำลังอัปโหลด...' : '📎 อัปโหลดใบเสร็จ'}
                    </button>
                  </div>
                ) : null}
                {!isEmployee && (
                <div style={{ display: 'flex', gap: 8, marginTop: s.receiptUrl ? 10 : 0 }}>
                  <button onClick={() => onUpdateSale(s.id, { note: nextSt })}
                    style={{ flex: 1, border: `1px solid ${badge.border}`, borderRadius: 9, padding: '8px 0', background: badge.bg, color: badge.color, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                    เปลี่ยนเป็น: {stMap[nextSt]?.label}
                  </button>
                  {s.receiptUrl && (
                    <button onClick={() => { uploadTargetRef.current = s.id; receiptInputRef.current?.click(); }}
                      disabled={uploadingSaleId === s.id}
                      style={{ border: '1px solid #C9A24B', background: '#FFFBF0', borderRadius: 9, padding: '8px 10px', fontSize: 12, color: '#7A5A22', cursor: 'pointer' }}>📎</button>
                  )}
                  <button onClick={() => { setDeleteTarget(s.id); setDeletePinVal(''); setDeletePinErr(''); setExpandedId(null); }}
                    style={{ border: '1px solid #E8C8C2', background: '#FDF0EE', borderRadius: 9, padding: '8px 14px', fontSize: 12, color: '#C0392B', cursor: 'pointer' }}>🗑 ลบ</button>
                </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ขาเข้า */}
      {inBills.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 10px' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#4A3526' }}>บิลรับซื้อ</span>
            <div style={{ flex: 1, height: 1, background: '#E4D7BC' }} />
          </div>
          {inBills.map(h => (
            <button key={h.billNo} onClick={() => onOpenHistory && onOpenHistory(h)}
              style={{ width: '100%', textAlign: 'left', background: '#FFF8EE', border: '1px solid #E8D8B4', borderRadius: 14, padding: '12px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: onOpenHistory ? 'pointer' : 'default' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#3F2D1E' }}>{h.seller || h.billNo}</div>
                <div style={{ fontSize: 11.5, color: '#9A8662', marginTop: 2 }}>{h.billNo}</div>
                {h.date && <div style={{ fontSize: 11, color: '#B7A684', marginTop: 1 }}>{new Date(h.date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#7A5A22' }}>฿{h.baht}</div>
                <div style={{ fontSize: 11.5, color: '#9A8662' }}>{h.kg}</div>
                {onOpenHistory && <div style={{ fontSize: 11, color: '#C9A24B', marginTop: 2 }}>ดูบิล ›</div>}
              </div>
            </button>
          ))}
        </>
      )}

      <input ref={receiptInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f && uploadTargetRef.current) handleSaleReceiptUpload(f, uploadTargetRef.current); e.target.value = ''; }} />

      {addOpen && <AddSaleModal date={todayStr} accounts={accounts || []} onSaveAccount={onSaveAccount} onSave={async (data) => { await onAddSale(data); setAddOpen(false); }} onClose={() => setAddOpen(false)} />}

      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#FFFDF8', borderRadius: 18, padding: '24px 20px', width: '100%', maxWidth: 320 }}>
            <div style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 15, color: '#3F2D1E', marginBottom: 6 }}>ลบรายการขาย</div>
            <div style={{ fontSize: 13, color: '#9A8662', marginBottom: 16 }}>ใส่รหัส Admin เพื่อยืนยัน</div>
            <input type="password" inputMode="numeric" maxLength={6} value={deletePinVal}
              onChange={e => { setDeletePinVal(e.target.value); setDeletePinErr(''); }}
              placeholder="รหัส Admin"
              autoFocus
              style={{ width: '100%', border: `1.5px solid ${deletePinErr ? '#C62828' : '#E4D7BC'}`, borderRadius: 10, padding: '11px 14px', fontSize: 18, fontFamily: 'Prompt', textAlign: 'center', letterSpacing: '0.3em', boxSizing: 'border-box', background: '#fff', marginBottom: 6 }} />
            {deletePinErr && <div style={{ color: '#C62828', fontSize: 12, marginBottom: 8, textAlign: 'center' }}>{deletePinErr}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => {
                if (deletePinVal !== pin) { setDeletePinErr('รหัสไม่ถูกต้อง'); setDeletePinVal(''); return; }
                onDeleteSale(deleteTarget);
                setDeleteTarget(null);
              }} style={{ flex: 1, background: '#C62828', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 0', fontFamily: 'Prompt', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>ลบ</button>
              <button onClick={() => setDeleteTarget(null)} style={{ flex: 1, background: '#F0EAE0', color: '#7A5A22', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sale New View ────────────────────────────────────────────────────────────
function SaleNewView({ onStart, onGoBack, defaultRecorder }) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [recorder, setRecorder] = useState(defaultRecorder || '');
  const [prices, setPrices] = useState(Object.fromEntries(CATS.map(c => [c.key, ''])));
  const [showPrices, setShowPrices] = useState(false);
  const inp = { width: '100%', border: '1.5px solid #E4D7BC', borderRadius: 10, padding: '12px 14px', fontSize: 15, fontFamily: 'Prompt', background: '#fff', boxSizing: 'border-box' };
  return (
    <div style={{ flex: 1, padding: '16px 16px 32px', maxWidth: 520, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <button onClick={onGoBack} style={{ border: 'none', background: 'none', fontSize: 15, color: '#8A7A66', cursor: 'pointer', padding: '4px 0 14px', display: 'flex', alignItems: 'center', gap: 6 }}>‹ กลับ</button>
      <div style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 20, color: '#3F2D1E', marginBottom: 4 }}>ใบเสร็จขายใหม่</div>
      <div style={{ fontSize: 13, color: '#9A8662', marginBottom: 20 }}>กรอกข้อมูลลูกค้าแล้วเริ่มบันทึกเข่ง</div>

      <div style={{ background: '#FFFDF8', border: '1px solid #E4D7BC', borderRadius: 14, padding: '16px 16px 20px', marginBottom: 14 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#5A4A38', marginBottom: 12 }}>ข้อมูลลูกค้า</div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#9A8662', marginBottom: 4 }}>ชื่อลูกค้า</div>
          <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="ชื่อ (ไม่บังคับ)" style={inp} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#9A8662', marginBottom: 4 }}>เบอร์โทร</div>
          <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="0812345678 (ไม่บังคับ)" type="tel" style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#9A8662', marginBottom: 4 }}>ผู้จด</div>
          <input value={recorder} onChange={e => setRecorder(e.target.value)} placeholder="ชื่อผู้จด (ไม่บังคับ)" style={inp} />
        </div>
      </div>

      <button onClick={() => setShowPrices(v => !v)} style={{ width: '100%', border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 12, padding: '12px 16px', fontSize: 14, color: '#7A5A22', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showPrices ? 0 : 14 }}>
        <span>⚙ ตั้งราคา/กก. (ไม่บังคับ)</span>
        <span>{showPrices ? '▲' : '▼'}</span>
      </button>
      {showPrices && (
        <div style={{ background: '#FFFDF8', border: '1px solid #E4D7BC', borderRadius: '0 0 14px 14px', borderTop: 'none', padding: '12px 16px 16px', marginBottom: 14 }}>
          {CATS.map(c => (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ flex: 1, fontSize: 14, color: '#4A3526' }}>{c.label}</span>
              <input value={prices[c.key]} onChange={e => setPrices(p => ({ ...p, [c.key]: e.target.value }))}
                type="number" placeholder="0" inputMode="numeric"
                style={{ width: 80, border: '1.5px solid #E4D7BC', borderRadius: 8, padding: '8px 10px', fontSize: 14, textAlign: 'right', fontFamily: 'Prompt' }} />
              <span style={{ fontSize: 12, color: '#9A8662', width: 24 }}>฿</span>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => onStart({ customerName: customerName.trim(), customerPhone: customerPhone.trim(), recorder: recorder.trim(), prices: Object.fromEntries(CATS.map(c => [c.key, Number(prices[c.key]) || 0])) })}
        style={{ width: '100%', border: 'none', borderRadius: 14, padding: 18, background: 'linear-gradient(135deg,#4A7A2E,#2E5C1A)', color: '#fff', fontWeight: 700, fontSize: 17, cursor: 'pointer', fontFamily: 'Prompt' }}>
        เริ่มบันทึกเข่ง →
      </button>
    </div>
  );
}

// ─── Sale Record View ─────────────────────────────────────────────────────────
function SaleRecordView({ saleSession, activeCat, input, onInput, onCommit, onPickCat, onGoBack, onGoSummary, onEditEntry, pinnedCats, onOpenPinEditor, onCustomLabelChange, onEditCustomer, onChangeDate, customCatLabels, onAddCustomCatLabel, onRemoveCustomCatLabel, hiddenCats, onHideCat, onShowAllCats }) {
  const entries = saleSession?.entries || [];
  const aggData = {};
  CATS.forEach(c => { aggData[c.key] = { kg: 0, count: 0 }; });
  entries.forEach(e => { if (aggData[e.cat]) { aggData[e.cat].kg += e.kg; aggData[e.cat].count++; } });
  const customLabelAgg = {};
  entries.forEach(e => {
    if (e.cat === 'custom' && e.customLabel) {
      if (!customLabelAgg[e.customLabel]) customLabelAgg[e.customLabel] = { kg: 0, count: 0 };
      customLabelAgg[e.customLabel].kg += e.kg;
      customLabelAgg[e.customLabel].count++;
    }
  });
  const totalKg = entries.reduce((s, e) => s + e.kg, 0);
  const totalCount = entries.length;
  const [addingNewSaleLabel, setAddingNewSaleLabel] = useState(false);
  const [newSaleLabelText, setNewSaleLabelText] = useState('');
  const customLabel = saleSession?.customLabel || '';
  const mainCats = CATS.filter(c => c.key !== 'custom' && !(hiddenCats || []).includes(c.key));
  const recent = entries.filter(e => {
    if (e.cat !== activeCat) return false;
    if (activeCat === 'custom' && customLabel) return (e.customLabel || '') === customLabel;
    return true;
  }).slice().reverse();
  const hasCustomer = saleSession?.customerName || saleSession?.customerPhone;

  return (
    <div style={{ flex: 1, maxWidth: 880, width: '100%', margin: '0 auto', padding: '14px 14px 130px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button onClick={onGoBack} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#7A6450', cursor: 'pointer' }}>‹ หน้าหลัก</button>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#4A3526' }}>{saleSession?.billNo}</span>
          {onChangeDate ? (
            <input type="date"
              value={saleSession?.date ? (() => { const d = new Date(saleSession.date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })() : ''}
              onChange={e => { if (e.target.value) { const [y,m,d] = e.target.value.split('-').map(Number); const prev = new Date(saleSession.date); const nd = new Date(y,m-1,d,prev.getHours(),prev.getMinutes(),prev.getSeconds()); onChangeDate(nd.getTime()); } }}
              style={{ fontSize: 12, color: '#DC743C', border: 'none', background: 'none', padding: 0, cursor: 'pointer', outline: 'none', fontWeight: 600 }} />
          ) : (
            <span style={{ fontSize: 12, color: '#9A8662' }}>{saleSession ? dateStr(saleSession.date) : ''}</span>
          )}
        </div>
      </div>

      {/* Customer chip — tappable */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <div onClick={onEditCustomer} style={{ display: 'flex', alignItems: 'center', gap: 5, background: hasCustomer ? '#F0EAFA' : '#F5F5F5', border: `1px solid ${hasCustomer ? '#C9B8E8' : '#D0C8C0'}`, borderRadius: 20, padding: '5px 12px', cursor: 'pointer' }}>
          <span style={{ fontSize: 13 }}>🛒</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: hasCustomer ? '#5A3E8A' : '#9A8878' }}>
            {saleSession?.customerName || saleSession?.customerPhone || '+ เพิ่มลูกค้า'}
          </span>
          {hasCustomer && saleSession?.customerName && saleSession?.customerPhone && (
            <span style={{ fontSize: 12, color: '#9A8878' }}>· {saleSession.customerPhone}</span>
          )}
        </div>
      </div>

      {/* Total bar */}
      <div style={{ background: 'linear-gradient(135deg,#2E5C1A,#4A7A2E)', color: '#F0FAE8', borderRadius: 16, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, boxShadow: '0 8px 20px rgba(46,92,26,.22)' }}>
        <div>
          <span style={{ fontSize: 12, opacity: .7, letterSpacing: '.08em', display: 'block' }}>รวมน้ำหนักทั้งหมด</span>
          <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 30, lineHeight: 1.1 }}>{fmtKg(totalKg)} <span style={{ fontSize: 15, opacity: .7 }}>กก.</span></span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 12, opacity: .7, display: 'block' }}>จำนวนเข่ง</span>
          <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 22 }}>{totalCount}</span>
        </div>
      </div>

      {/* Category grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 8 }}>
        {mainCats.map(c => {
          const d = aggData[c.key];
          const active = activeCat === c.key;
          return (
            <div key={c.key} style={{ position: 'relative' }}>
              <button onClick={() => onPickCat(c.key)} style={{ width: '100%', border: active ? `2px solid ${c.accent}` : '1px solid #E4D7BC', background: active ? '#FFFDF8' : '#FBF6EC', borderRadius: 12, padding: '10px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: active ? `0 4px 12px ${c.accent}40` : 'none' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.accent, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{c.label}</span>
                </span>
                <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 16, marginTop: 3 }}>{fmtKg(d.kg)}</span>
                <span style={{ fontSize: 10, opacity: .7 }}>{d.count} เข่ง</span>
              </button>
              {onHideCat && d.count === 0 && <button onClick={() => onHideCat(c.key)} style={{ position: 'absolute', top: 3, right: 3, border: 'none', background: 'rgba(160,144,128,.18)', borderRadius: 8, width: 18, height: 18, fontSize: 9, cursor: 'pointer', color: '#9A8662', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>}
            </div>
          );
        })}
        {(customCatLabels || []).map(lbl => {
          const d = customLabelAgg[lbl] || { kg: 0, count: 0 };
          const active = activeCat === 'custom' && customLabel === lbl;
          const accent = hashColor(lbl);
          return (
            <div key={lbl} style={{ position: 'relative' }}>
              <button onClick={() => { onCustomLabelChange(lbl); onPickCat('custom'); }} style={{ width: '100%', border: active ? `2px solid ${accent}` : '1px solid #E4D7BC', background: active ? '#FFFDF8' : '#FBF6EC', borderRadius: 12, padding: '10px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: active ? `0 4px 12px ${accent}40` : 'none' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{lbl}</span>
                </span>
                <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 16, marginTop: 3 }}>{fmtKg(d.kg)}</span>
                <span style={{ fontSize: 10, opacity: .7 }}>{d.count} เข่ง</span>
              </button>
              {onRemoveCustomCatLabel && <button onClick={() => onRemoveCustomCatLabel(lbl)} style={{ position: 'absolute', top: 3, right: 3, border: 'none', background: 'rgba(160,144,128,.18)', borderRadius: 8, width: 18, height: 18, fontSize: 9, cursor: 'pointer', color: '#9A8662', lineHeight: '18px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>}
            </div>
          );
        })}
      </div>
      {/* Add new custom label */}
      {onAddCustomCatLabel && (
        <div style={{ marginBottom: 12 }}>
          {addingNewSaleLabel ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={newSaleLabelText}
                onChange={e => setNewSaleLabelText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newSaleLabelText.trim()) { onAddCustomCatLabel(newSaleLabelText.trim()); setNewSaleLabelText(''); setAddingNewSaleLabel(false); } if (e.key === 'Escape') { setNewSaleLabelText(''); setAddingNewSaleLabel(false); } }}
                placeholder="ชื่อหมวดใหม่…"
                autoFocus
                style={{ flex: 1, border: '1px solid #C9A24B', borderRadius: 12, padding: '8px 12px', fontSize: 14, fontWeight: 600, outline: 'none', fontFamily: 'inherit', color: '#4A3526' }}
              />
              <button onClick={() => { if (newSaleLabelText.trim()) { onAddCustomCatLabel(newSaleLabelText.trim()); setNewSaleLabelText(''); setAddingNewSaleLabel(false); } }} style={{ border: 'none', borderRadius: 12, padding: '8px 14px', background: '#C9A24B', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>บันทึก</button>
              <button onClick={() => { setNewSaleLabelText(''); setAddingNewSaleLabel(false); }} style={{ border: '1px solid #E4D7BC', borderRadius: 12, padding: '8px 12px', background: '#FBF6EC', color: '#9A8662', fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setAddingNewSaleLabel(true)} style={{ padding: '6px 14px', borderRadius: 16, border: '1px dashed #C9A24B', background: '#FBF6EC', color: '#9A8662', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>+ เพิ่มหมวดใหม่</button>
              {(customCatLabels || []).length > 0 && onOpenPinEditor && (
                <button onClick={onOpenPinEditor} style={{ padding: '6px 12px', borderRadius: 16, border: '1px solid #E4D7BC', background: '#fff', color: '#7A6450', fontSize: 13, cursor: 'pointer' }}>⚙ จัดการ</button>
              )}
              {(hiddenCats || []).length > 0 && onShowAllCats && (
                <button onClick={onShowAllCats} style={{ padding: '6px 12px', borderRadius: 16, border: '1px solid #C9A24B', background: '#FBF3DF', color: '#7A5A22', fontSize: 13, cursor: 'pointer' }}>↩ แสดงทั้งหมด</button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Input + Keypad */}
      <div style={{ background: '#FFFDF8', border: '1px solid #E4D7BC', borderRadius: 18, padding: 16, boxShadow: '0 4px 14px rgba(95,70,40,.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, color: '#4A3526' }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: catAccent(activeCat), display: 'inline-block' }} />
            กำลังจด: {activeCat === 'custom' ? (customLabel || 'หมวดพิเศษ') : catLabel(activeCat)}
          </span>
          <span style={{ fontSize: 12, color: '#9A8662' }}>เคาะตัวเลข แล้วกด "บันทึกเข่ง"</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, background: '#FBF6EC', borderRadius: 14, padding: 14, marginBottom: 14, minHeight: 60 }}>
          <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 42, color: '#3F2D1E', lineHeight: 1 }}>{input || '0'}</span>
          <span style={{ fontSize: 16, color: '#A6925E' }}>กก.</span>
        </div>
        <Keypad value={input} onChange={onInput} onConfirm={onCommit} />
      </div>

      {/* Recent entries for active cat */}
      {recent.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <span style={{ fontSize: 12, color: '#A6925E', letterSpacing: '.08em' }}>เข่งล่าสุด ({activeCat === 'custom' ? (customLabel || 'หมวดพิเศษ') : catLabel(activeCat)}) — แตะเพื่อแก้/ลบ</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {recent.map(e => (
              <button key={e.id} onClick={() => onEditEntry(e)} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 10, padding: '8px 12px', fontSize: 14, color: '#4A3526', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'Prompt', fontWeight: 500 }}>{fmtKg(e.kg)}</span>
                <span style={{ fontSize: 11, color: '#B7A684' }}>กก. · {timeStr(e.t)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Fixed bottom bar */}
      <div className="no-print" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 25, background: '#FBF6EC', borderTop: '1px solid #E4D7BC', padding: 'calc(env(safe-area-inset-bottom) + 10px) 14px 10px', display: 'flex', gap: 10 }}>
        <button
          onClick={onCommit}
          disabled={!input || parseFloat(input) <= 0}
          style={{ flex: 1, border: 'none', borderRadius: 13, padding: 15, background: (!input || parseFloat(input) <= 0) ? '#D9CDB8' : 'linear-gradient(135deg,#C9A24B,#A8763E)', color: (!input || parseFloat(input) <= 0) ? '#A89880' : '#fff', fontWeight: 700, fontSize: 16, cursor: (!input || parseFloat(input) <= 0) ? 'not-allowed' : 'pointer', transition: 'background .2s' }}>
          ＋ บันทึกเข่งนี้
        </button>
        <button onClick={onGoSummary} style={{ flex: 1, border: 'none', borderRadius: 13, padding: 15, background: '#3F2D1E', color: '#F6EEDD', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>ดูสรุป & ตั้งราคา →</button>
      </div>
    </div>
  );
}

// ─── Sale Customer Modal ──────────────────────────────────────────────────────
function SaleCustomerModal({ customerName, customerPhone, recorder: initRecorder, onSave, onCancel, verified = {}, customerInfo = {} }) {
  const [name, setName] = useState(customerName || '');
  const [phone, setPhone] = useState(customerPhone || '');
  const [recorder, setRecorder] = useState(initRecorder || '');
  const [autoFilled, setAutoFilled] = useState(false);
  const inp = { width: '100%', border: '1.5px solid #E4D7BC', borderRadius: 10, padding: '12px 14px', fontSize: 15, fontFamily: 'Prompt', background: '#fff', boxSizing: 'border-box', outline: 'none' };

  const lookupName = (p) => {
    const digits = p.replace(/\D/g, '');
    if (digits.length < 9) return null;
    return verified[digits] || verified[p] || customerInfo[digits]?.fullName || customerInfo[p]?.fullName || null;
  };

  const handlePhoneChange = (e) => {
    const p = e.target.value;
    setPhone(p);
    const found = lookupName(p);
    if (found && !name) { setName(found); setAutoFilled(true); }
    else if (autoFilled) { setName(''); setAutoFilled(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: '#FFFDF8', borderRadius: '18px 18px 0 0', padding: '22px 18px 36px', width: '100%', maxWidth: 520 }}>
        <div style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 17, marginBottom: 16, color: '#3F2D1E' }}>ข้อมูลลูกค้า</div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#9A8662', marginBottom: 4 }}>เบอร์โทร</div>
          <input value={phone} onChange={handlePhoneChange} placeholder="0812345678 (ไม่บังคับ)" type="tel" style={inp} autoFocus />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: '#9A8662' }}>ชื่อลูกค้า</span>
            {autoFilled && <span style={{ fontSize: 10, color: '#4A7A2E', background: '#EDF7E6', borderRadius: 4, padding: '1px 6px' }}>✓ ดึงข้อมูลอัตโนมัติ</span>}
          </div>
          <input value={name} onChange={e => { setName(e.target.value); setAutoFilled(false); }} placeholder="ชื่อ (ไม่บังคับ)" style={{ ...inp, background: autoFilled ? '#F6FFF3' : '#fff', borderColor: autoFilled ? '#81C784' : '#E4D7BC' }} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: '#9A8662', marginBottom: 4 }}>ผู้จด</div>
          <input value={recorder} onChange={e => setRecorder(e.target.value)} placeholder="ชื่อผู้จด (ไม่บังคับ)" style={inp} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 12, padding: 14, fontSize: 15, color: '#9A8662', cursor: 'pointer' }}>ยกเลิก</button>
          <button onClick={() => onSave(name.trim(), phone.trim(), recorder.trim())} style={{ flex: 2, border: 'none', borderRadius: 12, padding: 14, background: 'linear-gradient(135deg,#4A7A2E,#2E5C1A)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>บันทึก</button>
        </div>
      </div>
    </div>
  );
}

// ─── Sale Summary View ────────────────────────────────────────────────────────
function SaleSummaryView({ saleSession, onGoRecord, onGoPrint, onSetPrice, customLabel }) {
  const aggData = {};
  CATS.forEach(c => { aggData[c.key] = { kg: 0, count: 0 }; });
  (saleSession?.entries || []).forEach(e => { if (aggData[e.cat]) { aggData[e.cat].kg += e.kg; aggData[e.cat].count++; } });
  const stdRows = CATS.filter(c => c.key !== 'custom' && aggData[c.key].count > 0);
  const custRows = customLabelRows(saleSession);
  const prices = saleSession?.prices || {};
  const totalKg = (saleSession?.entries || []).reduce((s, e) => s + e.kg, 0);
  const totalBaht = grandBaht(saleSession);

  return (
    <div style={{ flex: 1, maxWidth: 820, width: '100%', margin: '0 auto', padding: '16px 14px 120px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={onGoRecord} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#7A6450', cursor: 'pointer' }}>‹ กลับไปจด</button>
        <h2 style={{ fontFamily: 'Prompt', fontWeight: 400, fontSize: 20, color: '#4A3526', margin: 0 }}>สรุปยอดขาย · ตั้งราคา</h2>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: '#9A8662' }}>แตะช่อง "ราคา" เพื่อใส่ราคาขายของแต่ละหมวด · ยอดรวมคำนวณให้อัตโนมัติ</p>

      <div style={{ background: '#FFFDF8', border: '1px solid #E4D7BC', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 14px rgba(95,70,40,.06)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr .7fr 1fr 1.1fr 1.2fr', background: '#EAF4E0', padding: '11px 14px', fontSize: 12, fontWeight: 600, color: '#3A6020' }}>
          <span>หมวด</span><span style={{ textAlign: 'center' }}>เข่ง</span><span style={{ textAlign: 'right' }}>น้ำหนัก</span><span style={{ textAlign: 'right' }}>ราคา/กก.</span><span style={{ textAlign: 'right' }}>ยอด (฿)</span>
        </div>
        {stdRows.map(c => {
          const d = aggData[c.key];
          const price = prices[c.key] || 0;
          return (
            <div key={c.key} style={{ display: 'grid', gridTemplateColumns: '1.3fr .7fr 1fr 1.1fr 1.2fr', alignItems: 'center', padding: '12px 14px', borderTop: '1px solid #D8ECC8' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: 14, color: '#4A3526' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.accent, display: 'inline-block', flexShrink: 0 }} />{c.label}
              </span>
              <span style={{ textAlign: 'center', fontSize: 13, color: '#9A8662' }}>{d.count}</span>
              <span style={{ textAlign: 'right', fontFamily: 'Prompt', fontSize: 14 }}>{fmtKg(d.kg)}</span>
              <button onClick={() => onSetPrice(c.key)} style={{ textAlign: 'right', border: price ? '1px solid #C8DFB0' : '1.5px dashed #4A7A2E', background: price ? '#F5FAF0' : '#EEFAE6', borderRadius: 8, padding: '5px 8px', fontSize: 13, color: price ? '#2E5C1A' : '#4A7A2E', cursor: 'pointer', fontFamily: 'Prompt' }}>
                {price ? fmtPrice(price) : 'ตั้งราคา'}
              </button>
              <span style={{ textAlign: 'right', fontFamily: 'Prompt', fontWeight: 500, fontSize: 14, color: '#3F2D1E' }}>{price ? fmtBaht(d.kg * price) : '—'}</span>
            </div>
          );
        })}
        {custRows.map(r => {
          const price = prices[r.priceKey] || prices['custom'] || 0;
          return (
            <div key={r.priceKey} style={{ display: 'grid', gridTemplateColumns: '1.3fr .7fr 1fr 1.1fr 1.2fr', alignItems: 'center', padding: '12px 14px', borderTop: '1px solid #D8ECC8' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: 14, color: '#4A3526' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#7C8C9A', display: 'inline-block', flexShrink: 0 }} />{r.label || 'หมวดพิเศษ'}
              </span>
              <span style={{ textAlign: 'center', fontSize: 13, color: '#9A8662' }}>{r.count}</span>
              <span style={{ textAlign: 'right', fontFamily: 'Prompt', fontSize: 14 }}>{fmtKg(r.kg)}</span>
              <button onClick={() => onSetPrice(r.priceKey)} style={{ textAlign: 'right', border: price ? '1px solid #C8DFB0' : '1.5px dashed #4A7A2E', background: price ? '#F5FAF0' : '#EEFAE6', borderRadius: 8, padding: '5px 8px', fontSize: 13, color: price ? '#2E5C1A' : '#4A7A2E', cursor: 'pointer', fontFamily: 'Prompt' }}>
                {price ? fmtPrice(price) : 'ตั้งราคา'}
              </button>
              <span style={{ textAlign: 'right', fontFamily: 'Prompt', fontWeight: 500, fontSize: 14, color: '#3F2D1E' }}>{price ? fmtBaht(r.kg * price) : '—'}</span>
            </div>
          );
        })}
        {stdRows.length === 0 && custRows.length === 0 && <div style={{ padding: '20px 14px', textAlign: 'center', color: '#B7A684', fontSize: 14 }}>ยังไม่มีรายการ — กลับไปบันทึกเข่งก่อน</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr .7fr 1fr 1.1fr 1.2fr', alignItems: 'center', padding: 14, background: '#2E5C1A', color: '#F0FAE8' }}>
          <span style={{ fontWeight: 600, gridColumn: 'span 2' }}>รวมทั้งสิ้น</span>
          <span style={{ textAlign: 'right', fontFamily: 'Prompt', fontWeight: 500 }}>{fmtKg(totalKg)}</span>
          <span style={{ textAlign: 'right', fontSize: 12, opacity: .65 }}>บาท</span>
          <span style={{ textAlign: 'right', fontFamily: 'Prompt', fontWeight: 600, fontSize: 18 }}>{fmtBaht(totalBaht)}</span>
        </div>
      </div>

      <button onClick={onGoPrint} style={{ width: '100%', marginTop: 18, border: 'none', borderRadius: 15, padding: 18, background: 'linear-gradient(135deg,#4A7A2E,#2E5C1A)', color: '#fff', fontWeight: 700, fontSize: 18, cursor: 'pointer', boxShadow: '0 8px 18px rgba(46,92,26,.3)' }}>
        ดูใบเสร็จ & ปริ้น →
      </button>
    </div>
  );
}

// ─── Sale Print View ──────────────────────────────────────────────────────────
const QUDSUN_BANK = { bank: 'ธ.ไทยพาณิชย์ (SCB)', account: '408-426694-9', name: 'ภัทรกฤช จันพิทักษ์' };

function SalePrintView({ saleSession, onGoBack, onFinish, onEditPrice, onStartEdit, salePaymentStatus, onConfirmPayment }) {
  const entries = saleSession?.entries || [];
  const prices = saleSession?.prices || {};
  const aggData = {};
  CATS.forEach(c => { aggData[c.key] = { kg: 0, count: 0 }; });
  entries.forEach(e => { if (aggData[e.cat]) { aggData[e.cat].kg += e.kg; aggData[e.cat].count++; } });
  const stdRows = CATS.filter(c => c.key !== 'custom' && aggData[c.key].count > 0);
  const custRows = customLabelRows(saleSession);
  const rows = [
    ...stdRows,
    ...custRows.map(r => ({ key: r.priceKey, label: r.label || 'หมวดพิเศษ', accent: '#7C8C9A', _isCustomLabel: true, _custRow: r }))
  ];
  const totalKg = entries.reduce((s, e) => s + e.kg, 0);
  const totalBaht = grandBaht(saleSession);
  const grouped = {};
  entries.forEach(e => {
    const gKey = e.cat === 'custom' ? ('custom:' + (e.customLabel || '')) : e.cat;
    if (!grouped[gKey]) grouped[gKey] = { catKey: e.cat, label: e.customLabel || null, ents: [] };
    grouped[gKey].ents.push(e);
  });

  return (
    <div className="print-view-root" style={{ flex: 1, background: '#fff' }}>
      <div className="sale-print-inner" style={{ padding: '16px 14px 32px', maxWidth: 680, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <div className="no-print" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <button onClick={onGoBack} style={{ border: 'none', background: 'none', fontSize: 14, color: '#8A7A66', cursor: 'pointer', padding: '4px 0' }}>{onFinish ? '‹ กลับแก้ไข' : '‹ กลับ'}</button>
          {onStartEdit && <button onClick={onStartEdit} style={{ marginLeft: 'auto', border: 'none', background: 'linear-gradient(135deg,#2E5C1A,#4A7A2E)', color: '#fff', borderRadius: 9, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✏️ แก้ไข</button>}
        </div>
        <button onClick={() => window.print()} style={{ width: '100%', border: 'none', borderRadius: 15, padding: 18, background: 'linear-gradient(135deg,#4A7A2E,#2E5C1A)', color: '#fff', fontWeight: 700, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          🖨 ปริ้นใบเสร็จ
        </button>
        <p style={{ textAlign: 'center', fontSize: 12, color: '#9A8662', margin: '8px 0 12px' }}>ขนาดกระดาษ A4</p>
        {onFinish && <button onClick={onFinish} style={{ width: '100%', border: '1px solid #4A7A2E', background: '#F0FAE8', borderRadius: 12, padding: 14, fontSize: 15, fontFamily: 'Prompt', fontWeight: 600, color: '#2E5C1A', cursor: 'pointer' }}>
          ✓ บันทึกบิลขาย
        </button>}
        {salePaymentStatus === 'confirmed' && (
          <div style={{ width: '100%', border: '1px solid #2E7D32', background: '#E8F5E9', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 600, color: '#2E7D32', textAlign: 'center', marginTop: 8 }}>
            ✅ รับเงินแล้ว
          </div>
        )}
        {onConfirmPayment && (
          <button onClick={onConfirmPayment} style={{ width: '100%', border: 'none', background: 'linear-gradient(135deg,#2E7D32,#4CAF50)', color: '#fff', borderRadius: 12, padding: 14, fontSize: 15, fontFamily: 'Prompt', fontWeight: 600, cursor: 'pointer', marginTop: 8 }}>
            💰 ยืนยันรับเงินแล้ว
          </button>
        )}
      </div>

      <div className="bill-doc-wrapper" style={{ maxWidth: 600, margin: '0 auto' }}>
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          .sale-print-inner { padding: 0 !important; max-width: 100% !important; margin: 0 !important; }
          .bill-doc-wrapper { max-width: 100% !important; margin: 0 !important; }
          .sale-bill-doc { padding: 0 !important; font-size: 13px !important; border: none !important; box-shadow: none !important; border-radius: 0 !important; }
          .sale-bill-logo { width: 72px !important; height: 72px !important; }
          .sale-bill-title { font-size: 19px !important; }
          .sale-bill-subtitle { font-size: 12.5px !important; }
          .sale-bill-header { padding-bottom: 12px !important; gap: 12px !important; }
          .sale-entries-root { margin-top: 10px !important; margin-bottom: 10px !important; gap: 6px 14px !important; }
          .sale-entries-group { margin-bottom: 0 !important; }
          .sale-entry-label { font-size: 11px !important; margin-bottom: 3px !important; }
          .sale-entry-grid { gap: 3px !important; grid-template-columns: repeat(6, max-content) !important; }
          .sale-entry-chip { padding: 3px 6px !important; border-radius: 4px !important; line-height: 1.2 !important; }
          .sale-entry-kg { font-size: 13px !important; }
          .sale-bill-table td, .sale-bill-table th { padding: 7px 8px !important; font-size: 13px !important; }
          .sale-bill-bank { margin-top: 10px !important; padding: 8px 10px !important; }
          .sale-bank-acct { font-size: 14px !important; }
          .sale-bill-sign { margin-top: 22px !important; }
          .sale-bill-sign-line { height: 40px !important; }
          .sale-bill-footer { margin-top: 12px !important; }
          .sale-bill-qr { width: 80px !important; height: 80px !important; }
          .footer-text { font-size: 12px !important; }
        }
      `}</style>
      <div className="bill-doc sale-bill-doc" style={{ background: '#fff', border: '1px solid #E4D7BC', borderRadius: 6, boxShadow: '0 10px 30px rgba(95,70,40,.14)', padding: '18px 20px 14px', color: '#2A2118', fontSize: 13 }}>
        <div className="bill-doc-header sale-bill-header" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, borderBottom: '2px solid #2A2118', paddingBottom: 10 }}>
          <img src="/logo.jpg" className="bill-doc-logo sale-bill-logo" style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover' }} alt="Qudsun" />
          <div style={{ flex: 1 }}>
            <div className="bill-doc-title sale-bill-title" style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 17, letterSpacing: '.04em' }}>ทุเรียนคัดสรร <span style={{ color: '#8A6A2E' }}>QUDSUN</span></div>
            <div className="sale-bill-subtitle" style={{ fontSize: 11.5, color: '#5A4A38', marginTop: 2 }}>Premium Durian Selection</div>
            {saleSession?.recorder && (
              <div style={{ marginTop: 4, fontSize: 11 }}>
                <span style={{ color: '#9A8662' }}>ผู้จด: </span><b>{saleSession.recorder}</b>
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right', minWidth: 120 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#4A7A2E' }}>ใบเสร็จรับเงิน</div>
            <div style={{ fontSize: 11.5, color: '#5A4A38', marginBottom: 4 }}>เลขที่ {saleSession?.billNo}</div>
            <div style={{ fontSize: 11.5, color: '#3A2A18', lineHeight: 1.6 }}>
              <div>{saleSession ? dateStr(saleSession.date) : ''}</div>
              {(saleSession?.customerName || saleSession?.customerPhone) && (
                <div style={{ fontSize: 11, color: '#5A4A38', marginTop: 1 }}>
                  <b>{saleSession.customerName || '—'}</b>{saleSession.customerPhone ? ` · ${saleSession.customerPhone}` : ''}
                </div>
              )}
            </div>
          </div>
        </div>

        {entries.length > 0 && (
          <div className="sale-entries-root" style={{ marginTop: 8, marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'flex-start' }}>
            {Object.entries(grouped).map(([gKey, grp]) => {
              const catObj = CATS.find(c => c.key === grp.catKey);
              const label = grp.label ? grp.label : (catObj?.label || grp.catKey);
              return (
                <div key={gKey} className="sale-entries-group" style={{ marginBottom: 0 }}>
                  <div className="sale-entry-label" style={{ fontSize: 12, color: '#5A7A38', fontWeight: 600, marginBottom: 3 }}>{label} — {grp.ents.length} เข่ง</div>
                  <div className="sale-entry-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, max-content)', gap: 3 }}>
                    {grp.ents.map((e, i) => (
                      <div key={e.id || i} className="sale-entry-chip" style={{ border: '1px solid #C8DFB0', borderRadius: 5, padding: '3px 7px', background: '#F5FAF0', textAlign: 'center', lineHeight: 1.15 }}>
                        <span className="sale-entry-kg" style={{ fontWeight: 700, fontSize: 13, color: '#2E5C1A' }}>{fmtKg(e.kg)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <table className="sale-bill-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: '#EAF4E0' }}>
              <th style={{ textAlign: 'left', padding: '5px 7px', border: '1px solid #C8DFB0' }}>หมวด</th>
              <th style={{ textAlign: 'right', padding: '5px 7px', border: '1px solid #C8DFB0' }}>น้ำหนัก</th>
              <th style={{ textAlign: 'right', padding: '5px 7px', border: '1px solid #C8DFB0' }}>ราคา/กก.</th>
              <th style={{ textAlign: 'right', padding: '5px 7px', border: '1px solid #C8DFB0' }}>รวม (฿)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(c => {
              const isCustomLabel = c._isCustomLabel;
              const d = isCustomLabel ? c._custRow : aggData[c.key];
              const price = isCustomLabel
                ? (prices[c.key] || prices['custom'] || 0)
                : (prices[c.key] || 0);
              return (
                <tr key={c.key}>
                  <td style={{ padding: '5px 7px', border: '1px solid #C8DFB0' }}>
                    <div>{c.label}</div>
                    {d.count > 0 && <div style={{ fontSize: 10, color: '#6A9A4E', marginTop: 1 }}>{d.count} เข่ง</div>}
                  </td>
                  <td style={{ padding: '5px 7px', border: '1px solid #C8DFB0', textAlign: 'right' }}>{fmtKg(d.kg)}</td>
                  <td style={{ padding: '5px 7px', border: '1px solid #C8DFB0', textAlign: 'right' }}>{price ? fmtPrice(price) : '—'}</td>
                  <td style={{ padding: '5px 7px', border: '1px solid #C8DFB0', textAlign: 'right' }}>{price ? fmtBaht(d.kg * price) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: '#2A2118', color: '#fff' }}>
              <td style={{ padding: '6px 7px', fontWeight: 700 }}>
                <div>รวม</div>
                <div style={{ fontSize: 10, opacity: .75, fontWeight: 400, marginTop: 1 }}>{entries.length} เข่ง</div>
              </td>
              <td style={{ padding: '6px 7px', textAlign: 'right', fontWeight: 700 }}>{fmtKg(totalKg)}</td>
              <td style={{ padding: '6px 7px' }} />
              <td style={{ padding: '6px 7px', textAlign: 'right', fontWeight: 700 }}>{totalBaht > 0 ? fmtBaht(totalBaht) : '—'}</td>
            </tr>
          </tfoot>
        </table>

        <div className="bill-doc-bank sale-bill-bank" style={{ marginTop: 9, background: '#F5FAF0', border: '1px solid #C8DFB0', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="bank-label" style={{ fontSize: 10.5, color: '#6A9A4E', fontWeight: 600, marginBottom: 2 }}>โอนเงินมาที่</div>
            <div className="bank-acct sale-bank-acct" style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 13, color: '#2A2118', letterSpacing: '.04em' }}>{QUDSUN_BANK.account}</div>
            <div style={{ fontSize: 11.5, color: '#5A4A38' }}>{QUDSUN_BANK.bank} · {QUDSUN_BANK.name}</div>
          </div>
        </div>

        <div className="bill-doc-sign sale-bill-sign" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22, gap: 20 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div className="bill-doc-sign-line sale-bill-sign-line" style={{ height: 36 }} />
            <div style={{ borderTop: '1px dotted #2A2118', paddingTop: 6, fontSize: 11.5 }}>ลายเซ็นผู้ขาย</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div className="bill-doc-sign-line sale-bill-sign-line" style={{ height: 36 }} />
            <div style={{ borderTop: '1px dotted #2A2118', paddingTop: 6, fontSize: 11.5 }}>ลายเซ็นผู้ซื้อ</div>
          </div>
        </div>
        <div className="bill-doc-footer sale-bill-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <div>
            <div className="footer-text" style={{ fontSize: 11, color: '#8A7A66' }}>ขอบคุณที่ไว้วางใจ · ทุเรียนคัดสรร Qudsun</div>
            <div className="footer-text" style={{ fontSize: 11, color: '#8A7A66', marginTop: 2 }}>โทร. 094-149-1914 (วิน) · 082-691-4414 (เบนซ์)</div>
          </div>
          <img src="/qr-bill.png" alt="QR" className="bill-doc-qr sale-bill-qr" style={{ width: 72, height: 72, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}

// ─── HistoryPageView ──────────────────────────────────────────────────────────
function HistoryPageView({ onGoHome, onOpenBill, onOpenSaleBill, isEmployee, onDeleteBill, onDeleteSaleBill }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState('all');
  const [dateFilter, setDateFilter] = React.useState('today');
  const [rangeFromDate, setRangeFromDate] = React.useState('');
  const [rangeFromTime, setRangeFromTime] = React.useState('');
  const [rangeToDate, setRangeToDate] = React.useState('');
  const [rangeToTime, setRangeToTime] = React.useState('');
  const [deleteTarget, setDeleteTarget] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [bills, sessions] = await Promise.all([
        db.fetchHistoryBills(300),
        db.fetchHistorySaleSessions(300),
      ]);
      const merged = [...bills, ...sessions].sort((a, b) => new Date(b.date) - new Date(a.date));
      setItems(merged);
    } catch {}
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const handleDelete = React.useCallback(async (item) => {
    setDeleteTarget(null);
    try {
      if (item.type === 'buy') {
        await db.deleteBill(item.billNo);
        onDeleteBill?.(item.billNo);
      } else {
        await db.deleteSaleSession(item.billNo);
        onDeleteSaleBill?.(item.billNo);
      }
      setItems(prev => prev.filter(i => i.billNo !== item.billNo));
    } catch (err) {
      alert('ลบไม่สำเร็จ: ' + (err?.message || String(err)));
    }
  }, [onDeleteBill, onDeleteSaleBill]);

  const fmtDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    const day = dt.getDate();
    const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return `${day} ${months[dt.getMonth()]}`;
  };
  const fmtTime = (d) => { if (!d) return ''; const dt = new Date(d); return dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'; };

  const now = new Date();
  const hasRange = rangeFromDate || rangeToDate;
  const fromDt = rangeFromDate ? new Date(rangeFromDate + 'T' + (rangeFromTime || '00:00')) : null;
  const toDt = rangeToDate ? new Date(rangeToDate + 'T' + (rangeToTime || '23:59')) : null;
  const filtered = items.filter(i => {
    if (filter !== 'all' && (filter === 'buy' ? i.type !== 'buy' : i.type !== 'sale')) return false;
    const d = i.date ? new Date(i.date) : null;
    if (hasRange) {
      if (!d) return false;
      if (fromDt && d < fromDt) return false;
      if (toDt && d > toDt) return false;
      return true;
    }
    if (dateFilter === 'today') return d && d.toDateString() === now.toDateString();
    if (dateFilter === '7d') return d && (now - d) <= 7 * 86400000;
    if (dateFilter === '30d') return d && (now - d) <= 30 * 86400000;
    return true;
  });

  const buyItems = filtered.filter(i => i.type === 'buy');
  const saleItems = filtered.filter(i => i.type === 'sale');
  const parseNum = (v) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0;
  const buyKg = buyItems.reduce((s, i) => s + parseNum(i.kg), 0);
  const buyBaht = buyItems.reduce((s, i) => s + parseNum(i.baht), 0);
  const saleKg = saleItems.reduce((s, i) => s + parseNum(i.kg), 0);
  const saleBaht = saleItems.reduce((s, i) => s + parseNum(i.baht), 0);
  const profit = saleBaht - buyBaht;

  const grouped = [];
  let lastDate = '';
  for (const item of filtered) {
    const dateKey = item.date ? new Date(item.date).toDateString() : '';
    if (dateKey !== lastDate) { grouped.push({ _header: fmtDate(item.date) }); lastDate = dateKey; }
    grouped.push(item);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5EFE4', paddingBottom: 24 }}>
      <div style={{ background: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #E4D7BC', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={onGoHome} style={{ width: 32, height: 32, borderRadius: '50%', background: '#F5EFE4', border: 'none', fontSize: 18, cursor: 'pointer', color: '#5B3A29' }}>‹</button>
        <span style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 17, color: '#2A2118', flex: 1 }}>ประวัติบิล</span>
        <button onClick={load} style={{ fontSize: 12, color: '#4CAF50', fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer' }}>⟳ รีเฟรช</button>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '10px 16px', background: '#fff', borderBottom: '1px solid #E4D7BC' }}>
        {[['all','ทั้งหมด'],['buy','ซื้อ (QD)'],['sale','ขาย (QS)']].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)} style={{ padding: '5px 14px', borderRadius: 20, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: filter === val ? '#5B3A29' : '#F5EFE4', color: filter === val ? '#fff' : '#8A7A66', borderColor: filter === val ? '#5B3A29' : '#D0C8C0' }}>{label}</button>
        ))}
      </div>

      <div style={{ padding: '8px 16px', background: '#FAF6F0', borderBottom: '1px solid #E4D7BC' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          {[['today','วันนี้'],['7d','7 วัน'],['30d','30 วัน'],['all','ทั้งหมด']].map(([val, label]) => (
            <button key={val} onClick={() => { setDateFilter(val); setRangeFromDate(''); setRangeFromTime(''); setRangeToDate(''); setRangeToTime(''); }} style={{ padding: '3px 11px', borderRadius: 20, border: '1px solid', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: !hasRange && dateFilter === val ? '#DC743C' : 'transparent', color: !hasRange && dateFilter === val ? '#fff' : '#9A8662', borderColor: !hasRange && dateFilter === val ? '#DC743C' : '#D0C8C0' }}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#9A8662', fontWeight: 600, flexShrink: 0 }}>จาก</span>
          <input type="date" value={rangeFromDate} onChange={e => setRangeFromDate(e.target.value)}
            style={{ flex: 2, minWidth: 0, padding: '4px 6px', borderRadius: 8, border: `1px solid ${rangeFromDate ? '#DC743C' : '#D0C8C0'}`, fontSize: 11, color: rangeFromDate ? '#DC743C' : '#9A8662', background: '#fff', outline: 'none' }} />
          <input type="text" value={rangeFromTime} placeholder="00:00" maxLength={5}
            onChange={e => { let v = e.target.value.replace(/[^0-9]/g,''); if (v.length >= 3) v = v.slice(0,2)+':'+v.slice(2,4); setRangeFromTime(v); }}
            style={{ flex: 1, minWidth: 0, padding: '4px 6px', borderRadius: 8, border: `1px solid ${rangeFromTime ? '#DC743C' : '#D0C8C0'}`, fontSize: 11, color: rangeFromTime ? '#DC743C' : '#9A8662', background: '#fff', outline: 'none', textAlign: 'center' }} />
          <span style={{ fontSize: 11, color: '#9A8662', fontWeight: 600, flexShrink: 0 }}>ถึง</span>
          <input type="date" value={rangeToDate} onChange={e => setRangeToDate(e.target.value)}
            style={{ flex: 2, minWidth: 0, padding: '4px 6px', borderRadius: 8, border: `1px solid ${rangeToDate ? '#DC743C' : '#D0C8C0'}`, fontSize: 11, color: rangeToDate ? '#DC743C' : '#9A8662', background: '#fff', outline: 'none' }} />
          <input type="text" value={rangeToTime} placeholder="23:59" maxLength={5}
            onChange={e => { let v = e.target.value.replace(/[^0-9]/g,''); if (v.length >= 3) v = v.slice(0,2)+':'+v.slice(2,4); setRangeToTime(v); }}
            style={{ flex: 1, minWidth: 0, padding: '4px 6px', borderRadius: 8, border: `1px solid ${rangeToTime ? '#DC743C' : '#D0C8C0'}`, fontSize: 11, color: rangeToTime ? '#DC743C' : '#9A8662', background: '#fff', outline: 'none', textAlign: 'center' }} />
          {hasRange && (
            <button onClick={() => { setRangeFromDate(''); setRangeFromTime(''); setRangeToDate(''); setRangeToTime(''); }} style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 8, border: '1px solid #D0C8C0', background: '#fff', fontSize: 11, color: '#9A8662', cursor: 'pointer' }}>ล้าง</button>
          )}
        </div>
      </div>

      {!loading && (
        <div style={{ margin: '12px 12px 4px', background: '#fff', borderRadius: 14, border: '1px solid #E4D7BC', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center' }}>
            <div style={{ padding: '12px 8px', borderRight: '1px solid #F0E8DC' }}>
              <div style={{ fontSize: 10, color: '#9A8662', fontWeight: 600, marginBottom: 4 }}>📥 รับซื้อ</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#E65100' }}>฿{buyBaht.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: '#9A8662' }}>{buyKg % 1 === 0 ? buyKg : buyKg.toFixed(1)} กก.</div>
              <div style={{ fontSize: 10, color: '#C0A88A', marginTop: 2 }}>{buyItems.length} บิล</div>
            </div>
            <div style={{ padding: '12px 8px', borderRight: '1px solid #F0E8DC' }}>
              <div style={{ fontSize: 10, color: '#9A8662', fontWeight: 600, marginBottom: 4 }}>📤 ขาย</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#2E7D32' }}>฿{saleBaht.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: '#9A8662' }}>{saleKg % 1 === 0 ? saleKg : saleKg.toFixed(1)} กก.</div>
              <div style={{ fontSize: 10, color: '#C0A88A', marginTop: 2 }}>{saleItems.length} บิล</div>
            </div>
            <div style={{ padding: '12px 8px' }}>
              <div style={{ fontSize: 10, color: '#9A8662', fontWeight: 600, marginBottom: 4 }}>กำไร</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: profit >= 0 ? '#2E7D32' : '#C0392B' }}>{profit >= 0 ? '+' : ''}฿{Math.abs(profit).toLocaleString()}</div>
              <div style={{ fontSize: 11, color: '#9A8662' }}>{buyBaht > 0 ? `${((profit/buyBaht)*100).toFixed(1)}%` : '—'}</div>
              <div style={{ fontSize: 10, color: '#C0A88A', marginTop: 2 }}> </div>
            </div>
          </div>
          {(() => {
            const remainKg = buyKg - saleKg;
            const remainColor = remainKg >= 0 ? '#5B3A29' : '#C0392B';
            return (
              <div style={{ borderTop: '1px solid #F0E8DC', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#9A8662', fontWeight: 600 }}>📦 คงเหลือ (ซื้อ − ขาย)</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: remainColor }}>
                  {remainKg >= 0 ? '' : '−'}{Math.abs(remainKg % 1 === 0 ? remainKg : parseFloat(remainKg.toFixed(1))).toLocaleString()} กก.
                </span>
              </div>
            );
          })()}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 32, color: '#9A8662' }}>กำลังโหลด...</div>}

      {!loading && grouped.map((item, i) => {
        if (item._header) return <div key={'h-'+i} style={{ padding: '10px 16px 4px', fontSize: 11, fontWeight: 700, color: '#9A8662', letterSpacing: '0.5px' }}>{item._header}</div>;
        const isBuy = item.type === 'buy';
        return (
          <div key={item.billNo} style={{ margin: '0 12px 8px', background: isBuy ? '#FFFAF5' : '#F5FBF6', borderRadius: 14, border: `1px solid ${isBuy ? '#F0DECA' : '#C8E6C9'}`, borderLeft: `4px solid ${isBuy ? '#DC743C' : '#4CAF50'}`, overflow: 'hidden' }}>
            <button onClick={() => isBuy ? onOpenBill?.(item.billNo) : onOpenSaleBill?.(item.billNo)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: isBuy ? '#FDE8D4' : '#D4EDDA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{isBuy ? '📥' : '📤'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#2A2118' }}>{item.billNo}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: isBuy ? '#FDE8D4' : '#D4EDDA', color: isBuy ? '#C0450A' : '#1B6B2E' }}>{isBuy ? 'ซื้อ' : 'ขาย'}</span>
                </div>
                <div style={{ fontSize: 11.5, color: '#9A8662', marginTop: 2 }}>{fmtDate(item.date)} · {fmtTime(item.date)}{item.name ? ` · ${item.name}` : ''}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: isBuy ? '#C0450A' : '#1B6B2E' }}>฿{fmtBaht(parseNum(item.baht))}</div>
                <div style={{ fontSize: 11, color: '#9A8662' }}>{fmtKg(parseNum(item.kg))} กก.</div>
              </div>
            </button>
            {!isEmployee && (
              <div style={{ padding: '0 12px 10px', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setDeleteTarget(item)} style={{ border: '1px solid #E8C8C2', background: '#FDF0EE', borderRadius: 8, padding: '4px 12px', fontSize: 11, color: '#C0392B', cursor: 'pointer' }}>🗑 ลบ</button>
              </div>
            )}
          </div>
        );
      })}

      {!loading && filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#9A8662' }}>ไม่มีข้อมูล</div>}

      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, maxWidth: 320, width: '100%' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>ลบบิลนี้?</div>
            <div style={{ fontSize: 13, color: '#9A8662', marginBottom: 20 }}>{deleteTarget.billNo} · {deleteTarget.name || '—'}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #D0C8C0', background: '#F5EFE4', fontWeight: 600, cursor: 'pointer' }}>ยกเลิก</button>
              <button onClick={() => handleDelete(deleteTarget)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: '#C0392B', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>ลบ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CustomersView ────────────────────────────────────────────────────────────
function CustomersView({ history, verified, onGoHome, onOpenCustomer, onDeleteCustomer, pin, isEmployee }) {
  const customers = loadCustomers(history);
  const list = Object.values(customers).sort((a, b) => b.totalKg - a.totalKg);
  const [deleteTarget, setDeleteTarget] = useState(null);

  return (
    <div style={{ flex: 1, maxWidth: 720, width: '100%', margin: '0 auto', padding: '14px 14px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onGoHome} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#7A6450', cursor: 'pointer' }}>‹ หน้าหลัก</button>
        <h2 style={{ fontFamily: 'Prompt', fontWeight: 400, fontSize: 20, color: '#4A3526', margin: 0 }}>ทะเบียนลูกค้า</h2>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {TIERS.map(t => (
          <span key={t.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8A7A66' }}>
            <TierBadge tier={t} />
            {t.min > 0 ? `≥${t.min.toLocaleString()}` : 'เริ่มต้น'}
          </span>
        ))}
      </div>

      {list.length === 0 && <div style={{ textAlign: 'center', color: '#B7A684', fontSize: 14, marginTop: 40 }}>ยังไม่มีลูกค้า</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map(c => {
          const stat = customerStat(c.phone, history, verified);
          const tier = stat.effectiveTier;
          const rawTier = stat.tier;
          const pct = stat.next ? Math.min(100, (stat.total / stat.next.min) * 100) : 100;
          return (
            <div key={c.phone} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 14, overflow: 'hidden' }}>
              <button onClick={() => onOpenCustomer(c.phone)} style={{ textAlign: 'left', background: 'none', border: 'none', width: '100%', padding: '14px 16px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F0E4C8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>👤</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: '#4A3526' }}>{c.name || '—'}</div>
                    <div style={{ fontSize: 12, color: '#9A8662' }}>{c.phone}</div>
                  </div>
                  <TierBadge tier={tier} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9A8662', marginBottom: 6 }}>
                  <span><b style={{ color: '#4A3526', fontFamily: 'Prompt' }}>{fmtKg(c.totalKg)}</b> กก. · {c.billCount} บิล</span>
                  {stat.next && <span>→ {stat.next.label}: {fmtKg(stat.next.min - c.totalKg)} กก.</span>}
                </div>
                <div style={{ height: 5, background: '#EFE4CD', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: rawTier.dot, borderRadius: 3 }} />
                </div>
              </button>
              {!isEmployee && onDeleteCustomer && (
                <div style={{ padding: '0 14px 10px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => setDeleteTarget({ type: 'customer', phone: c.phone, name: c.name, kg: fmtKg(c.totalKg), bills: c.billCount })}
                    style={{ border: '1px solid #E8C8C2', background: '#FDF0EE', borderRadius: 8, padding: '5px 12px', fontSize: 11, color: '#C0392B', cursor: 'pointer' }}>
                    🗑 ลบลูกค้า
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {deleteTarget && (
        <DeleteBillModal
          bill={{ seller: deleteTarget.name || deleteTarget.phone, billNo: `${deleteTarget.bills ?? ''} บิล · ${deleteTarget.kg ?? ''} กก.`, baht: '' }}
          pin={pin}
          onConfirm={() => { onDeleteCustomer(deleteTarget.phone); setDeleteTarget(null); }}
          onClose={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}

// ─── SupervisorsView ──────────────────────────────────────────────────────────
function SupervisorsView({ supervisors, supervisorNames, history, onGoHome, onOpenSupervisor, onDeleteSupervisor, onAddSupervisor, pin, isEmployee }) {
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [billStats, setBillStats] = React.useState({});
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const supMap = {};
  Object.entries(supervisors || {}).forEach(([phone, name]) => {
    if (!name) return;
    if (!supMap[name]) supMap[name] = [];
    supMap[name].push(phone);
  });
  (supervisorNames || []).forEach(name => { if (name && !supMap[name]) supMap[name] = []; });
  const list = Object.entries(supMap).sort((a, b) => b[1].length - a[1].length);

  React.useEffect(() => {
    db.fetchSupervisorBillStats().then(setBillStats).catch(() => {});
  }, []);

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAddSupervisor && onAddSupervisor(newName.trim());
    setNewName(''); setShowAddModal(false);
  };

  return (
    <div style={{ flex: 1, maxWidth: 720, width: '100%', margin: '0 auto', padding: '14px 14px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onGoHome} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#7A6450', cursor: 'pointer' }}>‹ หน้าหลัก</button>
        <h2 style={{ fontFamily: 'Prompt', fontWeight: 400, fontSize: 20, color: '#4A3526', margin: 0, flex: 1 }}>รายชื่อผู้ดูแล</h2>
        {!isEmployee && <button onClick={() => setShowAddModal(true)} style={{ border: 'none', background: '#DC743C', color: '#fff', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ เพิ่ม</button>}
      </div>

      {showAddModal && (
        <div onClick={() => setShowAddModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '20px 16px 32px' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#2A2118', marginBottom: 14 }}>เพิ่มผู้ดูแลใหม่</div>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="ชื่อผู้ดูแล เช่น นุ่น, โจ้..."
              style={{ width: '100%', border: '1.5px solid #E4D7BC', borderRadius: 10, padding: '10px 12px', fontSize: 15, color: '#2A2118', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
            <button onClick={handleAdd} style={{ width: '100%', background: '#DC743C', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>บันทึก</button>
          </div>
        </div>
      )}

      {list.length === 0 && <div style={{ textAlign: 'center', color: '#B7A684', fontSize: 14, marginTop: 40 }}>ยังไม่มีผู้ดูแล</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map(([name, phones]) => {
          const stat = billStats[name] || {};
          return (
            <div key={name} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 14, overflow: 'hidden' }}>
              <button onClick={() => onOpenSupervisor(name)} style={{ textAlign: 'left', background: 'none', border: 'none', width: '100%', padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#5C4326,#3F2D1E)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🧑‍💼</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: '#4A3526' }}>{name}</div>
                  <div style={{ fontSize: 12, color: '#9A8662', marginTop: 2 }}>{phones.length} ลูกค้า · รวม {fmtKg(stat.kg || 0)} กก. · {stat.count || 0} บิล</div>
                </div>
                <span style={{ color: '#C9A24B', fontSize: 18 }}>›</span>
              </button>
              {!isEmployee && onDeleteSupervisor && (
                <div style={{ padding: '0 14px 10px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => setDeleteTarget({ name, phones: phones.length })}
                    style={{ border: '1px solid #E8C8C2', background: '#FDF0EE', borderRadius: 8, padding: '5px 12px', fontSize: 11, color: '#C0392B', cursor: 'pointer' }}>
                    🗑 ลบผู้ดูแล
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {deleteTarget && (
        <DeleteBillModal
          bill={{ seller: deleteTarget.name, billNo: `ดูแล ${deleteTarget.phones} ลูกค้า`, baht: '' }}
          pin={pin}
          onConfirm={() => { onDeleteSupervisor(deleteTarget.name); setDeleteTarget(null); }}
          onClose={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}

// ─── SupervisorDetailView ─────────────────────────────────────────────────────
function SlipShell({ title, supervisorName, dateLabel, onBack, children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F5EFE4', padding: 16 }}>
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button onClick={onBack} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: '#7A6450', cursor: 'pointer' }}>‹ กลับ</button>
          <button onClick={() => window.print()} style={{ flex: 1, background: '#5B3A29', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>🖨️ พิมพ์</button>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: '24px 20px', border: '1px solid #E4D7BC' }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 20, color: '#5B3A29' }}>QUDSUN</div>
            <div style={{ fontSize: 11, color: '#9A8662', marginTop: 2 }}>ทุเรียนคัดสรร</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#2A2118', marginTop: 10 }}>{title}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5B3A29', marginBottom: 4 }}>
            <span>ผู้ดูแล</span><span style={{ fontWeight: 700 }}>{supervisorName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9A8662', marginBottom: 16 }}>
            <span>วันที่</span><span>{dateLabel}</span>
          </div>
          {children}
          <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ borderTop: '1px solid #9A8662', paddingTop: 6, textAlign: 'center', fontSize: 11, color: '#9A8662' }}>ผู้รับเงิน</div>
            <div style={{ borderTop: '1px solid #9A8662', paddingTop: 6, textAlign: 'center', fontSize: 11, color: '#9A8662' }}>ผู้จ่าย</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// บิลค่าแรง+โบนัส (รายวัน)
function SalarySlipPrintView({ supervisorName, dateLabel, bills, base, commission, bonus, onBack }) {
  const total = base + commission + bonus;
  const parseNum = v => parseFloat(String(v ?? '').replace(/,/g, '')) || 0;
  const customerRows = {};
  bills.forEach(h => {
    const phone = h.phone || h.data?.sellerPhone || '';
    const name = h.seller || h.name || phone || '—';
    if (!customerRows[phone]) customerRows[phone] = { name, kg: 0 };
    customerRows[phone].kg += parseNum(h.kg);
  });
  const rows = Object.values(customerRows);
  return (
    <SlipShell title="บิลค่าแรง" supervisorName={supervisorName} dateLabel={dateLabel} onBack={onBack}>
      {rows.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9A8662', marginBottom: 6, borderBottom: '1px solid #F0E8DC', paddingBottom: 4 }}>รายการลูกค้า</div>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#4A3526', padding: '3px 0' }}>
              <span>{r.name}</span><span style={{ fontWeight: 600 }}>{r.kg % 1 === 0 ? r.kg : r.kg.toFixed(1)} กก.</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ borderTop: '1px solid #E4D7BC', paddingTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#4A3526', marginBottom: 4 }}>
          <span>เบสรายวัน</span><span>฿{base.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#4A3526', marginBottom: 4 }}>
          <span>ค่าคอม ({bills.reduce((s,h)=>s+(parseFloat(String(h.kg??'').replace(/,/g,''))||0),0).toFixed(0)} กก. × ฿1)</span>
          <span>฿{commission.toLocaleString()}</span>
        </div>
        {bonus > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#4A3526', marginBottom: 4 }}>
            <span>โบนัส</span><span>฿{bonus.toLocaleString()}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: '#5B3A29', borderTop: '1px solid #E4D7BC', paddingTop: 10, marginTop: 6 }}>
          <span>รวมจ่าย</span><span>฿{total.toLocaleString()}</span>
        </div>
      </div>
    </SlipShell>
  );
}

// บิลค่าแรง+โบนัส ภาพรวม (ออกจาก tab การจ่าย)
function WageSlipPrintView({ supervisorName, earnings, baseRate, onBack }) {
  const fmtThDate = s => { if (!s) return ''; const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }); };
  const totalBase = earnings.reduce((s, e) => s + (e.base || 0), 0);
  const totalBonus = earnings.reduce((s, e) => s + (e.bonus || 0), 0);
  const total = totalBase + totalBonus;
  const dateLabel = earnings.length > 0
    ? `${fmtThDate(earnings[earnings.length-1]?.date)} – ${fmtThDate(earnings[0]?.date)}`
    : new Date().toLocaleDateString('th-TH');
  return (
    <SlipShell title="บิลค่าแรง + โบนัส" supervisorName={supervisorName} dateLabel={dateLabel} onBack={onBack}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9A8662', marginBottom: 6, borderBottom: '1px solid #F0E8DC', paddingBottom: 4 }}>รายการรายวัน</div>
        {earnings.map((e, i) => (
          <div key={e.id || i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#4A3526', padding: '4px 0', borderBottom: '1px solid #FAF4EC' }}>
            <span>{fmtThDate(e.date)}</span>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontWeight: 600 }}>฿{(e.base || 0).toLocaleString()}</span>
              {e.bonus > 0 && <span style={{ color: '#7B3FA0', marginLeft: 6 }}>+฿{e.bonus} โบนัส</span>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid #E4D7BC', paddingTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#4A3526', marginBottom: 4 }}>
          <span>รวมรายวัน ({earnings.length} วัน)</span><span>฿{totalBase.toLocaleString()}</span>
        </div>
        {totalBonus > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#7B3FA0', marginBottom: 4 }}>
            <span>โบนัสรวม</span><span>฿{totalBonus.toLocaleString()}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: '#5B3A29', borderTop: '1px solid #E4D7BC', paddingTop: 10, marginTop: 6 }}>
          <span>รวมจ่าย</span><span>฿{total.toLocaleString()}</span>
        </div>
      </div>
    </SlipShell>
  );
}

// บิลค่าคอม (แยกออก)
function CommissionSlipPrintView({ supervisorName, bills, commissionRate, onBack }) {
  const parseNum = v => parseFloat(String(v ?? '').replace(/,/g, '')) || 0;
  const fmtBillDate = ms => {
    const d = new Date(typeof ms === 'number' ? (ms > 1e12 ? ms : ms * 1000) : new Date(ms).getTime());
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  };
  const totalKg = bills.reduce((s, b) => s + parseNum(b.kg), 0);
  const totalComm = Math.round(totalKg * commissionRate);
  const dateLabel = bills.length > 0
    ? (() => {
        const sorted = [...bills].sort((a, b) => (a.date > b.date ? 1 : -1));
        return `${fmtBillDate(sorted[0].date)} – ${fmtBillDate(sorted[sorted.length-1].date)}`;
      })()
    : new Date().toLocaleDateString('th-TH');
  return (
    <SlipShell title="บิลค่าคอมมิชชั่น" supervisorName={supervisorName} dateLabel={dateLabel} onBack={onBack}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9A8662', marginBottom: 6, borderBottom: '1px solid #F0E8DC', paddingBottom: 4 }}>รายการบิล ({bills.length} บิล)</div>
        {bills.map((b, i) => {
          const kg = parseNum(b.kg);
          const comm = Math.round(kg * commissionRate);
          return (
            <div key={b.billNo || i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#4A3526', padding: '4px 0', borderBottom: '1px solid #FAF4EC' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{b.seller || '—'}</div>
                <div style={{ fontSize: 10, color: '#B0966A' }}>{fmtBillDate(b.date)} · #{b.billNo}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600 }}>{kg % 1 === 0 ? kg : kg.toFixed(1)} กก.</div>
                <div style={{ color: '#E65100', fontWeight: 700 }}>+฿{comm}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: '1px solid #E4D7BC', paddingTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#4A3526', marginBottom: 4 }}>
          <span>รวม {totalKg % 1 === 0 ? totalKg : totalKg.toFixed(1)} กก. × ฿{commissionRate}</span><span>฿{totalComm.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: '#E65100', borderTop: '1px solid #E4D7BC', paddingTop: 10, marginTop: 6 }}>
          <span>รวมค่าคอม</span><span>฿{totalComm.toLocaleString()}</span>
        </div>
      </div>
    </SlipShell>
  );
}

function SupervisorDetailView({ supervisorName, supervisors, history, verified, onGoBack, onOpenCustomer, onOpenHistory }) {
  const phones = Object.entries(supervisors || {}).filter(([, n]) => n === supervisorName).map(([p]) => p);
  const customers = loadCustomers(history);
  const parseNum = v => parseFloat(String(v ?? '').replace(/,/g, '')) || 0;
  const toDateStr = d => { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`; };
  const fmtThDate = s => { if (!s) return ''; const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }); };
  const fmtPayNote = note => {
    if (!note) return '';
    if (note.startsWith('COMM_BILLS:')) {
      try { const arr = JSON.parse(note.slice('COMM_BILLS:'.length)); return `ค่าคอม ${arr.length} บิล`; } catch {}
    }
    if (note.startsWith('WAGE_DATES:')) {
      try { const arr = JSON.parse(note.slice('WAGE_DATES:'.length)); return `ค่าแรง ${arr.length} วัน`; } catch {}
    }
    return note;
  };
  const MONTH_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const DOW_TH = ['อา','จ','อ','พ','พฤ','ศ','ส'];
  const nowRef = new Date();

  const [tab, setTab] = React.useState('calendar');
  const [calYear, setCalYear] = React.useState(nowRef.getFullYear());
  const [calMonth, setCalMonth] = React.useState(nowRef.getMonth());
  const [selectedDay, setSelectedDay] = React.useState(null);
  const [dayBonus, setDayBonus] = React.useState(0);
  const [dayRate, setDayRate] = React.useState(1);
  const [baseRate, setBaseRate] = React.useState(200);
  const [editingBase, setEditingBase] = React.useState(false);
  const [baseDraft, setBaseDraft] = React.useState(200);
  const [commissionRate, setCommissionRate] = React.useState(1);
  const [editingCommission, setEditingCommission] = React.useState(false);
  const [commissionDraft, setCommissionDraft] = React.useState(1);
  const [monthBills, setMonthBills] = React.useState([]);
  const [allTimeBills, setAllTimeBills] = React.useState([]);
  const [loadingBills, setLoadingBills] = React.useState(false);
  const [earnings, setEarnings] = React.useState([]);
  const [payments, setPayments] = React.useState([]);
  const [loadingLedger, setLoadingLedger] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [showPayForm, setShowPayForm] = React.useState(false);
  const [payAmount, setPayAmount] = React.useState('');
  const [payNote, setPayNote] = React.useState('');
  const [showSlip, setShowSlip] = React.useState(false);
  const [showPaySlip, setShowPaySlip] = React.useState(false);
  const [showWageSlip, setShowWageSlip] = React.useState(false);
  const [showCommSlip, setShowCommSlip] = React.useState(false);
  const [showPeriodPay, setShowPeriodPay] = React.useState(false);
  const [periodFrom, setPeriodFrom] = React.useState('');
  const [periodTo, setPeriodTo] = React.useState('');
  const [commSelectMode, setCommSelectMode] = React.useState(false);
  const [selectedCommBills, setSelectedCommBills] = React.useState(new Set());
  const [showCommPaySlip, setShowCommPaySlip] = React.useState(false);
  const [pendingCommBills, setPendingCommBills] = React.useState([]);
  const [editingPayment, setEditingPayment] = React.useState(null);
  const [editPayAmount, setEditPayAmount] = React.useState('');
  const [editPayNote, setEditPayNote] = React.useState('');
  const [wageSelectMode, setWageSelectMode] = React.useState(false);
  const [selectedWageDates, setSelectedWageDates] = React.useState(new Set());
  const [showWagePaySlip, setShowWagePaySlip] = React.useState(false);
  const [pendingWageRecords, setPendingWageRecords] = React.useState([]);

  React.useEffect(() => {
    db.getSetting('sup_base_rates').then(v => {
      const r = v || {};
      if (r[supervisorName] !== undefined) { setBaseRate(r[supervisorName]); setBaseDraft(r[supervisorName]); }
    }).catch(() => {});
    db.getSetting('sup_commission_rates').then(v => {
      const r = v || {};
      if (r[supervisorName] !== undefined) { setCommissionRate(r[supervisorName]); setCommissionDraft(r[supervisorName]); }
    }).catch(() => {});
  }, [supervisorName]);

  const saveBaseRate = async (val) => {
    try {
      const cur = await db.getSetting('sup_base_rates') || {};
      await db.saveSetting('sup_base_rates', { ...cur, [supervisorName]: val });
      setBaseRate(val);
    } catch {}
    setEditingBase(false);
  };

  const saveCommissionRate = async (val) => {
    try {
      const cur = await db.getSetting('sup_commission_rates') || {};
      await db.saveSetting('sup_commission_rates', { ...cur, [supervisorName]: val });
      setCommissionRate(val);
    } catch {}
    setEditingCommission(false);
  };

  const loadLedger = React.useCallback(async () => {
    setLoadingLedger(true);
    try {
      const [e, p] = await Promise.all([db.fetchEarnings(supervisorName), db.fetchPayments(supervisorName)]);
      setEarnings(e); setPayments(p);
    } catch {}
    setLoadingLedger(false);
  }, [supervisorName]);

  React.useEffect(() => { loadLedger(); }, [loadLedger]);

  React.useEffect(() => {
    db.fetchBillsBySupervisor(supervisorName).then(b => setAllTimeBills(b)).catch(() => {});
  }, [supervisorName]);

  React.useEffect(() => {
    setLoadingBills(true);
    const mm = String(calMonth+1).padStart(2,'0');
    const lastD = new Date(calYear, calMonth+1, 0).getDate();
    const from = `${calYear}-${mm}-01T00:00:00`;
    const to = `${calYear}-${mm}-${String(lastD).padStart(2,'0')}T23:59:59`;
    db.fetchBillsBySupervisor(supervisorName, from, to).then(b => setMonthBills(b)).catch(() => setMonthBills([])).finally(() => setLoadingBills(false));
  }, [supervisorName, calYear, calMonth]);

  const billsByDay = React.useMemo(() => {
    const g = {};
    monthBills.forEach(b => {
      if (!b.date) return;
      const ms = typeof b.date === 'number' ? (b.date > 1e12 ? b.date : b.date * 1000) : new Date(b.date).getTime();
      const d = new Date(ms).getDate();
      if (!g[d]) g[d] = [];
      g[d].push(b);
    });
    return g;
  }, [monthBills]);

  const earningsByDay = React.useMemo(() => {
    const g = {};
    earnings.forEach(e => {
      if (!e.date) return;
      const ed = new Date(e.date + 'T12:00:00');
      if (ed.getFullYear() === calYear && ed.getMonth() === calMonth) g[ed.getDate()] = e;
    });
    return g;
  }, [earnings, calYear, calMonth]);

  const [dayIncludeBase, setDayIncludeBase] = React.useState(true);

  const selBills = billsByDay[selectedDay] || [];
  const selEarning = earningsByDay[selectedDay];
  const selKg = selBills.reduce((s, b) => s + parseNum(b.kg), 0);
  const selCommission = Math.round(selKg * dayRate);
  const selDayBase = dayIncludeBase ? baseRate : 0;
  const selTotal = selDayBase + selCommission + dayBonus;

  React.useEffect(() => {
    if (selEarning) {
      setDayBonus(selEarning.bonus || 0);
      setDayIncludeBase((selEarning.base || 0) > 0);
      setDayRate(selEarning.commission_kg > 0 ? Math.round(selEarning.commission_baht / selEarning.commission_kg * 10) / 10 : 1);
    } else { setDayBonus(0); setDayIncludeBase(true); setDayRate(commissionRate); }
  }, [selectedDay, selEarning?.id]);


  // Daily wage cutoff: day D's base pay is earned only when D+1 at 12:00 has passed
  const isDaySettled = React.useCallback((billDateMs) => {
    const d = new Date(billDateMs);
    const cutoff = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12, 0, 0);
    return Date.now() >= cutoff.getTime();
  }, []);

  const totalEarned = React.useMemo(() => {
    // Days with base=0 earnings = manually excluded from daily wage
    const zeroBaseDayKeys = new Set(
      earnings.filter(e => (e.base || 0) === 0).map(e => {
        const ed = new Date(e.date + 'T12:00:00');
        return `${ed.getFullYear()}-${ed.getMonth()}-${ed.getDate()}`;
      })
    );
    const settledDayKeys = new Set();
    const allDayKeys = new Set();
    let totalKg = 0;
    allTimeBills.forEach(b => {
      if (!b.date) return;
      const ms = typeof b.date === 'number' ? (b.date > 1e12 ? b.date : b.date * 1000) : new Date(b.date).getTime();
      const d = new Date(ms);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      allDayKeys.add(key);
      // Only count base for settled days that are NOT manually excluded
      if (isDaySettled(ms) && !zeroBaseDayKeys.has(key)) settledDayKeys.add(key);
      totalKg += parseNum(b.kg);
    });
    let total = settledDayKeys.size * baseRate + Math.round(totalKg * commissionRate);
    earnings.forEach(e => {
      const ed = new Date(e.date + 'T12:00:00');
      const key = `${ed.getFullYear()}-${ed.getMonth()}-${ed.getDate()}`;
      if (!allDayKeys.has(key)) {
        total += (e.base || 0) + (e.commission_baht || 0) + (e.bonus || 0);
      } else {
        total += (e.bonus || 0);
      }
    });
    return total;
  }, [allTimeBills, baseRate, commissionRate, earnings, isDaySettled]);
  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const balance = totalEarned - totalPaid;

  // Breakdown by type (respects cutoff)
  const { breakdownWorkDays, breakdownPendingDays, breakdownTotalKg } = React.useMemo(() => {
    const zeroBaseDayKeys = new Set(
      earnings.filter(e => (e.base || 0) === 0).map(e => {
        const ed = new Date(e.date + 'T12:00:00');
        return `${ed.getFullYear()}-${ed.getMonth()}-${ed.getDate()}`;
      })
    );
    const settled = new Set();
    const pending = new Set();
    let kg = 0;
    allTimeBills.forEach(b => {
      if (!b.date) return;
      const ms = typeof b.date === 'number' ? (b.date > 1e12 ? b.date : b.date * 1000) : new Date(b.date).getTime();
      const d = new Date(ms);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (isDaySettled(ms)) {
        if (!zeroBaseDayKeys.has(key)) settled.add(key);
      } else {
        pending.add(key);
      }
      kg += parseNum(b.kg);
    });
    return { breakdownWorkDays: settled.size, breakdownPendingDays: pending.size, breakdownTotalKg: kg };
  }, [allTimeBills, earnings, isDaySettled]);
  const breakdownBase = breakdownWorkDays * baseRate;
  const breakdownComm = Math.round(breakdownTotalKg * commissionRate);
  const breakdownBonus = earnings.reduce((s, e) => s + (e.bonus || 0), 0);

  const periodSummary = React.useMemo(() => {
    if (!periodFrom || !periodTo) return null;
    const from = new Date(periodFrom + 'T00:00:00').getTime();
    const to = new Date(periodTo + 'T23:59:59').getTime();
    const pEarnings = earnings.filter(e => {
      const d = new Date(e.date + 'T12:00:00').getTime();
      return d >= from && d <= to;
    });
    const pBase = pEarnings.reduce((s, e) => s + (e.base || 0), 0);
    const pBonus = pEarnings.reduce((s, e) => s + (e.bonus || 0), 0);
    const pBills = allTimeBills.filter(b => {
      if (!b.date) return false;
      const ms = typeof b.date === 'number' ? (b.date > 1e12 ? b.date : b.date * 1000) : new Date(b.date).getTime();
      return ms >= from && ms <= to;
    });
    const pKg = pBills.reduce((s, b) => s + parseNum(b.kg), 0);
    const pComm = Math.round(pKg * commissionRate);
    return { days: pEarnings.length, base: pBase, bonus: pBonus, kg: pKg, comm: pComm, total: pBase + pBonus + pComm };
  }, [periodFrom, periodTo, earnings, allTimeBills, commissionRate]);

  const handleSaveDayEarning = async () => {
    setSaving(true);
    try {
      const mm = String(calMonth+1).padStart(2,'0');
      const dd = String(selectedDay).padStart(2,'0');
      await db.saveEarning({ supervisor_name: supervisorName, date: `${calYear}-${mm}-${dd}`, base: selDayBase, commission_kg: selKg, commission_baht: selCommission, bonus: dayBonus, total: selTotal });
      await loadLedger();
    } catch { alert('บันทึกไม่สำเร็จ'); }
    setSaving(false);
  };

  const handleDeleteEarning = async (earningId) => {
    try {
      await db.deleteEarning(earningId);
      await loadLedger();
    } catch { alert('ลบไม่สำเร็จ'); }
  };

  const handleSavePayment = async () => {
    if (!payAmount) return;
    setSaving(true);
    try {
      await db.savePayment({ supervisor_name: supervisorName, paid_date: toDateStr(new Date()), amount: Number(payAmount), note: payNote || null });
      setPayAmount(''); setPayNote(''); setShowPayForm(false);
      await loadLedger();
      setShowPaySlip(true);
    } catch { alert('บันทึกไม่สำเร็จ'); }
    setSaving(false);
  };

  const todayDateStr = toDateStr(new Date());
  const todayEarning = earnings.find(e => e.date === todayDateStr);
  const todayIsOff = todayEarning && (todayEarning.base || 0) === 0;

  const handleTodayOff = async () => {
    try {
      if (todayIsOff) {
        await db.deleteEarning(todayEarning.id);
      } else {
        await db.saveEarning({ supervisor_name: supervisorName, date: todayDateStr, base: 0, commission_kg: 0, commission_baht: 0, bonus: 0, total: 0 });
      }
      await loadLedger();
    } catch { alert('บันทึกไม่สำเร็จ'); }
  };

  const prevMonth = () => { if (calMonth === 0) { setCalYear(y => y-1); setCalMonth(11); } else setCalMonth(m => m-1); setSelectedDay(null); };
  const nextMonth = () => { if (calMonth === 11) { setCalYear(y => y+1); setCalMonth(0); } else setCalMonth(m => m+1); setSelectedDay(null); };

  const firstDow = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const calCells = [];
  for (let i = 0; i < firstDow; i++) calCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calCells.push(d);

  const slipDateLabel = `${selectedDay} ${MONTH_TH[calMonth]} ${calYear + 543}`;

  if (showSlip) return (
    <SalarySlipPrintView supervisorName={supervisorName} dateLabel={slipDateLabel} bills={selBills} base={baseRate} commission={selCommission} bonus={dayBonus} onBack={() => setShowSlip(false)} />
  );

  if (showWageSlip) return (
    <WageSlipPrintView supervisorName={supervisorName} earnings={earnings} baseRate={baseRate} onBack={() => setShowWageSlip(false)} />
  );

  if (showCommSlip) return (
    <CommissionSlipPrintView supervisorName={supervisorName} bills={allTimeBills} commissionRate={commissionRate} onBack={() => setShowCommSlip(false)} />
  );

  if (showCommPaySlip) {
    const slipTotalKg = pendingCommBills.reduce((s, x) => s + x.kg, 0);
    const slipTotalComm = pendingCommBills.reduce((s, x) => s + x.comm, 0);
    const slipDate = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
    return (
      <div style={{ minHeight: '100vh', background: '#F5EFE4' }}>
        {/* Print-only slip */}
        <div id="comm-pay-slip" style={{ maxWidth: 420, margin: '0 auto', background: '#fff', padding: '24px 20px' }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#5B3A29' }}>ใบจ่ายค่าคอมมิชชัน</div>
            <div style={{ fontSize: 13, color: '#9A8662' }}>{supervisorName} · {slipDate}</div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E4D7BC' }}>
                <th style={{ textAlign: 'left', padding: '6px 4px', color: '#9A8662', fontWeight: 600 }}>วันที่</th>
                <th style={{ textAlign: 'left', padding: '6px 4px', color: '#9A8662', fontWeight: 600 }}>ผู้ขาย</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: '#9A8662', fontWeight: 600 }}>กก.</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: '#9A8662', fontWeight: 600 }}>คอม</th>
              </tr>
            </thead>
            <tbody>
              {pendingCommBills.map(({ b, kg, comm }, i) => {
                const ms = typeof b.date === 'number' ? (b.date > 1e12 ? b.date : b.date * 1000) : new Date(b.date).getTime();
                const dl = new Date(ms).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
                return (
                  <tr key={b.billNo || i} style={{ borderBottom: '1px solid #F0E8DC' }}>
                    <td style={{ padding: '7px 4px', color: '#5B3A29' }}>{dl}</td>
                    <td style={{ padding: '7px 4px', color: '#3F2D1E', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.seller || '—'}</td>
                    <td style={{ padding: '7px 4px', textAlign: 'right', color: '#5B3A29' }}>{kg % 1 === 0 ? kg : kg.toFixed(1)}</td>
                    <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: 700, color: '#E65100' }}>฿{comm}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #5B3A29' }}>
                <td colSpan={2} style={{ padding: '10px 4px', fontWeight: 700, color: '#5B3A29' }}>รวม {pendingCommBills.length} บิล · {slipTotalKg % 1 === 0 ? slipTotalKg : slipTotalKg.toFixed(1)} กก.</td>
                <td></td>
                <td style={{ padding: '10px 4px', textAlign: 'right', fontSize: 16, fontWeight: 800, color: '#E65100' }}>฿{slipTotalComm.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
          <div style={{ marginTop: 32, display: 'flex', justifyContent: 'space-between', paddingTop: 16, borderTop: '1px dashed #C9A24B' }}>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 11, color: '#9A8662', marginBottom: 24 }}>ผู้จ่าย</div>
              <div style={{ borderTop: '1px solid #5B3A29', paddingTop: 4, fontSize: 11, color: '#9A8662' }}>ลายเซ็น</div>
            </div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 11, color: '#9A8662', marginBottom: 24 }}>ผู้รับ ({supervisorName})</div>
              <div style={{ borderTop: '1px solid #5B3A29', paddingTop: 4, fontSize: 11, color: '#9A8662' }}>ลายเซ็น</div>
            </div>
          </div>
        </div>

        {/* Action buttons (hidden in print) */}
        <div className="no-print" style={{ maxWidth: 420, margin: '0 auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => window.print()} style={{ background: '#5B3A29', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            🖨️ พิมพ์บิล
          </button>
          <button onClick={async () => {
            setSaving(true);
            try {
              const billNos = pendingCommBills.map(x => x.b.billNo);
              const payId = await db.savePayment({
                supervisor_name: supervisorName,
                paid_date: toDateStr(new Date()),
                amount: slipTotalComm,
                note: `COMM_BILLS:${JSON.stringify(billNos)}`,
              });
              db.upsertWalletTxIfNew({ wallet: 'A_transfer', direction: 'out', amount: slipTotalComm, txType: 'commission', status: 'pending', refId: String(payId), note: `ค่าคอม ${supervisorName}` }).catch(() => {});
              await loadLedger();
              setShowCommPaySlip(false);
              setCommSelectMode(false);
              setSelectedCommBills(new Set());
              setPendingCommBills([]);
            } catch { alert('บันทึกไม่สำเร็จ'); }
            setSaving(false);
          }} disabled={saving} style={{ background: '#2E7D32', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? '...' : '✅ บันทึกจ่ายค่าคอมแล้ว ฿' + slipTotalComm.toLocaleString()}
          </button>
          <button onClick={() => setShowCommPaySlip(false)} style={{ background: '#E0D5C8', color: '#5B3A29', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            ← ย้อนกลับ (ยังไม่จ่าย)
          </button>
        </div>
      </div>
    );
  }

  if (showWagePaySlip) {
    const slipDate = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
    const slipBase = pendingWageRecords.reduce((s, e) => s + (e.base || 0), 0);
    const slipBonus = pendingWageRecords.reduce((s, e) => s + (e.bonus || 0), 0);
    const slipTotal = slipBase + slipBonus;
    const sortedWage = [...pendingWageRecords].sort((a, b) => a.date.localeCompare(b.date));
    return (
      <div style={{ minHeight: '100vh', background: '#F5EFE4' }}>
        <div id="wage-pay-slip" style={{ maxWidth: 420, margin: '0 auto', background: '#fff', padding: '24px 20px' }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#5B3A29' }}>ใบจ่ายค่าแรง</div>
            <div style={{ fontSize: 13, color: '#9A8662' }}>{supervisorName} · {slipDate}</div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E4D7BC' }}>
                <th style={{ textAlign: 'left', padding: '6px 4px', color: '#9A8662', fontWeight: 600 }}>วันที่</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: '#9A8662', fontWeight: 600 }}>ค่าแรง</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: '#9A8662', fontWeight: 600 }}>โบนัส</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: '#9A8662', fontWeight: 600 }}>รวม</th>
              </tr>
            </thead>
            <tbody>
              {sortedWage.map((e, i) => (
                <tr key={e.id || i} style={{ borderBottom: '1px solid #F0E8DC' }}>
                  <td style={{ padding: '7px 4px', color: '#5B3A29' }}>{fmtThDate(e.date)}</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right', color: '#5B3A29' }}>{(e.base || 0) > 0 ? `฿${e.base}` : '—'}</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right', color: '#7B3FA0' }}>{(e.bonus || 0) > 0 ? `฿${e.bonus}` : '—'}</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: 700, color: '#5B3A29' }}>฿{((e.base || 0) + (e.bonus || 0)).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #5B3A29' }}>
                <td style={{ padding: '10px 4px', fontWeight: 700, color: '#5B3A29' }}>รวม {pendingWageRecords.length} วัน</td>
                <td style={{ padding: '10px 4px', textAlign: 'right', fontWeight: 700 }}>฿{slipBase.toLocaleString()}</td>
                <td style={{ padding: '10px 4px', textAlign: 'right', fontWeight: 700, color: '#7B3FA0' }}>{slipBonus > 0 ? `฿${slipBonus.toLocaleString()}` : '—'}</td>
                <td style={{ padding: '10px 4px', textAlign: 'right', fontSize: 16, fontWeight: 800, color: '#5B3A29' }}>฿{slipTotal.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
          <div style={{ marginTop: 32, display: 'flex', justifyContent: 'space-between', paddingTop: 16, borderTop: '1px dashed #C9A24B' }}>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 11, color: '#9A8662', marginBottom: 24 }}>ผู้จ่าย</div>
              <div style={{ borderTop: '1px solid #5B3A29', paddingTop: 4, fontSize: 11, color: '#9A8662' }}>ลายเซ็น</div>
            </div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 11, color: '#9A8662', marginBottom: 24 }}>ผู้รับ ({supervisorName})</div>
              <div style={{ borderTop: '1px solid #5B3A29', paddingTop: 4, fontSize: 11, color: '#9A8662' }}>ลายเซ็น</div>
            </div>
          </div>
        </div>
        <div className="no-print" style={{ maxWidth: 420, margin: '0 auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => window.print()} style={{ background: '#5B3A29', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            🖨️ พิมพ์บิล
          </button>
          <button onClick={async () => {
            setSaving(true);
            try {
              const dates = pendingWageRecords.map(e => e.date);
              const payId = await db.savePayment({
                supervisor_name: supervisorName,
                paid_date: toDateStr(new Date()),
                amount: slipTotal,
                note: `WAGE_DATES:${JSON.stringify(dates)}`,
              });
              db.upsertWalletTxIfNew({ wallet: 'C', direction: 'out', amount: slipTotal, txType: 'expense', category: 'เงินเดือน', status: 'pending', refId: String(payId), note: `ค่าแรง ${supervisorName}` }).catch(() => {});
              await loadLedger();
              setShowWagePaySlip(false);
              setWageSelectMode(false);
              setSelectedWageDates(new Set());
              setPendingWageRecords([]);
            } catch { alert('บันทึกไม่สำเร็จ'); }
            setSaving(false);
          }} disabled={saving} style={{ background: '#2E7D32', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? '...' : '✅ บันทึกจ่ายค่าแรงแล้ว ฿' + slipTotal.toLocaleString()}
          </button>
          <button onClick={() => setShowWagePaySlip(false)} style={{ background: '#E0D5C8', color: '#5B3A29', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            ← ย้อนกลับ (ยังไม่จ่าย)
          </button>
        </div>
      </div>
    );
  }

  if (showPaySlip) return (
    <div style={{ minHeight: '100vh', background: '#F5EFE4', padding: 16 }}>
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button onClick={() => setShowPaySlip(false)} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: '#7A6450', cursor: 'pointer' }}>‹ กลับ</button>
          <button onClick={() => window.print()} style={{ flex: 1, background: '#5B3A29', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>🖨️ พิมพ์</button>
        </div>
        <div id="pay-slip-print" style={{ background: '#fff', borderRadius: 16, padding: '24px 20px', border: '1px solid #E4D7BC' }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 20, color: '#5B3A29' }}>QUDSUN</div>
            <div style={{ fontSize: 11, color: '#9A8662', marginTop: 2 }}>ทุเรียนคัดสรร</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#2A2118', marginTop: 10 }}>บิลสรุปการจ่ายเงิน</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5B3A29', marginBottom: 4 }}>
            <span>ผู้ดูแล</span><span style={{ fontWeight: 700 }}>{supervisorName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9A8662', marginBottom: 16 }}>
            <span>วันที่พิมพ์</span><span>{new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
          <div style={{ borderTop: '1px solid #E4D7BC', paddingTop: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9A8662', marginBottom: 6, borderBottom: '1px solid #F0E8DC', paddingBottom: 4 }}>รายการจ่าย</div>
            {payments.length === 0 ? (
              <div style={{ fontSize: 12, color: '#B7A684', textAlign: 'center', padding: '8px 0' }}>ยังไม่มีรายการ</div>
            ) : payments.map((p, i) => (
              <div key={p.id || i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#4A3526', padding: '4px 0', borderBottom: '1px solid #F5EFE4' }}>
                <span>{fmtThDate(p.paid_date)}{p.note ? ` · ${fmtPayNote(p.note)}` : ''}</span>
                <span style={{ fontWeight: 600 }}>฿{(p.amount||0).toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid #E4D7BC', paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#4A3526', marginBottom: 4 }}>
              <span>ยอดสะสมทั้งหมด</span><span>฿{totalEarned.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#2E7D32', marginBottom: 4 }}>
              <span>จ่ายแล้ว</span><span>฿{totalPaid.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: balance > 0 ? '#C0392B' : '#2E7D32', borderTop: '1px solid #E4D7BC', paddingTop: 10, marginTop: 6 }}>
              <span>ยอดค้าง</span><span>฿{balance.toLocaleString()}</span>
            </div>
          </div>
          <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ borderTop: '1px solid #9A8662', paddingTop: 6, textAlign: 'center', fontSize: 11, color: '#9A8662' }}>ผู้รับเงิน</div>
            <div style={{ borderTop: '1px solid #9A8662', paddingTop: 6, textAlign: 'center', fontSize: 11, color: '#9A8662' }}>ผู้จ่าย</div>
          </div>
        </div>
      </div>
    </div>
  );

  const TABS = [['calendar','ปฏิทิน'],['bills','บิลคอม'],['earnings','ค่าแรง'],['paid','การจ่าย'],['customers','ลูกค้า']];

  return (
    <div style={{ minHeight: '100vh', background: '#F5EFE4', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #E4D7BC', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={onGoBack} style={{ width: 32, height: 32, borderRadius: '50%', background: '#F5EFE4', border: 'none', fontSize: 18, cursor: 'pointer', color: '#5B3A29' }}>‹</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 16, color: '#2A2118' }}>🧑‍💼 {supervisorName}</div>
        </div>
        <button onClick={handleTodayOff} style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 8, border: `1.5px solid ${todayIsOff ? '#A8D5A2' : '#E4D7BC'}`, background: todayIsOff ? '#F0FFF4' : '#FFF8EE', color: todayIsOff ? '#2E7D32' : '#9A8662', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {todayIsOff ? '✅ หยุดวันนี้' : '💤 หยุดวันนี้'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#9A8662' }}>เบส/วัน:</span>
          {editingBase ? (
            <>
              <input type="number" value={baseDraft} onChange={e => setBaseDraft(Number(e.target.value)||0)} style={{ width: 60, border: '1.5px solid #DC743C', borderRadius: 6, padding: '3px 6px', fontSize: 13, fontWeight: 700, color: '#3F2D1E', outline: 'none' }} />
              <button onClick={() => saveBaseRate(baseDraft)} style={{ fontSize: 11, background: '#DC743C', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>✓</button>
              <button onClick={() => setEditingBase(false)} style={{ fontSize: 11, background: 'none', border: 'none', color: '#9A8662', cursor: 'pointer' }}>✕</button>
            </>
          ) : (
            <button onClick={() => { setBaseDraft(baseRate); setEditingBase(true); }} style={{ fontSize: 13, fontWeight: 700, color: '#DC743C', background: 'none', border: 'none', cursor: 'pointer' }}>฿{baseRate}</button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#9A8662' }}>คอม/กก.:</span>
          {editingCommission ? (
            <>
              <input type="number" step="0.5" value={commissionDraft} onChange={e => setCommissionDraft(Number(e.target.value)||0)} style={{ width: 50, border: '1.5px solid #2E7D32', borderRadius: 6, padding: '3px 6px', fontSize: 13, fontWeight: 700, color: '#3F2D1E', outline: 'none' }} />
              <button onClick={() => saveCommissionRate(commissionDraft)} style={{ fontSize: 11, background: '#2E7D32', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>✓</button>
              <button onClick={() => setEditingCommission(false)} style={{ fontSize: 11, background: 'none', border: 'none', color: '#9A8662', cursor: 'pointer' }}>✕</button>
            </>
          ) : (
            <button onClick={() => { setCommissionDraft(commissionRate); setEditingCommission(true); }} style={{ fontSize: 13, fontWeight: 700, color: '#2E7D32', background: 'none', border: 'none', cursor: 'pointer' }}>฿{commissionRate}</button>
          )}
        </div>
      </div>

      {/* Balance card */}
      <div style={{ margin: '10px 12px 0', background: '#fff', borderRadius: 14, border: '1px solid #E4D7BC', overflow: 'hidden' }}>
        {loadingLedger ? <div style={{ textAlign: 'center', padding: 14, color: '#9A8662', fontSize: 12 }}>กำลังโหลด...</div> : (<>
          {/* Pay type breakdown */}
          <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid #F0E8DC' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#B7A684', marginBottom: 8, letterSpacing: '.08em' }}>รายละเอียดค่าแรง</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14 }}>📅</span>
                  <span style={{ fontSize: 12, color: '#4A3526' }}>รายวัน</span>
                  <span style={{ fontSize: 10, color: '#B7A684' }}>{breakdownWorkDays} วัน × ฿{baseRate}</span>
                  {breakdownPendingDays > 0 && <span style={{ fontSize: 10, color: '#DC743C', background: '#FFF3E0', borderRadius: 4, padding: '1px 5px' }}>+{breakdownPendingDays} วัน รอตัด 12:00</span>}
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#4A3526' }}>฿{breakdownBase.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>📦</span>
                  <span style={{ fontSize: 12, color: '#4A3526' }}>ค่าคอม</span>
                  <span style={{ fontSize: 10, color: '#B7A684' }}>{breakdownTotalKg % 1 === 0 ? breakdownTotalKg : breakdownTotalKg.toFixed(1)} กก. × ฿{commissionRate}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#E65100' }}>฿{breakdownComm.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>🎁</span>
                  <span style={{ fontSize: 12, color: '#4A3526' }}>โบนัส</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#7B3FA0' }}>฿{breakdownBonus.toLocaleString()}</span>
              </div>
            </div>
          </div>
          {/* Totals row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center', padding: '10px 8px' }}>
            <div>
              <div style={{ fontSize: 10, color: '#9A8662' }}>💼 รวมสะสม</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#4A3526' }}>฿{totalEarned.toLocaleString()}</div>
            </div>
            <div style={{ borderLeft: '1px solid #F0E8DC', borderRight: '1px solid #F0E8DC' }}>
              <div style={{ fontSize: 10, color: '#9A8662' }}>✅ จ่ายแล้ว</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#2E7D32' }}>฿{totalPaid.toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#9A8662' }}>🔴 ยอดค้าง</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: balance > 0 ? '#C0392B' : '#9A8662' }}>฿{balance.toLocaleString()}</div>
            </div>
          </div>
          {/* Pay button */}
          {balance > 0 && !showPayForm && (
            <div style={{ padding: '0 12px 12px' }}>
              <button onClick={() => { setShowPayForm(true); setPayAmount(String(balance)); }}
                style={{ width: '100%', background: 'linear-gradient(135deg,#2E7D32,#1B5E20)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                💸 บันทึกการจ่ายเงิน ฿{balance.toLocaleString()}
              </button>
            </div>
          )}
          {showPayForm && (
            <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="จำนวนเงิน" style={{ flex: 1, border: '1.5px solid #E4D7BC', borderRadius: 9, padding: '9px 12px', fontSize: 14, outline: 'none' }} />
                <input value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="หมายเหตุ" style={{ flex: 1, border: '1.5px solid #E4D7BC', borderRadius: 9, padding: '9px 12px', fontSize: 14, outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowPayForm(false)} style={{ flex: 1, background: '#F5EFE4', color: '#7A6450', border: '1px solid #E4D7BC', borderRadius: 9, padding: '10px 0', fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
                <button onClick={handleSavePayment} disabled={saving} style={{ flex: 2, background: '#2E7D32', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{saving ? '...' : '✓ ยืนยันจ่าย'}</button>
              </div>
            </div>
          )}
        </>)}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 12px 0', overflowX: 'auto' }}>
        {TABS.map(([val, label]) => (
          <button key={val} onClick={() => setTab(val)} style={{ padding: '5px 14px', borderRadius: 20, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: tab === val ? '#5B3A29' : '#fff', color: tab === val ? '#fff' : '#8A7A66', borderColor: tab === val ? '#5B3A29' : '#D0C8C0' }}>{label}</button>
        ))}
      </div>

      {/* Tab: ปฏิทิน */}
      {tab === 'calendar' && (
        <div style={{ padding: '10px 12px' }}>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, background: '#fff', borderRadius: 12, padding: '8px 14px', border: '1px solid #E4D7BC' }}>
            <button onClick={prevMonth} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#5B3A29', padding: '0 4px' }}>‹</button>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#2A2118' }}>{MONTH_TH[calMonth]} {calYear + 543}</span>
            <button onClick={nextMonth} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#5B3A29', padding: '0 4px' }}>›</button>
          </div>

          {/* Calendar grid */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E4D7BC', padding: '8px 6px', marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 4 }}>
              {DOW_TH.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 10, color: '#9A8662', padding: '2px 0' }}>{d}</div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
              {calCells.map((day, i) => {
                if (!day) return <div key={'e'+i} />;
                const earning = earningsByDay[day];
                const dBills = billsByDay[day] || [];
                const kg = dBills.reduce((s, b) => s + parseNum(b.kg), 0);
                const calcTotal = baseRate + Math.round(kg * commissionRate);
                const isSelected = day === selectedDay;
                const isToday = day === nowRef.getDate() && calMonth === nowRef.getMonth() && calYear === nowRef.getFullYear();
                const hasData = earning || kg > 0;
                return (
                  <button key={day} onClick={() => setSelectedDay(d => d === day ? null : day)} style={{ borderRadius: 8, border: isSelected ? '2px solid #5B3A29' : earning ? '2px solid #DC743C' : kg > 0 ? '1.5px solid #A8D5A2' : '1px solid #E4D7BC', background: isSelected ? '#5B3A29' : earning ? '#FFF3E0' : kg > 0 ? '#F0FFF4' : '#FAFAFA', padding: '3px 2px', cursor: 'pointer', minHeight: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: hasData || isToday ? 700 : 400, color: isSelected ? '#fff' : earning ? '#E65100' : isToday ? '#5B3A29' : '#4A3526' }}>{day}</div>
                    {!isSelected && earning && <div style={{ fontSize: 9, color: '#E65100', fontWeight: 700, lineHeight: 1 }}>฿{(earning.total||0).toLocaleString()}</div>}
                    {!isSelected && !earning && kg > 0 && <div style={{ fontSize: 9, color: '#2E7D32', fontWeight: 700, lineHeight: 1 }}>฿{calcTotal.toLocaleString()}</div>}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8, paddingLeft: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: '#FFF3E0', border: '2px solid #DC743C' }} /><span style={{ fontSize: 10, color: '#9A8662' }}>บันทึกแล้ว</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: '#F0FFF4', border: '1.5px solid #A8D5A2' }} /><span style={{ fontSize: 10, color: '#9A8662' }}>คำนวณ (ยังไม่บันทึก)</span></div>
            </div>
          </div>

          {/* Month bill overview */}
          {monthBills.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E4D7BC', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #F0E8DC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#2A2118' }}>📋 บิลทั้งหมดเดือนนี้</span>
                <span style={{ fontSize: 11, color: '#9A8662' }}>{monthBills.length} บิล · {monthBills.reduce((s,b) => s + parseNum(b.kg), 0).toLocaleString()} กก.</span>
              </div>
              {loadingBills ? (
                <div style={{ textAlign: 'center', padding: 16, color: '#9A8662', fontSize: 12 }}>กำลังโหลด...</div>
              ) : monthBills.map((b, idx) => {
                const fullCard = history.find(h => h.billNo === b.billNo);
                const clickable = !!fullCard && !!onOpenHistory;
                const bDate = b.date > 1e12 ? b.date : b.date * 1000;
                const bDay = new Date(bDate).getDate();
                return (
                  <button key={b.billNo || idx} onClick={() => clickable && onOpenHistory(fullCard)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: idx % 2 === 0 ? '#FAFAF8' : '#fff', borderBottom: idx < monthBills.length - 1 ? '1px solid #F0E8DC' : 'none', width: '100%', border: 'none', cursor: clickable ? 'pointer' : 'default', textAlign: 'left' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F5EFE4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#5B3A29' }}>{bDay}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#3F2D1E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.seller || '—'}</div>
                      <div style={{ fontSize: 10, color: '#B0966A' }}>#{b.billNo}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#E65100' }}>{parseNum(b.kg) % 1 === 0 ? parseNum(b.kg) : parseNum(b.kg).toFixed(1)} กก.</div>
                      <div style={{ fontSize: 10, color: '#9A8662' }}>฿{Number(b.baht?.toString().replace(/,/g,'')||0).toLocaleString()}</div>
                    </div>
                    {clickable && <span style={{ color: '#C9A24B', fontSize: 16, flexShrink: 0 }}>›</span>}
                  </button>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* Day detail modal */}
      {tab === 'calendar' && selectedDay && (
        <div onClick={() => setSelectedDay(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', padding: '16px 16px 32px' }}>
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#2A2118' }}>📅 {selectedDay} {MONTH_TH[calMonth]} {calYear + 543}</div>
                {selEarning && <div style={{ fontSize: 11, color: '#DC743C', fontWeight: 600, marginTop: 2 }}>✅ บันทึกแล้ว</div>}
              </div>
              <button onClick={() => setSelectedDay(null)} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: '#F0EAE0', fontSize: 16, cursor: 'pointer', color: '#5B3A29', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            {loadingBills ? <div style={{ textAlign: 'center', padding: 24, color: '#9A8662', fontSize: 13 }}>กำลังโหลด...</div> : (<>
              {/* Summary row */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1, background: '#FFF8EE', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: '#9A8662' }}>ยอดกิโล ({selBills.length} บิล)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#E65100' }}>{selKg % 1 === 0 ? selKg : selKg.toFixed(1)} กก.</div>
                </div>
                <div style={{ flex: 1, background: '#F0FFF4', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: '#9A8662' }}>ค่าคอม ({dayRate}฿/กก.)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#2E7D32' }}>฿{selCommission.toLocaleString()}</div>
                </div>
              </div>

              {/* Bill list */}
              {selBills.length > 0 && (
                <div style={{ marginBottom: 12, borderRadius: 10, border: '1px solid #E4D7BC', overflow: 'hidden' }}>
                  {selBills.map((b, idx) => {
                    const fullCard = history.find(h => h.billNo === b.billNo);
                    const clickable = !!fullCard && !!onOpenHistory;
                    return (
                      <button key={b.billNo || idx} onClick={() => clickable && onOpenHistory(fullCard)}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: idx % 2 === 0 ? '#FAFAF8' : '#fff', borderBottom: idx < selBills.length - 1 ? '1px solid #F0E8DC' : 'none', width: '100%', border: 'none', cursor: clickable ? 'pointer' : 'default', textAlign: 'left' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#3F2D1E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.seller || '—'}</div>
                          <div style={{ fontSize: 10, color: '#B0966A' }}>#{b.billNo}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#E65100' }}>{parseNum(b.kg) % 1 === 0 ? parseNum(b.kg) : parseNum(b.kg).toFixed(1)} กก.</div>
                            <div style={{ fontSize: 10, color: '#2E7D32' }}>+฿{Math.round(parseNum(b.kg) * dayRate)}</div>
                          </div>
                          {clickable && <span style={{ color: '#C9A24B', fontSize: 16 }}>›</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Daily wage toggle */}
              <button onClick={() => setDayIncludeBase(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: dayIncludeBase ? '#F0FFF4' : '#FFF0F0', border: `1.5px solid ${dayIncludeBase ? '#A8D5A2' : '#F0A0A0'}`, borderRadius: 10, padding: '9px 14px', marginBottom: 10, cursor: 'pointer' }}>
                <span style={{ fontSize: 13, color: dayIncludeBase ? '#2E7D32' : '#C0392B', fontWeight: 600 }}>
                  📅 ค่าแรงรายวัน ฿{baseRate}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: dayIncludeBase ? '#2E7D32' : '#C0392B', background: dayIncludeBase ? '#D4EDDA' : '#FADBD8', borderRadius: 6, padding: '2px 10px' }}>
                  {dayIncludeBase ? 'นับ ✓' : 'ไม่นับ ✕'}
                </span>
              </button>

              {/* Total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F5EFE4', borderRadius: 12, padding: '10px 14px', marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: '#9A8662' }}>
                  {dayIncludeBase ? `฿${baseRate}` : '฿0 (ไม่นับ)'} + ฿{selCommission}{dayBonus > 0 ? ` + ฿${dayBonus}` : ''}
                </span>
                <span style={{ fontSize: 20, fontWeight: 700, color: '#5B3A29' }}>฿{selTotal.toLocaleString()}</span>
              </div>

              {/* Bonus inline edit */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: '#9A8662', flexShrink: 0 }}>🎁 โบนัส</span>
                <input type="number" value={dayBonus} onChange={e => setDayBonus(Number(e.target.value)||0)} placeholder="0" style={{ flex: 1, border: '1.5px solid #E4D7BC', borderRadius: 8, padding: '7px 10px', fontSize: 14, color: '#3F2D1E', outline: 'none' }} />
                <button onClick={async () => { await handleSaveDayEarning(); }} disabled={saving} style={{ background: '#DC743C', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{saving ? '...' : '💾'}</button>
              </div>
            </>)}
          </div>
        </div>
      )}

      {/* Tab: บิลคอม */}
      {tab === 'bills' && (() => {
        // Parse paid bill numbers from commission payments
        const paidCommBillNos = new Set();
        payments.forEach(p => {
          if (p.note && p.note.startsWith('COMM_BILLS:')) {
            try { JSON.parse(p.note.slice('COMM_BILLS:'.length)).forEach(n => paidCommBillNos.add(n)); } catch {}
          }
        });

        const commPaidAmt = allTimeBills.reduce((s, b) => {
          const kg = parseNum(b.kg);
          const comm = Math.round(kg * commissionRate);
          return paidCommBillNos.has(b.billNo) ? s + comm : s;
        }, 0);
        const commRemain = Math.max(0, breakdownComm - commPaidAmt);

        // Bills newest-first with paid flag from explicit set
        const displayBills = [...allTimeBills].map(b => {
          const kg = parseNum(b.kg);
          const comm = Math.round(kg * commissionRate);
          const paid = paidCommBillNos.has(b.billNo);
          return { b, kg, comm, paid };
        });

        // For selection mode
        const selKg = displayBills.filter(x => selectedCommBills.has(x.b.billNo)).reduce((s, x) => s + x.kg, 0);
        const selComm = displayBills.filter(x => selectedCommBills.has(x.b.billNo)).reduce((s, x) => s + x.comm, 0);
        const unpaidBills = displayBills.filter(x => !x.paid);

        return (
          <div style={{ padding: '10px 12px', paddingBottom: commSelectMode ? 90 : 10 }}>
            {/* Summary bar */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E4D7BC', padding: '12px 14px', marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: 10, color: '#9A8662' }}>📦 ค่าคอมรวม</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#E65100' }}>฿{breakdownComm.toLocaleString()}</div>
                </div>
                <div style={{ borderLeft: '1px solid #F0E8DC', borderRight: '1px solid #F0E8DC' }}>
                  <div style={{ fontSize: 10, color: '#9A8662' }}>✅ จ่ายแล้ว</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#2E7D32' }}>฿{commPaidAmt.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#9A8662' }}>🔴 ค้าง</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: commRemain > 0 ? '#C0392B' : '#9A8662' }}>฿{commRemain.toLocaleString()}</div>
                </div>
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'center' }}>
                {!commSelectMode ? (
                  <button onClick={() => { setCommSelectMode(true); setSelectedCommBills(new Set()); }}
                    style={{ background: '#DC743C', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    📄 ออกบิลค่าคอม
                  </button>
                ) : (
                  <>
                    <button onClick={() => {
                      const allUnpaid = new Set(unpaidBills.map(x => x.b.billNo));
                      setSelectedCommBills(selectedCommBills.size === unpaidBills.length ? new Set() : allUnpaid);
                    }} style={{ background: '#5B3A29', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      {selectedCommBills.size === unpaidBills.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                    </button>
                    <button onClick={() => { setCommSelectMode(false); setSelectedCommBills(new Set()); }}
                      style={{ background: '#E0D5C8', color: '#5B3A29', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      ยกเลิก
                    </button>
                  </>
                )}
              </div>
            </div>

            {allTimeBills.length === 0 && <div style={{ textAlign: 'center', color: '#B7A684', padding: 32 }}>ยังไม่มีบิล</div>}
            {displayBills.map(({ b, kg, comm, paid }, idx) => {
              const ms = typeof b.date === 'number' ? (b.date > 1e12 ? b.date : b.date * 1000) : new Date(b.date).getTime();
              const bDate = new Date(ms);
              const dateLabel = bDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
              const fullCard = history.find(h => h.billNo === b.billNo);
              const isSelected = selectedCommBills.has(b.billNo);
              const canSelect = commSelectMode && !paid;

              const handleClick = () => {
                if (commSelectMode) {
                  if (paid) return;
                  const next = new Set(selectedCommBills);
                  if (next.has(b.billNo)) next.delete(b.billNo); else next.add(b.billNo);
                  setSelectedCommBills(next);
                } else if (fullCard && onOpenHistory) {
                  onOpenHistory(fullCard);
                }
              };

              return (
                <button key={b.billNo || idx} onClick={handleClick}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    background: paid ? '#F9FFF9' : (isSelected ? '#FFF3E6' : '#fff'),
                    border: `1px solid ${paid ? '#C8E6C9' : (isSelected ? '#DC743C' : '#E4D7BC')}`,
                    borderLeft: `4px solid ${paid ? '#2E7D32' : (isSelected ? '#DC743C' : '#E4D7BC')}`,
                    borderRadius: 12, padding: '10px 14px', marginBottom: 6,
                    cursor: canSelect || (!commSelectMode && !!fullCard && !!onOpenHistory) ? 'pointer' : 'default',
                    textAlign: 'left', opacity: commSelectMode && paid ? 0.5 : 1 }}>
                  {commSelectMode && (
                    <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${paid ? '#B0BEC5' : (isSelected ? '#DC743C' : '#C9A24B')}`, background: isSelected ? '#DC743C' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: 14, fontWeight: 700 }}>
                      {isSelected ? '✓' : ''}
                    </div>
                  )}
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: paid ? '#E8F5E9' : '#FFF3E0', border: `1px solid ${paid ? '#81C784' : '#FFB74D'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, fontWeight: 700, color: paid ? '#2E7D32' : '#BF360C' }}>{dateLabel}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#3F2D1E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.seller || '—'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 10, color: '#B0966A' }}>#{b.billNo}</span>
                      {paid
                        ? <span style={{ fontSize: 10, fontWeight: 700, color: '#2E7D32', background: '#E8F5E9', borderRadius: 4, padding: '1px 5px' }}>✓ จ่ายแล้ว</span>
                        : <span style={{ fontSize: 10, fontWeight: 700, color: '#C0392B', background: '#FDECEA', borderRadius: 4, padding: '1px 5px' }}>ค้าง</span>
                      }
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 12, color: '#9A8662' }}>{kg % 1 === 0 ? kg : kg.toFixed(1)} กก.</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: paid ? '#2E7D32' : (isSelected ? '#DC743C' : '#E65100') }}>+฿{comm}</div>
                  </div>
                  {!commSelectMode && !!fullCard && !!onOpenHistory && <span style={{ color: '#C9A24B', fontSize: 16, flexShrink: 0 }}>›</span>}
                </button>
              );
            })}

            {/* Sticky bottom bar when selecting */}
            {commSelectMode && selectedCommBills.size > 0 && (
              <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#5B3A29', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 200 }}>
                <div style={{ color: '#FFF6ED' }}>
                  <div style={{ fontSize: 12 }}>{selectedCommBills.size} บิล · {selKg % 1 === 0 ? selKg : selKg.toFixed(1)} กก.</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>฿{selComm.toLocaleString()}</div>
                </div>
                <button onClick={() => {
                  const selectedList = displayBills.filter(x => selectedCommBills.has(x.b.billNo));
                  setPendingCommBills(selectedList);
                  setShowCommPaySlip(true);
                }} style={{ background: '#DC743C', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  📄 ออกบิล
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Tab: ค่าแรง */}
      {tab === 'earnings' && (() => {
        // Parse paid wage dates from wage payments
        const paidWageDateSet = new Set();
        payments.forEach(p => {
          if (p.note && p.note.startsWith('WAGE_DATES:')) {
            try { JSON.parse(p.note.slice('WAGE_DATES:'.length)).forEach(d => paidWageDateSet.add(d)); } catch {}
          }
        });

        const eligibleEarnings = earnings.filter(e => (e.base || 0) > 0 || (e.bonus || 0) > 0);
        const unpaidEarnings = eligibleEarnings.filter(e => !paidWageDateSet.has(e.date));

        const selWageTotal = eligibleEarnings
          .filter(e => selectedWageDates.has(e.date))
          .reduce((s, e) => s + (e.base || 0) + (e.bonus || 0), 0);

        const wagePaidAmt = payments
          .filter(p => p.note && p.note.startsWith('WAGE_DATES:'))
          .reduce((s, p) => s + (p.amount || 0), 0);

        return (
          <div style={{ padding: '10px 12px', paddingBottom: wageSelectMode ? 90 : 10 }}>
            {/* Summary + select mode controls */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E4D7BC', padding: '12px 14px', marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: 10, color: '#9A8662' }}>📅 ค่าแรง+โบนัส</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#5B3A29' }}>฿{(breakdownBase + breakdownBonus).toLocaleString()}</div>
                </div>
                <div style={{ borderLeft: '1px solid #F0E8DC', borderRight: '1px solid #F0E8DC' }}>
                  <div style={{ fontSize: 10, color: '#9A8662' }}>✅ จ่ายแล้ว</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#2E7D32' }}>฿{wagePaidAmt.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#9A8662' }}>🔴 ค้าง</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: (breakdownBase + breakdownBonus - wagePaidAmt) > 0 ? '#C0392B' : '#9A8662' }}>
                    ฿{Math.max(0, breakdownBase + breakdownBonus - wagePaidAmt).toLocaleString()}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'center' }}>
                {!wageSelectMode ? (
                  <button onClick={() => { setWageSelectMode(true); setSelectedWageDates(new Set()); }}
                    style={{ background: '#5B3A29', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    📄 ออกบิลค่าแรง
                  </button>
                ) : (
                  <>
                    <button onClick={() => {
                      const allUnpaidDates = new Set(unpaidEarnings.map(e => e.date));
                      setSelectedWageDates(selectedWageDates.size === unpaidEarnings.length ? new Set() : allUnpaidDates);
                    }} style={{ background: '#5B3A29', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      {selectedWageDates.size === unpaidEarnings.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                    </button>
                    <button onClick={() => { setWageSelectMode(false); setSelectedWageDates(new Set()); }}
                      style={{ background: '#E0D5C8', color: '#5B3A29', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      ยกเลิก
                    </button>
                  </>
                )}
              </div>
            </div>

            {earnings.length === 0 && !loadingLedger && (
              <div style={{ textAlign: 'center', color: '#B7A684', padding: 32 }}>ยังไม่มีรายการ<br/><span style={{ fontSize: 12 }}>กดวันในปฏิทินแล้วกด 💾 เพื่อบันทึก</span></div>
            )}

            {earnings.map(e => {
              const isOff = (e.base || 0) === 0 && (e.bonus || 0) === 0;
              const isPaid = paidWageDateSet.has(e.date);
              const isSelected = selectedWageDates.has(e.date);
              const canSelect = wageSelectMode && !isPaid && !isOff;
              const dayTotal = (e.base || 0) + (e.bonus || 0);

              const handleClick = () => {
                if (!wageSelectMode) return;
                if (isPaid || isOff) return;
                const next = new Set(selectedWageDates);
                if (next.has(e.date)) next.delete(e.date); else next.add(e.date);
                setSelectedWageDates(next);
              };

              const borderColor = isOff ? '#C0392B' : isPaid ? '#2E7D32' : isSelected ? '#DC743C' : '#DC743C';
              const bgColor = isOff ? '#fff' : isPaid ? '#F9FFF9' : isSelected ? '#FFF3E6' : '#fff';
              const borderLeftColor = isOff ? '#C0392B' : isPaid ? '#2E7D32' : isSelected ? '#DC743C' : '#DC743C';

              return (
                <div key={e.id} onClick={handleClick}
                  style={{ background: bgColor, borderRadius: 12, border: `1px solid ${isSelected ? '#DC743C' : isPaid ? '#C8E6C9' : isOff ? '#F0A0A0' : '#E4D7BC'}`, borderLeft: `4px solid ${borderLeftColor}`, padding: '12px 14px', marginBottom: 8, cursor: canSelect ? 'pointer' : 'default', opacity: wageSelectMode && isPaid ? 0.5 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {wageSelectMode && !isOff && (
                        <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isPaid ? '#B0BEC5' : isSelected ? '#DC743C' : '#C9A24B'}`, background: isSelected ? '#DC743C' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: 14, fontWeight: 700 }}>
                          {isSelected ? '✓' : ''}
                        </div>
                      )}
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#2A2118' }}>{fmtThDate(e.date)}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isPaid && <span style={{ fontSize: 10, fontWeight: 700, color: '#2E7D32', background: '#E8F5E9', borderRadius: 4, padding: '2px 6px' }}>✓ จ่ายแล้ว</span>}
                      {!isOff && <div style={{ fontWeight: 700, fontSize: 15, color: isPaid ? '#2E7D32' : isSelected ? '#DC743C' : '#5B3A29' }}>฿{dayTotal.toLocaleString()}</div>}
                      {!wageSelectMode && (
                        <button onClick={e2 => { e2.stopPropagation(); handleDeleteEarning(e.id); }} style={{ background: 'none', border: '1px solid #E4D7BC', borderRadius: 7, padding: '3px 8px', fontSize: 12, color: '#9A8662', cursor: 'pointer' }}>🗑</button>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(e.base || 0) > 0
                      ? <span style={{ background: '#F5EFE4', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#5B3A29' }}>📅 ฿{e.base}</span>
                      : <span style={{ background: '#FFF0F0', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#C0392B' }}>📅 ไม่นับค่าแรง</span>
                    }
                    {e.bonus > 0 && <span style={{ background: '#F3E8FF', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#7B3FA0' }}>🎁 ฿{e.bonus}</span>}
                  </div>
                </div>
              );
            })}

            {/* Sticky bottom bar when selecting */}
            {wageSelectMode && selectedWageDates.size > 0 && (
              <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#5B3A29', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 200 }}>
                <div style={{ color: '#FFF6ED' }}>
                  <div style={{ fontSize: 12 }}>{selectedWageDates.size} วัน</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>฿{selWageTotal.toLocaleString()}</div>
                </div>
                <button onClick={() => {
                  const selected = earnings.filter(e => selectedWageDates.has(e.date));
                  setPendingWageRecords(selected);
                  setShowWagePaySlip(true);
                }} style={{ background: '#DC743C', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  📄 ออกบิล
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Tab: การจ่าย */}
      {tab === 'paid' && (
        <div style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {balance > 0 && <button onClick={() => { setShowPayForm(true); setPayAmount(String(balance)); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ flex: 1, background: '#2E7D32', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>💸 จ่ายทั้งหมด</button>}
            <button onClick={() => { setShowPeriodPay(v => !v); setPeriodFrom(''); setPeriodTo(''); }} style={{ flex: 1, background: showPeriodPay ? '#5B3A29' : '#fff', color: showPeriodPay ? '#fff' : '#5B3A29', border: '1px solid #5B3A29', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>📆 จ่ายช่วงเวลา</button>
            <button onClick={() => setShowPaySlip(true)} style={{ background: '#fff', color: '#9A8662', border: '1px solid #E4D7BC', borderRadius: 10, padding: '10px 12px', fontSize: 13, cursor: 'pointer' }}>📋</button>
          </div>

          {/* Period pay form */}
          {showPeriodPay && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E4D7BC', padding: '14px', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#2A2118', marginBottom: 10 }}>📆 เลือกช่วงเวลาที่จ่าย</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: '#9A8662', marginBottom: 3 }}>จาก</div>
                  <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)}
                    style={{ width: '100%', border: '1.5px solid #E4D7BC', borderRadius: 9, padding: '8px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <span style={{ color: '#9A8662', marginTop: 14 }}>–</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: '#9A8662', marginBottom: 3 }}>ถึง</div>
                  <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)}
                    style={{ width: '100%', border: '1.5px solid #E4D7BC', borderRadius: 9, padding: '8px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>

              {periodSummary && periodFrom && periodTo && (
                <>
                  {/* Period summary card */}
                  <div style={{ background: '#F9F5EC', borderRadius: 12, border: '1px solid #E4D7BC', padding: '12px 14px', marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#B7A684', marginBottom: 8 }}>
                      สรุป {new Date(periodFrom+'T12:00').toLocaleDateString('th-TH', { day:'numeric', month:'short' })} – {new Date(periodTo+'T12:00').toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'2-digit' })}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#5B3A29' }}>📅 รายวัน ({periodSummary.days} วัน)</span>
                        <span style={{ fontWeight: 600 }}>฿{periodSummary.base.toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#E65100' }}>📦 ค่าคอม ({periodSummary.kg % 1 === 0 ? periodSummary.kg : periodSummary.kg.toFixed(1)} กก.)</span>
                        <span style={{ fontWeight: 600 }}>฿{periodSummary.comm.toLocaleString()}</span>
                      </div>
                      {periodSummary.bonus > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span style={{ color: '#7B3FA0' }}>🎁 โบนัส</span>
                          <span style={{ fontWeight: 600 }}>฿{periodSummary.bonus.toLocaleString()}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, borderTop: '1px solid #E4D7BC', paddingTop: 8, marginTop: 4, color: '#2A2118' }}>
                        <span>รวม</span><span>฿{periodSummary.total.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Note + confirm */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input value={payNote} onChange={e => setPayNote(e.target.value)}
                      placeholder={`ค่าแรง ${new Date(periodFrom+'T12:00').toLocaleDateString('th-TH', { day:'numeric', month:'short' })} – ${new Date(periodTo+'T12:00').toLocaleDateString('th-TH', { day:'numeric', month:'short' })}`}
                      style={{ flex: 1, border: '1.5px solid #E4D7BC', borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none' }} />
                  </div>
                  <button
                    onClick={async () => {
                      const note = payNote || `ค่าแรง ${new Date(periodFrom+'T12:00').toLocaleDateString('th-TH', { day:'numeric', month:'short' })} – ${new Date(periodTo+'T12:00').toLocaleDateString('th-TH', { day:'numeric', month:'short' })}`;
                      setSaving(true);
                      try {
                        const payId = await db.savePayment({ supervisor_name: supervisorName, paid_date: toDateStr(new Date()), amount: periodSummary.total, note });
                        db.upsertWalletTxIfNew({ wallet: 'C', direction: 'out', amount: periodSummary.total, txType: 'expense', category: 'เงินเดือน', status: 'pending', refId: String(payId), note: `ค่าแรง ${supervisorName}` }).catch(() => {});
                        setPayNote(''); setPeriodFrom(''); setPeriodTo(''); setShowPeriodPay(false);
                        await loadLedger();
                        setShowPaySlip(true);
                      } catch { alert('บันทึกไม่สำเร็จ'); }
                      setSaving(false);
                    }}
                    disabled={saving || periodSummary.total === 0}
                    style={{ width: '100%', background: periodSummary.total > 0 ? '#2E7D32' : '#ccc', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: periodSummary.total > 0 ? 'pointer' : 'default' }}>
                    {saving ? '...' : `✓ จ่าย ฿${periodSummary.total.toLocaleString()}`}
                  </button>
                </>
              )}
              {periodFrom && periodTo && periodSummary && periodSummary.total === 0 && (
                <div style={{ textAlign: 'center', color: '#B7A684', fontSize: 13, padding: '12px 0' }}>ไม่มีข้อมูลค่าแรงในช่วงนี้</div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button onClick={() => setShowWageSlip(true)} style={{ flex: 1, background: '#F5EFE4', color: '#5B3A29', border: '1px solid #D0C8BC', borderRadius: 10, padding: '9px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🖨️ บิลค่าแรง+โบนัส</button>
            <button onClick={() => setShowCommSlip(true)} style={{ flex: 1, background: '#FFF3E0', color: '#BF360C', border: '1px solid #FFCC80', borderRadius: 10, padding: '9px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🖨️ บิลค่าคอม</button>
          </div>
          {payments.length === 0 && !loadingLedger && <div style={{ textAlign: 'center', color: '#B7A684', padding: 32 }}>ยังไม่มีรายการจ่าย</div>}
          {payments.map(p => {
            const isEditing = editingPayment?.id === p.id;
            const isCommBill = p.note && p.note.startsWith('COMM_BILLS:');
            return (
              <div key={p.id} style={{ background: '#fff', borderRadius: 12, border: `1px solid ${isEditing ? '#DC743C' : '#E4D7BC'}`, borderLeft: `4px solid ${isCommBill ? '#E65100' : '#2E7D32'}`, padding: '12px 14px', marginBottom: 8 }}>
                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 11, color: '#9A8662', marginBottom: 2 }}>{fmtThDate(p.paid_date)}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" value={editPayAmount} onChange={e => setEditPayAmount(e.target.value)}
                        placeholder="จำนวนเงิน" style={{ flex: 1, border: '1.5px solid #E4D7BC', borderRadius: 8, padding: '8px 10px', fontSize: 14, outline: 'none' }} />
                      {!isCommBill && (
                        <input value={editPayNote} onChange={e => setEditPayNote(e.target.value)}
                          placeholder="หมายเหตุ" style={{ flex: 1, border: '1.5px solid #E4D7BC', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none' }} />
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={async () => {
                        if (!editPayAmount) return;
                        setSaving(true);
                        try {
                          await db.updateSupPayment(p.id, { amount: Number(editPayAmount), note: isCommBill ? p.note : (editPayNote || null) });
                          await loadLedger();
                          setEditingPayment(null);
                        } catch { alert('แก้ไขไม่สำเร็จ'); }
                        setSaving(false);
                      }} disabled={saving} style={{ flex: 2, background: '#2E7D32', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                        {saving ? '...' : '✓ บันทึก'}
                      </button>
                      <button onClick={() => setEditingPayment(null)} style={{ flex: 1, background: '#F5EFE4', color: '#5B3A29', border: '1px solid #E4D7BC', borderRadius: 8, padding: '8px 0', fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
                      <button onClick={async () => {
                        if (!confirm('ลบรายการนี้?')) return;
                        setSaving(true);
                        try { await db.deletePayment(p.id); await loadLedger(); setEditingPayment(null); } catch { alert('ลบไม่สำเร็จ'); }
                        setSaving(false);
                      }} style={{ background: '#FDECEA', color: '#C0392B', border: '1px solid #FFCDD2', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>🗑</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#2A2118' }}>{fmtThDate(p.paid_date)}</div>
                      {p.note && <div style={{ fontSize: 11, color: '#9A8662', marginTop: 2 }}>{fmtPayNote(p.note)}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 16, color: isCommBill ? '#E65100' : '#2E7D32' }}>฿{(p.amount||0).toLocaleString()}</div>
                      <button onClick={() => { setEditingPayment(p); setEditPayAmount(String(p.amount || '')); setEditPayNote(p.note && !isCommBill ? p.note : ''); }}
                        style={{ background: '#F5EFE4', border: '1px solid #E4D7BC', borderRadius: 7, padding: '4px 10px', fontSize: 12, color: '#7A6450', cursor: 'pointer' }}>แก้</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: ลูกค้า */}
      {tab === 'customers' && (
        <div style={{ padding: '10px 12px' }}>
          {phones.length === 0 && <div style={{ textAlign: 'center', color: '#B7A684', padding: 32 }}>ไม่มีลูกค้า</div>}
          {phones.map(phone => {
            const c = customers[phone];
            const stat = customerStat(phone, history, verified);
            const tier = stat ? stat.effectiveTier : null;
            return (
              <button key={phone} onClick={() => onOpenCustomer(phone)} style={{ width: '100%', textAlign: 'left', border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F0E4C8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>👤</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: '#4A3526' }}>{c?.name || '—'}</div>
                  <div style={{ fontSize: 12, color: '#9A8662' }}>{phone}</div>
                  {tier && tier.key !== 'silver' && <TierBadge tier={tier} />}
                </div>
                <span style={{ color: '#C9A24B', fontSize: 18 }}>›</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── CustomerDetailView ───────────────────────────────────────────────────────
function CustomerDetailView({ phone, history, verified, supervisors, vehiclePlates, customerInfo, payments, onPayment, onGoBack, onOpenHistory, onOpenVerify, onSaveSupervisor, onSaveCustomerInfo }) {
  const [editSupervisor, setEditSupervisor] = useState(false);
  const [supDraft, setSupDraft] = useState('');
  const [editInfo, setEditInfo] = useState(false);
  const [infoDraft, setInfoDraft] = useState({ bankName: '', bankAccount: '', fullName: '', note: '' });
  const stat = customerStat(phone, history, verified);
  if (!stat) return null;
  const tier = stat.effectiveTier;
  const rawTier = stat.tier;
  const needName = REQUIRE_NAME[rawTier.key] && !stat.verified;
  const verifiedName = verified[phone];
  const currentSupervisor = supervisors?.[phone] || '';
  const pct = stat.next ? Math.min(100, (stat.total / stat.next.min) * 100) : 100;
  const bills = history.filter(h => String(h.phone || h.data?.sellerPhone || '').trim() === phone);
  const info = customerInfo?.[phone] || {};
  // collect unique plates from bills + vehiclePlates map
  const platesFromBills = [...new Set(bills.map(h => h.data?.vehiclePlate).filter(Boolean))];
  const plateFromMap = vehiclePlates?.[phone];
  const allPlates = [...new Set([...(plateFromMap ? [plateFromMap] : []), ...platesFromBills])];

  return (
    <div style={{ flex: 1, maxWidth: 720, width: '100%', margin: '0 auto', padding: '14px 14px 40px' }}>
      <div style={{ marginBottom: 14 }}>
        <button onClick={onGoBack} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#7A6450', cursor: 'pointer' }}>‹ ทะเบียน</button>
      </div>

      <div style={{ background: 'linear-gradient(135deg,#5C4326,#3F2D1E)', borderRadius: 20, padding: '24px 20px', color: '#F6EEDD', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>👤</div>
          <div>
            <div style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 20 }}>{stat.name || '—'}</div>
            <div style={{ fontSize: 13, opacity: .75, marginTop: 2 }}>{phone}</div>
            <div style={{ marginTop: 8 }}><TierBadge tier={tier} /></div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, textAlign: 'center', background: 'rgba(255,255,255,.08)', borderRadius: 14, padding: '14px 10px' }}>
          <div><div style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 22 }}>{fmtKg(stat.total)}</div><div style={{ fontSize: 11, opacity: .7 }}>กก.สะสม</div></div>
          <div><div style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 22 }}>{stat.billCount}</div><div style={{ fontSize: 11, opacity: .7 }}>บิลทั้งหมด</div></div>
          <div><div style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 22 }}>{stat.next ? fmtKg(stat.next.min - stat.total) : '—'}</div><div style={{ fontSize: 11, opacity: .7 }}>{stat.next ? `กก.ถึง ${stat.next.label}` : 'ระดับสูงสุด'}</div></div>
        </div>
        {stat.next && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: .7, marginBottom: 5 }}>
              <span>{tier.label}</span><span>{stat.next.label}</span>
            </div>
            <div style={{ height: 7, background: 'rgba(255,255,255,.2)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: '#C9A24B', borderRadius: 4 }} />
            </div>
          </div>
        )}
      </div>

      {needName && (
        <div style={{ background: '#FBF3DF', border: '1px solid #E6CF94', borderRadius: 14, padding: '15px 16px', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#A07410' }}>⚑ ถึงเกณฑ์ {rawTier.label} แล้ว — รอยืนยันชื่อ</div>
          <p style={{ margin: '6px 0 12px', fontSize: 12.5, color: '#9A7A3C', lineHeight: 1.6 }}>ระดับ Gold ขึ้นไปต้องยืนยันชื่อ-นามสกุลให้ตรงกับบัตรประชาชนก่อน</p>
          <button onClick={() => onOpenVerify(phone)} style={{ border: 'none', borderRadius: 11, padding: '12px 18px', background: 'linear-gradient(135deg,#C9A24B,#A8763E)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>ยืนยันชื่อตอนนี้</button>
        </div>
      )}
      {verifiedName && (
        <div style={{ background: '#E7F4EC', border: '1px solid #BFE0CC', borderRadius: 14, padding: '14px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>✓</span>
          <div style={{ fontSize: 13, color: '#2E7048' }}>ยืนยันชื่อแล้ว: <b>{verifiedName}</b></div>
        </div>
      )}

      <div style={{ background: '#FBF6EC', border: '1px solid #E4D7BC', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editSupervisor ? 10 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>👤</span>
            <span style={{ fontSize: 13, color: '#4A3526' }}>
              ผู้ดูแล: <b>{currentSupervisor || <span style={{ color: '#B7A684', fontWeight: 400 }}>ยังไม่มี</span>}</b>
            </span>
          </div>
          <button onClick={() => { setEditSupervisor(v => !v); setSupDraft(currentSupervisor); }} style={{ border: '1px solid #D8C8A8', background: '#F3E9D2', borderRadius: 9, padding: '5px 10px', fontSize: 12, color: '#7A5A22', cursor: 'pointer' }}>
            {editSupervisor ? 'ยกเลิก' : 'แก้ไข'}
          </button>
        </div>
        {editSupervisor && (
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input value={supDraft} onChange={e => setSupDraft(e.target.value)} placeholder="ชื่อผู้ดูแล" style={{ flex: 1, border: '1.5px solid #E4D7BC', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#3F2D1E', outline: 'none' }} />
            <button onClick={() => { onSaveSupervisor(phone, supDraft.trim()); setEditSupervisor(false); }} style={{ border: 'none', background: '#3F2D1E', color: '#F6EEDD', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>บันทึก</button>
          </div>
        )}
      </div>

      {/* ทะเบียนรถ */}
      <div style={{ background: '#FBF6EC', border: '1px solid #E4D7BC', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: '#4A3526', fontWeight: 600, marginBottom: allPlates.length ? 8 : 0 }}>🚗 ทะเบียนรถ</div>
        {allPlates.length > 0
          ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allPlates.map((p, i) => <span key={i} style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 8, padding: '3px 10px', fontSize: 13, fontWeight: 600, color: '#BF360C' }}>{p}</span>)}
            </div>
          : <div style={{ fontSize: 12, color: '#B7A684' }}>ยังไม่มีทะเบียน</div>}
      </div>

      {/* บัญชีธนาคาร */}
      <div style={{ background: '#FBF6EC', border: '1px solid #E4D7BC', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editInfo ? 10 : 0 }}>
          <div style={{ fontSize: 13, color: '#4A3526', fontWeight: 600 }}>🏦 บัญชีธนาคาร</div>
          <button onClick={() => { setEditInfo(v => !v); setInfoDraft({ bankName: info.bankName || '', bankAccount: info.bankAccount || '', fullName: info.fullName || '', note: info.note || '' }); }} style={{ border: '1px solid #D8C8A8', background: '#F3E9D2', borderRadius: 9, padding: '5px 10px', fontSize: 12, color: '#7A5A22', cursor: 'pointer' }}>
            {editInfo ? 'ยกเลิก' : 'แก้ไข'}
          </button>
        </div>
        {!editInfo && (
          info.bankAccount
            ? <div style={{ fontSize: 13, color: '#3F2D1E', marginTop: 6 }}>
                {info.fullName && <div style={{ fontWeight: 600, marginBottom: 2 }}>{info.fullName}</div>}
                {info.bankName && <span style={{ color: '#7A5A22', marginRight: 6 }}>{info.bankName}</span>}
                <span style={{ fontFamily: 'Prompt', fontWeight: 600, letterSpacing: '.06em' }}>{info.bankAccount}</span>
                {info.note && <div style={{ fontSize: 11, color: '#9A8662', marginTop: 3 }}>{info.note}</div>}
              </div>
            : <div style={{ fontSize: 12, color: '#B7A684', marginTop: 4 }}>ยังไม่มีข้อมูล</div>
        )}
        {editInfo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input value={infoDraft.fullName} onChange={e => setInfoDraft(d => ({ ...d, fullName: e.target.value }))} placeholder="ชื่อ-นามสกุลเจ้าของบัญชี" style={{ border: '1.5px solid #E4D7BC', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#3F2D1E', outline: 'none' }} />
            <select value={infoDraft.bankName} onChange={e => setInfoDraft(d => ({ ...d, bankName: e.target.value }))} style={{ border: '1.5px solid #E4D7BC', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: infoDraft.bankName ? '#3F2D1E' : '#9A8662', outline: 'none', appearance: 'none', WebkitAppearance: 'none', background: '#FBF6EC url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath fill=\'%239A8662\' d=\'M5 6L0 0h10z\'/%3E%3C/svg%3E") no-repeat right 12px center', paddingRight: 32 }}>
              <option value="">เลือกธนาคาร</option>
              {THAI_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <input value={infoDraft.bankAccount} onChange={e => setInfoDraft(d => ({ ...d, bankAccount: e.target.value }))} placeholder="เลขบัญชี / เบอร์พร้อมเพย์" style={{ border: '1.5px solid #E4D7BC', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'Prompt', letterSpacing: '.06em', color: '#3F2D1E', outline: 'none' }} />
            <input value={infoDraft.note} onChange={e => setInfoDraft(d => ({ ...d, note: e.target.value }))} placeholder="หมายเหตุ (ไม่บังคับ)" style={{ border: '1.5px solid #E4D7BC', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#3F2D1E', outline: 'none' }} />
            <button onClick={() => { onSaveCustomerInfo(phone, infoDraft); setEditInfo(false); }} style={{ border: 'none', background: '#3F2D1E', color: '#F6EEDD', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>บันทึก</button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 12px' }}>
        <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 13, letterSpacing: '.14em', color: '#A6925E' }}>บิลของลูกค้ารายนี้</span>
        <div style={{ flex: 1, height: 1, background: '#E4D7BC' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {bills.map((h, i) => {
          const pay = payments?.[h.billNo];
          const status = pay?.status || 'unpaid';
          const borderColor = status === 'transferred' ? '#5A9A6A' : status === 'cash' ? '#5A7FA8' : '#E4D7BC';
          const statusLabel = status === 'transferred' ? '✓ โอนแล้ว' : status === 'cash' ? '✓ เงินสด' : null;
          const statusColor = status === 'transferred' ? '#2E7D32' : status === 'cash' ? '#1A4D80' : null;
          return (
            <div key={i} style={{ border: `1.5px solid ${borderColor}`, background: '#FFFDF8', borderRadius: 13, overflow: 'hidden' }}>
              <button onClick={() => onOpenHistory(h)} style={{ textAlign: 'left', background: 'none', border: 'none', width: '100%', padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: '#F0E4C8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>🧾</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#4A3526' }}>{h.billNo}</span>
                    {statusLabel && <span style={{ fontSize: 10, fontWeight: 700, color: statusColor }}>{statusLabel}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#9A8662' }}>{h.dateText} · {h.kg} กก.</div>
                </div>
                <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 15, color: '#3F2D1E' }}>฿{h.baht}</span>
              </button>
              {status === 'unpaid' && onPayment && (
                <div style={{ display: 'flex', gap: 8, padding: '0 12px 10px' }}>
                  <button onClick={() => onPayment(h.billNo, 'transferred')}
                    style={{ flex: 1, border: 'none', borderRadius: 9, padding: '8px 0', background: '#5A9A6A', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                    โอนแล้ว ✓
                  </button>
                  <button onClick={() => onPayment(h.billNo, 'cash')}
                    style={{ flex: 1, border: 'none', borderRadius: 9, padding: '8px 0', background: '#5A7FA8', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                    เงินสด ✓
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {bills.length === 0 && <div style={{ color: '#B7A684', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>ยังไม่มีบิล</div>}
      </div>
    </div>
  );
}

// ─── SellerModal ──────────────────────────────────────────────────────────────
function SellerModal({ name, phone, supervisor, nameLocked, supervisorLocked, onNameChange, onPhoneChange, onSupervisorChange, onUnlock, onSave, onCancel, history, verified, supervisorOptions }) {
  const stat = phone ? customerStat(phone, history, verified) : null;
  const tier = stat ? stat.effectiveTier : null;
  const locked = nameLocked || supervisorLocked;
  return (
    <div className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(42,33,24,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, animation: 'fadeIn .2s' }}>
      <div style={{ background: '#FFFDF8', borderRadius: 20, padding: 22, width: '100%', maxWidth: 360, animation: 'popIn .25s' }}>
        <h3 style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 18, margin: '0 0 14px', color: '#4A3526' }}>ข้อมูลผู้ขาย</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <label style={{ fontSize: 12, color: '#A6925E' }}>ชื่อผู้ขาย / สวน {nameLocked && <span style={{ color: '#C9A24B' }}>🔒 จากประวัติ</span>}</label>
          {locked && <button onClick={onUnlock} style={{ border: '1px solid #D8C8A8', background: '#F3E9D2', borderRadius: 8, padding: '3px 9px', fontSize: 11, color: '#7A5A22', cursor: 'pointer' }}>🔑 แก้ไข (Admin)</button>}
        </div>
        <input value={name} onChange={e => !nameLocked && onNameChange(e.target.value)} readOnly={nameLocked} placeholder="เช่น สวนลุงสมชาย" style={{ width: '100%', border: '1.5px solid #E4D7BC', borderRadius: 12, padding: 14, fontSize: 16, color: nameLocked ? '#9A8662' : '#3F2D1E', outline: 'none', marginBottom: 12, background: nameLocked ? '#F5F0E8' : '#fff' }} />
        <label style={{ display: 'block', fontSize: 12, color: '#A6925E', marginBottom: 5 }}>เบอร์โทรผู้ขาย</label>
        <input value={phone} onChange={e => onPhoneChange(e.target.value)} inputMode="tel" placeholder="เช่น 081-234-5678" style={{ width: '100%', border: '1.5px solid #E4D7BC', borderRadius: 12, padding: 14, fontSize: 16, color: '#3F2D1E', outline: 'none', marginBottom: 12 }} />
        <label style={{ display: 'block', fontSize: 12, color: '#A6925E', marginBottom: 5 }}>ผู้ดูแล {supervisorLocked && <span style={{ color: '#C9A24B' }}>🔒 จากประวัติ</span>}</label>
        {supervisorOptions && supervisorOptions.length > 0 && !supervisorLocked && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {supervisorOptions.map(opt => (
              <button key={opt} onClick={() => onSupervisorChange(opt)} style={{ padding: '7px 16px', borderRadius: 20, border: supervisor === opt ? 'none' : '1.5px solid #E4D7BC', background: supervisor === opt ? '#5B3A29' : '#fff', color: supervisor === opt ? '#fff' : '#5B3A29', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{opt}</button>
            ))}
          </div>
        )}
        <input value={supervisor} onChange={e => !supervisorLocked && onSupervisorChange(e.target.value)} readOnly={supervisorLocked} placeholder="หรือพิมพ์ชื่อ..." style={{ width: '100%', border: '1.5px solid #E4D7BC', borderRadius: 12, padding: 14, fontSize: 16, color: supervisorLocked ? '#9A8662' : '#3F2D1E', outline: 'none', background: supervisorLocked ? '#F5F0E8' : '#fff' }} />
        {tier && tier.key !== 'silver' && stat && (
          <div style={{ marginTop: 14, background: '#FBF6EC', border: '1px solid #E4D7BC', borderRadius: 14, padding: '13px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <TierBadge tier={tier} />
              <span style={{ fontSize: 12, color: '#9A8662', textAlign: 'right' }}>ขายสะสม <b style={{ color: '#4A3526' }}>{fmtKg(stat.total)}</b> กก. · {stat.billCount} บิล</span>
            </div>
            {stat.next && <div style={{ fontSize: 12, color: '#A6925E', marginTop: 8 }}>อีก {fmtKg(stat.next.min - stat.total)} กก. ถึง {stat.next.label}</div>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={onCancel} style={{ flex: 1, border: '1px solid #E4D7BC', background: '#fff', borderRadius: 12, padding: 13, color: '#7A6450', cursor: 'pointer' }}>ยกเลิก</button>
          <button onClick={onSave} style={{ flex: 1, border: 'none', background: '#3F2D1E', color: '#F6EEDD', borderRadius: 12, padding: 13, fontWeight: 600, cursor: 'pointer' }}>บันทึก</button>
        </div>
      </div>
    </div>
  );
}

// ─── VerifyModal ──────────────────────────────────────────────────────────────
function VerifyModal({ tier, phone, draft, total, canSkip, isManage, onDraftChange, onConfirm, onSkip, onCancel }) {
  return (
    <div className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 65, background: 'rgba(42,33,24,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, animation: 'fadeIn .2s' }}>
      <div style={{ background: '#FFFDF8', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360, animation: 'popIn .25s' }}>
        <div style={{ textAlign: 'center', marginBottom: 10 }}><TierBadge tier={tier} size="lg" /></div>
        <h3 style={{ textAlign: 'center', fontFamily: 'Prompt', fontWeight: 500, fontSize: 19, margin: '0 0 4px', color: '#4A3526' }}>เลื่อนระดับเป็น {tier.label}</h3>
        <p style={{ textAlign: 'center', fontSize: 13, color: '#9A8662', margin: '0 0 16px', lineHeight: 1.6 }}>
          ลูกค้ารายนี้ขายสะสมถึง <b style={{ color: '#4A3526' }}>{fmtKg(total)}</b> กก. แล้ว<br />
          ยืนยันชื่อ-นามสกุลให้ตรงกับบัตรประชาชนเพื่อรับสิทธิ์
        </p>
        <label style={{ display: 'block', fontSize: 12, color: '#A6925E', marginBottom: 5 }}>ชื่อ-นามสกุล (ตามบัตร) · โทร {phone}</label>
        <input value={draft} onChange={e => onDraftChange(e.target.value)} placeholder="เช่น สมชาย ใจดี" style={{ width: '100%', border: '1.5px solid #E4D7BC', borderRadius: 12, padding: 14, fontSize: 16, color: '#3F2D1E', outline: 'none' }} />
        <button onClick={onConfirm} style={{ width: '100%', marginTop: 14, border: 'none', borderRadius: 13, padding: 16, background: 'linear-gradient(135deg,#C9A24B,#A8763E)', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', boxShadow: '0 8px 18px rgba(168,118,62,.3)' }}>✓ ยืนยันชื่อ & เลื่อนระดับ</button>
        {canSkip && <button onClick={onSkip} style={{ width: '100%', marginTop: 8, border: '1px solid #E4D7BC', background: '#fff', borderRadius: 13, padding: 13, color: '#7A6450', fontSize: 14, cursor: 'pointer' }}>ข้ามไปก่อน — บันทึกบิล</button>}
        {isManage && <button onClick={onCancel} style={{ width: '100%', marginTop: 8, border: '1px solid #E4D7BC', background: '#fff', borderRadius: 13, padding: 13, color: '#7A6450', fontSize: 14, cursor: 'pointer' }}>ยกเลิก</button>}
      </div>
    </div>
  );
}


// ─── SheetModal ───────────────────────────────────────────────────────────────
function SheetModal({ onSyncNow, syncStatus, syncing, onCancel }) {
  return (
    <div className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 62, background: 'rgba(42,33,24,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, animation: 'fadeIn .2s' }}>
      <div style={{ background: '#FFFDF8', borderRadius: 20, padding: 24, width: '100%', maxWidth: 430, animation: 'popIn .25s' }}>
        <div style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 18, color: '#4A3526', marginBottom: 10 }}>📊 Google Sheet</div>
        <p style={{ fontSize: 13.5, color: '#7A6450', lineHeight: 1.8, margin: '0 0 6px' }}>ข้อมูลจะซิงก์จาก Google Sheet โดยอัตโนมัติ</p>
        {syncStatus && <p style={{ fontSize: 13, color: syncStatus.startsWith('⚠') ? '#C0392B' : '#2E7D32', margin: '0 0 14px', background: syncStatus.startsWith('⚠') ? '#FFF0F0' : '#F0FFF4', padding: '6px 10px', borderRadius: 8 }}>{syncStatus}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={onCancel} style={{ flex: 1, border: '1px solid #E4D7BC', background: '#fff', borderRadius: 12, padding: 13, color: '#7A6450', fontSize: 14, cursor: 'pointer' }}>ปิด</button>
          <button onClick={() => { onSyncNow(); }} disabled={syncing} style={{ flex: 1.4, border: 'none', borderRadius: 12, padding: 13, background: 'linear-gradient(135deg,#C9A24B,#A8763E)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: syncing ? 0.6 : 1 }}>{syncing ? '…กำลังซิงก์' : '↺ ซิงก์ตอนนี้'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Route wrapper: CustomerDetail ────────────────────────────────────────────
function CustomerDetailRoute({ history, verified, supervisors, vehiclePlates, customerInfo, payments, onPayment, onGoBack, onOpenHistory, onSaveSupervisor, onSaveCustomerInfo, onOpenVerify }) {
  const { phone } = useParams();
  const decodedPhone = decodeURIComponent(phone || '');
  if (!decodedPhone) return <Navigate to="/customers" replace />;
  return (
    <CustomerDetailView phone={decodedPhone} history={history} verified={verified} supervisors={supervisors}
      vehiclePlates={vehiclePlates} customerInfo={customerInfo} payments={payments} onPayment={onPayment}
      onGoBack={onGoBack} onOpenHistory={onOpenHistory}
      onSaveSupervisor={onSaveSupervisor}
      onSaveCustomerInfo={onSaveCustomerInfo}
      onOpenVerify={onOpenVerify} />
  );
}

// ─── Route wrapper: SupervisorDetail ──────────────────────────────────────────
function SupervisorDetailRoute({ supervisors, history, verified, onGoBack, onOpenCustomer, onOpenHistory }) {
  const { name } = useParams();
  const decodedName = decodeURIComponent(name || '');
  if (!decodedName) return <Navigate to="/supervisors" replace />;
  return (
    <SupervisorDetailView supervisorName={decodedName} supervisors={supervisors} history={history} verified={verified}
      onGoBack={onGoBack} onOpenCustomer={onOpenCustomer} onOpenHistory={onOpenHistory} />
  );
}

// ─── Wallet ───────────────────────────────────────────────────────────────────
const WALLET_LABELS = { A_transfer: 'จ่ายทุเรียน (โอน)', A_cash: 'จ่ายทุเรียน (เงินสด)', B: 'รับเงินขาย', C: 'ค่าใช้จ่าย' };
const EXPENSE_CATS = ['เงินเดือน', 'น้ำมัน', 'ค่าน้ำไฟ', 'อื่นๆ'];
const TX_LABELS = { bill_pay: 'จ่ายค่าทุเรียน', sale_recv: 'รับเงินขาย', transfer: 'โอนระหว่างกระเป๋า', commission: 'ค่าคอมผู้ดูแล', expense: 'ค่าใช้จ่าย', topup: 'เติมเงินเริ่มต้น' };

function WalletActionModal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(30,20,10,.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: '#FFFDF8', borderRadius: '20px 20px 0 0', padding: '20px 18px 32px', width: '100%', maxWidth: 480, maxHeight: '90dvh', overflowY: 'auto', animation: 'popIn .2s' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 17, margin: 0, color: '#2E3A28' }}>{title}</h3>
          <button onClick={onClose} style={{ fontSize: 22, background: 'none', border: 'none', cursor: 'pointer', color: '#9A8662' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function WalletSlipUpload({ file, onUpload, uploading }) {
  const camRef = useRef();
  const galRef = useRef();
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => { return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }; }, [previewUrl]);
  const clear = () => {
    if (camRef.current) camRef.current.value = '';
    if (galRef.current) galRef.current.value = '';
    onUpload(null);
  };
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, color: '#6B5740', marginBottom: 6, fontWeight: 500 }}>สลิป / หลักฐาน</div>
      {previewUrl ? (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img src={previewUrl} alt="slip" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 10, border: '2px solid #A8D5A2' }} />
          <button onClick={clear} style={{ position: 'absolute', top: -6, right: -6, background: '#C0392B', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 12, cursor: 'pointer', lineHeight: '20px', textAlign: 'center' }}>×</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => camRef.current?.click()} disabled={uploading} style={{ flex: 1, border: '1.5px dashed #C9A24B', background: '#FBF6EC', borderRadius: 10, padding: '12px 0', cursor: 'pointer', fontSize: 13, color: '#7A5A22', opacity: uploading ? 0.6 : 1 }}>
            {uploading ? '⏳' : '📷 ถ่ายรูป'}
          </button>
          <button onClick={() => galRef.current?.click()} disabled={uploading} style={{ flex: 1, border: '1.5px dashed #A8C5A0', background: '#F4FAF4', borderRadius: 10, padding: '12px 0', cursor: 'pointer', fontSize: 13, color: '#4A7A44', opacity: uploading ? 0.6 : 1 }}>
            {uploading ? '⏳' : '🖼 อัปโหลด'}
          </button>
        </div>
      )}
      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) onUpload(e.target.files[0]); e.target.value = ''; }} />
      <input ref={galRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) onUpload(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}

function WalletView({ onGoHome, recorderName }) {
  const [balances, setBalances] = useState({ A_transfer: 0, A_cash: 0, B: 0, C: 0 });
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'transfer_a'|'transfer_c'|'expense'|'topup'|'detail'
  const [selTx, setSelTx] = useState(null);

  // transfer modal state
  const [trAmt, setTrAmt] = useState('');
  const [trNote, setTrNote] = useState('');
  const [trSlip, setTrSlip] = useState(null);
  const [trSlipUpload, setTrSlipUpload] = useState(false);
  const [trTo, setTrTo] = useState('A_transfer');
  const [busy, setBusy] = useState(false);
  // expense modal state
  const [exAmt, setExAmt] = useState('');
  const [exCat, setExCat] = useState('เงินเดือน');
  const [exNote, setExNote] = useState('');
  const [exSlip, setExSlip] = useState(null);
  const [exSlipUpload, setExSlipUpload] = useState(false);
  // topup modal state
  const [tpWallet, setTpWallet] = useState('A_transfer');
  const [tpAmt, setTpAmt] = useState('');
  const [tpNote, setTpNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bal, allTxs] = await Promise.all([db.computeAllBalances(), db.fetchWalletTxs(null, 100)]);
      setBalances(bal);
      setTxs(allTxs);
    } catch(e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const uploadSlip = async (file, folder) => {
    if (!file) return null;
    // Compress before upload to stay within Vercel 4.5MB body limit
    const base64 = await new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, 1200 / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = reject;
      img.src = url;
    });
    const path = `${folder}/${Date.now()}.jpg`;
    const res = await fetch('/api/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ base64, path }) });
    const text = await res.text();
    let d;
    try { d = JSON.parse(text); } catch { throw new Error(`อัปโหลดไม่สำเร็จ (${res.status})`); }
    if (!d.ok) throw new Error(d.error || 'อัปโหลดรูปไม่สำเร็จ');
    return d.url;
  };

  const handleTransfer = async () => {
    const amt = parseFloat(trAmt);
    if (!amt || amt <= 0) return;
    setBusy(true);
    try {
      let slipUrl = null;
      if (trSlip) { setTrSlipUpload(true); slipUrl = await uploadSlip(trSlip, 'wallet/transfers'); setTrSlipUpload(false); }
      await db.insertTransferTx('B', trTo, amt, slipUrl, trNote || null, recorderName);
      setModal(null); setTrAmt(''); setTrNote(''); setTrSlip(null);
      await load();
    } catch(e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
    setBusy(false);
  };

  const handleExpense = async () => {
    const amt = parseFloat(exAmt);
    if (!amt || amt <= 0) return;
    setBusy(true);
    try {
      let slipUrl = null;
      if (exSlip) { setExSlipUpload(true); slipUrl = await uploadSlip(exSlip, 'expenses'); setExSlipUpload(false); }
      await db.insertWalletTx({ wallet: 'C', direction: 'out', amount: amt, txType: 'expense', status: 'confirmed', category: exCat, note: exNote || null, slipUrl, createdBy: recorderName });
      setModal(null); setExAmt(''); setExNote(''); setExSlip(null); setExCat('เงินเดือน');
      await load();
    } catch(e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
    setBusy(false);
  };

  const handleTopup = async () => {
    const amt = parseFloat(tpAmt);
    if (!amt || amt <= 0) return;
    setBusy(true);
    try {
      await db.insertWalletTx({ wallet: tpWallet, direction: 'in', amount: amt, txType: 'topup', status: 'confirmed', note: tpNote || 'เติมเงิน', createdBy: recorderName });
      setModal(null); setTpAmt(''); setTpNote('');
      await load();
    } catch(e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
    setBusy(false);
  };

  const [pendingSlipTx, setPendingSlipTx] = useState(null);
  const [pgSlip, setPgSlip] = useState(null);
  const [pgSlipUpload, setPgSlipUpload] = useState(false);

  const handleConfirmTx = async (tx) => {
    setBusy(true);
    try { await db.confirmWalletTx(tx.id, null); await load(); } catch(e) { alert(e.message); }
    setBusy(false);
  };

  const handleUploadWageSlip = async () => {
    if (!pendingSlipTx) return;
    setBusy(true);
    try {
      let slipUrl = null;
      if (pgSlip) { setPgSlipUpload(true); slipUrl = await uploadSlip(pgSlip, 'wages'); setPgSlipUpload(false); }
      await db.confirmWalletTx(pendingSlipTx.id, slipUrl);
      setPendingSlipTx(null); setPgSlip(null);
      await load();
    } catch(e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
    setBusy(false);
  };

  const pending = txs.filter(t => t.status === 'pending');
  const confirmed = txs.filter(t => t.status === 'confirmed');
  const fmtB = n => '฿' + Math.round(n).toLocaleString();
  const walletColor = { A_transfer: '#1565C0', A_cash: '#2E7D32', B: '#E65100', C: '#6A1B9A' };
  const walletBg = { A_transfer: '#E3F2FD', A_cash: '#E8F5E9', B: '#FFF3E0', C: '#F3E5F5' };

  const inp = (val, set, placeholder, type = 'text') => (
    <input value={val} onChange={e => set(e.target.value)} placeholder={placeholder} type={type}
      style={{ width: '100%', border: '1.5px solid #D8C8A8', borderRadius: 10, padding: '11px 13px', fontSize: 15, fontFamily: 'Prompt', boxSizing: 'border-box', marginBottom: 10, outline: 'none', background: '#FFFDF8' }} />
  );

  const btn = (label, onClick, color = '#2E7D32', disabled = false) => (
    <button onClick={onClick} disabled={disabled || busy}
      style={{ width: '100%', background: color, color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'Prompt', opacity: (disabled || busy) ? 0.6 : 1 }}>
      {busy ? '…' : label}
    </button>
  );

  return (
    <div style={{ minHeight: '100dvh', background: '#EFE6D4', paddingBottom: 32 }}>
      {/* Header */}
      <div style={{ background: '#FFFDF8', borderBottom: '1px solid #E4D7BC', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={onGoHome} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#7A5A22', padding: 4 }}>‹</button>
        <span style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 17, color: '#3F2D1E' }}>💰 กระเป๋าเงิน</span>
        <button onClick={load} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #D8C8A8', borderRadius: 8, padding: '5px 10px', fontSize: 13, color: '#7A5A22', cursor: 'pointer' }}>↺</button>
      </div>

      <div style={{ padding: '16px 14px', maxWidth: 480, margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9A8662' }}>กำลังโหลด…</div>
        ) : (
          <>
            {/* Balance Cards */}
            <div style={{ marginBottom: 14 }}>
              {/* กระเป๋า A combined */}
              <div style={{ background: '#fff', borderRadius: 16, padding: '16px', marginBottom: 10, border: '1.5px solid #C8E6C9', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
                <div style={{ fontSize: 12, color: '#4CAF50', fontWeight: 600, marginBottom: 6, letterSpacing: '.05em' }}>กระเป๋า A — จ่ายค่าทุเรียน</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#1B5E20', fontFamily: 'Prompt', marginBottom: 8 }}>{fmtB(balances.A_transfer + balances.A_cash)}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, background: '#E3F2FD', borderRadius: 10, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: '#1565C0', fontWeight: 600 }}>โอน</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1565C0' }}>{fmtB(balances.A_transfer)}</div>
                  </div>
                  <div style={{ flex: 1, background: '#E8F5E9', borderRadius: 10, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: '#2E7D32', fontWeight: 600 }}>เงินสด</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#2E7D32' }}>{fmtB(balances.A_cash)}</div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                {['B', 'C'].map(w => (
                  <div key={w} style={{ flex: 1, background: '#fff', borderRadius: 14, padding: '14px', border: `1.5px solid ${walletColor[w]}30`, boxShadow: '0 2px 6px rgba(0,0,0,.05)' }}>
                    <div style={{ fontSize: 10, color: walletColor[w], fontWeight: 600, marginBottom: 4 }}>{w === 'B' ? 'B — รับเงินขาย' : 'C — ค่าใช้จ่าย'}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: walletColor[w], fontFamily: 'Prompt' }}>{fmtB(balances[w])}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'โอน B→A', color: '#1565C0', onClick: () => { setTrTo('A_transfer'); setModal('transfer'); } },
                { label: 'โอน B→C', color: '#6A1B9A', onClick: () => { setTrTo('C'); setModal('transfer'); } },
                { label: 'รายจ่าย C', color: '#E65100', onClick: () => setModal('expense') },
                { label: 'เติมเงิน', color: '#5D4037', onClick: () => setModal('topup') },
              ].map(a => (
                <button key={a.label} onClick={a.onClick} style={{ background: a.color, color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Prompt' }}>{a.label}</button>
              ))}
            </div>

            {/* Pending */}
            {pending.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 13, color: '#E65100', marginBottom: 8 }}>⏳ รอยืนยัน ({pending.length})</div>
                {pending.map(tx => {
                  const isWageOrComm = tx.tx_type === 'commission' || (tx.tx_type === 'expense' && tx.category === 'เงินเดือน');
                  return (
                    <div key={tx.id} style={{ background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 12, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#5D4037' }}>{TX_LABELS[tx.tx_type] || tx.tx_type}{tx.category ? ` · ${tx.category}` : ''}</div>
                        <div style={{ fontSize: 11, color: '#9A8662' }}>{WALLET_LABELS[tx.wallet]} · {tx.note || tx.ref_id || ''}</div>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: tx.direction === 'in' ? '#2E7D32' : '#C0392B' }}>
                        {tx.direction === 'in' ? '+' : '-'}{fmtB(tx.amount)}
                      </div>
                      {isWageOrComm ? (
                        <button onClick={() => { setPendingSlipTx(tx); setPgSlip(null); setModal('wage_slip'); }} disabled={busy}
                          style={{ background: '#6A1B9A', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          📎 สลิป
                        </button>
                      ) : (
                        <button onClick={() => handleConfirmTx(tx)} disabled={busy} style={{ background: '#2E7D32', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>ยืนยัน</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* History */}
            <div>
              <div style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 13, color: '#7A5A22', marginBottom: 8 }}>ประวัติรายการ</div>
              {confirmed.length === 0 && <div style={{ textAlign: 'center', color: '#B0A090', padding: 20, fontSize: 13 }}>ยังไม่มีรายการ</div>}
              {confirmed.slice(0, 50).map(tx => (
                <button key={tx.id} onClick={() => { setSelTx(tx); setModal('detail'); }}
                  style={{ width: '100%', background: '#fff', border: '1px solid #EDE0CC', borderRadius: 12, padding: '11px 14px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: walletBg[tx.wallet] || '#EEE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                    {tx.tx_type === 'bill_pay' ? '🧾' : tx.tx_type === 'sale_recv' ? '💵' : tx.tx_type === 'transfer' ? '↔️' : tx.tx_type === 'commission' ? '👤' : tx.tx_type === 'expense' ? '📋' : '➕'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#3F2D1E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {TX_LABELS[tx.tx_type] || tx.tx_type}{tx.category ? ` · ${tx.category}` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: '#9A8662' }}>{WALLET_LABELS[tx.wallet]} · {new Date(tx.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: tx.direction === 'in' ? '#2E7D32' : '#C0392B', flexShrink: 0 }}>
                    {tx.direction === 'in' ? '+' : '-'}{fmtB(tx.amount)}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Transfer Modal */}
      {modal === 'transfer' && (
        <WalletActionModal title={trTo === 'C' ? 'โอน B → C (ค่าใช้จ่าย)' : 'โอน B → A (จ่ายทุเรียน)'} onClose={() => { setModal(null); setTrAmt(''); setTrNote(''); setTrSlip(null); }}>
          {trTo !== 'C' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {['A_transfer', 'A_cash'].map(w => (
                <button key={w} onClick={() => setTrTo(w)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `2px solid ${trTo === w ? '#1565C0' : '#E4D7BC'}`, background: trTo === w ? '#E3F2FD' : '#FFFDF8', color: trTo === w ? '#1565C0' : '#7A5A22', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                  {w === 'A_transfer' ? 'โอน' : 'เงินสด'}
                </button>
              ))}
            </div>
          )}
          {inp(trAmt, setTrAmt, 'จำนวนเงิน (บาท)', 'number')}
          {inp(trNote, setTrNote, 'หมายเหตุ (ถ้ามี)')}
          <WalletSlipUpload file={trSlip} uploading={trSlipUpload} onUpload={f => setTrSlip(f)} />
          {btn(`โอน ${fmtB(parseFloat(trAmt) || 0)}`, handleTransfer, '#1565C0', !trAmt)}
        </WalletActionModal>
      )}

      {/* Expense Modal */}
      {modal === 'expense' && (
        <WalletActionModal title="บันทึกค่าใช้จ่าย (C)" onClose={() => { setModal(null); setExAmt(''); setExSlip(null); }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {EXPENSE_CATS.map(c => (
              <button key={c} onClick={() => setExCat(c)} style={{ padding: '7px 12px', borderRadius: 20, border: `1.5px solid ${exCat === c ? '#6A1B9A' : '#E4D7BC'}`, background: exCat === c ? '#F3E5F5' : '#FFFDF8', color: exCat === c ? '#6A1B9A' : '#7A5A22', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{c}</button>
            ))}
          </div>
          {inp(exAmt, setExAmt, 'จำนวนเงิน (บาท)', 'number')}
          {inp(exNote, setExNote, 'หมายเหตุ (ถ้ามี)')}
          <WalletSlipUpload file={exSlip} uploading={exSlipUpload} onUpload={f => setExSlip(f)} />
          {btn(`บันทึก ${fmtB(parseFloat(exAmt) || 0)}`, handleExpense, '#6A1B9A', !exAmt)}
        </WalletActionModal>
      )}

      {/* Topup Modal */}
      {modal === 'topup' && (
        <WalletActionModal title="เติมเงินเข้ากระเป๋า" onClose={() => { setModal(null); setTpAmt(''); }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {['A_transfer', 'A_cash', 'C'].map(w => (
              <button key={w} onClick={() => setTpWallet(w)} style={{ padding: '7px 12px', borderRadius: 20, border: `1.5px solid ${tpWallet === w ? walletColor[w] : '#E4D7BC'}`, background: tpWallet === w ? walletBg[w] : '#FFFDF8', color: tpWallet === w ? walletColor[w] : '#7A5A22', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{WALLET_LABELS[w]}</button>
            ))}
          </div>
          {inp(tpAmt, setTpAmt, 'จำนวนเงิน (บาท)', 'number')}
          {inp(tpNote, setTpNote, 'หมายเหตุ')}
          {btn(`เติม ${fmtB(parseFloat(tpAmt) || 0)}`, handleTopup, '#5D4037', !tpAmt)}
        </WalletActionModal>
      )}

      {/* Wage/Commission Slip Upload Modal */}
      {modal === 'wage_slip' && pendingSlipTx && (
        <WalletActionModal title={pendingSlipTx.tx_type === 'commission' ? 'อัปโหลดสลิปค่าคอม' : 'อัปโหลดสลิปค่าแรง'}
          onClose={() => { setModal(null); setPendingSlipTx(null); setPgSlip(null); }}>
          <div style={{ background: '#F9F5EC', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#3F2D1E' }}>{pendingSlipTx.note || (TX_LABELS[pendingSlipTx.tx_type] || pendingSlipTx.tx_type)}</div>
            <div style={{ fontSize: 13, color: '#C0392B', fontWeight: 700, marginTop: 4 }}>-{fmtB(pendingSlipTx.amount)}</div>
          </div>
          <WalletSlipUpload file={pgSlip} uploading={pgSlipUpload} onUpload={f => setPgSlip(f)} />
          <div style={{ fontSize: 12, color: '#9A8662', marginBottom: 10, textAlign: 'center' }}>แนบสลิปโอนเงินแล้วกดยืนยัน (ถ้าไม่มีสลิปกดยืนยันได้เลย)</div>
          {btn('✅ ยืนยันจ่ายแล้ว', handleUploadWageSlip, '#6A1B9A')}
        </WalletActionModal>
      )}

      {/* Detail Modal */}
      {modal === 'detail' && selTx && (
        <WalletActionModal title="รายละเอียด" onClose={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['ประเภท', TX_LABELS[selTx.tx_type] || selTx.tx_type],
              ['กระเป๋า', WALLET_LABELS[selTx.wallet]],
              ['จำนวน', `${selTx.direction === 'in' ? '+' : '-'}${fmtB(selTx.amount)}`],
              ['สถานะ', selTx.status === 'confirmed' ? '✅ ยืนยันแล้ว' : '⏳ รอยืนยัน'],
              selTx.category && ['หมวด', selTx.category],
              selTx.ref_id && ['อ้างอิง', selTx.ref_id],
              selTx.note && ['หมายเหตุ', selTx.note],
              ['วันที่', new Date(selTx.created_at).toLocaleString('th-TH')],
              selTx.created_by && ['บันทึกโดย', selTx.created_by],
            ].filter(Boolean).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F0E8D8', paddingBottom: 6 }}>
                <span style={{ fontSize: 13, color: '#9A8662' }}>{k}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#3F2D1E', textAlign: 'right', maxWidth: '60%' }}>{v}</span>
              </div>
            ))}
            {selTx.slip_url && (
              <div>
                <div style={{ fontSize: 12, color: '#9A8662', marginBottom: 6 }}>หลักฐาน</div>
                <img src={selTx.slip_url} alt="slip" style={{ width: '100%', borderRadius: 10, border: '1px solid #E4D7BC', maxHeight: 300, objectFit: 'contain' }} />
              </div>
            )}
          </div>
        </WalletActionModal>
      )}
    </div>
  );
}

// ─── App (root) ───────────────────────────────────────────────────────────────
export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeCat, setActiveCat] = useState('รวม');
  const [input, setInput] = useState('');
  const [pin, setPin] = useState('1234');
  const [verified, setVerified] = useState({});

  const [supervisors, setSupervisors] = useState({});
  const [supervisorNames, setSupervisorNames] = useState([]);
  const [customCatLabels, setCustomCatLabels] = useState([]);
  const [hiddenCats, setHiddenCats] = useState([]);
  const [activeSupervisor, setActiveSupervisor] = useState(null);
  const [pinnedCats, setPinnedCats] = useState([]);
  const [pinEditorOpen, setPinEditorOpen] = useState(false);
  const [recorderName, setRecorderName] = useState('');
  const [showRecorderModal, setShowRecorderModal] = useState(false);
  const [authRole, setAuthRole] = useState(null);
  const [employeePin, setEmployeePin] = useState('');
  const [employees, setEmployees] = useState([]);
  const [employeeManagerOpen, setEmployeeManagerOpen] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [pinPrompt, setPinPrompt] = useState(null);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [numpad, setNumpad] = useState(null);
  const [sellerOpen, setSellerOpen] = useState(false);
  const [sellerDraft, setSellerDraft] = useState('');
  const [sellerNameLocked, setSellerNameLocked] = useState(false);
  const [sellerSupervisorLocked, setSellerSupervisorLocked] = useState(false);
  const [sellerPhoneDraft, setSellerPhoneDraft] = useState('');
  const [supervisorDraft, setSupervisorDraft] = useState('');
  const [verifyPrompt, setVerifyPrompt] = useState(null);
  const [custPhone, setCustPhone] = useState(null);
  const [readonly, setReadonly] = useState(false);
  const [isHandoff, setIsHandoff] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [sheetModal, setSheetModal] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const [vehiclePlates, setVehiclePlates] = useState({});
  const [customerInfo, setCustomerInfo] = useState({});
  const [payments, setPayments] = useState({});
  const [homeUnpaidCount, setHomeUnpaidCount] = useState(null);
  const [vehiclePhotoUrl, setVehiclePhotoUrl] = useState(null);
  const [sales, setSales] = useState([]);
  const [accounts, setAccounts] = useState(() => storage.loadAccounts());
  const [saleSession, setSaleSession] = useState(() => storage.loadSaleSession());
  const [saleHistory, setSaleHistory] = useState([]);
  const [saleSessions, setSaleSessions] = useState([]);
  const [viewSaleSession, setViewSaleSession] = useState(null);
  const [viewSalePaymentStatus, setViewSalePaymentStatus] = useState(null);
  const [saleActiveCat, setSaleActiveCat] = useState('AB');
  const [saleInput, setSaleInput] = useState('');
  const [saleNumpad, setSaleNumpad] = useState(null);
  const [saleCustomerModal, setSaleCustomerModal] = useState(false);
  const savedSession = useRef(null);
  const pendingPhotoDataUrl = useRef(null);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 1800);
  }, []);

  const persistSession = useCallback((s) => { storage.saveSession(s); }, []);

  const updateSession = useCallback((updater) => {
    setSession(prev => {
      const next = updater(prev ? { ...prev } : prev);
      if (next) storage.saveSession(next);
      return next;
    });
  }, []);

  const handleChangeDate = useCallback((ms) => {
    updateSession(prev => ({ ...prev, date: ms }));
  }, [updateSession]);

  const handleVehiclePlate = useCallback((plate) => {
    updateSession(prev => ({ ...prev, vehiclePlate: plate }));
    setSession(prev => prev ? { ...prev, vehiclePlate: plate } : prev);
    if (session?.sellerPhone && plate) {
      const next = { ...storage.loadVehiclePlates(), [session.sellerPhone]: plate };
      storage.saveVehiclePlates(next);
      setVehiclePlates(next);
      db.upsertVehiclePlate(session.sellerPhone, plate).catch(() => {});
    }
    // Drive upload now happens here so we have the plate in the filename
    const dataUrl = pendingPhotoDataUrl.current;
    if (dataUrl) {
      const now = new Date();
      const datePart = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
      const timePart = `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
      const namePart = (session?.seller || 'ไม่ระบุ').replace(/[^ก-๙a-zA-Z0-9]/g, '_');
      const phonePart = session?.sellerPhone || 'nophone';
      const platePart = plate.replace(/\s+/g, '') || 'noplate';
      const filename = `${namePart}_${phonePart}_${platePart}_${datePart}_${timePart}.jpg`;
      toast('กำลัง upload Drive…');
      fetch('/api/drive', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ base64: dataUrl, filename }),
      })
        .then(r => r.json())
        .then(res => {
          if (res.ok && res.fileId) {
            const driveUrl = `https://drive.google.com/uc?id=${res.fileId}`;
            updateSession(prev => ({ ...prev, vehicleDriveUrl: driveUrl }));
            toast('อัปโหลดรูปขึ้น Drive แล้ว ✓');
          }
        })
        .catch(() => toast('บันทึกรูปในเครื่องแล้ว (Drive ไม่สำเร็จ)'));
      pendingPhotoDataUrl.current = null;
    }
  }, [session, updateSession, toast]);

  const handleVehiclePhoto = useCallback(async (file) => {
    if (!session) return;
    try {
      const dataUrl = await resizeImage(file);
      const key = `vp_${session.id}`;
      await savePhoto(key, dataUrl);
      setVehiclePhotoUrl(dataUrl);
      pendingPhotoDataUrl.current = dataUrl;
      updateSession(prev => ({ ...prev, vehiclePhotoKey: key }));
      toast('บันทึกภาพแล้ว');
      // upload to Supabase immediately so other devices can see it in history
      try {
        const path = `vehicle/${session.billNo || key}_${Date.now()}.jpg`;
        const url = await db.uploadPhoto(dataUrl, path);
        if (url) updateSession(prev => ({ ...prev, vehicleSupaUrl: url }));
      } catch {}
    } catch { toast('ถ่ายภาพไม่สำเร็จ'); }
  }, [session, updateSession, toast]);

  // Init
  useEffect(() => {
    const s = storage.loadSession();
    const h = storage.loadHistory();
    const p = storage.loadPin();
    const v = storage.loadVerified();

    const sv = storage.loadSupervisors();
    const ep = storage.loadEmployeePin();
    const emps = storage.loadEmployees();
    const savedRole = localStorage.getItem('qudsun_role');
    const savedRecorder = localStorage.getItem('qudsun_recorder') || '';
    const pc = storage.loadPinnedCats();
    const vp = storage.loadVehiclePlates();
    const pm = storage.loadPayments();
    const ci = storage.loadCustomerInfo();
    const sl = storage.loadSales();
    const sh = storage.loadSaleHistory();
    setHistory(h); setPin(p); setVerified(v); setSupervisors(sv); setEmployeePin(ep); setPinnedCats(pc); setEmployees(emps); setVehiclePlates(vp); setPayments(pm); setCustomerInfo(ci); setSales(sl); setSaleHistory(sh);
    if (savedRole) { setAuthRole(savedRole); setRecorderName(savedRecorder); }
    if (s) { setSession(s); if (s.vehiclePhotoKey) loadPhoto(s.vehiclePhotoKey).then(u => { if (u) setVehiclePhotoUrl(u); }); }

    db.getPayments().then(remote => {
      storage.savePayments(remote); setPayments(remote);
    }).catch(() => {});
    db.getVehiclePlates().then(remote => {
      storage.saveVehiclePlates(remote); setVehiclePlates(remote);
    }).catch(() => {});
    db.getCustomerInfo().then(remote => {
      storage.saveCustomerInfo(remote); setCustomerInfo(remote);
    }).catch(() => {});
    db.getSales().then(remote => {
      storage.saveSales(remote); setSales(remote);
    }).catch(() => {});
    db.getVerified().then(remote => {
      storage.saveVerified(remote); setVerified(remote);
    }).catch(() => {});
    db.getBills().then(remoteBills => {
      if (!remoteBills?.length) return;
      storage.saveHistory(remoteBills); setHistory(remoteBills);
    }).catch(() => {});
    db.getSaleSessions().then(remoteSessions => {
      if (!remoteSessions?.length) return;
      setSaleSessions(remoteSessions);
      const summaries = remoteSessions.map(s => {
        const totalKg = (s.entries || []).reduce((sum, e) => sum + (e.kg || 0), 0);
        const totalBaht = grandBaht(s);
        return { billNo: s.billNo, date: s.date, customerName: s.customerName || '', customerPhone: s.customerPhone || '', kg: totalKg || s.kg || 0, baht: totalBaht || s.baht || 0 };
      });
      storage.saveSaleHistory(summaries); setSaleHistory(summaries);
    }).catch(() => {});
    db.getSetting('accounts').then(remote => {
      if (!Array.isArray(remote)) return;
      storage.saveAccounts(remote); setAccounts(remote);
    }).catch(() => {});
    db.getSetting('employees').then(remote => {
      if (!Array.isArray(remote) || !remote.length) return;
      storage.saveEmployees(remote); setEmployees(remote);
    }).catch(() => {});
    db.getSetting('supervisors').then(remote => {
      if (!remote || typeof remote !== 'object') return;
      storage.saveSupervisors(remote); setSupervisors(remote);
    }).catch(() => {});
    db.getSetting('supervisor_names').then(remote => {
      if (!Array.isArray(remote)) return;
      setSupervisorNames(remote);
    }).catch(() => {});
    db.getSetting('custom_cat_labels').then(remote => {
      if (!Array.isArray(remote)) return;
      setCustomCatLabels(remote);
    }).catch(() => {});
    db.getSetting('hidden_cats').then(remote => {
      if (!Array.isArray(remote)) return;
      setHiddenCats(remote);
    }).catch(() => {});
    const m = (window.location.hash || '').match(/bill=([^&]+)/);
    if (m) {
      try {
        const data = decodeBill(m[1]);
        setIsHandoff(true); setSession(data); navigate('/print');
      } catch {}
    }
    syncNow(false);
    const autoSync = setInterval(() => syncNow(true), 60000);
    const onVisible = () => { if (document.visibilityState === 'visible') syncNow(true); };
    document.addEventListener('visibilitychange', onVisible);
    const unsubRealtime = db.subscribeChanges(() => syncNow(true));
    return () => { clearInterval(autoSync); document.removeEventListener('visibilitychange', onVisible); unsubRealtime(); };
  }, []);

  const refreshHomeCount = useCallback(async () => {
    try {
      const [bills, pmts] = await Promise.all([db.getBills(), db.getPayments()]);
      const cutoff = new Date('2026-07-09').getTime();
      const count = bills.filter(b => {
        if (Number(b.date) < cutoff) return false;
        const p = pmts[b.billNo];
        return !p || p.status === 'unpaid';
      }).length;
      setHomeUnpaidCount(count);
    } catch {}
  }, []);

  useEffect(() => {
    if (location.pathname === '/') refreshHomeCount();
  }, [location.pathname, refreshHomeCount]);

  // Helper: load all data from Google Sheets
  const syncFromSheets = useCallback(async () => {
    const [sheetBills, sheetPayments, sheetSales, sheetCI] = await Promise.all([
      fetch('/api/sheets').then(r => r.json()),
      fetch('/api/sheets?action=getPayments').then(r => r.json()),
      fetch('/api/sheets?action=getSales').then(r => r.json()),
      fetch('/api/sheets?action=getCustomerInfo').then(r => r.json()),
    ]);
    if (sheetBills.ok && sheetBills.bills?.length > 0) {
      const sheetParsed = sheetBills.bills.map(b => {
        // Try json field first (full object), fall back to individual columns
        try { if (b.json) return JSON.parse(b.json); } catch {}
        if (!b.billNo) return null;
        return { billNo: b.billNo, date: b.date ? Number(b.date) : null, dateText: b.dateText || '', seller: b.seller || '', phone: b.phone || '', kg: b.kg || '', baht: b.baht || '', data: {} };
      }).filter(Boolean);
      // Merge: keep local-only bills (recorded offline / not yet in Sheets), exclude deleted
      const sheetNos = new Set(sheetParsed.map(b => b.billNo));
      const deleted = storage.loadDeletedBills();
      const localOnly = storage.loadHistory().filter(h => h?.billNo && !sheetNos.has(h.billNo) && !deleted.has(h.billNo));
      const bills = [...sheetParsed, ...localOnly];
      storage.saveHistory(bills); setHistory(bills);
    }
    if (sheetPayments.ok) {
      // Merge: Sheets data takes priority, but keep any local-only entries not yet in Sheets
      const local = storage.loadPayments();
      const merged = { ...local, ...(sheetPayments.payments || {}) };
      storage.savePayments(merged); setPayments(merged);
    }
    if (sheetSales.ok) {
      const sheetSalesData = sheetSales.sales || [];
      const sheetIds = new Set(sheetSalesData.map(s => s.id));
      const localOnly = storage.loadSales().filter(s => s.id && !sheetIds.has(s.id));
      const merged = [...sheetSalesData, ...localOnly];
      if (merged.length > 0) { storage.saveSales(merged); setSales(merged); }
    }
    if (sheetCI.ok) { const merged = { ...(sheetCI.info || {}), ...storage.loadCustomerInfo() }; storage.saveCustomerInfo(merged); setCustomerInfo(merged); }
  }, []); // eslint-disable-line

  // Google Sheets is primary DB — Supabase is backup
  const syncNow = useCallback(async (silent) => {
    setSyncing(true); if (!silent) setSyncStatus('กำลังซิงก์…');
    try {
      await syncFromSheets();
      setSyncStatus('✓ ซิงก์แล้ว ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }));
      // Background: also sync Supabase (best-effort, silent)
      db.getBills().then(remoteBills => {
        if (!remoteBills?.length) return;
        const remoteNos = new Set(remoteBills.map(c => c.billNo));
        const deleted = storage.loadDeletedBills();
        const localOnly = storage.loadHistory().filter(h => h?.billNo && !remoteNos.has(h.billNo) && !deleted.has(h.billNo));
        localOnly.forEach(c => pushBill(c, true));
      }).catch(() => {});
    } catch (err) {
      console.error('[syncNow] Google Sheets failed:', err);
      setSyncStatus('⚠ ซิงก์ไม่สำเร็จ: ' + (err?.message || String(err)));
    }
    setSyncing(false);
  }, []); // eslint-disable-line

  const pushBill = useCallback(async (card, quiet) => {
    if (!card) return;
    const billPayload = { action: 'syncBill', bill: { ...card, json: JSON.stringify(card) } };
    // Write to Google Sheets (primary) + Supabase (backup) in parallel
    const [sheetsResult] = await Promise.allSettled([
      fetch('/api/sheets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(billPayload) }).then(r => r.json()),
      db.upsertBill(card),
    ]);
    if (sheetsResult.status === 'fulfilled' && sheetsResult.value?.ok) {
      if (!quiet) setSyncStatus('✓ บันทึกแล้ว ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }));
    } else if (!quiet) {
      setSyncStatus('⚠ อัปโหลดไม่สำเร็จ');
    }
  }, []);

  const pushVerify = useCallback(async (phone, name) => {
    try { await db.upsertVerified(phone, name); } catch {}
  }, []);

  // PIN
  const requirePin = useCallback((title, action) => {
    setPinPrompt({ title, action }); setPinValue(''); setPinError('');
  }, []);

  const handlePinKey = useCallback((ch) => {
    if (ch === 'del') { setPinValue(v => v.slice(0, -1)); setPinError(''); return; }
    if (ch === 'ok') {
      setPinValue(v => {
        if (v.length < 4) return v;
        if (v === pin) {
          const act = pinPrompt?.action;
          setTimeout(() => { setPinPrompt(null); setPinValue(''); setPinError(''); if (act) act(); }, 10);
        } else { setTimeout(() => { setPinValue(''); setPinError('รหัสไม่ถูกต้อง ลองใหม่'); }, 10); }
        return v;
      });
      return;
    }
    setPinValue(v => {
      if (v.length >= 4) return v;
      const next = v + ch;
      if (next.length === 4) {
        setTimeout(() => {
          if (next === pin) {
            const act = pinPrompt?.action;
            setPinPrompt(null); setPinValue(''); setPinError('');
            if (act) act();
          } else { setPinValue(''); setPinError('รหัสไม่ถูกต้อง ลองใหม่'); }
        }, 120);
      }
      return next;
    });
  }, [pin, pinPrompt]);

  // Session
  const createSession = useCallback((seller = '', sellerPhone = '', supervisor = '') => {
    const t = Date.now();
    const recorder = localStorage.getItem('qudsun_recorder') || recorderName || '';
    const vp = storage.loadVehiclePlates();
    const vehiclePlate = (sellerPhone && vp[sellerPhone]) ? vp[sellerPhone] : '';
    const sess = { id: t, billNo: newBillNo(), createdAt: t, date: t, seller, sellerPhone, supervisor, recorder, vehiclePlate, vehiclePhotoKey: null, prices: Object.fromEntries(CATS.map(c => [c.key, 0])), entries: [], log: [{ t, kind: 'open', text: 'เปิดใบรับซื้อใหม่' }], confirmed: false, confirmedAt: null, customLabel: '' };
    setVehiclePhotoUrl(null);
    setSession(sess); persistSession(sess); navigate('/record'); setActiveCat('AB'); setInput('');
  }, [persistSession]);

  const startNew = useCallback(() => {
    createSession();
  }, [createSession]);

  const addLog = (sess, kind, text) => { sess.log = [{ t: Date.now(), kind, text }, ...(sess.log || [])]; };

  const commitEntry = useCallback(() => {
    const kg = parseFloat(input);
    if (!kg || kg <= 0) { toast('ใส่น้ำหนักก่อนนะ'); return; }
    updateSession(prev => {
      const s = { ...prev };
      const entryCustomLabel = activeCat === 'custom' ? (prev.customLabel || '') : '';
      const entry = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 6), cat: activeCat, kg, t: Date.now() };
      if (entryCustomLabel) entry.customLabel = entryCustomLabel;
      s.entries = [...(s.entries || []), entry];
      addLog(s, 'add', 'บันทึก ' + catLabel(activeCat) + ' ' + fmtKg(kg) + ' กก.');
      return s;
    });
    setInput(''); toast('บันทึก ' + fmtKg(kg) + ' กก. แล้ว');
  }, [input, activeCat, updateSession, toast]);

  const openEditEntry = useCallback((entry) => {
    setNumpad({ mode: 'editWeight', entryId: entry.id, catKey: entry.cat, title: 'แก้ไขเข่ง — ' + catLabel(entry.cat), unit: 'กก.', value: String(entry.kg), original: entry.kg, canDelete: true, saveLabel: 'บันทึกการแก้ไข' });
  }, []);

  const openSetPrice = useCallback((catKey) => {
    const cur = session?.prices[catKey] || 0;
    const displayLabel = catKey.startsWith('custom:') ? catKey.slice(7) : catLabel(catKey);
    setNumpad({ mode: 'price', catKey, title: 'ราคา/กก. — ' + displayLabel, unit: 'บาท/กก.', value: cur ? String(cur) : '', original: cur, canDelete: false, saveLabel: 'บันทึกราคา' });
  }, [session]);

  const numSave = useCallback(() => {
    if (!numpad) return;
    const val = parseFloat(numpad.value);
    if (numpad.mode === 'setpin') {
      if (!/^\d{4}$/.test(numpad.value || '')) { toast('ใส่รหัสเป็นตัวเลข 4 หลัก'); return; }
      storage.savePin(numpad.value); setPin(numpad.value); setNumpad(null); toast('เปลี่ยนรหัส Admin แล้ว'); return;
    }
    if (numpad.mode === 'setemployeepin') {
      if (!/^\d{4}$/.test(numpad.value || '')) { toast('ใส่รหัสเป็นตัวเลข 4 หลัก'); return; }
      storage.saveEmployeePin(numpad.value); setEmployeePin(numpad.value); setNumpad(null); toast('ตั้งรหัส Employee แล้ว'); return;
    }
    if (numpad.mode === 'editWeight') {
      if (!val || val <= 0) { toast('ใส่น้ำหนักก่อน'); return; }
      const apply = () => {
        updateSession(prev => {
          const s = { ...prev };
          s.entries = s.entries.map(e => e.id === numpad.entryId ? { ...e, kg: val } : e);
          addLog(s, 'edit', 'แก้ ' + catLabel(numpad.catKey) + ' จาก ' + fmtKg(numpad.original) + ' → ' + fmtKg(val) + ' กก.');
          return s;
        });
        setNumpad(null); toast('แก้ไขแล้ว');
      };
      requirePin('แก้น้ำหนักเข่งนี้', apply);
    } else {
      if (isNaN(val)) { toast('ใส่ราคาก่อน'); return; }
      const old = numpad.original;
      const apply = () => {
        updateSession(prev => {
          const s = { ...prev, prices: { ...prev.prices, [numpad.catKey]: val } };
          if (old > 0) addLog(s, 'price', 'แก้ราคา ' + catLabel(numpad.catKey) + ' จาก ' + fmtPrice(old) + ' → ' + fmtPrice(val) + ' บาท');
          else addLog(s, 'price', 'ตั้งราคา ' + catLabel(numpad.catKey) + ' = ' + fmtPrice(val) + ' บาท/กก.');
          return s;
        });
        setNumpad(null); toast('บันทึกราคาแล้ว');
      };
      if (old > 0 && val !== old) requirePin('แก้ราคาที่ตั้งไว้แล้ว', apply);
      else apply();
    }
  }, [numpad, toast, updateSession, requirePin]);

  const numDelete = useCallback(() => {
    if (!numpad) return;
    requirePin('ลบเข่งนี้', () => {
      updateSession(prev => {
        const s = { ...prev };
        const e = s.entries.find(x => x.id === numpad.entryId);
        if (e) addLog(s, 'delete', 'ลบ ' + catLabel(e.cat) + ' ' + fmtKg(e.kg) + ' กก.');
        s.entries = s.entries.filter(x => x.id !== numpad.entryId);
        return s;
      });
      setNumpad(null); toast('ลบแล้ว');
    });
  }, [numpad, requirePin, updateSession, toast]);

  const pushPayment = useCallback((billNo, pay) => {
    if (!pay) return;
    // Write to Google Sheets (primary) and Supabase (backup) in parallel
    fetch('/api/sheets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'updatePayment', billNo, ...pay }),
    }).catch(() => {});
    db.upsertPayment(billNo, pay).catch(() => {});
  }, []);

  const handlePayment = useCallback((billNo, status, slipPhotoUrl, slipData, cancelNote, receiptPhotoUrl, vehiclePhotoUrl) => {
    const paidAt = Date.now();
    const next = { ...storage.loadPayments(), [billNo]: { status, paidAt, ...(slipPhotoUrl ? { slipUrl: slipPhotoUrl } : {}), ...(slipData ? { slipData } : {}), ...(cancelNote ? { cancelNote } : {}), ...(receiptPhotoUrl ? { receiptUrl: receiptPhotoUrl } : {}), ...(vehiclePhotoUrl ? { vehicleUrl: vehiclePhotoUrl } : {}) } };
    if (status === 'unpaid') delete next[billNo];
    storage.savePayments(next);
    setPayments(next);
    pushPayment(billNo, next[billNo] || { status: 'unpaid' });
    // Wallet integration: debit A on bill payment
    if (status === 'cash' || status === 'transferred') {
      const bill = history.find(h => h.billNo === billNo);
      const amount = parseFloat(String(bill?.baht || '0').replace(/,/g, '')) || 0;
      if (amount > 0) {
        const wallet = status === 'transferred' ? 'A_transfer' : 'A_cash';
        const txStatus = (status === 'cash' || !!slipPhotoUrl) ? 'confirmed' : 'pending';
        db.upsertWalletTxIfNew({
          wallet, direction: 'out', amount, txType: 'bill_pay',
          status: txStatus, refId: billNo,
          note: `บิลซื้อ ${billNo}`, slipUrl: slipPhotoUrl || null,
        }).catch(() => {});
      }
    }
    if (status === 'transferred' && slipPhotoUrl) {
      const bill = history.find(h => h.billNo === billNo);
      const now = new Date();
      const datePart = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
      const timePart = `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
      const namePart = (bill?.seller || 'ไม่ระบุ').replace(/[^ก-๙a-zA-Z0-9]/g, '_');
      const phonePart = bill?.sellerPhone || 'nophone';
      const filename = `transfer_${namePart}_${phonePart}_${datePart}_${timePart}.jpg`;
      fetch('/api/drive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ base64: slipPhotoUrl, filename, folder: 'QudsunTransfers' }) }).catch(() => {});
    }
  }, [history, pushPayment]);

  const handleBatchPayment = useCallback((billNos, slipUrl) => {
    billNos.forEach(billNo => handlePayment(billNo, 'transferred', slipUrl, null, null, null, null));
  }, [handlePayment]);

  const handleDeleteBill = useCallback((billNo) => {
    storage.addDeletedBill(billNo);
    const nextHistory = storage.loadHistory().filter(h => h.billNo !== billNo);
    storage.saveHistory(nextHistory);
    setHistory(nextHistory);
    const nextPay = { ...storage.loadPayments() };
    delete nextPay[billNo];
    storage.savePayments(nextPay);
    setPayments(nextPay);
    fetch('/api/sheets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'deleteBill', billNo }) }).catch(() => {});
    fetch('/api/sheets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'updatePayment', billNo, status: 'unpaid' }) }).catch(() => {});
    db.deleteBill(billNo).catch(() => {});
    db.deletePayment(billNo).catch(() => {});
  }, []);

  const handleDeleteSaleBill = useCallback((billNo) => {
    const nextSh = storage.loadSaleHistory().filter(s => s.billNo !== billNo);
    storage.saveSaleHistory(nextSh);
    setSaleHistory(nextSh);
    setSaleSessions(prev => prev.filter(s => s.billNo !== billNo));
    setSales(prev => prev.filter(s => s.id !== billNo));
  }, []);

  const handleDeleteCustomer = useCallback((phone) => {
    // Delete all bills for this phone
    const billsToDelete = storage.loadHistory().filter(h => String(h.phone || '').trim() === phone);
    billsToDelete.forEach(b => {
      storage.addDeletedBill(b.billNo);
      fetch('/api/sheets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'deleteBill', billNo: b.billNo }) }).catch(() => {});
      fetch('/api/sheets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'updatePayment', billNo: b.billNo, status: 'unpaid' }) }).catch(() => {});
      db.deleteBill(b.billNo).catch(() => {});
      db.deletePayment(b.billNo).catch(() => {});
    });
    const nextHistory = storage.loadHistory().filter(h => String(h.phone || '').trim() !== phone);
    storage.saveHistory(nextHistory);
    setHistory(nextHistory);
    // Clear payments
    const nextPay = { ...storage.loadPayments() };
    billsToDelete.forEach(b => delete nextPay[b.billNo]);
    storage.savePayments(nextPay);
    setPayments(nextPay);
    // Clear verified
    const nextVerified = { ...storage.loadVerified() };
    delete nextVerified[phone];
    storage.saveVerified(nextVerified);
    setVerified(nextVerified);
    db.deleteVerified(phone).catch(() => {});
    // Clear customerInfo
    const nextInfo = { ...storage.loadCustomerInfo() };
    delete nextInfo[phone];
    storage.saveCustomerInfo(nextInfo);
    setCustomerInfo(nextInfo);
    db.deleteCustomerInfo(phone).catch(() => {});
    // Clear supervisor assignment
    const nextSup = { ...storage.loadSupervisors() };
    delete nextSup[phone];
    storage.saveSupervisors(nextSup);
    setSupervisors(nextSup);
    db.saveSetting('supervisors', nextSup).catch(() => {});
  }, []);

  const handleDeleteSupervisor = useCallback((name) => {
    const nextSup = Object.fromEntries(
      Object.entries(storage.loadSupervisors()).filter(([, n]) => n !== name)
    );
    storage.saveSupervisors(nextSup);
    setSupervisors(nextSup);
    db.saveSetting('supervisors', nextSup).catch(() => {});
    setSupervisorNames(prev => {
      const next = prev.filter(n => n !== name);
      db.saveSetting('supervisor_names', next).catch(() => {});
      return next;
    });
  }, []);

  const handleAddSupervisorName = useCallback((name) => {
    if (!name.trim()) return;
    setSupervisorNames(prev => {
      if (prev.includes(name.trim())) return prev;
      const next = [...prev, name.trim()];
      db.saveSetting('supervisor_names', next).catch(() => {});
      return next;
    });
  }, []);

  const handleAddCustomCatLabel = useCallback((label) => {
    if (!label.trim()) return;
    setCustomCatLabels(prev => {
      if (prev.includes(label.trim())) return prev;
      const next = [...prev, label.trim()];
      db.saveSetting('custom_cat_labels', next).catch(() => {});
      return next;
    });
  }, []);

  const handleRemoveCustomCatLabel = useCallback((label) => {
    setCustomCatLabels(prev => {
      const next = prev.filter(l => l !== label);
      db.saveSetting('custom_cat_labels', next).catch(() => {});
      return next;
    });
  }, []);

  const handleHideCat = useCallback((key) => {
    setHiddenCats(prev => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      db.saveSetting('hidden_cats', next).catch(() => {});
      return next;
    });
  }, []);

  const handleShowAllCats = useCallback(() => {
    setHiddenCats([]);
    db.saveSetting('hidden_cats', []).catch(() => {});
    toast('แสดงหมวดทั้งหมดแล้ว');
  }, [toast]);

  const handleSaveAccount = useCallback((acct) => {
    if (!acct) return;
    setAccounts(prev => {
      if (prev.includes(acct)) return prev;
      const next = [acct, ...prev];
      storage.saveAccounts(next);
      db.saveSetting('accounts', next).catch(() => {});
      return next;
    });
  }, []);

  const handleAddSale = useCallback(async ({ account, kg, baht, receiptUrl, status, date }) => {
    const ts = Date.now(); // use actual creation time, not forced noon
    const sale = { id: String(ts) + '_' + Math.random().toString(36).slice(2), date: ts, buyer: account || '', kg: Number(kg) || 0, baht: Number(baht) || 0, note: status || 'cash', receiptUrl: receiptUrl || '' };
    const next = [sale, ...sales];
    storage.saveSales(next);
    setSales(next);
    fetch('/api/sheets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'addSale', ...sale }) }).catch(() => {});
    try { await db.upsertSale(sale); } catch {}
  }, [sales]);

  const handleDeleteSale = useCallback(async (id) => {
    const next = sales.filter(s => s.id !== id);
    storage.saveSales(next);
    setSales(next);
    fetch('/api/sheets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'deleteSale', id }) }).catch(() => {});
    try { await db.deleteSale(id); } catch {}
  }, [sales]);

  const handleUpdateSale = useCallback(async (id, patch) => {
    const next = sales.map(s => s.id === id ? { ...s, ...patch } : s);
    storage.saveSales(next);
    setSales(next);
    const updated = next.find(s => s.id === id);
    if (updated) {
      fetch('/api/sheets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'addSale', ...updated }) }).catch(() => {});
      try { await db.upsertSale(updated); } catch {}
    }
  }, [sales]);

  const handleSaveSlip = useCallback((dataUrl) => {
    if (!session) return;
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const timePart = `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    const namePart = (session.seller || 'ไม่ระบุ').replace(/[^ก-๙a-zA-Z0-9]/g, '_');
    const phonePart = session.sellerPhone || 'nophone';
    const filename = `slip_${namePart}_${phonePart}_${datePart}_${timePart}.jpg`;
    fetch('/api/drive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ base64: dataUrl, filename, folder: 'QudsunSlips' }) }).catch(() => {});
  }, [session]);

  const handleUploadEvidence = useCallback(async (type, file) => {
    if (!session) return;
    try {
      const dataUrl = await resizeImage(file, 1400);
      const now = new Date();
      const datePart = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
      const timePart = `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
      const namePart = (session.seller || 'ไม่ระบุ').replace(/[^ก-๙a-zA-Z0-9]/g, '_');
      const phonePart = session.sellerPhone || 'nophone';
      const prefix = type === 'receipt' ? 'receipt' : type === 'vehicle' ? 'vehicle' : 'slip';
      const folder = type === 'receipt' ? 'QudsunReceipts' : type === 'vehicle' ? 'QudsunVehicles' : 'QudsunTransfers';
      const filename = `${prefix}_${namePart}_${phonePart}_${datePart}_${timePart}.jpg`;
      const urlKey = type === 'receipt' ? 'receiptUrl' : type === 'vehicle' ? 'vehicleUrl' : 'slipUrl';
      const prev = storage.loadPayments();
      const existing = prev[session.billNo] || { status: 'transferred', paidAt: Date.now() };

      // Show base64 immediately in UI (local only)
      if (type === 'vehicle') setVehiclePhotoUrl(dataUrl);
      const localUpdated = { ...existing, [urlKey]: dataUrl };
      const localNext = { ...prev, [session.billNo]: localUpdated };
      storage.savePayments(localNext);
      setPayments(localNext);
      toast('กำลัง upload…');

      // Upload to Supabase Storage
      try {
        const storagePath = `${folder}/${filename}`;
        const publicUrl = await db.uploadPhoto(dataUrl, storagePath);
        if (type === 'vehicle') setVehiclePhotoUrl(publicUrl);
        const cloudUpdated = { ...existing, [urlKey]: publicUrl };
        const cloudNext = { ...prev, [session.billNo]: cloudUpdated };
        storage.savePayments(cloudNext);
        setPayments(cloudNext);
        pushPayment(session.billNo, cloudUpdated);
        toast('อัพโหลดรูปแล้ว ✓');
      } catch {
        toast('บันทึกรูปไว้ในเครื่อง ✓');
      }
    } catch { toast('อัพโหลดไม่สำเร็จ'); }
  }, [session, toast, pushPayment]);

  const handleBulkUpload = useCallback(async (receiptUrl, slipUrl, vehicleUrl) => {
    if (!session) return;
    toast('กำลัง upload…');
    const prev = storage.loadPayments();
    const existing = prev[session.billNo] || { status: 'transferred', paidAt: Date.now() };
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const timePart = `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    const namePart = (session.seller || 'noname').replace(/[^ก-๙a-zA-Z0-9]/g, '_');
    const phone = session.sellerPhone || 'nophone';

    const uploadOne = async (dataUrl, prefix, folder) => {
      if (!dataUrl) return null;
      try {
        const filename = `${prefix}_${namePart}_${phone}_${datePart}_${timePart}.jpg`;
        return await db.uploadPhoto(dataUrl, `${folder}/${filename}`);
      } catch { return dataUrl; } // keep base64 as fallback
    };

    const [rUrl, sUrl, vUrl] = await Promise.all([
      uploadOne(receiptUrl, 'receipt', 'QudsunReceipts'),
      uploadOne(slipUrl, 'slip', 'QudsunTransfers'),
      uploadOne(vehicleUrl, 'vehicle', 'QudsunVehicles'),
    ]);

    const updated = {
      ...existing,
      ...(rUrl ? { receiptUrl: rUrl } : {}),
      ...(sUrl ? { slipUrl: sUrl } : {}),
      ...(vUrl ? { vehicleUrl: vUrl } : {}),
    };
    const next = { ...prev, [session.billNo]: updated };
    storage.savePayments(next);
    setPayments(next);
    pushPayment(session.billNo, updated);
    toast('อัพโหลดรูปแล้ว ✓');
  }, [session, toast, pushPayment]);

  const handleReusePhoto = useCallback((type, url) => {
    if (!session || !url) return;
    const urlKey = type === 'receipt' ? 'receiptUrl' : type === 'vehicle' ? 'vehicleUrl' : 'slipUrl';
    const prev = storage.loadPayments();
    const existing = prev[session.billNo] || { status: 'transferred', paidAt: Date.now() };
    const updated = { ...existing, [urlKey]: url };
    const next = { ...prev, [session.billNo]: updated };
    storage.savePayments(next);
    setPayments(next);
    pushPayment(session.billNo, updated);
    toast('คัดลอกรูปแล้ว ✓');
  }, [session, toast, pushPayment]);

  const handleSaveCustomerInfo = useCallback((phone, info) => {
    if (!phone) return;
    const ciPrev = storage.loadCustomerInfo();
    const ciExist = ciPrev[phone] || {};
    const newInfo = Object.fromEntries(Object.entries(info).filter(([, v]) => v));
    const ciNext = { ...ciPrev, [phone]: { ...ciExist, ...newInfo } };
    storage.saveCustomerInfo(ciNext);
    setCustomerInfo(ciNext);
    db.upsertCustomerInfo(phone, ciNext[phone]).catch(() => {});
  }, []);

  // ── Sale session handlers ────────────────────────────────────────────────────
  const persistSaleSession = useCallback((s) => { storage.saveSaleSession(s); }, []);

  const createSaleSession = useCallback(() => {
    const t = Date.now();
    const ss = { id: t, billNo: newSaleBillNo(), createdAt: t, date: t, customerName: '', customerPhone: '', prices: Object.fromEntries(CATS.map(c => [c.key, 0])), entries: [], customLabel: '' };
    setSaleSession(ss); setSaleActiveCat('AB'); setSaleInput(''); navigate('/sale/record');
  }, [navigate]);

  const commitSaleEntry = useCallback(() => {
    const kg = parseFloat(saleInput);
    if (!kg || kg <= 0) { toast('ใส่น้ำหนักก่อนนะ'); return; }
    setSaleSession(prev => {
      const entryCustomLabel = saleActiveCat === 'custom' ? (prev.customLabel || '') : '';
      const entry = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 6), cat: saleActiveCat, kg, t: Date.now() };
      if (entryCustomLabel) entry.customLabel = entryCustomLabel;
      return { ...prev, entries: [...(prev.entries || []), entry] };
    });
    setSaleInput(''); toast('บันทึก ' + fmtKg(kg) + ' กก. แล้ว');
  }, [saleInput, saleActiveCat, toast]);

  useEffect(() => { if (saleSession) persistSaleSession(saleSession); }, [saleSession, persistSaleSession]);

  const finishSaleSession = useCallback(async () => {
    if (!saleSession) return;
    const totalKg = (saleSession.entries || []).reduce((s, e) => s + e.kg, 0);
    const totalBaht = grandBaht(saleSession);

    const saleRecord = { id: saleSession.billNo, date: saleSession.date, buyer: saleSession.customerName || saleSession.billNo, kg: totalKg, baht: totalBaht, note: 'pending', receiptUrl: '' };
    try {
      await Promise.all([
        db.upsertSaleSession(saleSession),
        db.upsertSale(saleRecord),
      ]);
    } catch {}

    const summary = { billNo: saleSession.billNo, date: saleSession.date, customerName: saleSession.customerName || '', customerPhone: saleSession.customerPhone || '', kg: totalKg, baht: totalBaht };
    const nextSh = [summary, ...saleHistory];
    storage.saveSaleHistory(nextSh); setSaleHistory(nextSh);

    const nextSales = [saleRecord, ...sales];
    storage.saveSales(nextSales); setSales(nextSales);

    // Wallet integration: credit B as pending when sale is finalized
    db.upsertWalletTxIfNew({
      wallet: 'B', direction: 'in', amount: totalBaht, txType: 'sale_recv',
      status: 'pending', refId: saleSession.billNo,
      note: `รับเงินขาย ${saleSession.billNo}`,
    }).catch(() => {});

    storage.saveSaleSession(null); setSaleSession(null);
    toast('บันทึกบิลขายเรียบร้อย'); navigate('/');
  }, [saleSession, saleHistory, sales, toast, navigate]);

  const editSaleEntry = useCallback((entry) => {
    setSaleNumpad({ entryId: entry.id, catKey: entry.cat, title: 'แก้ไขเข่ง — ' + (CATS.find(c => c.key === entry.cat)?.label || entry.cat), value: String(entry.kg), canDelete: true });
  }, []);

  const setSalePrice = useCallback((catKey) => {
    const cur = saleSession?.prices?.[catKey] || 0;
    const displayLabel = catKey.startsWith('custom:') ? catKey.slice(7) : (CATS.find(c => c.key === catKey)?.label || catKey);
    setSaleNumpad({ priceKey: catKey, title: 'ราคา — ' + displayLabel, value: cur ? String(cur) : '', unit: '฿/กก.', canDelete: false });
  }, [saleSession]);

  const saleNumSave = useCallback(() => {
    if (!saleNumpad) return;
    const val = parseFloat(saleNumpad.value);
    if (saleNumpad.priceKey) {
      if (val >= 0) setSaleSession(prev => ({ ...prev, prices: { ...(prev.prices || {}), [saleNumpad.priceKey]: val } }));
      setSaleNumpad(null); return;
    }
    if (!val || val <= 0) return;
    setSaleSession(prev => ({ ...prev, entries: (prev.entries || []).map(e => e.id === saleNumpad.entryId ? { ...e, kg: val } : e) }));
    setSaleNumpad(null);
  }, [saleNumpad]);

  const saleNumDelete = useCallback(() => {
    if (!saleNumpad) return;
    setSaleSession(prev => ({ ...prev, entries: (prev.entries || []).filter(e => e.id !== saleNumpad.entryId) }));
    setSaleNumpad(null);
  }, [saleNumpad]);

  const doConfirm = useCallback(() => {
    updateSession(prev => {
      const s = { ...prev, confirmed: true, confirmedAt: Date.now() };
      addLog(s, 'confirm', 'ลูกค้ายืนยันยอด ฿' + fmtBaht(grandBaht(s)));
      return s;
    });
    navigate('/print');
  }, [updateSession, navigate]);

  const commitFinish = useCallback(async (sessOverride) => {
    const s = sessOverride || session;
    if (!s) return;
    const card = { billNo: s.billNo, seller: s.seller || '-', phone: s.sellerPhone || '', date: s.date, dateText: dateStr(s.date), kg: fmtKg(grandKg(s)), baht: fmtBaht(grandBaht(s)), supervisor: s.supervisor || (supervisors || {})[s.sellerPhone || ''] || '', data: s };
    setSyncStatus('กำลังบันทึก…');
    try {
      await db.upsertBill(card);
      setSyncStatus('✓ บันทึกแล้ว ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }));
    } catch {
      setSyncStatus('⚠ Supabase บันทึกไม่สำเร็จ');
    }
    const hist = [card, ...history].slice(0, 60);
    storage.saveHistory(hist); storage.saveSession(null);
    setHistory(hist); setSession(null); navigate('/'); setVerifyPrompt(null);
    toast('บันทึกบิลเรียบร้อย');
    const billPayload = { action: 'syncBill', bill: { ...card, json: JSON.stringify(card) } };
    fetch('/api/sheets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(billPayload) }).catch(() => {});
  }, [session, history, toast, navigate]);

  const finishBill = useCallback(() => {
    const s = session; if (!s) return;
    const phone = String(s.sellerPhone || '').trim();
    if (phone) {
      const stat = customerStat(phone, history, verified);
      const newTotal = stat.total + grandKg(s);
      const newTier = tierOf(newTotal);
      if (REQUIRE_NAME[newTier.key] && !verified[phone]) {
        setVerifyPrompt({ phone, tier: newTier, draft: s.seller || stat.name || '', newTotal, mode: 'bill' }); return;
      }
    }
    commitFinish();
  }, [session, history, verified, commitFinish]);

  const handleVerifyConfirm = useCallback(() => {
    if (!verifyPrompt) return;
    const name = String(verifyPrompt.draft || '').trim();
    if (name.length < 3) { toast('กรุณาใส่ชื่อ-นามสกุลให้ครบ'); return; }
    const nv = { ...verified, [verifyPrompt.phone]: name };
    storage.saveVerified(nv); setVerified(nv);
    pushVerify(verifyPrompt.phone, name);
    if (verifyPrompt.mode === 'manage') { setVerifyPrompt(null); toast('ยืนยันชื่อแล้ว · เลื่อนเป็น ' + verifyPrompt.tier.label); return; }
    updateSession(prev => { const s = { ...prev, seller: name }; addLog(s, 'verify', 'ยืนยันชื่อ "' + name + '" เลื่อนระดับ ' + verifyPrompt.tier.label); return s; });
    setTimeout(() => commitFinish(), 50);
  }, [verifyPrompt, verified, toast, pushVerify, updateSession, commitFinish]);

  const openHistory = useCallback((card, fromCust = false) => {
    savedSession.current = session;
    setIsHandoff(false); setSession(card.data); navigate('/print'); setReadonly(true);
    if (!fromCust) setCustPhone(null);
    setVehiclePhotoUrl(null);
    if (card.data?.vehiclePhotoKey) {
      loadPhoto(card.data.vehiclePhotoKey).then(u => { if (u) setVehiclePhotoUrl(u); });
    }
  }, [session, navigate]);

  const openSaleHistoryDetail = useCallback(async (billNo) => {
    setViewSalePaymentStatus(null);
    const loadPayStatus = (bn) => db.fetchWalletTxByRef(bn, 'sale_recv').then(tx => setViewSalePaymentStatus(tx?.status || null)).catch(() => {});
    const full = saleSessions.find(s => s.billNo === billNo);
    if (full) { setViewSaleSession(full); navigate('/sale/history'); loadPayStatus(billNo); return; }
    try {
      const remote = await db.getSaleSessionByBillNo(billNo);
      if (remote) { setViewSaleSession(remote); navigate('/sale/history'); loadPayStatus(billNo); }
    } catch {}
  }, [saleSessions, navigate]);

  const handleConfirmSalePayment = useCallback(async (billNo, totalBaht) => {
    try {
      const existing = await db.fetchWalletTxByRef(billNo, 'sale_recv');
      if (existing?.status === 'confirmed') { toast('รับเงินแล้ว ✓'); setViewSalePaymentStatus('confirmed'); return; }
      if (existing?.status === 'pending') {
        await db.confirmWalletTxByRef(billNo, 'sale_recv', null);
      } else {
        await db.upsertWalletTxIfNew({ wallet: 'B', direction: 'in', amount: totalBaht, txType: 'sale_recv', status: 'confirmed', refId: billNo, note: `รับเงินขาย ${billNo}` });
      }
      setViewSalePaymentStatus('confirmed');
      toast('ยืนยันรับเงินแล้ว ✓');
    } catch { alert('ยืนยันไม่สำเร็จ'); }
  }, [toast]);

  const goBackFromBill = useCallback(() => {
    setSession(savedSession.current || null); savedSession.current = null;
    setReadonly(false); navigate(-1);
  }, [navigate]);

  const handleForcePush = useCallback(async () => {
    setSyncing(true);
    setSyncStatus('กำลังบันทึกทั้งหมด…');
    try {
      const bills = storage.loadHistory().filter(b => !b.deleted);
      const payments = storage.loadPayments();
      const sales = storage.loadSales ? storage.loadSales() : [];
      const r = await fetch('/api/sheets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'forcePush', bills, payments, sales }),
      });
      const d = await r.json();
      if (d.ok) {
        toast(`บันทึกสำเร็จ — บิล ${d.bills} รายการ, ยอดขาย ${d.sales} รายการ`);
        setSyncStatus(`✓ บันทึกทั้งหมดแล้ว (${d.bills} บิล)`);
      } else {
        toast('บันทึกไม่สำเร็จ: ' + (d.error || 'ไม่ทราบสาเหตุ'));
        setSyncStatus('⚠ บันทึกไม่สำเร็จ');
      }
    } catch (err) {
      toast('บันทึกไม่สำเร็จ');
      setSyncStatus('⚠ บันทึกไม่สำเร็จ');
    } finally {
      setSyncing(false);
    }
  }, [toast]);

  const handleExport = useCallback(() => {
    const data = { history: storage.loadHistory(), verified: storage.loadVerified(), supervisors: storage.loadSupervisors(), exportedAt: new Date().toISOString(), version: 1 };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `qudsun-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('ส่งออกสำเร็จ');
  }, [toast]);

  const handleImport = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.version) throw new Error('ไม่ใช่ไฟล์สำรองของ Qudsun');
        if (data.history && Array.isArray(data.history)) {
          const existing = storage.loadHistory();
          const ids = new Set(existing.map(h => h.id));
          const merged = [...existing, ...data.history.filter(h => !ids.has(h.id))];
          storage.saveHistory(merged); setHistory(merged);
        }
        if (data.verified && typeof data.verified === 'object') {
          const nv = { ...storage.loadVerified(), ...data.verified };
          storage.saveVerified(nv); setVerified(nv);
        }
        if (data.supervisors && typeof data.supervisors === 'object') {
          const ns = { ...storage.loadSupervisors(), ...data.supervisors };
          storage.saveSupervisors(ns); setSupervisors(ns);
          db.saveSetting('supervisors', ns).catch(() => {});
        }
        e.target.value = '';
        toast('นำเข้าสำเร็จ ✓');
      } catch (err) {
        toast('ไฟล์ไม่ถูกต้อง: ' + err.message);
      }
    };
    reader.readAsText(file);
  }, [toast]);

  const [resetModalOpen, setResetModalOpen] = useState(false);

  const handleResetData = useCallback(async () => {
    await db.resetAllData();
    setHistory([]);
    setSaleHistory([]);
    setPayments({});
    storage.saveHistory([]);
    storage.saveSaleHistory([]);
    storage.savePayments({});
    setResetModalOpen(false);
    toast('รีเซ็ตข้อมูลเรียบร้อย ✓');
  }, [toast]);

  const changePin = useCallback(() => {
    requirePin('ยืนยันรหัสเดิมก่อนเปลี่ยน', () => {
      setNumpad({ mode: 'setpin', title: 'ตั้งรหัส Admin ใหม่ (4 หลัก)', unit: '', value: '', original: '', canDelete: false, saveLabel: 'บันทึกรหัสใหม่' });
    });
  }, [requirePin]);

  const setEmployeePinAction = useCallback(() => {
    requirePin('ยืนยัน Admin PIN ก่อนจัดการพนักงาน', () => {
      setEmployeeManagerOpen(true);
    });
  }, [requirePin]);

  const handleLogin = useCallback((entered) => {
    if (entered === pin) {
      setAuthRole('admin'); localStorage.setItem('qudsun_role', 'admin'); setLoginError('');
      const name = 'Admin';
      setRecorderName(name); localStorage.setItem('qudsun_recorder', name);
    } else {
      const emp = employees.find(e => e.pin === entered);
      if (emp) {
        setAuthRole('employee'); localStorage.setItem('qudsun_role', 'employee'); setLoginError('');
        setRecorderName(emp.name); localStorage.setItem('qudsun_recorder', emp.name);
      } else if (employeePin && entered === employeePin) {
        setAuthRole('employee'); localStorage.setItem('qudsun_role', 'employee'); setLoginError('');
        setRecorderName('พนักงาน'); localStorage.setItem('qudsun_recorder', 'พนักงาน');
      } else {
        setLoginError('รหัสไม่ถูกต้อง ลองใหม่');
      }
    }
  }, [pin, employeePin, employees]);

  const handleLogout = useCallback(() => {
    setAuthRole(null); setRecorderName('');
    localStorage.removeItem('qudsun_role'); localStorage.removeItem('qudsun_recorder');
  }, []);

  if (!authRole) {
    return <LoginScreen onLogin={handleLogin} error={loginError} onErrorClear={() => setLoginError('')} />;
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#EFE6D4' }}>
      <Header />

      <Routes>
        <Route path="/" element={
          <HomeView session={session} history={history} saleHistory={saleHistory} payments={payments} pendingPurchaseCount={homeUnpaidCount} verified={verified} supervisors={supervisors} syncing={syncing} syncStatus={syncStatus} onSyncNow={() => syncNow(false)} onOpenSheet={() => setSheetModal(true)}
            onNew={startNew} onResume={() => { navigate('/record'); if (session?.entries?.length > 0) { setActiveCat(session.entries[session.entries.length - 1].cat); } else { setActiveCat('AB'); } }}
            onGoCustomers={() => { navigate('/customers'); syncNow(true); }}
            onGoDashboard={() => { navigate('/purchases'); syncNow(true); }}
            onGoSales={() => { navigate('/sales'); syncNow(true); }}
            onNewSale={createSaleSession}
            saleSession={saleSession}
            onResumeSale={() => navigate('/sale/record')}
            onGoSupervisors={() => { navigate('/supervisors'); syncNow(true); }}
            onChangePin={changePin} onSetEmployeePin={setEmployeePinAction}
            onOpenHistory={openHistory} onOpenSaleHistory={openSaleHistoryDetail} onPayment={handlePayment} onDeleteBill={handleDeleteBill} onDeleteSaleBill={handleDeleteSaleBill} pin={pin} isEmployee={authRole === 'employee'} onLogout={handleLogout}
            onExport={handleExport} onImport={handleImport} onGoHistory={() => navigate('/history')} onResetData={() => setResetModalOpen(true)} onGoWallet={() => navigate('/wallet')} />
        } />
        <Route path="/record" element={session ? (
          <RecordView session={session} activeCat={activeCat} input={input} onInput={setInput} onCommit={commitEntry}
            onPickCat={setActiveCat} onGoHome={() => { navigate('/'); syncNow(true); }} onGoSummary={() => navigate('/summary')}
            onEditSeller={() => {
              const ph = session.sellerPhone || '';
              const knownName = loadCustomers(history)[ph]?.name || verified[ph] || '';
              const knownSup = supervisors[ph] || '';
              setSellerDraft(session.seller || '');
              setSellerPhoneDraft(ph);
              setSupervisorDraft(session.supervisor || knownSup);
              setSellerNameLocked(!!knownName);
              setSellerSupervisorLocked(!!knownSup);
              setSellerOpen(true);
            }}
            onEditEntry={openEditEntry} verified={verified} history={history}
            customLabel={session.customLabel || ''}
            onCustomLabelChange={label => updateSession(prev => ({ ...prev, customLabel: label }))}
            pinnedCats={pinnedCats} onOpenPinEditor={() => setPinEditorOpen(true)}
            vehiclePhotoUrl={vehiclePhotoUrl} onVehiclePlate={handleVehiclePlate} onVehiclePhoto={handleVehiclePhoto}
            customerInfo={customerInfo}
            onSaveCustomerInfo={(phone, info) => { const next = { ...storage.loadCustomerInfo(), [phone]: info }; storage.saveCustomerInfo(next); setCustomerInfo(next); db.upsertCustomerInfo(phone, info).catch(() => {}); }}
            onChangeDate={handleChangeDate}
            customCatLabels={customCatLabels} onAddCustomCatLabel={handleAddCustomCatLabel} onRemoveCustomCatLabel={handleRemoveCustomCatLabel}
            hiddenCats={hiddenCats} onHideCat={handleHideCat} onShowAllCats={handleShowAllCats} />
        ) : <Navigate to="/" replace />} />
        <Route path="/summary" element={session ? (
          <SummaryView session={session} logOpen={logOpen}
            onGoRecord={() => navigate('/record')} onGoConfirm={() => navigate('/confirm')}
            onSetPrice={openSetPrice} onToggleLog={() => setLogOpen(v => !v)}
            customLabel={session.customLabel || ''} />
        ) : <Navigate to="/" replace />} />
        <Route path="/confirm" element={session ? (
          <ConfirmView session={session} verified={verified} history={history}
            onConfirm={doConfirm} onGoSummary={() => navigate('/summary')}
            customLabel={session.customLabel || ''} />
        ) : <Navigate to="/" replace />} />
        <Route path="/print" element={session ? (
          <PrintView session={session} readonly={readonly} isHandoff={isHandoff} verified={verified} history={history} payments={payments}
            onGoSummary={() => navigate('/summary')} onGoBack={goBackFromBill} onFinish={finishBill}
            onStartEdit={readonly ? () => { setReadonly(false); setSession(prev => ({ ...prev, confirmed: false })); navigate('/record'); } : undefined}
            customLabel={session.customLabel || ''} vehiclePhotoUrl={session.vehicleDriveUrl || vehiclePhotoUrl}
            onSaveSlip={handleSaveSlip} onUploadEvidence={readonly ? handleUploadEvidence : undefined}
            onReusePhoto={readonly ? handleReusePhoto : undefined}
            onBulkUpload={readonly ? handleBulkUpload : undefined}
            onSaveCustomerInfo={readonly ? handleSaveCustomerInfo : undefined}
            supervisors={supervisors} customerInfo={customerInfo} />
        ) : <Navigate to="/" replace />} />
        <Route path="/purchases" element={
          <DashboardView payments={payments} pin={pin} onPayment={handlePayment} onBatchPayment={handleBatchPayment} onDeleteBill={handleDeleteBill} onGoHome={() => { navigate('/'); syncNow(true); }} onOpenHistory={openHistory} isEmployee={authRole === 'employee'} />
        } />
        <Route path="/sales" element={
          <SalesView accounts={accounts} pin={pin} onGoHome={() => navigate('/')} onAddSale={handleAddSale} onDeleteSale={handleDeleteSale} onUpdateSale={handleUpdateSale} onSaveAccount={handleSaveAccount} onOpenHistory={openHistory}
            onNewSaleSession={createSaleSession} isEmployee={authRole === 'employee'} />
        } />
        <Route path="/sale/record" element={saleSession ? (
          <SaleRecordView saleSession={saleSession} activeCat={saleActiveCat} input={saleInput} onInput={setSaleInput} onCommit={commitSaleEntry}
            onPickCat={setSaleActiveCat} onGoBack={() => navigate('/')} onGoSummary={() => navigate('/sale/summary')} onEditEntry={editSaleEntry}
            pinnedCats={pinnedCats} onOpenPinEditor={() => setPinEditorOpen(true)}
            onCustomLabelChange={label => setSaleSession(prev => ({ ...prev, customLabel: label }))}
            onEditCustomer={() => setSaleCustomerModal(true)}
            onChangeDate={ms => setSaleSession(prev => ({ ...prev, date: ms }))}
            customCatLabels={customCatLabels} onAddCustomCatLabel={handleAddCustomCatLabel} onRemoveCustomCatLabel={handleRemoveCustomCatLabel}
            hiddenCats={hiddenCats} onHideCat={handleHideCat} onShowAllCats={handleShowAllCats} />
        ) : <Navigate to="/" replace />} />
        <Route path="/sale/summary" element={saleSession ? (
          <SaleSummaryView saleSession={saleSession} customLabel={saleSession?.customLabel || ''}
            onGoRecord={() => navigate('/sale/record')} onGoPrint={() => navigate('/sale/print')}
            onSetPrice={setSalePrice} />
        ) : <Navigate to="/" replace />} />
        <Route path="/sale/print" element={saleSession ? (
          <SalePrintView saleSession={saleSession} onGoBack={() => navigate('/sale/summary')} onFinish={finishSaleSession} />
        ) : <Navigate to="/" replace />} />
        <Route path="/sale/history" element={viewSaleSession ? (
          <SalePrintView saleSession={viewSaleSession} onGoBack={() => { navigate('/history'); setTimeout(() => setViewSaleSession(null), 100); }} onFinish={null}
            salePaymentStatus={viewSalePaymentStatus}
            onConfirmPayment={viewSalePaymentStatus !== 'confirmed' ? () => handleConfirmSalePayment(viewSaleSession.billNo, grandBaht(viewSaleSession)) : null}
            onStartEdit={() => { setSaleSession({ ...viewSaleSession, confirmed: false }); navigate('/sale/record'); setTimeout(() => setViewSaleSession(null), 100); }} />
        ) : <Navigate to="/" replace />} />
        <Route path="/customers" element={
          <CustomersView history={history} verified={verified} onGoHome={() => navigate('/')}
            onOpenCustomer={phone => { setCustPhone(phone); navigate('/customers/' + encodeURIComponent(phone)); }}
            onDeleteCustomer={handleDeleteCustomer} pin={pin} isEmployee={authRole === 'employee'} />
        } />
        <Route path="/customers/:phone" element={
          <CustomerDetailRoute history={history} verified={verified} supervisors={supervisors}
            vehiclePlates={vehiclePlates} customerInfo={customerInfo} payments={payments} onPayment={handlePayment}
            onGoBack={() => navigate('/customers')} onOpenHistory={card => openHistory(card, true)}
            onSaveSupervisor={(phone, name) => { const ns = { ...supervisors, [phone]: name }; storage.saveSupervisors(ns); setSupervisors(ns); db.saveSetting('supervisors', ns).catch(() => {}); }}
            onSaveCustomerInfo={(phone, info) => { const next = { ...storage.loadCustomerInfo(), [phone]: info }; storage.saveCustomerInfo(next); setCustomerInfo(next); db.upsertCustomerInfo(phone, info).catch(() => {}); }}
            onOpenVerify={phone => {
              const stat = customerStat(phone, history, verified);
              setVerifyPrompt({ phone, tier: tierOf(stat.total), draft: stat.name || '', newTotal: stat.total, mode: 'manage' });
            }} />
        } />
        <Route path="/supervisors" element={
          <SupervisorsView supervisors={supervisors} supervisorNames={supervisorNames} history={history}
            onGoHome={() => navigate('/')}
            onOpenSupervisor={name => { setActiveSupervisor(name); navigate('/supervisors/' + encodeURIComponent(name)); }}
            onDeleteSupervisor={handleDeleteSupervisor}
            onAddSupervisor={handleAddSupervisorName}
            pin={pin} isEmployee={authRole === 'employee'} />
        } />
        <Route path="/supervisors/:name" element={
          <SupervisorDetailRoute supervisors={supervisors} history={history} verified={verified}
            onGoBack={() => navigate('/supervisors')}
            onOpenCustomer={phone => { setCustPhone(phone); navigate('/customers/' + encodeURIComponent(phone)); }}
            onOpenHistory={card => openHistory(card)} />
        } />
        <Route path="/history" element={
          <HistoryPageView
            onGoHome={() => navigate('/')}
            onOpenBill={(billNo) => {
              const card = history.find(h => h.billNo === billNo);
              if (card) openHistory(card);
            }}
            onOpenSaleBill={(billNo) => openSaleHistoryDetail(billNo)}
            isEmployee={authRole === 'employee'}
            onDeleteBill={handleDeleteBill}
            onDeleteSaleBill={handleDeleteSaleBill}
          />
        } />
        <Route path="/wallet" element={
          <WalletView onGoHome={() => navigate('/')} recorderName={recorderName} />
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {pinPrompt && <PinModal title={pinPrompt.title} error={pinError} value={pinValue} onKey={handlePinKey} onCancel={() => { setPinPrompt(null); setPinValue(''); setPinError(''); }} />}
      {numpad && <NumModal title={numpad.title} unit={numpad.unit} value={numpad.value || ''} onChange={v => setNumpad(n => ({ ...n, value: v }))} onSave={numSave} onCancel={() => setNumpad(null)} onDelete={numDelete} saveLabel={numpad.saveLabel} canDelete={numpad.canDelete} />}
      {saleNumpad && <NumModal title={saleNumpad.title} unit={saleNumpad.unit || 'กก.'} value={saleNumpad.value || ''} onChange={v => setSaleNumpad(n => ({ ...n, value: v }))} onSave={saleNumSave} onCancel={() => setSaleNumpad(null)} onDelete={saleNumDelete} saveLabel="บันทึก" canDelete={saleNumpad.canDelete} />}
      {saleCustomerModal && <SaleCustomerModal customerName={saleSession?.customerName} customerPhone={saleSession?.customerPhone} recorder={saleSession?.recorder} verified={verified} customerInfo={customerInfo} onSave={(name, phone, rec) => { setSaleSession(prev => ({ ...prev, customerName: name, customerPhone: phone, recorder: rec })); setSaleCustomerModal(false); }} onCancel={() => setSaleCustomerModal(false)} />}
      {sellerOpen && <SellerModal
        name={sellerDraft} phone={sellerPhoneDraft} supervisor={supervisorDraft}
        nameLocked={sellerNameLocked} supervisorLocked={sellerSupervisorLocked}
        supervisorOptions={[...new Set([...supervisorNames, ...Object.values(supervisors).filter(Boolean)])].sort()}
        onUnlock={() => requirePin('ปลดล็อคชื่อ/ผู้ดูแล (Admin เท่านั้น)', () => { setSellerNameLocked(false); setSellerSupervisorLocked(false); })}
        onNameChange={setSellerDraft}
        onPhoneChange={val => {
          setSellerPhoneDraft(val);
          const phone = val.trim();
          const knownSup = supervisors[phone] || '';
          if (knownSup) { setSupervisorDraft(knownSup); setSellerSupervisorLocked(true); }
          else setSellerSupervisorLocked(false);
          const knownName = loadCustomers(history)[phone]?.name || verified[phone] || '';
          if (knownName) { setSellerDraft(knownName); setSellerNameLocked(true); }
          else setSellerNameLocked(false);
        }}
        onSupervisorChange={setSupervisorDraft}
        onSave={() => {
          const phone = sellerPhoneDraft.trim();
          const sup = supervisorDraft.trim();
          if (phone && sup) { const ns = { ...supervisors, [phone]: sup }; storage.saveSupervisors(ns); setSupervisors(ns); }
          updateSession(prev => ({ ...prev, seller: sellerDraft.trim(), sellerPhone: phone, supervisor: sup }));
          setSellerOpen(false);
        }}
        onCancel={() => setSellerOpen(false)}
        history={history} verified={verified} />}
      {verifyPrompt && <VerifyModal tier={verifyPrompt.tier} phone={verifyPrompt.phone} draft={verifyPrompt.draft} total={verifyPrompt.newTotal}
        canSkip={verifyPrompt.mode === 'bill'} isManage={verifyPrompt.mode === 'manage'}
        onDraftChange={v => setVerifyPrompt(p => ({ ...p, draft: v }))}
        onConfirm={handleVerifyConfirm} onSkip={() => commitFinish()} onCancel={() => setVerifyPrompt(null)} />}

      {pinEditorOpen && <PinEditor customCatLabels={customCatLabels} onSave={labels => { db.saveSetting('custom_cat_labels', labels).catch(() => {}); setCustomCatLabels(labels); setPinEditorOpen(false); toast('บันทึกหมวดกำหนดเองแล้ว'); }} onCancel={() => setPinEditorOpen(false)} />}
      {employeeManagerOpen && <EmployeeManager employees={employees} onSave={list => { storage.saveEmployees(list); setEmployees(list); db.saveSetting('employees', list).catch(() => {}); setEmployeeManagerOpen(false); toast('บันทึกรายชื่อพนักงานแล้ว'); }} onCancel={() => setEmployeeManagerOpen(false)} />}
      {sheetModal && <SheetModal onSyncNow={() => { syncNow(false); }} syncStatus={syncStatus} syncing={syncing} onCancel={() => setSheetModal(false)} />}
      {resetModalOpen && <ResetDataModal pin={pin} onConfirm={handleResetData} onClose={() => setResetModalOpen(false)} />}

<Toast msg={toastMsg} />
    </div>
  );
}
