// fields.jsx — reusable masked phone + city picker
import React from 'react';
import { Icon } from './icons.jsx';
import { Sheet } from './ui.jsx';
import { CITIES as ALL_CITIES, VLADIMIR_REGION } from './cities.js';

// Список городов один на всё приложение — здесь был свой, разошедшийся
// с cities.js: во Владимире объявление создать было нельзя, а в фильтре
// он был.
export const CITIES = [...ALL_CITIES, 'Удалённо'];

const inputStyle = {
  width: '100%', padding: '13px 16px', border: '1.5px solid var(--line)', borderRadius: 14,
  fontSize: 15, fontFamily: 'var(--font)', background: '#fff', color: 'var(--ink)',
  outline: 'none', transition: 'border-color .15s', boxSizing: 'border-box',
};

// "+7 (999) 123-45-67" mask (RU). Accepts 8/9/digits-only input, keeps 11 digits.
export function formatPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('8')) d = '7' + d.slice(1);
  if (!d.startsWith('7')) d = '7' + d;
  d = d.slice(0, 11);
  let out = '+7';
  if (d.length > 1) out += ' (' + d.slice(1, 4);
  if (d.length >= 4) out += ')';
  if (d.length > 4) out += ' ' + d.slice(4, 7);
  if (d.length >= 7) out += '-' + d.slice(7, 9);
  if (d.length >= 9) out += '-' + d.slice(9, 11);
  return out;
}

export function PhoneField({ label = 'Телефон', value, onChange, autoComplete = 'tel' }) {
  return (
    <div className="col gap6">
      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>{label}</label>
      <input
        type="tel"
        inputMode="tel"
        value={value}
        autoComplete={autoComplete}
        placeholder="+7 (___) ___-__-__"
        onChange={e => onChange(formatPhone(e.target.value))}
        onFocus={e => e.target.style.borderColor = 'var(--berry)'}
        onBlur={e => e.target.style.borderColor = 'var(--line)'}
        style={inputStyle}
      />
    </div>
  );
}

export function CityField({ label = 'Город', value, onChange, placeholder = 'Выберите город' }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [custom, setCustom] = React.useState('');
  const [customOpen, setCustomOpen] = React.useState(false);
  const ql = q.toLowerCase();
  const matches = CITIES.filter(c => c.toLowerCase().includes(ql));
  // домашний регион — вверх списка, иначе «Ковров» ищется среди полусотни
  const home = matches.filter(c => VLADIMIR_REGION.includes(c));
  const rest = matches.filter(c => !VLADIMIR_REGION.includes(c));
  const list = [...home, ...rest];

  return (
    <div className="col gap6">
      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>{label}</label>
      <button
        type="button"
        onClick={() => { setOpen(true); setQ(''); setCustom(''); setCustomOpen(false); }}
        style={{ ...inputStyle, textAlign: 'left', cursor: 'pointer', color: value ? 'var(--ink)' : 'var(--ink-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span>{value || placeholder}</span>
        <Icon name="chevD" size={16} color="var(--ink-3)" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Выберите город">
        <div className="px col gap10" style={{ paddingBottom: 10 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск города" style={inputStyle} />
          <div className="col" style={{ maxHeight: 360, overflowY: 'auto', gap: 2 }}>
            {list.map(c => (
              <button key={c} type="button" onClick={() => { onChange(c); setOpen(false); }}
                style={{ textAlign: 'left', padding: '12px 12px', border: 'none', background: value === c ? 'var(--berry-50)' : 'transparent', borderRadius: 10, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 15, color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{c}</span>
                {value === c && <Icon name="check" size={16} color="var(--berry)" />}
              </button>
            ))}
            {!list.length && <span className="cap" style={{ padding: 10, color: 'var(--ink-3)' }}>Ничего не найдено</span>}
          </div>

          <div className="divider" />
          {customOpen ? (
            <div className="col gap8">
              <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="Введите город" style={inputStyle} autoFocus />
              <button className="btn btn-primary" onClick={() => { if (custom.trim()) onChange(custom.trim()); setOpen(false); }} disabled={!custom.trim()}>
                Готово
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setCustomOpen(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 14, fontWeight: 600, color: 'var(--berry)', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 2px' }}>
              <Icon name="plusCircle" size={16} color="var(--berry)" />Указать свой город
            </button>
          )}
        </div>
      </Sheet>
    </div>
  );
}
