import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation, useParams, Routes, Route, Navigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { CATS, TIERS, REQUIRE_NAME } from './utils/constants.js';
import {
  fmtKg, fmtBaht, fmtPrice, timeStr, dateStr,
  catLabel, catAccent, tierOf, tierBadge,
  agg, grandKg, grandBaht, billLink, billCode, newBillNo, newSaleBillNo,
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
function HomeView({ session, history, saleHistory, payments, syncing, syncStatus, onSyncNow, onOpenSheet, onNew, onResume, onGoCustomers, onGoDashboard, onGoSupervisors, onGoSales, onNewSale, saleSession, onResumeSale, onChangePin, onSetEmployeePin, onOpenHistory, onOpenSaleHistory, onPayment, onDeleteBill, pin, verified, supervisors, isEmployee, onLogout, onExport, onImport }) {
  const customerCount = Object.keys(loadCustomers(history)).length;
  const supervisorCount = Object.values(supervisors || {}).filter(Boolean).reduce((set, n) => (set.add(n), set), new Set()).size;
  const [deleteTarget, setDeleteTarget] = useState(null);
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


      <button onClick={onGoDashboard} style={{ width: '100%', border: '1.5px solid #5A7FA8', background: 'linear-gradient(135deg,#EEF3FA,#DDE8F5)', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <span style={{ fontSize: 22 }}>🧾</span>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#1A3A5C' }}>ยอดซื้อ</div>
          <div style={{ fontSize: 12, color: '#4A6A8A' }}>ประวัติรับซื้อ / สถานะชำระ</div>
        </div>
        <span style={{ marginLeft: 'auto', color: '#5A7FA8', fontSize: 18 }}>›</span>
      </button>

      <button onClick={onGoSales} style={{ width: '100%', border: '1.5px solid #6B8E4E', background: 'linear-gradient(135deg,#EDF5E7,#DFF0D4)', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <span style={{ fontSize: 22 }}>📤</span>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#3A5A28' }}>ยอดขาย / กำไร</div>
          <div style={{ fontSize: 12, color: '#6A8A58' }}>ขาเข้า / ขาออก / กำไร-ขาดทุน</div>
        </div>
        <span style={{ marginLeft: 'auto', color: '#6B8E4E', fontSize: 18 }}>›</span>
      </button>

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

      {(history.length > 0 || (saleHistory || []).length > 0) && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 12px' }}>
            <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 13, letterSpacing: '.14em', color: '#A6925E' }}>ประวัติบิล</span>
            <div style={{ flex: 1, height: 1, background: '#E4D7BC' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ...history.slice(0, 30).map(h => ({ _type: 'buy', _date: h.date || 0, ...h })),
              ...(saleHistory || []).slice(0, 30).map(s => ({ _type: 'sell', _date: s.date || 0, ...s })),
            ].sort((a, b) => b._date - a._date).slice(0, 30).map((item, i) => {
              if (item._type === 'buy') {
                const h = item;
                const stat = h.phone ? customerStat(h.phone, history, verified) : null;
                const tier = stat ? stat.effectiveTier : null;
                const pay = payments?.[h.billNo];
                const status = pay?.status || 'unpaid';
                const borderColor = status === 'transferred' ? '#5A9A6A' : status === 'cash' ? '#5A7FA8' : '#E05050';
                const statusLabel = status === 'transferred' ? '✓ โอนแล้ว' : status === 'cash' ? '✓ เงินสด' : null;
                const statusColor = status === 'transferred' ? '#2E7D32' : status === 'cash' ? '#1A4D80' : null;
                return (
                  <div key={'b-' + i} style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{ width: '83%', border: `1.5px solid ${borderColor}`, background: '#FFFDF8', borderRadius: '4px 13px 13px 13px', overflow: 'hidden' }}>
                      <button onClick={() => onOpenHistory(h)} style={{ textAlign: 'left', background: 'none', border: 'none', width: '100%', padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 9, background: '#F0E4C8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>🧾</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600, fontSize: 14, color: '#4A3526' }}>{h.billNo}</span>
                            {statusLabel && <span style={{ fontSize: 10, fontWeight: 700, color: statusColor }}>{statusLabel}</span>}
                          </div>
                          <div style={{ fontSize: 12, color: '#9A8662', marginTop: 1 }}>
                            {h.dateText} · {h.seller || '—'} · {h.kg} กก.
                          </div>
                          {tier && tier.key !== 'silver' && <TierBadge tier={tier} />}
                        </div>
                        <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 15, color: '#3F2D1E', whiteSpace: 'nowrap' }}>฿{h.baht}</span>
                      </button>
                      {status === 'unpaid' && onPayment && (
                        <div style={{ display: 'flex', gap: 8, padding: '0 12px 10px' }}>
                          <button onClick={() => onPayment(h.billNo, 'transferred')} style={{ flex: 1, border: 'none', borderRadius: 9, padding: '8px 0', background: '#5A9A6A', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>โอนแล้ว ✓</button>
                          <button onClick={() => onPayment(h.billNo, 'cash')} style={{ flex: 1, border: 'none', borderRadius: 9, padding: '8px 0', background: '#5A7FA8', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>เงินสด ✓</button>
                        </div>
                      )}
                      {!isEmployee && onDeleteBill && (
                        <div style={{ padding: '0 12px 10px', display: 'flex', justifyContent: 'flex-end' }}>
                          <button onClick={() => setDeleteTarget(h)} style={{ border: '1px solid #E8C8C2', background: '#FDF0EE', borderRadius: 8, padding: '5px 12px', fontSize: 11, color: '#C0392B', cursor: 'pointer' }}>🗑 ลบบิล</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              } else {
                const s = item;
                const fmtTs = ts => { const d = new Date(ts); return `${d.getDate()} ${['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][d.getMonth()]} ${d.getFullYear() + 543}`; };
                return (
                  <div key={'s-' + i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ width: '83%', border: '1.5px solid #6BBF70', background: '#F2FBF2', borderRadius: '13px 4px 13px 13px', overflow: 'hidden' }}>
                      <button onClick={() => onOpenSaleHistory ? onOpenSaleHistory(s.billNo) : onGoSales()} style={{ textAlign: 'left', background: 'none', border: 'none', width: '100%', padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600, fontSize: 14, color: '#1B5E20' }}>{s.billNo}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#4CAF50' }}>📤 ขาย</span>
                          </div>
                          <div style={{ fontSize: 12, color: '#5A8A5A', marginTop: 1 }}>
                            {s.date ? fmtTs(s.date) : ''}{s.customerName ? ` · ${s.customerName}` : ''} · {fmtKg(s.kg)} กก.
                          </div>
                        </div>
                        <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 15, color: '#1B5E20', whiteSpace: 'nowrap' }}>฿{fmtBaht(s.baht)}</span>
                      </button>
                    </div>
                  </div>
                );
              }
            })}
          </div>
        </>
      )}
      {deleteTarget && (
        <DeleteBillModal bill={deleteTarget} pin={pin}
          onConfirm={() => { onDeleteBill(deleteTarget.billNo); setDeleteTarget(null); }}
          onClose={() => setDeleteTarget(null)} />
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
      </div>
    </div>
  );
}

// ─── PinEditor ────────────────────────────────────────────────────────────────
function PinEditor({ pinnedCats, onSave, onCancel }) {
  const [pins, setPins] = useState([...pinnedCats]);
  const available = CATS.filter(c => c.key !== 'custom' && !pins.includes(c.key));

  const move = (i, dir) => {
    const next = [...pins];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setPins(next);
  };

  return (
    <div className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 65, background: 'rgba(42,33,24,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, animation: 'fadeIn .2s' }}>
      <div style={{ background: '#FFFDF8', borderRadius: 20, padding: 22, width: '100%', maxWidth: 360, maxHeight: '85dvh', overflowY: 'auto', animation: 'popIn .25s' }}>
        <h3 style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 17, margin: '0 0 4px', color: '#4A3526' }}>⭐ จัดหมวดปักหมุด</h3>
        <p style={{ fontSize: 12, color: '#9A8662', margin: '0 0 14px' }}>เลือกหมวดที่ใช้บ่อย แล้วจัดลำดับตามต้องการ</p>

        <div style={{ marginBottom: 14 }}>
          {pins.map((key, i) => {
            const cat = CATS.find(c => c.key === key);
            if (!cat) return null;
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', background: '#FBF6EC', borderRadius: 10, marginBottom: 6, border: '1px solid #E4D7BC' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: cat.accent, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#4A3526' }}>{cat.label || cat.key}</span>
                <button onClick={() => move(i, -1)} disabled={i === 0} style={{ border: '1px solid #E4D7BC', background: '#fff', borderRadius: 7, padding: '4px 8px', fontSize: 13, cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? .3 : 1 }}>↑</button>
                <button onClick={() => move(i, 1)} disabled={i === pins.length - 1} style={{ border: '1px solid #E4D7BC', background: '#fff', borderRadius: 7, padding: '4px 8px', fontSize: 13, cursor: i === pins.length - 1 ? 'default' : 'pointer', opacity: i === pins.length - 1 ? .3 : 1 }}>↓</button>
                <button onClick={() => setPins(p => p.filter((_, j) => j !== i))} style={{ border: '1px solid #E0B4A2', background: '#FBEEE8', borderRadius: 7, padding: '4px 8px', fontSize: 13, color: '#B5503A', cursor: 'pointer' }}>✕</button>
              </div>
            );
          })}
          {pins.length === 0 && <div style={{ textAlign: 'center', fontSize: 13, color: '#B7A684', padding: '12px 0' }}>ยังไม่มีหมวดปักหมุด</div>}
        </div>

        {available.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: '#A6925E', fontWeight: 600, letterSpacing: '.1em', marginBottom: 8 }}>เพิ่มหมวด</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 16 }}>
              {available.map(cat => (
                <button key={cat.key} onClick={() => setPins(p => [...p, cat.key])} style={{ border: '1px dashed #C9A24B', background: '#FBF6EC', borderRadius: 9, padding: '6px 12px', fontSize: 13, color: '#7A5A22', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: cat.accent }} />
                  {cat.label || cat.key} <span style={{ fontSize: 14 }}>＋</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, border: '1px solid #E4D7BC', background: '#fff', borderRadius: 12, padding: 13, color: '#7A6450', cursor: 'pointer' }}>ยกเลิก</button>
          <button onClick={() => onSave(pins)} style={{ flex: 1, border: 'none', background: '#3F2D1E', color: '#F6EEDD', borderRadius: 12, padding: 13, fontWeight: 600, cursor: 'pointer' }}>บันทึก</button>
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

function BankModal({ bankName, bankAccount, onSave, onClose }) {
  const [name, setName] = useState(bankName || '');
  const [acct, setAcct] = useState(bankAccount || '');
  const inp = { width: '100%', boxSizing: 'border-box', border: '1.5px solid #D8C8A8', borderRadius: 12, padding: '12px 14px', fontSize: 15, fontFamily: 'Prompt', color: '#2A2118', background: '#FBF6EC', marginBottom: 10 };
  return (
    <div className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(42,33,24,.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 0 env(safe-area-inset-bottom)', animation: 'fadeIn .2s' }}>
      <div style={{ background: '#FFFDF8', borderRadius: '20px 20px 0 0', padding: '20px 18px 28px', width: '100%', maxWidth: 480, boxShadow: '0 -8px 30px rgba(42,33,24,.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 17, color: '#3F2D1E' }}>🏦 ข้อมูลธนาคาร</span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#9A8662' }}>✕</button>
        </div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="ชื่อธนาคาร เช่น กสิกรไทย, SCB" style={inp} />
        <input value={acct} onChange={e => setAcct(e.target.value.replace(/\D/g, ''))} placeholder="เลขบัญชี" inputMode="numeric" style={{ ...inp, fontFamily: 'Prompt', letterSpacing: '.06em', fontSize: 16 }} />
        <button onClick={() => { onSave(name.trim(), acct.trim()); onClose(); }} style={{ width: '100%', border: 'none', borderRadius: 13, padding: 15, background: 'linear-gradient(135deg,#5A7FA8,#3A5F88)', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', boxShadow: '0 6px 16px rgba(58,95,136,.28)' }}>
          บันทึกข้อมูลธนาคาร
        </button>
      </div>
    </div>
  );
}

function RecordView({ session, activeCat, input, onInput, onCommit, onPickCat, onGoHome, onGoSummary, onEditSeller, onEditEntry, verified, history, customLabel, onCustomLabelChange, pinnedCats, onOpenPinEditor, vehiclePhotoUrl, onVehiclePlate, onVehiclePhoto, customerInfo, onSaveCustomerInfo }) {
  const aggData = agg(session);
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const sellerPhone = session?.sellerPhone || '';
  const bankInfo = (customerInfo || {})[sellerPhone] || {};
  const totalKg = grandKg(session);
  const totalCount = (session?.entries || []).length;
  const recent = (session?.entries || []).filter(e => e.cat === activeCat).reverse();
  const sellerPhone = session?.sellerPhone || '';
  const stat = sellerPhone ? customerStat(sellerPhone, history, verified) : null;
  const tier = stat ? stat.effectiveTier : null;
  const sellerText = (session?.seller || session?.sellerPhone) ? `${session.seller || ''}${session.sellerPhone ? (session.seller ? ' · ' : '') + session.sellerPhone : ''}` : 'ผู้ขาย —';
  const supervisorText = session?.supervisor ? `👤 ผู้ดูแล: ${session.supervisor}` : '';
  const recorderText = session?.recorder ? `✍️ ผู้บันทึก: ${session.recorder}` : '';
  const mainCats = CATS.filter(c => c.key !== 'custom');
  const customCat = CATS.find(c => c.key === 'custom');
  const vehiclePlate = session?.vehiclePlate || '';

  return (
    <div style={{ flex: 1, maxWidth: 880, width: '100%', margin: '0 auto', padding: '14px 14px 130px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button onClick={onGoHome} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#7A6450', cursor: 'pointer' }}>‹ หน้าหลัก</button>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#4A3526' }}>{session?.billNo}</span>
          <span style={{ fontSize: 12, color: '#9A8662' }}>{session ? dateStr(session.date) : ''}</span>
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
          onSave={(bName, bAcct) => onSaveCustomerInfo(sellerPhone, { ...bankInfo, bankName: bName, bankAccount: bAcct })}
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

      {pinnedCats && pinnedCats.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: '#A6925E', fontWeight: 600, letterSpacing: '.1em' }}>⭐ ปักหมุด</span>
            <div style={{ flex: 1, height: 1, background: '#E4D7BC' }} />
            <button onClick={onOpenPinEditor} style={{ border: '1px solid #E4D7BC', background: '#FBF6EC', borderRadius: 8, padding: '3px 8px', fontSize: 11, color: '#9A8662', cursor: 'pointer' }}>จัดการ</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(pinnedCats.length, 5)},1fr)`, gap: 7 }}>
            {pinnedCats.map(key => {
              const cat = CATS.find(c => c.key === key);
              if (!cat) return null;
              const d = aggData[key] || { kg: 0, count: 0 };
              const active = activeCat === key;
              return (
                <button key={key} onClick={() => onPickCat(key)} style={{ border: active ? `2px solid ${cat.accent}` : '1.5px solid #D8C8A8', background: active ? '#FFFDF8' : '#F6F0E4', borderRadius: 12, padding: '10px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: active ? `0 4px 12px ${cat.accent}40` : 'none' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.accent, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#4A3526' }}>{cat.label || cat.key}</span>
                  </span>
                  <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 16, marginTop: 3 }}>{fmtKg(d.kg)}</span>
                  <span style={{ fontSize: 10, opacity: .7 }}>{d.count} เข่ง</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(!pinnedCats || pinnedCats.length === 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 8 }}>
          {mainCats.map(c => {
            const d = aggData[c.key];
            const active = activeCat === c.key;
            return (
              <button key={c.key} onClick={() => onPickCat(c.key)} style={{ border: active ? `2px solid ${c.accent}` : '1px solid #E4D7BC', background: active ? '#FFFDF8' : '#FBF6EC', borderRadius: 12, padding: '10px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: active ? `0 4px 12px ${c.accent}40` : 'none' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.accent, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{c.label}</span>
                </span>
                <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 16, marginTop: 3 }}>{fmtKg(d.kg)}</span>
                <span style={{ fontSize: 10, opacity: .7 }}>{d.count} เข่ง</span>
              </button>
            );
          })}
        </div>
      )}
      {(() => {
        const d = aggData['custom'];
        const active = activeCat === 'custom';
        return (
          <button onClick={() => onPickCat('custom')} style={{ width: '100%', border: active ? `2px solid ${customCat.accent}` : '1px solid #E4D7BC', background: active ? '#FFFDF8' : '#FBF6EC', borderRadius: 12, padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, boxShadow: active ? `0 4px 12px ${customCat.accent}40` : 'none' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: customCat.accent, display: 'inline-block', flexShrink: 0 }} />
            <input
              value={customLabel}
              onChange={e => onCustomLabelChange(e.target.value)}
              onFocus={() => onPickCat('custom')}
              onClick={e => e.stopPropagation()}
              placeholder="พิมชื่อหมวดเอง…"
              style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, fontWeight: 600, color: '#4A3526', outline: 'none', cursor: 'text', fontFamily: 'inherit', minWidth: 0 }}
            />
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 16 }}>{fmtKg(d.kg)}</div>
              <div style={{ fontSize: 10, opacity: .7 }}>{d.count} เข่ง</div>
            </div>
          </button>
        );
      })()}

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
  const rows = CATS.filter(c => aggData[c.key].count > 0);
  const totalKg = grandKg(session);
  const totalBaht = grandBaht(session);
  const allPriced = rows.length > 0 && rows.every(c => (session?.prices[c.key] || 0) > 0);
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
        {rows.map(c => {
          const d = aggData[c.key];
          const price = session?.prices[c.key] || 0;
          return (
            <div key={c.key} style={{ display: 'grid', gridTemplateColumns: '1.3fr .7fr 1fr 1.1fr 1.2fr', alignItems: 'center', padding: '12px 14px', borderTop: '1px solid #EFE4CD' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: 14, color: '#4A3526' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.accent, display: 'inline-block', flexShrink: 0 }} />{c.key === 'custom' ? (customLabel || 'หมวดพิเศษ') : c.label}
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
        {rows.length === 0 && <div style={{ padding: '20px 14px', textAlign: 'center', color: '#B7A684', fontSize: 14 }}>ยังไม่มีรายการ — กลับไปบันทึกก่อน</div>}
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
      {!allPriced && rows.length > 0 && (
        <p style={{ textAlign: 'center', fontSize: 12, color: '#B7A684', marginTop: 8 }}>⚠ ยังมีบางหมวดที่ยังไม่ได้ตั้งราคา</p>
      )}
    </div>
  );
}

// ─── ConfirmView ──────────────────────────────────────────────────────────────
function ConfirmView({ session, verified, history, onConfirm, onGoSummary, customLabel }) {
  const aggData = agg(session);
  const rows = CATS.filter(c => aggData[c.key].count > 0);
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
          {rows.map(c => {
            const d = aggData[c.key];
            const price = session?.prices[c.key] || 0;
            return (
              <div key={c.key} style={{ display: 'flex', alignItems: 'center', padding: '13px 0', borderBottom: '1px solid #EFE4CD', gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.accent, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontWeight: 600, color: '#4A3526', flex: 1 }}>{c.key === 'custom' ? (customLabel || 'หมวดพิเศษ') : c.label}</span>
                <span style={{ fontFamily: 'Prompt', color: '#9A8662', fontSize: 14 }}>{fmtKg(d.kg)} กก. × {fmtPrice(price)} บาท</span>
                <span style={{ fontFamily: 'Prompt', fontWeight: 600, color: '#3F2D1E', minWidth: 84, textAlign: 'right' }}>฿{fmtBaht(d.kg * price)}</span>
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
function PrintView({ session, readonly, isHandoff, verified, history, payments, onGoSummary, onGoBack, onFinish, customLabel, vehiclePhotoUrl, onSaveSlip, onUploadEvidence, onReusePhoto, onBulkUpload, onSaveCustomerInfo, supervisors, customerInfo }) {
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
  const rows = CATS.filter(c => aggData[c.key].count > 0);
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
                    <span style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 14, color: '#7A5A22' }}>ดูบิลย้อนหลัง · อ่านอย่างเดียว</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#B7A684' }}>ยืนยัน {confirmTime}</span>
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
          entries.forEach(e => { if (!grouped[e.cat]) grouped[e.cat] = []; grouped[e.cat].push(e); });
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
                {Object.entries(grouped).map(([catKey, ents]) => {
                  const catObj = CATS.find(c => c.key === catKey);
                  const label = catKey === 'custom' ? (customLabel || 'หมวดพิเศษ') : (catObj?.label || catKey);
                  return (
                    <div key={catKey} className="bill-entries-group" style={{ marginBottom: 0 }}>
                      <div className="bill-entry-label" style={{ fontSize: 15, color: '#8A7A66', fontWeight: 600, marginBottom: 5, letterSpacing: '.03em' }}>{label} — {ents.length} เข่ง</div>
                      <div className="bill-entry-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, max-content)', gap: 5 }}>
                        {ents.map((e, i) => (
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
              const d = aggData[c.key];
              const price = session?.prices[c.key] || 0;
              return (
                <tr key={c.key}>
                  <td style={{ padding: '6px 8px', border: '1px solid #C9BBA0' }}>
                    <div>{c.key === 'custom' ? (customLabel || 'หมวดพิเศษ') : c.label}</div>
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

function DashboardView({ history, payments, pin, onPayment, onDeleteBill, onGoHome, onOpenHistory, isEmployee }) {
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [transferBill, setTransferBill] = useState(null);
  const [cancelBill, setCancelBill] = useState(null);
  const [deleteBill, setDeleteBill] = useState(null);

  const STATUS = {
    unpaid:      { label: 'ยังไม่โอน', color: '#E07A5F', bg: '#FDECEA', text: '#C0392B' },
    transferred: { label: 'โอนแล้ว',   color: '#5A9A6A', bg: '#E6F4EA', text: '#2E7D32' },
    cash:        { label: 'เงินสด',    color: '#5A7FA8', bg: '#E8EEF8', text: '#1A4D80' },
  };

  const toDateStr = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

  const dayBills = history
    .filter(h => { if (!h.date) return false; const ds = toDateStr(h.date); return ds >= startDate && ds <= endDate; })
    .map(h => ({ ...h, pay: payments[h.billNo] || { status: 'unpaid' } }))
    .sort((a, b) => (b.date || 0) - (a.date || 0));

  const totalKg   = dayBills.reduce((s, b) => s + (parseFloat((b.kg || '0').replace(/,/g, '')) || 0), 0);
  const totalBaht = dayBills.reduce((s, b) => s + (parseFloat((b.baht || '0').replace(/,/g, '')) || 0), 0);
  const nUnpaid   = dayBills.filter(b => b.pay.status === 'unpaid').length;
  const nPaid     = dayBills.length - nUnpaid;

  const fmt    = n => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtKg2 = n => n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  return (
    <div style={{ flex: 1, padding: '14px 14px 60px', maxWidth: 620, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <button onClick={onGoHome} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#7A6450' }}>‹</button>
          <span style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 18, color: '#3F2D1E' }}>ยอดซื้อ</span>
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

      {/* Bill list header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#4A3526' }}>รายการบิล</span>
        <div style={{ flex: 1, height: 1, background: '#E4D7BC' }} />
      </div>

      {dayBills.length === 0 && (
        <div style={{ textAlign: 'center', color: '#B7A684', fontSize: 13, padding: '20px 0' }}>ไม่มีบิลวันนี้</div>
      )}

      {dayBills.map(b => {
        const st = STATUS[b.pay.status] || STATUS.unpaid;
        const billTime = b.date ? new Date(b.date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.' : '';
        return (
          <div key={b.billNo} style={{ background: '#FFFDF8', border: `1px solid #E4D7BC`, borderLeft: `4px solid ${st.color}`, borderRadius: 14, marginBottom: 10, overflow: 'hidden' }}>
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
                <div style={{ fontSize: 12, color: '#8A7A66' }}>{b.billNo} · {b.kg} กก.{billTime ? ` · ${billTime}` : ''}</div>
              </button>
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#3F2D1E' }}>฿{b.baht}</div>
                {!isEmployee && <button onClick={() => setDeleteBill(b)} style={{ border: 'none', background: 'none', padding: '2px 4px', cursor: 'pointer', fontSize: 14, color: '#C8B89A', lineHeight: 1 }}>🗑</button>}
              </div>
            </div>
            </div>
            {!isEmployee && (
            <div style={{ padding: '0 16px 14px' }}>
              {b.pay.status === 'unpaid' ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setTransferBill(b)}
                    style={{ flex: 2, border: 'none', borderRadius: 10, padding: '9px 0', background: '#3F2D1E', color: '#F6EEDD', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                    📎 อัปโหลดหลักฐาน
                  </button>
                  <button onClick={() => onPayment(b.billNo, 'cash')}
                    style={{ flex: 1, border: '1px solid #5A7FA8', borderRadius: 10, padding: '9px 0', background: '#E8EEF8', color: '#1A4D80', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                    💵 เงินสด
                  </button>
                </div>
              ) : (
                <button onClick={() => setCancelBill(b)}
                  style={{ width: '100%', border: '1px solid #D0C8C0', borderRadius: 10, padding: '8px 0', background: '#fff', color: '#8A7A66', fontSize: 12, cursor: 'pointer' }}>
                  🔒 ยกเลิกการชำระ
                </button>
              )}
            </div>
            )}
          </div>
        );
      })}

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

function SalesView({ history, sales, accounts, pin, onGoHome, onAddSale, onDeleteSale, onUpdateSale, onSaveAccount, onOpenHistory, onNewSaleSession, isEmployee }) {
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [addOpen, setAddOpen] = useState(false);
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

  const inBills = history.filter(h => { if (!h.date) return false; const ds = toDateStr(h.date); return ds >= startDate && ds <= endDate; });
  const inKg = inBills.reduce((sum, h) => sum + (grandKg(h.data) || 0), 0);
  const inBaht = inBills.reduce((sum, h) => sum + (grandBaht(h.data) || 0), 0);

  const outSales = (sales || []).filter(s => { if (!s.date) return false; const ds = toDateStr(s.date); return ds >= startDate && ds <= endDate; }).sort((a, b) => b.date - a.date);
  const outKg = outSales.reduce((sum, s) => sum + (Number(s.kg) || 0), 0);
  const outBaht = outSales.reduce((sum, s) => sum + (Number(s.baht) || 0), 0);

  const profit = outBaht - inBaht;

  return (
    <div style={{ flex: 1, padding: '14px 14px 60px', maxWidth: 620, margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <button onClick={onGoHome} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#7A6450' }}>‹</button>
          <span style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 18, color: '#3F2D1E' }}>ยอดขาย</span>
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
                  {timeStr}{s.buyer ? ` · ${s.buyer}` : ''}
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

      <input ref={receiptInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
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
function SaleNewView({ onStart, onGoBack }) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
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
        <div>
          <div style={{ fontSize: 12, color: '#9A8662', marginBottom: 4 }}>เบอร์โทร</div>
          <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="0812345678 (ไม่บังคับ)" type="tel" style={inp} />
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

      <button onClick={() => onStart({ customerName: customerName.trim(), customerPhone: customerPhone.trim(), prices: Object.fromEntries(CATS.map(c => [c.key, Number(prices[c.key]) || 0])) })}
        style={{ width: '100%', border: 'none', borderRadius: 14, padding: 18, background: 'linear-gradient(135deg,#4A7A2E,#2E5C1A)', color: '#fff', fontWeight: 700, fontSize: 17, cursor: 'pointer', fontFamily: 'Prompt' }}>
        เริ่มบันทึกเข่ง →
      </button>
    </div>
  );
}

// ─── Sale Record View ─────────────────────────────────────────────────────────
function SaleRecordView({ saleSession, activeCat, input, onInput, onCommit, onPickCat, onGoBack, onGoSummary, onEditEntry, pinnedCats, onOpenPinEditor, onCustomLabelChange, onEditCustomer }) {
  const entries = saleSession?.entries || [];
  const aggData = {};
  CATS.forEach(c => { aggData[c.key] = { kg: 0, count: 0 }; });
  entries.forEach(e => { if (aggData[e.cat]) { aggData[e.cat].kg += e.kg; aggData[e.cat].count++; } });
  const totalKg = entries.reduce((s, e) => s + e.kg, 0);
  const totalCount = entries.length;
  const customLabel = saleSession?.customLabel || '';
  const mainCats = CATS.filter(c => c.key !== 'custom');
  const customCat = CATS.find(c => c.key === 'custom');
  const recent = entries.filter(e => e.cat === activeCat).slice().reverse();
  const hasCustomer = saleSession?.customerName || saleSession?.customerPhone;

  return (
    <div style={{ flex: 1, maxWidth: 880, width: '100%', margin: '0 auto', padding: '14px 14px 130px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button onClick={onGoBack} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#7A6450', cursor: 'pointer' }}>‹ หน้าหลัก</button>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#4A3526' }}>{saleSession?.billNo}</span>
          <span style={{ fontSize: 12, color: '#9A8662' }}>{saleSession ? dateStr(saleSession.date) : ''}</span>
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

      {/* Pinned cats */}
      {pinnedCats && pinnedCats.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: '#A6925E', fontWeight: 600, letterSpacing: '.1em' }}>⭐ ปักหมุด</span>
            <div style={{ flex: 1, height: 1, background: '#E4D7BC' }} />
            <button onClick={onOpenPinEditor} style={{ border: '1px solid #E4D7BC', background: '#FBF6EC', borderRadius: 8, padding: '3px 8px', fontSize: 11, color: '#9A8662', cursor: 'pointer' }}>จัดการ</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(pinnedCats.length, 5)},1fr)`, gap: 7 }}>
            {pinnedCats.map(key => {
              const cat = CATS.find(c => c.key === key);
              if (!cat) return null;
              const d = aggData[key] || { kg: 0, count: 0 };
              const active = activeCat === key;
              return (
                <button key={key} onClick={() => onPickCat(key)} style={{ border: active ? `2px solid ${cat.accent}` : '1.5px solid #D8C8A8', background: active ? '#FFFDF8' : '#F6F0E4', borderRadius: 12, padding: '10px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: active ? `0 4px 12px ${cat.accent}40` : 'none' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.accent, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#4A3526' }}>{cat.label || cat.key}</span>
                  </span>
                  <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 16, marginTop: 3 }}>{fmtKg(d.kg)}</span>
                  <span style={{ fontSize: 10, opacity: .7 }}>{d.count} เข่ง</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(!pinnedCats || pinnedCats.length === 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 8 }}>
          {mainCats.map(c => {
            const d = aggData[c.key];
            const active = activeCat === c.key;
            return (
              <button key={c.key} onClick={() => onPickCat(c.key)} style={{ border: active ? `2px solid ${c.accent}` : '1px solid #E4D7BC', background: active ? '#FFFDF8' : '#FBF6EC', borderRadius: 12, padding: '10px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: active ? `0 4px 12px ${c.accent}40` : 'none' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.accent, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{c.label}</span>
                </span>
                <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 16, marginTop: 3 }}>{fmtKg(d.kg)}</span>
                <span style={{ fontSize: 10, opacity: .7 }}>{d.count} เข่ง</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Custom cat row */}
      {(() => {
        const d = aggData['custom'];
        const active = activeCat === 'custom';
        return (
          <button onClick={() => onPickCat('custom')} style={{ width: '100%', border: active ? `2px solid ${customCat.accent}` : '1px solid #E4D7BC', background: active ? '#FFFDF8' : '#FBF6EC', borderRadius: 12, padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, boxShadow: active ? `0 4px 12px ${customCat.accent}40` : 'none' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: customCat.accent, display: 'inline-block', flexShrink: 0 }} />
            <input
              value={customLabel}
              onChange={e => onCustomLabelChange(e.target.value)}
              onFocus={() => onPickCat('custom')}
              onClick={e => e.stopPropagation()}
              placeholder="พิมชื่อหมวดเอง…"
              style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, fontWeight: 600, color: '#4A3526', outline: 'none', cursor: 'text', fontFamily: 'inherit', minWidth: 0 }}
            />
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 16 }}>{fmtKg(d.kg)}</div>
              <div style={{ fontSize: 10, opacity: .7 }}>{d.count} เข่ง</div>
            </div>
          </button>
        );
      })()}

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
function SaleCustomerModal({ customerName, customerPhone, onSave, onCancel }) {
  const [name, setName] = useState(customerName || '');
  const [phone, setPhone] = useState(customerPhone || '');
  const inp = { width: '100%', border: '1.5px solid #E4D7BC', borderRadius: 10, padding: '12px 14px', fontSize: 15, fontFamily: 'Prompt', background: '#fff', boxSizing: 'border-box', outline: 'none' };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: '#FFFDF8', borderRadius: '18px 18px 0 0', padding: '22px 18px 36px', width: '100%', maxWidth: 520 }}>
        <div style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 17, marginBottom: 16, color: '#3F2D1E' }}>ข้อมูลลูกค้า</div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#9A8662', marginBottom: 4 }}>ชื่อลูกค้า</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="ชื่อ (ไม่บังคับ)" style={inp} autoFocus />
        </div>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: '#9A8662', marginBottom: 4 }}>เบอร์โทร</div>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0812345678 (ไม่บังคับ)" type="tel" style={inp} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 12, padding: 14, fontSize: 15, color: '#9A8662', cursor: 'pointer' }}>ยกเลิก</button>
          <button onClick={() => onSave(name.trim(), phone.trim())} style={{ flex: 2, border: 'none', borderRadius: 12, padding: 14, background: 'linear-gradient(135deg,#4A7A2E,#2E5C1A)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>บันทึก</button>
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
  const rows = CATS.filter(c => aggData[c.key].count > 0);
  const prices = saleSession?.prices || {};
  const totalKg = (saleSession?.entries || []).reduce((s, e) => s + e.kg, 0);
  const totalBaht = rows.reduce((s, c) => s + aggData[c.key].kg * (prices[c.key] || 0), 0);

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
        {rows.map(c => {
          const d = aggData[c.key];
          const price = prices[c.key] || 0;
          return (
            <div key={c.key} style={{ display: 'grid', gridTemplateColumns: '1.3fr .7fr 1fr 1.1fr 1.2fr', alignItems: 'center', padding: '12px 14px', borderTop: '1px solid #D8ECC8' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: 14, color: '#4A3526' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.accent, display: 'inline-block', flexShrink: 0 }} />{c.key === 'custom' ? (customLabel || 'หมวดพิเศษ') : c.label}
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
        {rows.length === 0 && <div style={{ padding: '20px 14px', textAlign: 'center', color: '#B7A684', fontSize: 14 }}>ยังไม่มีรายการ — กลับไปบันทึกเข่งก่อน</div>}
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

function SalePrintView({ saleSession, onGoBack, onFinish, onEditPrice }) {
  const entries = saleSession?.entries || [];
  const prices = saleSession?.prices || {};
  const rows = CATS.filter(c => entries.some(e => e.cat === c.key));
  const aggData = {};
  CATS.forEach(c => { aggData[c.key] = { kg: 0, count: 0 }; });
  entries.forEach(e => { if (aggData[e.cat]) { aggData[e.cat].kg += e.kg; aggData[e.cat].count++; } });
  const totalKg = entries.reduce((s, e) => s + e.kg, 0);
  const totalBaht = entries.reduce((s, e) => s + e.kg * (prices[e.cat] || 0), 0);
  const customLabel = saleSession?.customLabel || '';
  const grouped = {};
  entries.forEach(e => { if (!grouped[e.cat]) grouped[e.cat] = []; grouped[e.cat].push(e); });

  return (
    <div style={{ flex: 1, padding: '16px 12px 32px', maxWidth: 520, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <div className="no-print" style={{ marginBottom: 14 }}>
        <button onClick={onGoBack} style={{ border: 'none', background: 'none', fontSize: 14, color: '#8A7A66', cursor: 'pointer', padding: '4px 0 10px' }}>{onFinish ? '‹ กลับแก้ไข' : '‹ กลับ'}</button>
        <button onClick={() => window.print()} style={{ width: '100%', border: 'none', borderRadius: 15, padding: 18, background: 'linear-gradient(135deg,#4A7A2E,#2E5C1A)', color: '#fff', fontWeight: 700, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          🖨 ปริ้นใบเสร็จ
        </button>
        <p style={{ textAlign: 'center', fontSize: 12, color: '#9A8662', margin: '8px 0 12px' }}>ขนาดกระดาษ A5 (ครึ่ง A4)</p>
        {onFinish && <button onClick={onFinish} style={{ width: '100%', border: '1px solid #4A7A2E', background: '#F0FAE8', borderRadius: 12, padding: 14, fontSize: 15, fontFamily: 'Prompt', fontWeight: 600, color: '#2E5C1A', cursor: 'pointer' }}>
          ✓ บันทึกบิลขาย
        </button>}
      </div>

      <div className="bill-doc-wrapper" style={{ maxWidth: 420, margin: '0 auto' }}>
      <div className="bill-doc" style={{ background: '#fff', border: '1px solid #E4D7BC', borderRadius: 6, boxShadow: '0 10px 30px rgba(95,70,40,.14)', padding: '22px 22px 18px', color: '#2A2118', fontSize: 13 }}>
        <div className="bill-doc-header" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, borderBottom: '2px solid #2A2118', paddingBottom: 12 }}>
          <img src="/logo.jpg" className="bill-doc-logo" style={{ width: 72, height: 72, borderRadius: 8, objectFit: 'cover' }} alt="Qudsun" />
          <div style={{ flex: 1 }}>
            <div className="bill-doc-title" style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 19, letterSpacing: '.04em' }}>ทุเรียนคัดสรร <span style={{ color: '#8A6A2E' }}>QUDSUN</span></div>
            <div style={{ fontSize: 12.5, color: '#5A4A38', marginTop: 2 }}>Premium Durian Selection</div>
          </div>
          <div style={{ textAlign: 'right', minWidth: 130 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#4A7A2E' }}>ใบเสร็จรับเงิน</div>
            <div style={{ fontSize: 12, color: '#5A4A38', marginBottom: 6 }}>เลขที่ {saleSession?.billNo}</div>
            <div style={{ fontSize: 12, color: '#3A2A18', lineHeight: 1.8 }}>
              <div>{saleSession ? dateStr(saleSession.date) : ''}</div>
              {(saleSession?.customerName || saleSession?.customerPhone) && (
                <div style={{ fontSize: 11.5, color: '#5A4A38', marginTop: 2 }}>
                  <b>{saleSession.customerName || '—'}</b>{saleSession.customerPhone ? ` · ${saleSession.customerPhone}` : ''}
                </div>
              )}
            </div>
          </div>
        </div>

        {entries.length > 0 && (() => {
          return (
            <>
              <style>{`
                @media print {
                  .sale-entries-root { margin-top: 6px !important; margin-bottom: 6px !important; }
                  .sale-entries-group { margin-bottom: 4px !important; }
                  .sale-entry-label { font-size: 9px !important; margin-bottom: 3px !important; }
                  .sale-entry-grid { gap: 2px !important; }
                  .sale-entry-chip { padding: 3px 6px !important; border-radius: 3px !important; line-height: 1.1 !important; }
                  .sale-entry-kg { font-size: 11px !important; }
                }
              `}</style>
              <div className="sale-entries-root" style={{ marginTop: 10, marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: '6px 14px', alignItems: 'flex-start' }}>
                {Object.entries(grouped).map(([catKey, ents]) => {
                  const catObj = CATS.find(c => c.key === catKey);
                  const label = catKey === 'custom' ? (customLabel || 'หมวดพิเศษ') : (catObj?.label || catKey);
                  return (
                    <div key={catKey} className="sale-entries-group" style={{ marginBottom: 0 }}>
                      <div className="sale-entry-label" style={{ fontSize: 15, color: '#5A7A38', fontWeight: 600, marginBottom: 5 }}>{label} — {ents.length} เข่ง</div>
                      <div className="sale-entry-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, max-content)', gap: 5 }}>
                        {ents.map((e, i) => (
                          <div key={e.id || i} className="sale-entry-chip" style={{ border: '1px solid #C8DFB0', borderRadius: 6, padding: '7px 12px', background: '#F5FAF0', textAlign: 'center', lineHeight: 1.15 }}>
                            <span className="sale-entry-kg" style={{ fontWeight: 700, fontSize: 20, color: '#2E5C1A' }}>{fmtKg(e.kg)}</span>
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
            <tr style={{ background: '#EAF4E0' }}>
              <th style={{ textAlign: 'left', padding: '7px 8px', border: '1px solid #C8DFB0' }}>หมวด</th>
              <th style={{ textAlign: 'right', padding: '7px 8px', border: '1px solid #C8DFB0' }}>น้ำหนัก</th>
              <th style={{ textAlign: 'right', padding: '7px 8px', border: '1px solid #C8DFB0' }}>ราคา/กก.</th>
              <th style={{ textAlign: 'right', padding: '7px 8px', border: '1px solid #C8DFB0' }}>รวม (฿)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(c => {
              const d = aggData[c.key];
              const price = prices[c.key] || 0;
              return (
                <tr key={c.key}>
                  <td style={{ padding: '6px 8px', border: '1px solid #C8DFB0' }}>
                    <div>{c.key === 'custom' ? (customLabel || 'หมวดพิเศษ') : c.label}</div>
                    {d.count > 0 && <div style={{ fontSize: 11, color: '#6A9A4E', marginTop: 1 }}>{d.count} เข่ง</div>}
                  </td>
                  <td style={{ padding: '6px 8px', border: '1px solid #C8DFB0', textAlign: 'right' }}>{fmtKg(d.kg)}</td>
                  <td style={{ padding: '6px 8px', border: '1px solid #C8DFB0', textAlign: 'right' }}>{price ? fmtPrice(price) : '—'}</td>
                  <td style={{ padding: '6px 8px', border: '1px solid #C8DFB0', textAlign: 'right' }}>{price ? fmtBaht(d.kg * price) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: '#2A2118', color: '#fff' }}>
              <td style={{ padding: 8, fontWeight: 700 }}>
                <div>รวม</div>
                <div style={{ fontSize: 11, opacity: .75, fontWeight: 400, marginTop: 1 }}>{entries.length} เข่ง</div>
              </td>
              <td style={{ padding: 8, textAlign: 'right', fontWeight: 700 }}>{fmtKg(totalKg)}</td>
              <td style={{ padding: 8 }} />
              <td style={{ padding: 8, textAlign: 'right', fontWeight: 700 }}>{totalBaht > 0 ? fmtBaht(totalBaht) : '—'}</td>
            </tr>
          </tfoot>
        </table>

        <div className="bill-doc-bank" style={{ marginTop: 12, background: '#F5FAF0', border: '1px solid #C8DFB0', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="bank-label" style={{ fontSize: 11, color: '#6A9A4E', fontWeight: 600, marginBottom: 2 }}>โอนเงินมาที่</div>
            <div className="bank-acct" style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 14, color: '#2A2118', letterSpacing: '.04em' }}>{QUDSUN_BANK.account}</div>
            <div style={{ fontSize: 12, color: '#5A4A38' }}>{QUDSUN_BANK.bank} · {QUDSUN_BANK.name}</div>
          </div>
        </div>

        <div className="bill-doc-sign" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 36, gap: 20 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div className="bill-doc-sign-line" style={{ height: 48 }} />
            <div style={{ borderTop: '1px dotted #2A2118', paddingTop: 8, fontSize: 12 }}>ลายเซ็นผู้ขาย</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div className="bill-doc-sign-line" style={{ height: 48 }} />
            <div style={{ borderTop: '1px dotted #2A2118', paddingTop: 8, fontSize: 12 }}>ลายเซ็นผู้ซื้อ</div>
          </div>
        </div>
        <div className="bill-doc-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <div>
            <div className="footer-text" style={{ fontSize: 11.5, color: '#8A7A66' }}>ขอบคุณที่ไว้วางใจ · ทุเรียนคัดสรร Qudsun</div>
            <div className="footer-text" style={{ fontSize: 11.5, color: '#8A7A66', marginTop: 2 }}>โทร. 094-149-1914 (วิน) · 082-691-4414 (เบนซ์)</div>
          </div>
          <img src="/qr-bill.png" alt="QR" className="bill-doc-qr" style={{ width: 88, height: 88, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
        </div>
      </div>
      </div>
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
function SupervisorsView({ supervisors, history, onGoHome, onOpenSupervisor, onDeleteSupervisor, pin, isEmployee }) {
  const [deleteTarget, setDeleteTarget] = useState(null);
  const supMap = {};
  Object.entries(supervisors || {}).forEach(([phone, name]) => {
    if (!name) return;
    if (!supMap[name]) supMap[name] = [];
    supMap[name].push(phone);
  });
  const list = Object.entries(supMap).sort((a, b) => b[1].length - a[1].length);
  const customers = loadCustomers(history);

  return (
    <div style={{ flex: 1, maxWidth: 720, width: '100%', margin: '0 auto', padding: '14px 14px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onGoHome} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#7A6450', cursor: 'pointer' }}>‹ หน้าหลัก</button>
        <h2 style={{ fontFamily: 'Prompt', fontWeight: 400, fontSize: 20, color: '#4A3526', margin: 0 }}>รายชื่อผู้ดูแล</h2>
      </div>

      {list.length === 0 && <div style={{ textAlign: 'center', color: '#B7A684', fontSize: 14, marginTop: 40 }}>ยังไม่มีผู้ดูแล — กำหนดผู้ดูแลได้ในหน้าข้อมูลผู้ขาย</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map(([name, phones]) => {
          const totalKg = phones.reduce((s, p) => s + (customers[p]?.totalKg || 0), 0);
          return (
            <div key={name} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 14, overflow: 'hidden' }}>
              <button onClick={() => onOpenSupervisor(name)} style={{ textAlign: 'left', background: 'none', border: 'none', width: '100%', padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#5C4326,#3F2D1E)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🧑‍💼</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: '#4A3526' }}>{name}</div>
                  <div style={{ fontSize: 12, color: '#9A8662', marginTop: 2 }}>{phones.length} ลูกค้า · รวม {fmtKg(totalKg)} กก.</div>
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
function SupervisorDetailView({ supervisorName, supervisors, history, verified, onGoBack, onOpenCustomer }) {
  const phones = Object.entries(supervisors || {}).filter(([, n]) => n === supervisorName).map(([p]) => p);
  const customers = loadCustomers(history);

  return (
    <div style={{ flex: 1, maxWidth: 720, width: '100%', margin: '0 auto', padding: '14px 14px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onGoBack} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#7A6450', cursor: 'pointer' }}>‹ ผู้ดูแล</button>
        <div>
          <div style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 18, color: '#4A3526' }}>🧑‍💼 {supervisorName}</div>
          <div style={{ fontSize: 12, color: '#9A8662' }}>{phones.length} ลูกค้าในความดูแล</div>
        </div>
      </div>

      {phones.length === 0 && <div style={{ textAlign: 'center', color: '#B7A684', fontSize: 14, marginTop: 40 }}>ไม่มีลูกค้า</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {phones.map(phone => {
          const c = customers[phone];
          const stat = customerStat(phone, history, verified);
          const tier = stat ? stat.effectiveTier : null;
          return (
            <button key={phone} onClick={() => onOpenCustomer(phone)} style={{ textAlign: 'left', border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F0E4C8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>👤</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: '#4A3526' }}>{c?.name || '—'}</div>
                <div style={{ fontSize: 12, color: '#9A8662' }}>{phone} · {c ? fmtKg(c.totalKg) + ' กก.' : '0 กก.'}</div>
                {tier && tier.key !== 'silver' && <TierBadge tier={tier} />}
              </div>
              <span style={{ color: '#C9A24B', fontSize: 18 }}>›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── CustomerDetailView ───────────────────────────────────────────────────────
function CustomerDetailView({ phone, history, verified, supervisors, vehiclePlates, customerInfo, payments, onPayment, onGoBack, onOpenHistory, onOpenVerify, onSaveSupervisor, onSaveCustomerInfo }) {
  const [editSupervisor, setEditSupervisor] = useState(false);
  const [supDraft, setSupDraft] = useState('');
  const [editInfo, setEditInfo] = useState(false);
  const [infoDraft, setInfoDraft] = useState({ bankName: '', bankAccount: '', note: '' });
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
          <button onClick={() => { setEditInfo(v => !v); setInfoDraft({ bankName: info.bankName || '', bankAccount: info.bankAccount || '', note: info.note || '' }); }} style={{ border: '1px solid #D8C8A8', background: '#F3E9D2', borderRadius: 9, padding: '5px 10px', fontSize: 12, color: '#7A5A22', cursor: 'pointer' }}>
            {editInfo ? 'ยกเลิก' : 'แก้ไข'}
          </button>
        </div>
        {!editInfo && (
          info.bankAccount
            ? <div style={{ fontSize: 13, color: '#3F2D1E', marginTop: 6 }}>
                {info.bankName && <span style={{ color: '#7A5A22', marginRight: 6 }}>{info.bankName}</span>}
                <span style={{ fontFamily: 'Prompt', fontWeight: 600, letterSpacing: '.06em' }}>{info.bankAccount}</span>
                {info.note && <div style={{ fontSize: 11, color: '#9A8662', marginTop: 3 }}>{info.note}</div>}
              </div>
            : <div style={{ fontSize: 12, color: '#B7A684', marginTop: 4 }}>ยังไม่มีข้อมูล</div>
        )}
        {editInfo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input value={infoDraft.bankName} onChange={e => setInfoDraft(d => ({ ...d, bankName: e.target.value }))} placeholder="ชื่อธนาคาร เช่น กสิกร" style={{ border: '1.5px solid #E4D7BC', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#3F2D1E', outline: 'none' }} />
            <input value={infoDraft.bankAccount} onChange={e => setInfoDraft(d => ({ ...d, bankAccount: e.target.value }))} placeholder="เลขบัญชี" style={{ border: '1.5px solid #E4D7BC', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'Prompt', letterSpacing: '.06em', color: '#3F2D1E', outline: 'none' }} />
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
function SellerModal({ name, phone, supervisor, nameLocked, supervisorLocked, onNameChange, onPhoneChange, onSupervisorChange, onUnlock, onSave, onCancel, history, verified }) {
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
        <input value={supervisor} onChange={e => !supervisorLocked && onSupervisorChange(e.target.value)} readOnly={supervisorLocked} placeholder="เช่น พี่โอ๋" style={{ width: '100%', border: '1.5px solid #E4D7BC', borderRadius: 12, padding: 14, fontSize: 16, color: supervisorLocked ? '#9A8662' : '#3F2D1E', outline: 'none', background: supervisorLocked ? '#F5F0E8' : '#fff' }} />
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
function SupervisorDetailRoute({ supervisors, history, verified, onGoBack, onOpenCustomer }) {
  const { name } = useParams();
  const decodedName = decodeURIComponent(name || '');
  if (!decodedName) return <Navigate to="/supervisors" replace />;
  return (
    <SupervisorDetailView supervisorName={decodedName} supervisors={supervisors} history={history} verified={verified}
      onGoBack={onGoBack} onOpenCustomer={onOpenCustomer} />
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
  const [vehiclePhotoUrl, setVehiclePhotoUrl] = useState(null);
  const [sales, setSales] = useState([]);
  const [accounts, setAccounts] = useState(() => storage.loadAccounts());
  const [saleSession, setSaleSession] = useState(() => storage.loadSaleSession());
  const [saleHistory, setSaleHistory] = useState([]);
  const [saleSessions, setSaleSessions] = useState([]);
  const [viewSaleSession, setViewSaleSession] = useState(null);
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
      const local = storage.loadPayments();
      const merged = { ...local };
      for (const [bn, rp] of Object.entries(remote)) {
        const lp = local[bn] || {};
        merged[bn] = { ...lp, ...rp, receiptUrl: rp.receiptUrl || lp.receiptUrl || null, slipUrl: rp.slipUrl || lp.slipUrl || null, vehicleUrl: rp.vehicleUrl || lp.vehicleUrl || null };
      }
      storage.savePayments(merged);
      setPayments(merged);
    }).catch(() => {});
    db.getVehiclePlates().then(remote => {
      const merged = { ...storage.loadVehiclePlates(), ...remote };
      storage.saveVehiclePlates(merged);
      setVehiclePlates(merged);
    }).catch(() => {});
    db.getCustomerInfo().then(remote => {
      const merged = { ...storage.loadCustomerInfo(), ...remote };
      storage.saveCustomerInfo(merged);
      setCustomerInfo(merged);
    }).catch(() => {});
    db.getSales().then(remote => {
      const local = storage.loadSales();
      const remoteIds = new Set(remote.map(s => s.id));
      const localOnly = local.filter(s => !remoteIds.has(s.id));
      const merged = [...remote, ...localOnly];
      storage.saveSales(merged); setSales(merged);
    }).catch(() => {});
    db.getVerified().then(remote => {
      const merged = { ...remote, ...storage.loadVerified() };
      storage.saveVerified(merged); setVerified(merged);
    }).catch(() => {});
    db.getBills().then(remoteBills => {
      if (!remoteBills?.length) return;
      const remoteNos = new Set(remoteBills.map(b => b.billNo));
      const deleted = storage.loadDeletedBills();
      const local = storage.loadHistory();
      const localOnly = local.filter(h => h?.billNo && !remoteNos.has(h.billNo) && !deleted.has(h.billNo));
      const merged = [...remoteBills, ...localOnly];
      storage.saveHistory(merged); setHistory(merged);
      // Also derive supervisor map from bills
      const svMap = {};
      merged.forEach(c => { const ph = c.phone || c.data?.sellerPhone || ''; const sup = c.data?.supervisor || c.supervisor || ''; if (ph && sup) svMap[ph] = sup; });
      if (Object.keys(svMap).length) { const nSv = { ...storage.loadSupervisors(), ...svMap }; storage.saveSupervisors(nSv); setSupervisors(nSv); }
    }).catch(() => {});
    db.getSaleSessions().then(remoteSessions => {
      if (!remoteSessions?.length) return;
      setSaleSessions(remoteSessions);
      const summaries = remoteSessions.map(s => {
        const totalKg = (s.entries || []).reduce((sum, e) => sum + (e.kg || 0), 0);
        const totalBaht = (s.entries || []).reduce((sum, e) => sum + (e.kg || 0) * ((s.prices || {})[e.cat] || 0), 0);
        return { billNo: s.billNo, date: s.date, customerName: s.customerName || '', customerPhone: s.customerPhone || '', kg: totalKg || s.kg || 0, baht: totalBaht || s.baht || 0 };
      });
      const local = storage.loadSaleHistory();
      const remoteNos = new Set(summaries.map(s => s.billNo));
      const localOnly = local.filter(s => s.billNo && !remoteNos.has(s.billNo));
      const merged = [...summaries, ...localOnly].sort((a, b) => (b.date || 0) - (a.date || 0));
      storage.saveSaleHistory(merged); setSaleHistory(merged);
    }).catch(() => {});
    // Sync accounts + employees from Supabase app settings
    db.getSetting('accounts').then(remote => {
      if (!Array.isArray(remote)) return;
      const local = storage.loadAccounts();
      const merged = [...new Set([...remote, ...local])];
      storage.saveAccounts(merged); setAccounts(merged);
    }).catch(() => {});
    db.getSetting('employees').then(remote => {
      if (!Array.isArray(remote) || !remote.length) return;
      const local = storage.loadEmployees();
      const remotePins = new Set(remote.map(e => e.pin));
      const localOnly = local.filter(e => e.pin && !remotePins.has(e.pin));
      const merged = [...remote, ...localOnly];
      storage.saveEmployees(merged); setEmployees(merged);
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
      const svMap = {};
      bills.forEach(c => { const ph = c.phone || c.data?.sellerPhone || ''; const sup = c.data?.supervisor || c.supervisor || ''; if (ph && sup) svMap[ph] = sup; });
      if (Object.keys(svMap).length) { const nSv = { ...storage.loadSupervisors(), ...svMap }; storage.saveSupervisors(nSv); setSupervisors(nSv); }
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
    if (sheetCI.ok) { storage.saveCustomerInfo(sheetCI.info || {}); setCustomerInfo(sheetCI.info || {}); }
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
      s.entries = [...(s.entries || []), { id: Date.now() + '-' + Math.random().toString(36).slice(2, 6), cat: activeCat, kg, t: Date.now() }];
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
    setNumpad({ mode: 'price', catKey, title: 'ราคา/กก. — ' + catLabel(catKey), unit: 'บาท/กก.', value: cur ? String(cur) : '', original: cur, canDelete: false, saveLabel: 'บันทึกราคา' });
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
  }, []);

  const handleDeleteSupervisor = useCallback((name) => {
    const nextSup = Object.fromEntries(
      Object.entries(storage.loadSupervisors()).filter(([, n]) => n !== name)
    );
    storage.saveSupervisors(nextSup);
    setSupervisors(nextSup);
  }, []);

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
      const s = { ...prev, entries: [...(prev.entries || []), { id: Date.now() + '-' + Math.random().toString(36).slice(2, 6), cat: saleActiveCat, kg, t: Date.now() }] };
      return s;
    });
    setSaleInput(''); toast('บันทึก ' + fmtKg(kg) + ' กก. แล้ว');
  }, [saleInput, saleActiveCat, toast]);

  useEffect(() => { if (saleSession) persistSaleSession(saleSession); }, [saleSession, persistSaleSession]);

  const finishSaleSession = useCallback(() => {
    if (!saleSession) return;
    const totalKg = (saleSession.entries || []).reduce((s, e) => s + e.kg, 0);
    const totalBaht = (saleSession.entries || []).reduce((s, e) => s + e.kg * ((saleSession.prices || {})[e.cat] || 0), 0);

    // Save to saleHistory (home page chat-style display)
    const summary = { billNo: saleSession.billNo, date: saleSession.date, customerName: saleSession.customerName || '', customerPhone: saleSession.customerPhone || '', kg: totalKg, baht: totalBaht };
    const nextSh = [summary, ...saleHistory];
    storage.saveSaleHistory(nextSh); setSaleHistory(nextSh);

    // Also add to sales array so SalesView KPIs + list show this bill
    const saleRecord = { id: saleSession.billNo, date: saleSession.date, buyer: saleSession.customerName || saleSession.billNo, kg: totalKg, baht: totalBaht, note: 'pending', receiptUrl: '' };
    const nextSales = [saleRecord, ...sales];
    storage.saveSales(nextSales); setSales(nextSales);
    db.upsertSale(saleRecord).catch(() => {});

    storage.saveSaleSession(null); setSaleSession(null);
    toast('บันทึกบิลขายเรียบร้อย'); navigate('/');
    db.upsertSaleSession(saleSession).catch(() => {});
  }, [saleSession, saleHistory, sales, toast, navigate]);

  const editSaleEntry = useCallback((entry) => {
    setSaleNumpad({ entryId: entry.id, catKey: entry.cat, title: 'แก้ไขเข่ง — ' + (CATS.find(c => c.key === entry.cat)?.label || entry.cat), value: String(entry.kg), canDelete: true });
  }, []);

  const setSalePrice = useCallback((catKey) => {
    const cur = saleSession?.prices?.[catKey] || 0;
    setSaleNumpad({ priceKey: catKey, title: 'ราคา — ' + (CATS.find(c => c.key === catKey)?.label || catKey), value: cur ? String(cur) : '', unit: '฿/กก.', canDelete: false });
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

  const commitFinish = useCallback((sessOverride) => {
    const s = sessOverride || session;
    if (!s) return;
    const card = { billNo: s.billNo, seller: s.seller || '-', phone: s.sellerPhone || '', date: s.date, dateText: dateStr(s.date), kg: fmtKg(grandKg(s)), baht: fmtBaht(grandBaht(s)), data: s };
    const hist = [card, ...history].slice(0, 60);
    storage.saveHistory(hist); storage.saveSession(null);
    setHistory(hist); setSession(null); navigate('/'); setVerifyPrompt(null);
    toast('บันทึกบิลเรียบร้อย');
    pushBill(card);
  }, [session, history, toast, pushBill, navigate]);

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

  const openSaleHistoryDetail = useCallback((billNo) => {
    const full = saleSessions.find(s => s.billNo === billNo);
    if (full) { setViewSaleSession(full); navigate('/sale/history'); }
    else { navigate('/sales'); }
  }, [saleSessions, navigate]);

  const goBackFromBill = useCallback(() => {
    const dest = custPhone ? '/customers/' + encodeURIComponent(custPhone) : '/';
    setSession(savedSession.current || null); savedSession.current = null;
    setReadonly(false); navigate(dest);
  }, [custPhone, navigate]);

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
        }
        e.target.value = '';
        toast('นำเข้าสำเร็จ ✓');
      } catch (err) {
        toast('ไฟล์ไม่ถูกต้อง: ' + err.message);
      }
    };
    reader.readAsText(file);
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
          <HomeView session={session} history={history} saleHistory={saleHistory} payments={payments} verified={verified} supervisors={supervisors} syncing={syncing} syncStatus={syncStatus} onSyncNow={() => syncNow(false)} onOpenSheet={() => setSheetModal(true)}
            onNew={startNew} onResume={() => { navigate('/record'); if (session?.entries?.length > 0) { setActiveCat(session.entries[session.entries.length - 1].cat); } else { setActiveCat('AB'); } }}
            onGoCustomers={() => { navigate('/customers'); syncNow(true); }}
            onGoDashboard={() => { navigate('/purchases'); syncNow(true); }}
            onGoSales={() => { navigate('/sales'); syncNow(true); }}
            onNewSale={createSaleSession}
            saleSession={saleSession}
            onResumeSale={() => navigate('/sale/record')}
            onGoSupervisors={() => { navigate('/supervisors'); syncNow(true); }}
            onChangePin={changePin} onSetEmployeePin={setEmployeePinAction}
            onOpenHistory={openHistory} onOpenSaleHistory={openSaleHistoryDetail} onPayment={handlePayment} onDeleteBill={handleDeleteBill} pin={pin} isEmployee={authRole === 'employee'} onLogout={handleLogout}
            onExport={handleExport} onImport={handleImport} />
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
            onSaveCustomerInfo={(phone, info) => { const next = { ...storage.loadCustomerInfo(), [phone]: info }; storage.saveCustomerInfo(next); setCustomerInfo(next); db.upsertCustomerInfo(phone, info).catch(() => {}); }} />
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
            customLabel={session.customLabel || ''} vehiclePhotoUrl={session.vehicleDriveUrl || vehiclePhotoUrl}
            onSaveSlip={handleSaveSlip} onUploadEvidence={readonly ? handleUploadEvidence : undefined}
            onReusePhoto={readonly ? handleReusePhoto : undefined}
            onBulkUpload={readonly ? handleBulkUpload : undefined}
            onSaveCustomerInfo={readonly ? handleSaveCustomerInfo : undefined}
            supervisors={supervisors} customerInfo={customerInfo} />
        ) : <Navigate to="/" replace />} />
        <Route path="/purchases" element={
          <DashboardView history={history} payments={payments} pin={pin} onPayment={handlePayment} onDeleteBill={handleDeleteBill} onGoHome={() => { navigate('/'); syncNow(true); }} onOpenHistory={openHistory} isEmployee={authRole === 'employee'} />
        } />
        <Route path="/sales" element={
          <SalesView history={history} sales={sales} accounts={accounts} pin={pin} onGoHome={() => navigate('/')} onAddSale={handleAddSale} onDeleteSale={handleDeleteSale} onUpdateSale={handleUpdateSale} onSaveAccount={handleSaveAccount} onOpenHistory={openHistory}
            onNewSaleSession={createSaleSession} isEmployee={authRole === 'employee'} />
        } />
        <Route path="/sale/record" element={saleSession ? (
          <SaleRecordView saleSession={saleSession} activeCat={saleActiveCat} input={saleInput} onInput={setSaleInput} onCommit={commitSaleEntry}
            onPickCat={setSaleActiveCat} onGoBack={() => navigate('/')} onGoSummary={() => navigate('/sale/summary')} onEditEntry={editSaleEntry}
            pinnedCats={pinnedCats} onOpenPinEditor={() => setPinEditorOpen(true)}
            onCustomLabelChange={label => setSaleSession(prev => ({ ...prev, customLabel: label }))}
            onEditCustomer={() => setSaleCustomerModal(true)} />
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
          <SalePrintView saleSession={viewSaleSession} onGoBack={() => { setViewSaleSession(null); navigate('/'); }} onFinish={null} />
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
            onSaveSupervisor={(phone, name) => { const ns = { ...supervisors, [phone]: name }; storage.saveSupervisors(ns); setSupervisors(ns); }}
            onSaveCustomerInfo={(phone, info) => { const next = { ...storage.loadCustomerInfo(), [phone]: info }; storage.saveCustomerInfo(next); setCustomerInfo(next); db.upsertCustomerInfo(phone, info).catch(() => {}); }}
            onOpenVerify={phone => {
              const stat = customerStat(phone, history, verified);
              setVerifyPrompt({ phone, tier: tierOf(stat.total), draft: stat.name || '', newTotal: stat.total, mode: 'manage' });
            }} />
        } />
        <Route path="/supervisors" element={
          <SupervisorsView supervisors={supervisors} history={history}
            onGoHome={() => navigate('/')}
            onOpenSupervisor={name => { setActiveSupervisor(name); navigate('/supervisors/' + encodeURIComponent(name)); }}
            onDeleteSupervisor={handleDeleteSupervisor} pin={pin} isEmployee={authRole === 'employee'} />
        } />
        <Route path="/supervisors/:name" element={
          <SupervisorDetailRoute supervisors={supervisors} history={history} verified={verified}
            onGoBack={() => navigate('/supervisors')}
            onOpenCustomer={phone => { setCustPhone(phone); navigate('/customers/' + encodeURIComponent(phone)); }} />
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {pinPrompt && <PinModal title={pinPrompt.title} error={pinError} value={pinValue} onKey={handlePinKey} onCancel={() => { setPinPrompt(null); setPinValue(''); setPinError(''); }} />}
      {numpad && <NumModal title={numpad.title} unit={numpad.unit} value={numpad.value || ''} onChange={v => setNumpad(n => ({ ...n, value: v }))} onSave={numSave} onCancel={() => setNumpad(null)} onDelete={numDelete} saveLabel={numpad.saveLabel} canDelete={numpad.canDelete} />}
      {saleNumpad && <NumModal title={saleNumpad.title} unit={saleNumpad.unit || 'กก.'} value={saleNumpad.value || ''} onChange={v => setSaleNumpad(n => ({ ...n, value: v }))} onSave={saleNumSave} onCancel={() => setSaleNumpad(null)} onDelete={saleNumDelete} saveLabel="บันทึก" canDelete={saleNumpad.canDelete} />}
      {saleCustomerModal && <SaleCustomerModal customerName={saleSession?.customerName} customerPhone={saleSession?.customerPhone} onSave={(name, phone) => { setSaleSession(prev => ({ ...prev, customerName: name, customerPhone: phone })); setSaleCustomerModal(false); }} onCancel={() => setSaleCustomerModal(false)} />}
      {sellerOpen && <SellerModal
        name={sellerDraft} phone={sellerPhoneDraft} supervisor={supervisorDraft}
        nameLocked={sellerNameLocked} supervisorLocked={sellerSupervisorLocked}
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

      {pinEditorOpen && <PinEditor pinnedCats={pinnedCats} onSave={pins => { storage.savePinnedCats(pins); setPinnedCats(pins); setPinEditorOpen(false); toast('บันทึกหมวดปักหมุดแล้ว'); }} onCancel={() => setPinEditorOpen(false)} />}
      {employeeManagerOpen && <EmployeeManager employees={employees} onSave={list => { storage.saveEmployees(list); setEmployees(list); db.saveSetting('employees', list).catch(() => {}); setEmployeeManagerOpen(false); toast('บันทึกรายชื่อพนักงานแล้ว'); }} onCancel={() => setEmployeeManagerOpen(false)} />}
      {sheetModal && <SheetModal onSyncNow={() => { syncNow(false); }} syncStatus={syncStatus} syncing={syncing} onCancel={() => setSheetModal(false)} />}

<Toast msg={toastMsg} />
    </div>
  );
}
