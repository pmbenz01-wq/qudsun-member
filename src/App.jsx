import { useState, useEffect, useCallback, useRef } from 'react';
import QRCode from 'qrcode';
import { CATS, TIERS, REQUIRE_NAME } from './utils/constants.js';
import {
  fmtKg, fmtBaht, fmtPrice, timeStr, dateStr,
  catLabel, catAccent, tierOf, tierBadge,
  agg, grandKg, grandBaht, billLink, billCode, newBillNo,
  loadCustomers, customerStat, decodeBill
} from './utils/helpers.js';
import { storage } from './utils/storage.js';
import { savePhoto, loadPhoto, resizeImage } from './utils/photoDB.js';
import html2canvas from 'html2canvas';

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
      {onConfirm && (
        <button onClick={onConfirm} style={{ width: '100%', marginTop: 10, border: 'none', borderRadius: 14, padding: 18, background: 'linear-gradient(135deg,#C9A24B,#A8763E)', color: '#fff', fontFamily: 'IBM Plex Sans Thai', fontWeight: 700, fontSize: 18, cursor: 'pointer', boxShadow: '0 8px 18px rgba(168,118,62,.32)' }}>
          {confirmLabel || '＋ บันทึกเข่งนี้'}
        </button>
      )}
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
    <div style={{ background: '#FBF6EC', borderBottom: '1px solid #E4D7BC', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <img src="/logo.jpg" alt="Qudsun" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} />
      <div>
        <div style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 15, color: '#4A3526', letterSpacing: '.04em' }}>QUDSUN</div>
        <div style={{ fontSize: 10, color: '#A6925E', letterSpacing: '.1em' }}>ระบบรับซื้อทุเรียน</div>
      </div>
    </div>
  );
}

// ─── TierBadge ────────────────────────────────────────────────────────────────
function TierBadge({ tier, size }) {
  const lg = size === 'lg';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 20, fontFamily: 'Prompt', fontWeight: 600, letterSpacing: '.04em', padding: lg ? '6px 14px' : '3px 10px', fontSize: lg ? 13 : 11, background: tierBgColor(tier), color: tierTextColor(tier) }}>
      ★ {tier.label}
    </span>
  );
}
function tierBgColor(t) {
  const m = t.badge.match(/background:([^;]+)/); return m ? m[1].trim() : '#F0E9DA';
}
function tierTextColor(t) {
  const m = t.badge.match(/color:([^;]+)/); return m ? m[1].trim() : '#A6925E';
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
function HomeView({ session, history, sheetUrl, syncStatus, syncing, onNew, onResume, onGoCustomers, onGoDashboard, onGoSupervisors, onOpenSheet, onSyncNow, onChangePin, onSetEmployeePin, onOpenHistory, verified, supervisors, isEmployee, onLogout, onExport, onImport }) {
  const customerCount = Object.keys(loadCustomers(history)).length;
  const supervisorCount = Object.values(supervisors || {}).filter(Boolean).reduce((set, n) => (set.add(n), set), new Set()).size;
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
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button onClick={onNew} style={{ flex: 1, border: 'none', borderRadius: 16, padding: '20px 14px', background: 'linear-gradient(135deg,#5C4326,#3F2D1E)', color: '#F6EEDD', cursor: 'pointer', textAlign: 'left' }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>＋</div>
          <div style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 18 }}>เปิดบิลใหม่</div>
          <div style={{ fontSize: 12, opacity: .7, marginTop: 2 }}>บันทึกรับซื้อทุเรียน</div>
        </button>
        {session && (
          <button onClick={onResume} style={{ flex: 1, border: '2px solid #C9A24B', borderRadius: 16, padding: '20px 14px', background: '#FFFDF8', color: '#4A3526', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>↩</div>
            <div style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 18 }}>ทำบิลต่อ</div>
            <div style={{ fontSize: 12, color: '#A6925E', marginTop: 2 }}>{session.billNo}</div>
          </button>
        )}
      </div>

      <button onClick={onGoDashboard} style={{ width: '100%', border: '1.5px solid #C9A24B', background: 'linear-gradient(135deg,#FBF3E2,#F5E6C8)', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <span style={{ fontSize: 22 }}>📊</span>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#4A3526' }}>Dashboard ยอดชำระ</div>
          <div style={{ fontSize: 12, color: '#9A8662' }}>โอนแล้ว / ยังไม่โอน / เงินสด</div>
        </div>
        <span style={{ marginLeft: 'auto', color: '#C9A24B', fontSize: 18 }}>›</span>
      </button>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <button onClick={onGoCustomers} style={{ flex: 1, border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 14, padding: '15px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>👥</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: '#4A3526' }}>ทะเบียนลูกค้า</div>
            <div style={{ fontSize: 12, color: '#9A8662' }}>{customerCount} ราย</div>
          </div>
          <span style={{ marginLeft: 'auto', color: '#C9A24B', fontSize: 18 }}>›</span>
        </button>
        <button onClick={onGoSupervisors} style={{ flex: 1, border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 14, padding: '15px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>🧑‍💼</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: '#4A3526' }}>ผู้ดูแล</div>
            <div style={{ fontSize: 12, color: '#9A8662' }}>{supervisorCount} คน</div>
          </div>
          <span style={{ marginLeft: 'auto', color: '#C9A24B', fontSize: 18 }}>›</span>
        </button>
      </div>

      {history.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 12px' }}>
            <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 13, letterSpacing: '.14em', color: '#A6925E' }}>ประวัติบิล</span>
            <div style={{ flex: 1, height: 1, background: '#E4D7BC' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.slice(0, 20).map((h, i) => {
              const stat = h.phone ? customerStat(h.phone, history, verified) : null;
              const tier = stat ? stat.effectiveTier : null;
              return (
                <button key={i} onClick={() => onOpenHistory(h)} style={{ textAlign: 'left', border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 13, padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: '#F0E4C8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>🧾</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#4A3526' }}>{h.billNo}</div>
                    <div style={{ fontSize: 12, color: '#9A8662', marginTop: 1 }}>
                      {h.dateText} · {h.seller || '—'} · {h.kg} กก.
                    </div>
                    {tier && tier.key !== 'new' && <TierBadge tier={tier} />}
                  </div>
                  <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 15, color: '#3F2D1E', whiteSpace: 'nowrap' }}>฿{h.baht}</span>
                </button>
              );
            })}
          </div>
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
            <div style={{ fontSize: 14, color: '#4A3526', fontWeight: 500 }}>Google Sheet {sheetUrl ? '· เชื่อมต่อแล้ว' : ''}</div>
            {syncStatus && <div style={{ fontSize: 12, color: '#9A8662', marginTop: 2 }}>{syncStatus}</div>}
          </div>
          {sheetUrl && (
            <button onClick={e => { e.stopPropagation(); onSyncNow(); }} style={{ border: '1px solid #D8C8A8', background: '#F3E9D2', borderRadius: 9, padding: '6px 10px', fontSize: 12, color: '#7A5A22', cursor: 'pointer' }}>
              {syncing ? '…' : '↺ ซิงก์'}
            </button>
          )}
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

  async function runOcr(file) {
    const sheetUrl = storage.loadSheet();
    if (!sheetUrl) { setOcrStatus('fail'); return; }
    setOcrStatus('reading');
    try {
      const dataUrl = await resizeImage(file, 800);
      const res = await fetch(sheetUrl, {
        method: 'POST',
        body: JSON.stringify({ action: 'readPlate', base64: dataUrl }),
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
          onChange={e => {
            const file = e.target.files[0];
            if (!file) return;
            onPhoto(file);
            runOcr(file);
          }} />
        <button onClick={() => fileRef.current?.click()} style={{ width: '100%', border: '1.5px dashed #C9A24B', background: '#FBF3E2', borderRadius: 12, padding: '13px 0', fontSize: 15, fontWeight: 600, color: '#7A5A22', cursor: 'pointer', marginBottom: photoUrl ? 10 : 14 }}>
          📷 {photoUrl ? 'ถ่ายภาพใหม่' : 'ถ่ายภาพทะเบียน'}
        </button>
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

function RecordView({ session, activeCat, input, onInput, onCommit, onPickCat, onGoHome, onGoSummary, onEditSeller, onEditEntry, verified, history, customLabel, onCustomLabelChange, pinnedCats, onOpenPinEditor, vehiclePhotoUrl, onVehiclePlate, onVehiclePhoto }) {
  const aggData = agg(session);
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const totalKg = grandKg(session);
  const totalCount = (session?.entries || []).length;
  const recent = (session?.entries || []).filter(e => e.cat === activeCat).slice(-5).reverse();
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
          {tier && tier.key !== 'new' && <TierBadge tier={tier} />}
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
          {vehiclePhotoUrl
            ? <img src={vehiclePhotoUrl} style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} alt="" />
            : <span style={{ fontSize: 13 }}>🚗</span>
          }
          <span style={{ fontSize: 13, fontWeight: 600, color: vehiclePlate ? '#BF360C' : '#9A8878' }}>
            {vehiclePlate || '+ ทะเบียนรถ'}
          </span>
        </div>
      </div>
      {vehicleModalOpen && (
        <VehicleModal
          plate={vehiclePlate}
          photoUrl={vehiclePhotoUrl}
          onSave={onVehiclePlate}
          onPhoto={file => { onVehiclePhoto(file); }}
          onClose={() => setVehicleModalOpen(false)}
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
          {tier && tier.key !== 'new' && <div style={{ marginTop: 10 }}><TierBadge tier={tier} size="lg" /></div>}
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
function PrintView({ session, readonly, isHandoff, verified, history, onGoSummary, onGoBack, onFinish, customLabel, vehiclePhotoUrl, onSaveSlip }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
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

  return (
    <div style={{ flex: 1, padding: '18px 14px 60px' }}>
      <div className="no-print" style={{ maxWidth: 620, margin: '0 auto 18px' }}>
        {readonly ? (
          <div style={{ background: '#F0E9DA', border: '1px solid #E0D2B4', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 22 }}>👁</span>
            <div>
              <div style={{ fontWeight: 600, color: '#7A5A22' }}>ดูบิลย้อนหลัง · อ่านอย่างเดียว</div>
              <div style={{ fontSize: 12.5, color: '#9A8662' }}>ยืนยันแล้วเมื่อ {confirmTime}</div>
            </div>
          </div>
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

        <div style={{ marginTop: 20, background: '#FFFDF8', border: '1px solid #E4D7BC', borderRadius: 16, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 18 }}>📡</span>
            <span style={{ fontWeight: 600, color: '#4A3526' }}>เครื่องปริ้นไม่ได้ต่อ Wi-Fi?</span>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: '#9A8662', lineHeight: 1.6 }}>
            ถ้ากดจดบนแท็บเล็ต/มือถือ แต่เครื่องปริ้นต่ออยู่กับคอมหลัก — ที่เครื่องคอมเปิดเว็บนี้ แล้ว<b>สแกน QR</b> หรือพิมพ์<b>รหัสบิล</b> ด้านล่าง บิลจะเด้งขึ้นพร้อมปุ่มปริ้นทันที
          </p>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{ background: '#fff', padding: 10, borderRadius: 12, border: '1px solid #E4D7BC' }}>
              {qrDataUrl
                ? <img src={qrDataUrl} alt="QR บิล" style={{ width: 160, height: 160, display: 'block', imageRendering: 'pixelated' }} />
                : <div style={{ width: 160, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B7A684', fontSize: 12, textAlign: 'center' }}>กำลังสร้าง QR…</div>
              }
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <span style={{ fontSize: 12, color: '#A6925E', display: 'block' }}>รหัสบิล (พิมพ์ที่เครื่องคอม)</span>
              <div style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 26, letterSpacing: '.18em', color: '#3F2D1E', margin: '4px 0 12px' }}>{code}</div>
              <button onClick={doCopy} style={{ border: '1px solid #D8C8A8', background: '#FBF6EC', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#7A5A22', cursor: 'pointer' }}>
                {copied ? '✓ คัดลอกแล้ว' : '📋 คัดลอกลิงก์'}
              </button>
            </div>
          </div>
        </div>

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
      <div className="bill-doc" style={{ maxWidth: 420, margin: '0 auto', background: '#fff', border: '1px solid #E4D7BC', borderRadius: 6, boxShadow: '0 10px 30px rgba(95,70,40,.14)', padding: '22px 22px 18px', color: '#2A2118', fontSize: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, borderBottom: '2px solid #2A2118', paddingBottom: 12 }}>
          <img src="/logo.jpg" style={{ width: 64, height: 'auto' }} alt="" />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Prompt', fontWeight: 600, fontSize: 17, letterSpacing: '.04em' }}>ทุเรียนคัดสรร <span style={{ color: '#8A6A2E' }}>QUDSUN</span></div>
            <div style={{ fontSize: 11, color: '#5A4A38', marginTop: 2 }}>Premium Durian Selection</div>
            <div style={{ fontSize: 11, color: '#5A4A38', marginTop: 2 }}>โทร. 082-691-4414</div>
          </div>
          <div style={{ textAlign: 'right', minWidth: 130 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>ใบรับซื้อทุเรียน</div>
            <div style={{ fontSize: 10.5, color: '#5A4A38', marginBottom: 6 }}>เลขที่ {session?.billNo}</div>
            <div style={{ fontSize: 10.5, color: '#3A2A18', lineHeight: 1.8 }}>
              <div>{session ? dateStr(session.date) : ''}</div>
              <div><b>{session?.seller || '—'}</b>{session?.sellerPhone ? ` · ${session.sellerPhone}` : ''}</div>
              {session?.vehiclePlate && <div>ทะเบียน: {session.vehiclePlate}</div>}
              {(session?.supervisor || session?.recorder) && (
                <div>{[session?.supervisor && `ผู้ดูแล: ${session.supervisor}`, session?.recorder && `ผู้จด: ${session.recorder}`].filter(Boolean).join(' · ')}</div>
              )}
            </div>
          </div>
        </div>
        {tier && tier.key !== 'new' && (
          <div style={{ margin: '-4px 0 10px', fontSize: 11, color: '#8A6A2E' }}>สมาชิกระดับ {tier.label} · ยอดสะสม {fmtKg(stat?.total || 0)} กก.</div>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
          <thead>
            <tr style={{ background: '#F0E9DA' }}>
              <th style={{ textAlign: 'left', padding: '7px 8px', border: '1px solid #C9BBA0' }}>หมวด</th>
              <th style={{ textAlign: 'center', padding: '7px 6px', border: '1px solid #C9BBA0' }}>เข่ง</th>
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
                  <td style={{ padding: '6px 8px', border: '1px solid #C9BBA0' }}>{c.key === 'custom' ? (customLabel || 'หมวดพิเศษ') : c.label}</td>
                  <td style={{ padding: '6px 6px', border: '1px solid #C9BBA0', textAlign: 'center' }}>{d.count}</td>
                  <td style={{ padding: '6px 8px', border: '1px solid #C9BBA0', textAlign: 'right' }}>{fmtKg(d.kg)}</td>
                  <td style={{ padding: '6px 8px', border: '1px solid #C9BBA0', textAlign: 'right' }}>{fmtPrice(price)}</td>
                  <td style={{ padding: '6px 8px', border: '1px solid #C9BBA0', textAlign: 'right' }}>{price ? fmtBaht(d.kg * price) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: '#2A2118', color: '#fff' }}>
              <td style={{ padding: 8, fontWeight: 700 }}>รวม</td>
              <td style={{ padding: 8, textAlign: 'center' }}>{(session?.entries || []).length}</td>
              <td style={{ padding: 8, textAlign: 'right', fontWeight: 700 }}>{fmtKg(totalKg)}</td>
              <td style={{ padding: 8 }} />
              <td style={{ padding: 8, textAlign: 'right', fontWeight: 700 }}>{fmtBaht(totalBaht)}</td>
            </tr>
          </tfoot>
        </table>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 36, gap: 20 }}>
          <div style={{ flex: 1, textAlign: 'center' }}><div style={{ borderTop: '1px dotted #2A2118', paddingTop: 6, fontSize: 11 }}>ลายเซ็นผู้ขาย</div></div>
          <div style={{ flex: 1, textAlign: 'center' }}><div style={{ borderTop: '1px dotted #2A2118', paddingTop: 6, fontSize: 11 }}>ลายเซ็นผู้ซื้อ</div></div>
        </div>
        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 10, color: '#8A7A66' }}>ขอบคุณที่ไว้วางใจ · ทุเรียนคัดสรร Qudsun · 082-691-4414</div>
      </div>
    </div>
  );
}

// ─── DashboardView ────────────────────────────────────────────────────────────
function TransferSlipModal({ bill, onConfirm, onClose }) {
  const [photoUrl, setPhotoUrl] = useState(null);
  const cameraRef = useRef();
  const galleryRef = useRef();
  const handleFile = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setPhotoUrl(ev.target.result); r.readAsDataURL(f); e.target.value = ''; };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(42,33,24,.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: '#FFFDF8', borderRadius: '20px 20px 0 0', padding: '20px 18px 28px', width: '100%', maxWidth: 480, boxShadow: '0 -8px 30px rgba(42,33,24,.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 16, color: '#3F2D1E' }}>ยืนยันการโอน</span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#9A8662' }}>✕</button>
        </div>
        <div style={{ background: '#F0E9DA', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          <div style={{ fontWeight: 700, color: '#2A2118' }}>{bill.seller || '—'}</div>
          <div style={{ color: '#5A4A38' }}>{bill.billNo} · ฿{bill.baht}</div>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
        <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
        <div style={{ display: 'flex', gap: 8, marginBottom: photoUrl ? 10 : 14 }}>
          <button onClick={() => cameraRef.current?.click()}
            style={{ flex: 1, border: '1.5px dashed #5A9A6A', background: '#EFF8F1', borderRadius: 12, padding: '13px 0', fontSize: 14, fontWeight: 600, color: '#2E7D32', cursor: 'pointer' }}>
            📷 {photoUrl ? 'ถ่ายใหม่' : 'ถ่ายรูป'}
          </button>
          <button onClick={() => galleryRef.current?.click()}
            style={{ flex: 1, border: '1.5px dashed #5A7FA8', background: '#EEF2F8', borderRadius: 12, padding: '13px 0', fontSize: 14, fontWeight: 600, color: '#1A4D80', cursor: 'pointer' }}>
            🖼️ {photoUrl ? 'เลือกใหม่' : 'อัปโหลด'}
          </button>
        </div>
        {photoUrl && <img src={photoUrl} alt="สลิป" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10, border: '1px solid #C8E6C9', marginBottom: 14, display: 'block' }} />}
        <button onClick={() => onConfirm(photoUrl)} disabled={!photoUrl}
          style={{ width: '100%', border: 'none', borderRadius: 13, padding: 15, background: photoUrl ? '#5A9A6A' : '#C8D8C8', color: '#fff', fontWeight: 700, fontSize: 16, cursor: photoUrl ? 'pointer' : 'default', marginBottom: 8 }}>
          ยืนยันโอนแล้ว ✓
        </button>
        <button onClick={() => onConfirm(null)}
          style={{ width: '100%', border: 'none', background: 'none', color: '#9A8662', fontSize: 13, cursor: 'pointer', padding: '6px 0' }}>
          ยืนยันโดยไม่มีสลิป
        </button>
      </div>
    </div>
  );
}

function DashboardView({ history, payments, onPayment, onGoHome }) {
  const [tab, setTab] = useState('unpaid');
  const [transferBill, setTransferBill] = useState(null);

  const bills = history.map(h => ({ ...h, pay: payments[h.billNo] || { status: 'unpaid' } }));
  const unpaid      = bills.filter(b => b.pay.status === 'unpaid');
  const transferred = bills.filter(b => b.pay.status === 'transferred');
  const cash        = bills.filter(b => b.pay.status === 'cash');

  const sumBaht = arr => arr.reduce((s, b) => s + (parseFloat((b.baht || '0').replace(/,/g, '')) || 0), 0);
  const fmt = n => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const displayed = tab === 'unpaid' ? unpaid : tab === 'transferred' ? transferred : tab === 'cash' ? cash : bills;

  const SummaryCard = ({ label, amount, color, active, onClick }) => (
    <div onClick={onClick} style={{ flex: 1, background: active ? color : '#FBF6EC', border: `1.5px solid ${color}`, borderRadius: 14, padding: '12px 10px', textAlign: 'center', cursor: 'pointer' }}>
      <div style={{ fontSize: 10, color: active ? '#fff' : '#7A6450', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: active ? '#fff' : '#2A2118' }}>฿{fmt(amount)}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100dvh', background: '#F5EFE3', paddingBottom: 32 }}>
      <div style={{ background: '#3F2D1E', padding: '18px 18px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onGoHome} style={{ border: 'none', background: 'none', color: '#F6EEDD', fontSize: 20, cursor: 'pointer', padding: 0 }}>‹</button>
        <span style={{ fontFamily: 'Prompt', fontWeight: 700, fontSize: 18, color: '#F6EEDD' }}>Dashboard ยอดชำระ</span>
      </div>

      <div style={{ padding: '16px 14px 8px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <SummaryCard label="ยังไม่โอน" amount={sumBaht(unpaid)} color="#E07A5F" active={tab==='unpaid'} onClick={() => setTab('unpaid')} />
          <SummaryCard label="โอนแล้ว" amount={sumBaht(transferred)} color="#5A9A6A" active={tab==='transferred'} onClick={() => setTab('transferred')} />
          <SummaryCard label="เงินสด" amount={sumBaht(cash)} color="#5A7FA8" active={tab==='cash'} onClick={() => setTab('cash')} />
        </div>

        {displayed.length === 0 && (
          <div style={{ textAlign: 'center', color: '#A6925E', padding: '40px 0', fontSize: 14 }}>ไม่มีรายการ</div>
        )}

        {displayed.map(b => (
          <div key={b.billNo} style={{ background: '#FFFDF8', borderRadius: 14, padding: '14px 14px 12px', marginBottom: 10, border: '1px solid #E4D7BC' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#2A2118' }}>{b.seller || '—'}</div>
                <div style={{ fontSize: 11, color: '#8A7A66', marginTop: 2 }}>{b.billNo} · {b.dateText} · {b.kg} กก.</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#3F2D1E' }}>฿{b.baht}</div>
                <div style={{ fontSize: 10, marginTop: 2, padding: '2px 8px', borderRadius: 8, display: 'inline-block',
                  background: b.pay.status === 'unpaid' ? '#FDECEA' : b.pay.status === 'transferred' ? '#E6F4EA' : '#E8EEF8',
                  color: b.pay.status === 'unpaid' ? '#C0392B' : b.pay.status === 'transferred' ? '#2E7D32' : '#1A4D80' }}>
                  {b.pay.status === 'unpaid' ? 'ยังไม่โอน' : b.pay.status === 'transferred' ? 'โอนแล้ว' : 'เงินสด'}
                </div>
              </div>
            </div>
            {b.pay.status === 'unpaid' ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setTransferBill(b)}
                  style={{ flex: 1, border: 'none', borderRadius: 10, padding: '9px 0', background: '#5A9A6A', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  โอนแล้ว ✓
                </button>
                <button onClick={() => onPayment(b.billNo, 'cash')}
                  style={{ flex: 1, border: 'none', borderRadius: 10, padding: '9px 0', background: '#5A7FA8', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  เงินสด ✓
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {b.pay.slipUrl && <img src={b.pay.slipUrl} alt="สลิป" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid #C8E6C9', flexShrink: 0 }} />}
                <button onClick={() => onPayment(b.billNo, 'unpaid')}
                  style={{ flex: 1, border: '1px solid #D0C8C0', borderRadius: 10, padding: '8px 0', background: '#fff', color: '#8A7A66', fontSize: 12, cursor: 'pointer' }}>
                  ยกเลิกการชำระ
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {transferBill && (
        <TransferSlipModal bill={transferBill}
          onConfirm={(slipPhotoUrl) => { onPayment(transferBill.billNo, 'transferred', slipPhotoUrl); setTransferBill(null); }}
          onClose={() => setTransferBill(null)} />
      )}
    </div>
  );
}

// ─── CustomersView ────────────────────────────────────────────────────────────
function CustomersView({ history, verified, onGoHome, onOpenCustomer }) {
  const customers = loadCustomers(history);
  const list = Object.values(customers).sort((a, b) => b.totalKg - a.totalKg);

  return (
    <div style={{ flex: 1, maxWidth: 720, width: '100%', margin: '0 auto', padding: '14px 14px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onGoHome} style={{ border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#7A6450', cursor: 'pointer' }}>‹ หน้าหลัก</button>
        <h2 style={{ fontFamily: 'Prompt', fontWeight: 400, fontSize: 20, color: '#4A3526', margin: 0 }}>ทะเบียนลูกค้า</h2>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {TIERS.map(t => (
          <span key={t.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 20, fontFamily: 'Prompt', fontWeight: 600, letterSpacing: '.04em', padding: '3px 10px', fontSize: 11, background: tierBgColor(t), color: tierTextColor(t) }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.dot, display: 'inline-block' }} />
            {t.label} {t.min > 0 ? `≥${t.min.toLocaleString()} กก.` : ''}
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
            <button key={c.phone} onClick={() => onOpenCustomer(c.phone)} style={{ textAlign: 'left', border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 14, padding: '14px 16px', cursor: 'pointer' }}>
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
          );
        })}
      </div>
    </div>
  );
}

// ─── SupervisorsView ──────────────────────────────────────────────────────────
function SupervisorsView({ supervisors, history, onGoHome, onOpenSupervisor }) {
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
            <button key={name} onClick={() => onOpenSupervisor(name)} style={{ textAlign: 'left', border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#5C4326,#3F2D1E)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🧑‍💼</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: '#4A3526' }}>{name}</div>
                <div style={{ fontSize: 12, color: '#9A8662', marginTop: 2 }}>{phones.length} ลูกค้า · รวม {fmtKg(totalKg)} กก.</div>
              </div>
              <span style={{ color: '#C9A24B', fontSize: 18 }}>›</span>
            </button>
          );
        })}
      </div>
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
                {tier && tier.key !== 'new' && <TierBadge tier={tier} />}
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
function CustomerDetailView({ phone, history, verified, supervisors, onGoBack, onOpenHistory, onOpenVerify, onSaveSupervisor }) {
  const [editSupervisor, setEditSupervisor] = useState(false);
  const [supDraft, setSupDraft] = useState('');
  const stat = customerStat(phone, history, verified);
  if (!stat) return null;
  const tier = stat.effectiveTier;
  const rawTier = stat.tier;
  const needName = REQUIRE_NAME[rawTier.key] && !stat.verified;
  const verifiedName = verified[phone];
  const currentSupervisor = supervisors?.[phone] || '';
  const pct = stat.next ? Math.min(100, (stat.total / stat.next.min) * 100) : 100;
  const bills = history.filter(h => String(h.phone || '').trim() === phone);

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

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 12px' }}>
        <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 13, letterSpacing: '.14em', color: '#A6925E' }}>บิลของลูกค้ารายนี้</span>
        <div style={{ flex: 1, height: 1, background: '#E4D7BC' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {bills.map((h, i) => (
          <button key={i} onClick={() => onOpenHistory(h)} style={{ textAlign: 'left', border: '1px solid #E4D7BC', background: '#FFFDF8', borderRadius: 13, padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 9, background: '#F0E4C8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>🧾</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#4A3526' }}>{h.billNo}</div>
              <div style={{ fontSize: 12, color: '#9A8662' }}>{h.dateText} · {h.kg} กก.</div>
            </div>
            <span style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 15, color: '#3F2D1E' }}>฿{h.baht}</span>
          </button>
        ))}
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
        {tier && tier.key !== 'new' && stat && (
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
function SheetModal({ url, onUrlChange, onSave, onCancel }) {
  return (
    <div className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 62, background: 'rgba(42,33,24,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, animation: 'fadeIn .2s' }}>
      <div style={{ background: '#FFFDF8', borderRadius: 20, padding: 24, width: '100%', maxWidth: 430, animation: 'popIn .25s' }}>
        <div style={{ fontFamily: 'Prompt', fontWeight: 500, fontSize: 18, color: '#4A3526', marginBottom: 10 }}>เชื่อมต่อ Google Sheet</div>
        <p style={{ fontSize: 12.5, color: '#9A8662', lineHeight: 1.7, margin: '0 0 6px' }}>วางลิงก์ Web App (ลงท้ายด้วย <b style={{ color: '#7A5A22' }}>/exec</b>) ที่ได้จากการ Deploy สคริปต์ใน Google Sheet ของคุณ</p>
        <input value={url} onChange={e => onUrlChange(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" inputMode="url" style={{ width: '100%', border: '1.5px solid #E4D7BC', borderRadius: 12, padding: '12px 13px', fontSize: 13, color: '#4A3526', outline: 'none', boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={onCancel} style={{ flex: 1, border: '1px solid #E4D7BC', background: '#fff', borderRadius: 12, padding: 13, color: '#7A6450', fontSize: 14, cursor: 'pointer' }}>ยกเลิก</button>
          <button onClick={onSave} style={{ flex: 1.4, border: 'none', borderRadius: 12, padding: 13, background: 'linear-gradient(135deg,#C9A24B,#A8763E)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>บันทึก & ซิงก์</button>
        </div>
        <p style={{ fontSize: 11, color: '#C8B998', margin: '12px 0 0', lineHeight: 1.6 }}>เว้นว่างแล้วกดบันทึก = เลิกเชื่อมต่อ (ข้อมูลยังอยู่ในเครื่อง)</p>
      </div>
    </div>
  );
}

// ─── App (root) ───────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState('home');
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
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetModal, setSheetModal] = useState(false);
  const [sheetModalUrl, setSheetModalUrl] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const [vehiclePlates, setVehiclePlates] = useState({});
  const [payments, setPayments] = useState({});
  const [vehiclePhotoUrl, setVehiclePhotoUrl] = useState(null);
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
    }
    // Drive upload now happens here so we have the plate in the filename
    const dataUrl = pendingPhotoDataUrl.current;
    if (dataUrl) {
      const url = storage.loadSheet();
      if (url) {
        const now = new Date();
        const datePart = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
        const timePart = `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
        const namePart = (session?.seller || 'ไม่ระบุ').replace(/[^ก-๙a-zA-Z0-9]/g, '_');
        const phonePart = session?.sellerPhone || 'nophone';
        const platePart = plate.replace(/\s+/g, '') || 'noplate';
        const filename = `${namePart}_${phonePart}_${platePart}_${datePart}_${timePart}.jpg`;
        toast('กำลัง upload Drive…');
        fetch(url, {
          method: 'POST',
          body: JSON.stringify({ action: 'uploadPhoto', base64: dataUrl, filename }),
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
    } catch { toast('ถ่ายภาพไม่สำเร็จ'); }
  }, [session, updateSession, toast]);

  // Init
  useEffect(() => {
    const s = storage.loadSession();
    const h = storage.loadHistory();
    const p = storage.loadPin();
    const v = storage.loadVerified();
    const su = storage.loadSheet();
    const sv = storage.loadSupervisors();
    const ep = storage.loadEmployeePin();
    const emps = storage.loadEmployees();
    const savedRole = sessionStorage.getItem('qudsun_role');
    const savedRecorder = sessionStorage.getItem('qudsun_recorder') || '';
    const pc = storage.loadPinnedCats();
    const vp = storage.loadVehiclePlates();
    const pm = storage.loadPayments();
    setHistory(h); setPin(p); setVerified(v); setSupervisors(sv); setEmployeePin(ep); setPinnedCats(pc); setEmployees(emps); setVehiclePlates(vp); setPayments(pm);
    if (savedRole) { setAuthRole(savedRole); setRecorderName(savedRecorder); }
    if (s) { setSession(s); if (s.vehiclePhotoKey) loadPhoto(s.vehiclePhotoKey).then(u => { if (u) setVehiclePhotoUrl(u); }); }
    if (su) { setSheetUrl(su); setTimeout(() => syncNow(true), 1500); }
    const m = (location.hash || '').match(/bill=([^&]+)/);
    if (m) {
      try {
        const data = decodeBill(m[1]);
        setIsHandoff(true); setSession(data); setScreen('print');
      } catch {}
    }
  }, []);

  // Google Sheet
  const syncNow = useCallback(async (silent) => {
    const url = storage.loadSheet();
    if (!url) { if (!silent) toast('ยังไม่ได้เชื่อมต่อ Google Sheet'); return; }
    setSyncing(true); setSyncStatus('กำลังซิงก์…');
    try {
      const res = await fetch(url, { method: 'GET' });
      const data = await res.json();
      if (!data?.ok) throw new Error('bad');
      const remote = (data.bills || []).map(b => { try { return JSON.parse(b.json); } catch { return null; } }).filter(Boolean);
      const remoteNos = new Set(remote.map(c => c.billNo));
      const current = storage.loadHistory();
      const localOnly = current.filter(c => c?.billNo && !remoteNos.has(c.billNo));
      const byNo = {};
      remote.forEach(c => { if (c?.billNo) byNo[c.billNo] = c; });
      current.forEach(c => { if (c?.billNo) byNo[c.billNo] = c; });
      const merged = Object.values(byNo).sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, 300);
      if (data.verified) { const nv = { ...storage.loadVerified(), ...data.verified }; storage.saveVerified(nv); setVerified(nv); }
      // rebuild supervisors from synced bill data
      const svFromSync = {};
      merged.forEach(c => { const ph = c.phone || c.sellerPhone || ''; const sup = (c.data && c.data.supervisor) || c.supervisor || ''; if (ph && sup) svFromSync[ph] = sup; });
      if (Object.keys(svFromSync).length) { const nSv = { ...storage.loadSupervisors(), ...svFromSync }; storage.saveSupervisors(nSv); setSupervisors(nSv); }
      storage.saveHistory(merged); setHistory(merged);
      setSyncStatus('✓ ซิงก์แล้ว ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }));
      localOnly.forEach(c => pushBill(c, true, url));
    } catch {
      setSyncStatus('⚠ ซิงก์ไม่สำเร็จ');
    }
    setSyncing(false);
  }, [toast]); // eslint-disable-line

  const pushBill = useCallback(async (card, quiet, urlOverride) => {
    const url = urlOverride || storage.loadSheet();
    if (!url || !card) return;
    try {
      await fetch(url, { method: 'POST', body: JSON.stringify({ action: 'bill', bill: { billNo: card.billNo, date: card.date, dateText: card.dateText, seller: card.seller, phone: card.phone, kg: card.kg, baht: card.baht, json: JSON.stringify(card) } }) });
      if (!quiet) setSyncStatus('✓ บันทึกขึ้นชีตแล้ว ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }));
    } catch { if (!quiet) setSyncStatus('⚠ อัปโหลดไม่สำเร็จ'); }
  }, []);

  const pushVerify = useCallback(async (phone, name) => {
    const url = storage.loadSheet(); if (!url) return;
    try { await fetch(url, { method: 'POST', body: JSON.stringify({ action: 'verify', phone, name }) }); } catch {}
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
    const recorder = sessionStorage.getItem('qudsun_recorder') || recorderName || '';
    const vp = storage.loadVehiclePlates();
    const vehiclePlate = (sellerPhone && vp[sellerPhone]) ? vp[sellerPhone] : '';
    const sess = { id: t, billNo: newBillNo(), createdAt: t, date: t, seller, sellerPhone, supervisor, recorder, vehiclePlate, vehiclePhotoKey: null, prices: Object.fromEntries(CATS.map(c => [c.key, 0])), entries: [], log: [{ t, kind: 'open', text: 'เปิดใบรับซื้อใหม่' }], confirmed: false, confirmedAt: null, customLabel: '' };
    setVehiclePhotoUrl(null);
    setSession(sess); persistSession(sess); setScreen('record'); setActiveCat('AB'); setInput('');
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

  const handlePayment = useCallback((billNo, status, slipPhotoUrl) => {
    const next = { ...storage.loadPayments(), [billNo]: { status, paidAt: Date.now(), ...(slipPhotoUrl ? { slipUrl: slipPhotoUrl } : {}) } };
    if (status === 'unpaid') delete next[billNo];
    storage.savePayments(next);
    setPayments(next);
  }, []);

  const handleSaveSlip = useCallback((dataUrl) => {
    const url = storage.loadSheet();
    if (!url || !session) return;
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const timePart = `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    const namePart = (session.seller || 'ไม่ระบุ').replace(/[^ก-๙a-zA-Z0-9]/g, '_');
    const phonePart = session.sellerPhone || 'nophone';
    const filename = `slip_${namePart}_${phonePart}_${datePart}_${timePart}.jpg`;
    fetch(url, { method: 'POST', body: JSON.stringify({ action: 'uploadPhoto', base64: dataUrl, filename, folder: 'QudsunSlips' }) }).catch(() => {});
  }, [session]);

  const doConfirm = useCallback(() => {
    updateSession(prev => {
      const s = { ...prev, confirmed: true, confirmedAt: Date.now() };
      addLog(s, 'confirm', 'ลูกค้ายืนยันยอด ฿' + fmtBaht(grandBaht(s)));
      return s;
    });
    setScreen('print');
  }, [updateSession]);

  const commitFinish = useCallback((sessOverride) => {
    const s = sessOverride || session;
    if (!s) return;
    const card = { billNo: s.billNo, seller: s.seller || '-', phone: s.sellerPhone || '', date: s.date, dateText: dateStr(s.date), kg: fmtKg(grandKg(s)), baht: fmtBaht(grandBaht(s)), data: s };
    const hist = [card, ...history].slice(0, 60);
    storage.saveHistory(hist); storage.saveSession(null);
    setHistory(hist); setSession(null); setScreen('home'); setVerifyPrompt(null);
    toast('บันทึกบิลเรียบร้อย');
    pushBill(card);
  }, [session, history, toast, pushBill]);

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
    setIsHandoff(false); setSession(card.data); setScreen('print'); setReadonly(true);
    if (!fromCust) setCustPhone(null);
  }, [session]);

  const goBackFromBill = useCallback(() => {
    const back = custPhone ? 'customerDetail' : 'home';
    setSession(savedSession.current || null); savedSession.current = null;
    setReadonly(false); setScreen(back);
  }, [custPhone]);

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
      setAuthRole('admin'); sessionStorage.setItem('qudsun_role', 'admin'); setLoginError('');
      const name = 'Admin';
      setRecorderName(name); sessionStorage.setItem('qudsun_recorder', name);
    } else {
      const emp = employees.find(e => e.pin === entered);
      if (emp) {
        setAuthRole('employee'); sessionStorage.setItem('qudsun_role', 'employee'); setLoginError('');
        setRecorderName(emp.name); sessionStorage.setItem('qudsun_recorder', emp.name);
      } else if (employeePin && entered === employeePin) {
        setAuthRole('employee'); sessionStorage.setItem('qudsun_role', 'employee'); setLoginError('');
        setRecorderName('พนักงาน'); sessionStorage.setItem('qudsun_recorder', 'พนักงาน');
      } else {
        setLoginError('รหัสไม่ถูกต้อง ลองใหม่');
      }
    }
  }, [pin, employeePin, employees]);

  const handleLogout = useCallback(() => {
    setAuthRole(null); setRecorderName('');
    sessionStorage.removeItem('qudsun_role'); sessionStorage.removeItem('qudsun_recorder');
  }, []);

  const sheetSave = () => {
    const url = String(sheetModalUrl || '').trim();
    if (url && !/^https:\/\/script\.google\.com\/.+\/exec/.test(url)) { toast('ลิงก์ไม่ถูกต้อง — ต้องลงท้ายด้วย /exec'); return; }
    storage.saveSheet(url); setSheetUrl(url); setSheetModal(false); setSyncStatus('');
    if (url) { toast('เชื่อมต่อแล้ว · กำลังซิงก์ข้อมูล'); setTimeout(() => syncNow(), 60); }
    else toast('ยกเลิกการเชื่อมต่อแล้ว');
  };

  if (!authRole) {
    return <LoginScreen onLogin={handleLogin} error={loginError} onErrorClear={() => setLoginError('')} />;
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#EFE6D4' }}>
      <Header />

      {screen === 'home' && (
        <HomeView session={session} history={history} verified={verified} supervisors={supervisors} sheetUrl={sheetUrl} syncStatus={syncStatus} syncing={syncing}
          onNew={startNew} onResume={() => setScreen('record')} onGoCustomers={() => setScreen('customers')}
          onGoDashboard={() => setScreen('dashboard')}
          onGoSupervisors={() => setScreen('supervisors')}
          onOpenSheet={() => { setSheetModal(true); setSheetModalUrl(sheetUrl); }}
          onSyncNow={() => syncNow(false)} onChangePin={changePin} onSetEmployeePin={setEmployeePinAction}
          onOpenHistory={openHistory} isEmployee={authRole === 'employee'} onLogout={handleLogout}
          onExport={handleExport} onImport={handleImport} />
      )}
      {screen === 'record' && session && (
        <RecordView session={session} activeCat={activeCat} input={input} onInput={setInput} onCommit={commitEntry}
          onPickCat={setActiveCat} onGoHome={() => setScreen('home')} onGoSummary={() => setScreen('summary')}
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
          vehiclePhotoUrl={vehiclePhotoUrl} onVehiclePlate={handleVehiclePlate} onVehiclePhoto={handleVehiclePhoto} />
      )}
      {screen === 'summary' && session && (
        <SummaryView session={session} logOpen={logOpen}
          onGoRecord={() => setScreen('record')} onGoConfirm={() => setScreen('confirm')}
          onSetPrice={openSetPrice} onToggleLog={() => setLogOpen(v => !v)}
          customLabel={session.customLabel || ''} />
      )}
      {screen === 'confirm' && session && (
        <ConfirmView session={session} verified={verified} history={history}
          onConfirm={doConfirm} onGoSummary={() => setScreen('summary')}
          customLabel={session.customLabel || ''} />
      )}
      {screen === 'print' && session && (
        <PrintView session={session} readonly={readonly} isHandoff={isHandoff} verified={verified} history={history}
          onGoSummary={() => setScreen('summary')} onGoBack={goBackFromBill} onFinish={finishBill}
          customLabel={session.customLabel || ''} vehiclePhotoUrl={session.vehicleDriveUrl || vehiclePhotoUrl}
          onSaveSlip={handleSaveSlip} />
      )}
      {screen === 'dashboard' && (
        <DashboardView history={history} payments={payments} onPayment={handlePayment} onGoHome={() => setScreen('home')} />
      )}
      {screen === 'customers' && (
        <CustomersView history={history} verified={verified} onGoHome={() => setScreen('home')}
          onOpenCustomer={phone => { setCustPhone(phone); setScreen('customerDetail'); }} />
      )}
      {screen === 'supervisors' && (
        <SupervisorsView supervisors={supervisors} history={history}
          onGoHome={() => setScreen('home')}
          onOpenSupervisor={name => { setActiveSupervisor(name); setScreen('supervisorDetail'); }} />
      )}
      {screen === 'supervisorDetail' && activeSupervisor && (
        <SupervisorDetailView supervisorName={activeSupervisor} supervisors={supervisors} history={history} verified={verified}
          onGoBack={() => setScreen('supervisors')}
          onOpenCustomer={phone => { setCustPhone(phone); setScreen('customerDetail'); }} />
      )}
      {screen === 'customerDetail' && custPhone && (
        <CustomerDetailView phone={custPhone} history={history} verified={verified} supervisors={supervisors}
          onGoBack={() => setScreen('customers')} onOpenHistory={card => openHistory(card, true)}
          onSaveSupervisor={(phone, name) => { const ns = { ...supervisors, [phone]: name }; storage.saveSupervisors(ns); setSupervisors(ns); }}
          onOpenVerify={phone => {
            const stat = customerStat(phone, history, verified);
            setVerifyPrompt({ phone, tier: tierOf(stat.total), draft: stat.name || '', newTotal: stat.total, mode: 'manage' });
          }} />
      )}

      {pinPrompt && <PinModal title={pinPrompt.title} error={pinError} value={pinValue} onKey={handlePinKey} onCancel={() => { setPinPrompt(null); setPinValue(''); setPinError(''); }} />}
      {numpad && <NumModal title={numpad.title} unit={numpad.unit} value={numpad.value || ''} onChange={v => setNumpad(n => ({ ...n, value: v }))} onSave={numSave} onCancel={() => setNumpad(null)} onDelete={numDelete} saveLabel={numpad.saveLabel} canDelete={numpad.canDelete} />}
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
      {sheetModal && <SheetModal url={sheetModalUrl} onUrlChange={setSheetModalUrl} onSave={sheetSave} onCancel={() => setSheetModal(false)} />}
      {pinEditorOpen && <PinEditor pinnedCats={pinnedCats} onSave={pins => { storage.savePinnedCats(pins); setPinnedCats(pins); setPinEditorOpen(false); toast('บันทึกหมวดปักหมุดแล้ว'); }} onCancel={() => setPinEditorOpen(false)} />}
      {employeeManagerOpen && <EmployeeManager employees={employees} onSave={list => { storage.saveEmployees(list); setEmployees(list); setEmployeeManagerOpen(false); toast('บันทึกรายชื่อพนักงานแล้ว'); }} onCancel={() => setEmployeeManagerOpen(false)} />}

      <Toast msg={toastMsg} />
    </div>
  );
}
