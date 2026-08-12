// screen-profile.jsx — user profile screen
import React from 'react';
import { Icon } from './icons.jsx';
import { WISH_GROUPS, ALL_WISHES } from './wishes.js';
import { Logo, Credit, AppBar, IconBtn, TabBar, Photo, Sheet, LotCard, PullToRefresh } from './ui.jsx';
import { updateProfileAction, updateAvatarAction, changePasswordAction, updateSettingsAction, broadcastInfoAction, broadcastAction } from './server/actions.js';
import { enablePush, disablePush, pushState } from './pwa.jsx';
import { PhoneField, CityField } from './fields.jsx';

function StatBox({ value, label }) {
  return (
    <div className="col" style={{ alignItems: 'center', gap: 3, flex: 1 }}>
      <span style={{ fontSize: 22, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.03em' }}>{value}</span>
      <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function SettingsRow({ icon, label, sub, onClick, danger, right }) {
  return (
    <div
      className="row"
      onClick={onClick}
      style={{ padding: '14px 18px', gap: 14, alignItems: 'center', cursor: onClick ? 'pointer' : 'default', background: '#fff' }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: danger ? 'var(--berry-50)' : 'var(--line-2)', flex: 'none',
      }}>
        <Icon name={icon} size={18} color={danger ? 'var(--berry)' : 'var(--ink-2)'} />
      </div>
      <div className="col grow" style={{ gap: 1 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: danger ? 'var(--berry)' : 'var(--ink)' }}>{label}</span>
        {sub && <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{sub}</span>}
      </div>
      {right || <Icon name="chevR" size={18} color="var(--ink-3)" />}
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <div style={{ padding: '20px 18px 8px' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--line)', marginLeft: 68 }} />;
}

function GroupCard({ children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', margin: '0 16px', boxShadow: 'var(--sh-1)' }}>
      {children}
    </div>
  );
}

const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${d} ${months[(m || 1) - 1]}`;
};

const fieldStyle = { width: '100%', padding: '12px 14px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 15, fontFamily: 'var(--font)', background: '#fff', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' };

function Switch({ on, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!on}
      onClick={() => onChange(!on)}
      style={{
        position: 'relative', width: 42, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer',
        padding: 0, flex: 'none', transition: 'background .15s', background: on ? 'var(--berry)' : 'var(--line)',
      }}
    >
      <i style={{
        position: 'absolute', top: 3, left: 3, width: 18, height: 18, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'transform .15s', transform: on ? 'translateX(18px)' : 'none',
      }} />
    </button>
  );
}

const ERR_BOX = { padding: '10px 14px', borderRadius: 12, background: 'var(--berry-50)', border: '1px solid var(--berry-200)', color: 'var(--berry-700)', fontSize: 13.5, fontWeight: 500 };

// Вишлист. Хранится по-прежнему одной строкой через запятую — на неё завязаны
// умный мэтчинг (myWants) и подсказки ИИ при создании объявления, — но
// редактируется и показывается как список: строку в поле люди заполняли
// сплошным текстом, и мэтчингу было не за что зацепиться.
export const parseWishes = (str) => String(str || '').split(',').map(s => s.trim()).filter(Boolean);
export const joinWishes = (list) => list.join(', ');

// Выбор из каталога: поиск, группы по категориям, свой вариант. Раньше в
// настройках было одно пустое поле — приходилось придумывать формулировки
// самому, и вишлист оставался незаполненным.
export function WishPicker({ open, onClose, value, onChange }) {
  const [q, setQ] = React.useState('');
  const chosen = parseWishes(value);
  const has = (w) => chosen.some(x => x.toLowerCase() === w.toLowerCase());
  const toggle = (w) => onChange(joinWishes(has(w) ? chosen.filter(x => x.toLowerCase() !== w.toLowerCase()) : [...chosen, w]));

  const ql = q.trim().toLowerCase();
  const groups = WISH_GROUPS
    .map(g => ({ ...g, items: ql ? g.items.filter(i => i.toLowerCase().includes(ql)) : g.items }))
    .filter(g => g.items.length);
  // своё значение предлагаем добавить, если в каталоге такого нет
  const custom = q.trim();
  const canAddCustom = custom.length > 1 && !ALL_WISHES.some(i => i.toLowerCase() === custom.toLowerCase()) && !has(custom);

  React.useEffect(() => { if (open) setQ(''); }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title={`Что вы хотите получить${chosen.length ? ` · ${chosen.length}` : ''}`}>
      <div className="px col gap12" style={{ paddingBottom: 8 }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Поиск или свой вариант"
          style={bcFieldStyle}
        />

        {canAddCustom && (
          <button className="btn btn-soft btn-block" onClick={() => { toggle(custom); setQ(''); }}>
            <Icon name="plus" size={17} color="var(--berry)" />Добавить «{custom}»
          </button>
        )}

        <div className="col gap14" style={{ maxHeight: '46vh', overflowY: 'auto' }}>
          {groups.map(g => (
            <div key={g.id} className="col gap8">
              <span className="over" style={{ color: g.color }}>{g.label}</span>
              <div className="row gap6" style={{ flexWrap: 'wrap' }}>
                {g.items.map(w => (
                  <button
                    key={w}
                    onClick={() => toggle(w)}
                    aria-pressed={has(w)}
                    className="chip"
                    style={{
                      padding: '7px 13px', fontSize: 13.5,
                      background: has(w) ? 'var(--berry)' : 'var(--card)',
                      color: has(w) ? '#fff' : 'var(--ink-2)',
                      borderColor: has(w) ? 'var(--berry)' : 'var(--line)',
                    }}
                  >
                    {has(w) && <Icon name="check" size={13} color="#fff" />}{w}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!groups.length && !canAddCustom && (
            <span className="sub" style={{ padding: '10px 0' }}>Ничего не нашлось — впишите свой вариант.</span>
          )}
        </div>

        <button className="btn btn-primary btn-block btn-lg" onClick={onClose}>Готово</button>
      </div>
    </Sheet>
  );
}

export function WishList({ value, onChange, editable = false }) {
  const items = parseWishes(value);
  const [draft, setDraft] = React.useState('');

  const add = () => {
    const v = draft.trim().replace(/,+$/, '');
    if (!v) return;
    if (items.some(x => x.toLowerCase() === v.toLowerCase())) { setDraft(''); return; }
    onChange(joinWishes([...items, v]));
    setDraft('');
  };
  const remove = (i) => onChange(joinWishes(items.filter((_, k) => k !== i)));

  if (!editable && !items.length) {
    return <span className="sub">Пока пусто. Добавьте, что ищете — мэтчинг найдёт подходящие лоты.</span>;
  }

  return (
    <div className="col gap8">
      {items.length > 0 && (
        <div className="row gap6" style={{ flexWrap: 'wrap' }}>
          {items.map((w, i) => (
            <span key={w + i} className="tag" style={{ background: 'var(--berry-50)', color: 'var(--berry)', padding: '6px 10px', fontSize: 13, gap: 6 }}>
              {w}
              {editable && (
                <button onClick={() => remove(i)} aria-label={`Убрать ${w}`} style={{ border: 'none', background: 'none', padding: 0, display: 'flex', cursor: 'pointer' }}>
                  <Icon name="close" size={13} color="var(--berry)" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {editable && (
        <div className="row gap6">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
            placeholder="Например: ноутбук"
            style={{ ...fieldStyle, flex: 1 }}
          />
          <button className="btn btn-soft" style={{ padding: '0 16px', flex: 'none' }} onClick={add} disabled={!draft.trim()}>
            <Icon name="plus" size={17} color="var(--berry)" />
          </button>
        </div>
      )}
    </div>
  );
}

export function EditProfileSheet({ user, open, onClose, onSaved }) {
  const [name, setName] = React.useState(user?.name || '');
  const [city, setCity] = React.useState(user?.city || '');
  const [bio, setBio] = React.useState(user?.bio || '');
  const [wants, setWants] = React.useState(user?.wants || '');
  const [phone, setPhone] = React.useState(user?.phone || '');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const avatarRef = React.useRef(null);

  React.useEffect(() => {
    if (open) {
      setName(user?.name || '');
      setCity(user?.city || '');
      setBio(user?.bio || '');
      setWants(user?.wants || '');
      setPhone(user?.phone || '');
      setError('');
    }
  }, [open, user]);

  const onAvatarFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
        reader.readAsDataURL(f);
      });
      const resized = await resizeImage(dataUrl, 256);
      const res = await updateAvatarAction(resized);
      if (res.ok && onSaved) onSaved(res.user);
    } catch (err) {
      console.error('avatar upload failed', err);
    }
  };

  const save = async () => {
    if (!name.trim()) return setError('Введите имя');
    setSaving(true);
    setError('');
    const res = await updateProfileAction({ name, city, bio, wants, phone });
    setSaving(false);
    if (!res.ok) return setError(res.error || 'Ошибка сохранения');
    onSaved(res.user);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Редактировать профиль">
      <div className="px col gap14" style={{ paddingBottom: 10 }}>
        <div className="row gap12" style={{ alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            {(user && user.avatar) ? (
              <div style={{ width: 64, height: 64, borderRadius: 999, overflow: 'hidden' }}><img src={user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></div>
            ) : (
              <div style={{ width: 64, height: 64, borderRadius: 999, background: 'linear-gradient(135deg, var(--berry), var(--berry-500))', color: '#fff', fontSize: 26, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{(name || '?').charAt(0)}</div>
            )}
          </div>
          <div className="col gap6">
            <button className="btn btn-soft" style={{ padding: '10px 14px', fontSize: 13.5 }} onClick={() => avatarRef.current && avatarRef.current.click()}><Icon name="camera" size={16} color="var(--ink)" />Изменить фото</button>
            <span className="cap">Фото появится в профиле и в сделках</span>
            <input ref={avatarRef} type="file" accept="image/*" onChange={onAvatarFile} style={{ display: 'none' }} />
          </div>
        </div>
        <div className="col gap6">
          <label className="cap">Имя</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Как вас зовут?" style={bcFieldStyle} />
        </div>
        <CityField value={city} onChange={setCity} />
        <PhoneField value={phone} onChange={setPhone} />
        <div className="col gap6">
          <label className="cap">О себе</label>
          <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Чем меняетесь, где, как любите договариваться…" rows={4} style={{ ...fieldStyle, resize: 'none', lineHeight: 1.5 }} />
        </div>
        <div className="col gap6">
          <label className="cap">Вишлист</label>
          <WishList value={wants} onChange={setWants} editable />
          <button className="btn btn-soft btn-block" onClick={() => setPickerOpen(true)}>
            <Icon name="plusCircle" size={18} color="var(--berry)" />
            {parseWishes(wants).length ? 'Изменить список' : 'Выбрать из списка'}
          </button>
          <span className="cap">По списку подбираются обмены в «Умном мэтчинге».</span>
        </div>
        {error && <div style={ERR_BOX}>{error}</div>}
        <button className="btn btn-primary btn-block btn-lg" onClick={save} disabled={saving} style={{ opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
      <WishPicker open={pickerOpen} onClose={() => setPickerOpen(false)} value={wants} onChange={setWants} />
    </Sheet>
  );
}


export function ChangePasswordSheet({ open, onClose }) {
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [repeat, setRepeat] = React.useState('');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    if (open) { setCurrent(''); setNext(''); setRepeat(''); setError(''); setDone(false); }
  }, [open]);

  const save = async () => {
    if (!current) return setError('Введите текущий пароль');
    if (next.length < 6) return setError('Новый пароль — минимум 6 символов');
    if (next !== repeat) return setError('Пароли не совпадают');
    setSaving(true);
    setError('');
    const res = await changePasswordAction({ currentPassword: current, newPassword: next });
    setSaving(false);
    if (!res.ok) return setError(res.error || 'Ошибка');
    setDone(true);
  };

  const passField = { ...fieldStyle, letterSpacing: '1px' };

  return (
    <Sheet open={open} onClose={onClose} title="Сменить пароль">
      <div className="px col gap14" style={{ paddingBottom: 10 }}>
        {done ? (
          <div className="col gap14" style={{ alignItems: 'center', padding: '18px 0' }}>
            <Icon name="checkCircle" size={42} color="var(--ok)" />
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Пароль изменён</span>
            <button className="btn btn-primary btn-block btn-lg" onClick={onClose}>Готово</button>
          </div>
        ) : (
          <>
            <div className="col gap6">
              <label className="cap">Текущий пароль</label>
              <input type="password" value={current} onChange={e => setCurrent(e.target.value)} placeholder="••••••••" style={passField} />
            </div>
            <div className="col gap6">
              <label className="cap">Новый пароль</label>
              <input type="password" value={next} onChange={e => setNext(e.target.value)} placeholder="Минимум 6 символов" style={passField} />
            </div>
            <div className="col gap6">
              <label className="cap">Повторите новый пароль</label>
              <input type="password" value={repeat} onChange={e => setRepeat(e.target.value)} placeholder="••••••••" style={passField} />
            </div>
            {error && <div style={ERR_BOX}>{error}</div>}
            <button className="btn btn-primary btn-block btn-lg" onClick={save} disabled={saving} style={{ opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}

export function AboutSheet({ open, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} title="О приложении">
      <div className="px col gap14" style={{ paddingBottom: 10 }}>
        <div className="col" style={{ alignItems: 'center', gap: 6, padding: '10px 0 4px' }}>
          <Logo size={58} />
          <span className="h3">Дайбери</span>
          <span className="cap">Обмен без денег · версия 1.0.0</span>
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink-2)', margin: 0 }}>
          Меняйтесь вещами и услугами без денег. Внутренние баллы (1 Б = 1 ₽) защищают сделку: доплата
          уходит в эскроу и размораживается после подтверждения получения.
        </p>
        <div className="row gap8">
          <div className="chip chip-berry" onClick={() => {}}><Icon name="shield" size={14} color="var(--berry)" />Правила сервиса</div>
          <div className="chip chip-berry" onClick={() => {}}><Icon name="chat" size={14} color="var(--berry)" />Поддержка</div>
        </div>
        <span className="cap" style={{ textAlign: 'center', color: 'var(--ink-3)' }}>dayberry.ru</span>
      </div>
    </Sheet>
  );
}

export function ProfileScreen({ tab, setTab, onCreate, onLogout, user, profile, myLots = [], onProfileSaved, onEditLot, onOpenLot, onOpenSettings, bell = null, onRefresh }) {
  const [activeTab, setActiveTab] = React.useState('lots'); // 'lots' | 'reviews'
  const [editing, setEditing] = React.useState(false);
  const avatarRef = React.useRef(null);

  const name = (user && user.name) || '';
  const email = (user && user.email) || '';
  const city = (user && user.city) || '';
  const rating = user ? (user.rating ?? 0) : 0;
  const reviewsCount = (profile && profile.reviewsCount) ?? (user && user.reviewsCount) ?? 0;
  const deals = user ? (user.dealsCount ?? 0) : 0;
  const balance = (user && user.balance) || 0;
  const bio = (profile && profile.bio) || (user && user.bio) || '';
  const wants = (profile && profile.wants) || (user && user.wants) || '';
  const avatar = (profile && profile.avatar) || (user && user.avatar) || '';
  const reviews = (profile && profile.reviews) || [];
  const initial = (name || '?').trim().charAt(0).toUpperCase();

  const onAvatarFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
        reader.readAsDataURL(f);
      });
      const resized = await resizeImage(dataUrl, 256);
      const res = await updateAvatarAction(resized);
      if (res.ok && onProfileSaved) onProfileSaved(res.user);
    } catch (err) {
      console.error('avatar upload failed', err);
    }
  };

  return (
    <div className="app">
      <div className="safe-top" />
      <AppBar title="Профиль" right={bell} />

      <PullToRefresh onRefresh={onRefresh}>

        {/* hero */}
        <div className="col" style={{ alignItems: 'center', padding: '8px 24px 24px', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            {avatar ? (
              <div style={{ width: 88, height: 88, borderRadius: 999, overflow: 'hidden', boxShadow: '0 6px 20px rgba(75,43,201,0.30)' }}>
                <img src={avatar} alt="аватар" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
            ) : (
              <div style={{
                width: 88, height: 88, borderRadius: 999,
                background: 'linear-gradient(135deg, var(--berry), var(--berry-500))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 36, fontWeight: 800, color: '#fff',
                boxShadow: '0 6px 20px rgba(75,43,201,0.30)',
              }}>{initial}</div>
            )}
            <button onClick={() => avatarRef.current && avatarRef.current.click()} style={{
              position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 999,
              background: 'var(--berry)', border: '2.5px solid var(--bg)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <Icon name="camera" size={13} color="#fff" />
            </button>
            <input ref={avatarRef} type="file" accept="image/*" onChange={onAvatarFile} style={{ display: 'none' }} />
          </div>

          <div className="col" style={{ alignItems: 'center', gap: 4 }}>
            <span className="h2">{name}</span>
            <div className="row gap6" style={{ alignItems: 'center' }}>
              <Icon name="map" size={13} color="var(--ink-3)" />
              <span className="sub">{city}</span>
            </div>
            <div className="row gap4" style={{ marginTop: 2 }}>
              {reviewsCount > 0 ? (
                <>
                  {[1,2,3,4,5].map(i => (
                    <Icon key={i} name="star" size={14} color={i <= Math.round(rating) ? '#F5A623' : 'var(--line)'} />
                  ))}
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginLeft: 4 }}>{rating.toFixed(1)}</span>
                  <span className="cap" style={{ marginLeft: 2 }}>· {reviewsCount}</span>
                </>
              ) : (
                <span className="cap">Оценок пока нет</span>
              )}
            </div>
          </div>

          {/* stats */}
          <div className="card row" style={{ width: '100%', padding: '16px 8px', marginTop: 4 }}>
            <StatBox value={deals} label="сделок" />
            <div style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch' }} />
            <StatBox value={myLots.length} label="объявлений" />
            <div style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch' }} />
            <StatBox value={<span style={{ display:'flex', alignItems:'center', gap:3 }}><Credit n={balance} size={18} coin={16} /></span>} label="баллов" />
          </div>

          {/* bio */}
          <div style={{ width: '100%', padding: '12px 14px', background: 'var(--berry-50)', borderRadius: 14, border: '1px solid var(--berry-100)' }}>
            <span style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              {bio || 'Пока ничего о себе не написано.'}
            </span>
          </div>

          {/* wants */}
          <div className="card" style={{ width: '100%', padding: '12px 14px', gap: 6 }}>
            <div className="row gap6" style={{ alignItems: 'center' }}>
              <Icon name="ai" size={15} color="var(--berry)" />
              <span className="over" style={{ color: 'var(--berry)' }}>Вишлист</span>
            </div>
            <WishList value={wants} onChange={() => {}} />
          </div>

          <button className="btn btn-soft" style={{ padding: '10px 18px', fontSize: 14 }} onClick={() => setEditing(true)}>
            <Icon name="user" size={16} color="var(--ink)" />Редактировать
          </button>
        </div>

        {/* lots / reviews tabs */}
        <div className="row" style={{ margin: '0 16px 12px', background: 'var(--line-2)', borderRadius: 14, padding: 4 }}>
          {[['lots', 'Объявления'], ['reviews', 'Отзывы']].map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)} style={{
              flex: 1, padding: '9px 0', border: 'none', borderRadius: 11, cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 14, fontWeight: 700, transition: 'all .15s',
              background: activeTab === id ? '#fff' : 'transparent',
              color: activeTab === id ? 'var(--ink)' : 'var(--ink-3)',
              boxShadow: activeTab === id ? 'var(--sh-1)' : 'none',
            }}>{label}</button>
          ))}
        </div>

        {activeTab === 'lots' && (
          <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingBottom: 16 }}>
            {/* Раньше по всей карточке открывалось редактирование — промахнуться
                было невозможно, а посмотреть своё объявление как его видят
                другие нельзя. Теперь тап открывает лот, правка — по кнопке. */}
            {myLots.map(l => (
              <LotCard key={l.id} lot={l} compact onClick={() => onOpenLot && onOpenLot(l.id)} onEdit={onEditLot} />
            ))}
            {/* Без aspectRatio: плитка тянется на высоту ряда. Жёсткий квадрат
                был ниже карточки — та выше на блок с ценой и заголовком, и
                кнопка «уезжала» вверх. minHeight держит форму, когда она одна. */}
            <div
              className="card col"
              style={{ overflow: 'hidden', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 180, alignSelf: 'stretch', border: '2px dashed var(--line)', background: 'transparent', boxShadow: 'none' }}
              onClick={onCreate}
            >
              <Icon name="plusCircle" size={28} color="var(--berry-200)" />
              <span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600 }}>Добавить</span>
            </div>
            {!myLots.length && (
              <div className="col gap8" style={{ gridColumn: '1 / -1', alignItems: 'center', padding: '30px 20px', textAlign: 'center' }}>
                <Icon name="tag" size={30} color="var(--ink-3)" />
                <span className="sub">Здесь появятся ваши товары и услуги. Нажмите «Добавить» и опубликуйте первое объявление.</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="col" style={{ padding: '0 16px 16px', gap: 10 }}>
            {reviews.length === 0 && (
              <div className="col gap8" style={{ alignItems: 'center', padding: '30px 20px', textAlign: 'center' }}>
                <Icon name="star" size={30} color="var(--ink-3)" />
                <span className="sub">Отзывов пока нет. Завершите обмен — и партнёры смогут вас оценить.</span>
              </div>
            )}
            {reviews.map((r, i) => (
              <div key={r.id || i} className="card" style={{ padding: '14px 16px', gap: 8 }} >
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="row gap8">
                    <div className="avatar" style={{ width: 34, height: 34, fontSize: 14 }}>{(r.author || '?').charAt(0)}</div>
                    <div className="col" style={{ gap: 2 }}>
                      <span className="title" style={{ fontSize: 13.5 }}>{r.author}</span>
                      <div className="row gap3">
                        {[1,2,3,4,5].map(s => <Icon key={s} name="star" size={11} color={s <= r.rating ? '#F5A623' : 'var(--line)'} />)}
                      </div>
                    </div>
                  </div>
                  <span className="cap">{fmtDate(r.date)}</span>
                </div>
                <span style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5 }}>{r.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* settings */}
        <SectionHeader title="" />
        <GroupCard>
          <SettingsRow icon="settings" label="Настройки" sub="Профиль, уведомления, кошелёк" onClick={() => onOpenSettings && onOpenSettings()} />
        </GroupCard>

        <div style={{ height: 32 }} />
      </PullToRefresh>

      <TabBar tab={tab} setTab={setTab} onCreate={onCreate} unread={0} />
      <EditProfileSheet user={profile || user} open={editing} onClose={() => setEditing(false)} onSaved={onProfileSaved} />
    </div>
  );
}

export function MyLotsScreen({ myLots = [], archivedLots = [], go, onEdit, onCreate, onArchive, onRestore, onDelete, bell = null, onRefresh }) {
  const [tab, setTab] = React.useState('active'); // 'active' | 'archived'
  const [menuLot, setMenuLot] = React.useState(null);
  const [confirmLot, setConfirmLot] = React.useState(null);
  const list = tab === 'active' ? myLots : archivedLots;

  return (
    <PullToRefresh onRefresh={onRefresh}>
      <div className="appbar" style={{ paddingBottom: 10 }}>
        <div className="row grow" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="col gap2">
            <span className="h2">Мои объявления</span>
            <span className="cap">{list.length} {tab === 'active' ? 'активных' : 'в архиве'}</span>
          </div>
          <span className="row gap8">{bell}<IconBtn name="plusCircle" onClick={onCreate} /></span>
        </div>
      </div>
      <div className="row gap8" style={{ padding: '0 18px 10px', flexShrink: 0 }}>
        {[['active', 'Активные'], ['archived', 'Архив']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '7px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
            fontSize: 13.5, fontWeight: 600, transition: 'all .15s',
            background: tab === id ? 'var(--berry)' : 'var(--line-2)',
            color: tab === id ? '#fff' : 'var(--ink-2)',
          }}>{label}{id === 'archived' && archivedLots.length ? ` · ${archivedLots.length}` : ''}</button>
        ))}
      </div>
      <div className="px" style={{ paddingBottom: 20 }}>
        {list.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {list.map(l => (
              <LotCard
                key={l.id}
                lot={l}
                compact
                onClick={() => go('lot', { lotId: l.id })}
                onEdit={tab === 'active' ? onEdit : undefined}
                onMenu={(lot) => setMenuLot(lot)}
              />
            ))}
          </div>
        ) : tab === 'active' ? (
          <div className="col gap10" style={{ alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
            <div className="avatar" style={{ width: 56, height: 56, background: 'var(--berry-50)' }}><Icon name="plusCircle" size={26} color="var(--berry)" /></div>
            <span className="title">Пока нет объявлений</span>
            <span className="sub" style={{ maxWidth: 260 }}>Создайте первое — и начните обмениваться без денег</span>
            <button className="btn btn-primary" style={{ marginTop: 4 }} onClick={onCreate}><Icon name="plus" size={18} color="#fff" />Создать объявление</button>
          </div>
        ) : (
          <div className="col gap10" style={{ alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
            <div className="avatar" style={{ width: 56, height: 56, background: 'var(--line-2)' }}><Icon name="archive" size={26} color="var(--ink-3)" /></div>
            <span className="title">В архиве пусто</span>
            <span className="sub" style={{ maxWidth: 260 }}>Архивированные объявления прячутся из ленты, но сохраняются здесь</span>
          </div>
        )}
      </div>

      <Sheet open={!!menuLot} onClose={() => setMenuLot(null)} title="Действия с объявлением">
        <div className="px col gap10" style={{ paddingBottom: 8 }}>
          {tab === 'active' && (
            <button className="btn btn-soft btn-block" onClick={() => { const l = menuLot; setMenuLot(null); onEdit(l); }}><Icon name="edit" size={18} color="var(--berry)" />Редактировать</button>
          )}
          {tab === 'active' ? (
            <button className="btn btn-soft btn-block" onClick={() => { const l = menuLot; setMenuLot(null); onArchive(l); }}><Icon name="archive" size={18} color="var(--ink-2)" />Архивировать</button>
          ) : (
            <button className="btn btn-soft btn-block" onClick={() => { const l = menuLot; setMenuLot(null); onRestore(l); }}><Icon name="check" size={18} color="var(--ok)" />Восстановить</button>
          )}
          <button className="btn btn-soft btn-block" style={{ color: 'var(--warn)' }} onClick={() => { setConfirmLot(menuLot); setMenuLot(null); }}><Icon name="close" size={18} color="var(--warn)" />Удалить</button>
        </div>
      </Sheet>

      <Sheet open={!!confirmLot} onClose={() => setConfirmLot(null)} title="Удалить объявление?">
        <div className="px col gap14" style={{ paddingBottom: 8 }}>
          <span className="body">«{confirmLot ? confirmLot.title : ''}» будет удалено навсегда. Если на нём есть активные сделки — вместо удаления оно уйдёт в архив.</span>
          <button className="btn btn-block btn-lg" style={{ background: 'var(--warn)', color: '#fff' }} onClick={() => { const l = confirmLot; setConfirmLot(null); onDelete(l); }}><Icon name="close" size={20} color="#fff" />Да, удалить</button>
          <button className="btn btn-soft btn-block" onClick={() => setConfirmLot(null)}>Отмена</button>
        </div>
      </Sheet>
    </PullToRefresh>
  );
}

// Экран рассылки: доступен только аккаунтам из ADMIN_EMAILS, и проверяет
// это сервер — интерфейс лишь не показывает лишнего. Отправка необратима,
// поэтому между кнопкой и рассылкой стоит подтверждение с числом людей.
export function BroadcastScreen({ onBack }) {
  const [info, setInfo] = React.useState(null);
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [audience, setAudience] = React.useState('all');
  const [confirm, setConfirm] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [result, setResult] = React.useState('');

  React.useEffect(() => {
    broadcastInfoAction().then(setInfo).catch(() => setInfo({ admin: false }));
  }, []);

  const count = info ? (audience === 'with_lots' ? info.withLots : info.all) : 0;

  const send = async () => {
    setConfirm(false);
    setSending(true);
    setResult('');
    try {
      const res = await broadcastAction({ title, body, audience });
      if (!res.ok) { setResult(res.error || 'Не удалось отправить'); return; }
      setResult('Отправлено: ' + res.sent);
      setTitle('');
      setBody('');
    } catch (e) {
      console.error('broadcast failed', e);
      setResult('Не удалось отправить — попробуйте ещё раз');
    } finally {
      setSending(false);
    }
  };

  if (info && !info.admin) {
    return (
      <div className="app-scroll">
        <AppBar title="Рассылка" left={<IconBtn name="back" onClick={onBack} />} />
        <div className="px"><span className="sub">Раздел доступен только администратору.</span></div>
      </div>
    );
  }

  return (
    <div className="app-scroll">
      <AppBar title="Рассылка" sub="Уведомление всем пользователям" left={<IconBtn name="back" onClick={onBack} />} />
      <div className="px col gap14" style={{ paddingBottom: 30 }}>
        <div className="card col gap12" style={{ padding: 14 }}>
          <div className="col gap6">
            <span className="cap">Заголовок</span>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Что нового в Дайбери"
              style={bcFieldStyle}
            />
          </div>
          <div className="col gap6">
            <span className="cap">Текст</span>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              maxLength={400}
              rows={4}
              placeholder="Коротко: что изменилось и зачем это людям"
              style={{ ...bcFieldStyle, resize: 'vertical', lineHeight: 1.45 }}
            />
            <span className="cap" style={{ textAlign: 'right' }}>{body.length} / 400</span>
          </div>
          <div className="col gap6">
            <span className="cap">Кому</span>
            <div className="row gap8">
              {[['all', 'Всем'], ['with_lots', 'С объявлениями']].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setAudience(id)}
                  className={'chip chip-berry' + (audience === id ? ' is-on' : '')}
                  style={{ border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}
                >{label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="card col gap8" style={{ padding: 14, background: 'var(--berry-50)' }}>
          <span className="cap">Так это увидят в колокольчике</span>
          <div className="row gap12" style={{ alignItems: 'flex-start' }}>
            <div className="avatar" style={{ width: 36, height: 36, background: '#fff', flex: 'none' }}><Icon name="bell" size={18} color="var(--berry)" /></div>
            <div className="col gap3" style={{ minWidth: 0 }}>
              <span className="title" style={{ fontSize: 14 }}>{title || 'Заголовок'}</span>
              {body && <span className="sub" style={{ lineHeight: 1.45 }}>{body}</span>}
              <span className="cap">только что</span>
            </div>
          </div>
        </div>

        <button
          className="btn btn-primary btn-block btn-lg"
          disabled={!title.trim() || sending || !info}
          onClick={() => setConfirm(true)}
          style={{ opacity: !title.trim() || sending || !info ? 0.5 : 1 }}
        >
          <Icon name="send" size={19} color="#fff" />{sending ? 'Отправляем…' : 'Отправить · ' + count}
        </button>
        {result && <span className="sub" style={{ textAlign: 'center' }}>{result}</span>}
        <span className="cap" style={{ lineHeight: 1.5 }}>
          Уведомление придёт в колокольчик внутри приложения. Отозвать его нельзя, поэтому перечитайте текст перед отправкой.
        </span>
      </div>

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Отправить всем?">
        <div className="px col gap12" style={{ paddingBottom: 10 }}>
          <span className="body">Уведомление получат <b>{count}</b> человек. Отменить отправку будет нельзя.</span>
          <div className="card" style={{ padding: 12 }}>
            <span className="title" style={{ fontSize: 14 }}>{title}</span>
            {body && <span className="sub" style={{ display: 'block', marginTop: 4, lineHeight: 1.45 }}>{body}</span>}
          </div>
          <button className="btn btn-primary btn-block btn-lg" onClick={send}><Icon name="send" size={19} color="#fff" />Отправить</button>
          <button className="btn btn-soft btn-block" onClick={() => setConfirm(false)}>Ещё подумаю</button>
        </div>
      </Sheet>
    </div>
  );
}

const bcFieldStyle = {
  width: '100%',
  border: '1px solid var(--line)',
  borderRadius: 12,
  padding: '11px 13px',
  fontSize: 15,
  fontFamily: 'var(--font)',
  outline: 'none',
  background: 'var(--bg)',
  color: 'var(--ink)',
};

export function SettingsScreen({ user, profile, onBack, onLogout, onProfileSaved, onGoWallet, onBroadcast }) {
  const [isAdmin, setIsAdmin] = React.useState(false);
  React.useEffect(() => { broadcastInfoAction().then(r => setIsAdmin(!!r?.admin)).catch(() => {}); }, []);
  const [editing, setEditing] = React.useState(false);
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [aboutOpen, setAboutOpen] = React.useState(false);
  const [shareNote, setShareNote] = React.useState('');
  const email = (user && user.email) || '';
  const balance = (user && user.balance) || 0;

  const setting = (k) => !user || user[k] !== false;
  const toggleSetting = async (k) => {
    if (!user) return;
    const next = {
      notifyPush: setting('notifyPush'),
      notifyEmail: setting('notifyEmail'),
      notifyDeals: setting('notifyDeals'),
      [k]: !setting(k),
    };
    const res = await updateSettingsAction(next);
    if (res.ok && res.user && onProfileSaved) onProfileSaved(res.user);
  };

  // Выключатель push раньше просто писал флаг в профиль. Теперь он делает
  // то, что обещает: спрашивает разрешение и подписывает браузер — иначе
  // включённый тумблер означал ровно ничего.
  const [push, setPush] = React.useState({ supported: true, subscribed: false });
  const [pushNote, setPushNote] = React.useState('');
  React.useEffect(() => { pushState().then(setPush).catch(() => {}); }, []);

  const togglePush = async () => {
    setPushNote('');
    if (push.subscribed) {
      await disablePush();
      setPush(p => ({ ...p, subscribed: false }));
      if (setting('notifyPush')) await toggleSetting('notifyPush');
      return;
    }
    const res = await enablePush();
    if (!res.ok) { setPushNote(res.error); return; }
    setPush(p => ({ ...p, subscribed: true, permission: 'granted' }));
    if (!setting('notifyPush')) await toggleSetting('notifyPush');
    setPushNote('Уведомления придут на это устройство');
  };

  const shareInvite = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://dayberry.ru';
    const text = `Дайбери — обмен без денег. Присоединяйся: ${origin}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title: 'Дайбери', text }); return; } catch {}
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareNote('Ссылка скопирована');
      setTimeout(() => setShareNote(''), 2500);
    } catch {}
  };

  return (
    <div className="app-scroll">
      <AppBar title="Настройки" left={<IconBtn name="back" onClick={onBack} />} />
      <SectionHeader title="Аккаунт" />
      <GroupCard>
        <SettingsRow icon="user" label="Профиль" sub={email || 'Email'} onClick={() => setEditing(true)} />
        <Divider />
        <SettingsRow icon="shield" label="Сменить пароль" onClick={() => setPasswordOpen(true)} />
      </GroupCard>

      <SectionHeader title="Уведомления" />
      <GroupCard>
        <SettingsRow
          icon="bell"
          label="Push-уведомления"
          sub={push.supported ? (pushNote || (push.subscribed ? 'Это устройство подписано' : 'Приходят, даже когда приложение закрыто')) : 'Браузер не умеет push'}
          right={<Switch on={push.subscribed && setting('notifyPush')} onChange={togglePush} />}
        />
        <Divider />
        <SettingsRow icon="mail" label="Email-рассылка" right={<Switch on={setting('notifyEmail')} onChange={() => toggleSetting('notifyEmail')} />} />
        <Divider />
        <SettingsRow icon="chat" label="Сделки и чаты" right={<Switch on={setting('notifyDeals')} onChange={() => toggleSetting('notifyDeals')} />} />
      </GroupCard>

      <SectionHeader title="Приложение" />
      <GroupCard>
        <SettingsRow icon="wallet" label="Кошелёк и баллы"
          right={<div className="row gap6"><Credit n={balance} size={13} coin={13} /><Icon name="chevR" size={18} color="var(--ink-3)" /></div>}
          onClick={onGoWallet}
        />
        <Divider />
        <SettingsRow icon="gift" label="Пригласить друга" sub={shareNote || 'Поделиться ссылкой на сервис'} onClick={shareInvite} />
        <Divider />
        <SettingsRow icon="info" label="О приложении" sub="Версия 1.0.0" onClick={() => setAboutOpen(true)} />
      </GroupCard>

      {isAdmin && (
        <>
          <SectionHeader title="Администратору" />
          <GroupCard>
            <SettingsRow icon="send" label="Рассылка" sub="Уведомление всем пользователям" onClick={onBroadcast} />
          </GroupCard>
        </>
      )}

      <SectionHeader title="" />
      <GroupCard>
        <SettingsRow icon="lock" label="Выйти из аккаунта" danger onClick={onLogout} />
      </GroupCard>

      <div style={{ height: 32 }} />

      <EditProfileSheet user={profile || user} open={editing} onClose={() => setEditing(false)} onSaved={onProfileSaved} />
      <ChangePasswordSheet open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <AboutSheet open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}

export function resizeImage(dataUrl, size) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, size / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
