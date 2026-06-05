// screen-auth.jsx — login + registration
import React from 'react';
import { Icon } from './icons.jsx';

function Field({ label, type = 'text', value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = React.useState(false);
  const isPassword = type === 'password';
  return (
    <div className="col gap6">
      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>{label}</label>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type={isPassword && show ? 'text' : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          style={{
            width: '100%', padding: '13px 16px', paddingRight: isPassword ? 44 : 16,
            border: '1.5px solid var(--line)', borderRadius: 14, fontSize: 15,
            fontFamily: 'var(--font)', background: '#fff', color: 'var(--ink)',
            outline: 'none', transition: 'border-color .15s', boxSizing: 'border-box',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--berry)'}
          onBlur={e => e.target.style.borderColor = 'var(--line)'}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            style={{ position: 'absolute', right: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink-3)' }}
          >
            <Icon name={show ? 'eyeOff' : 'eye'} size={18} color="var(--ink-3)" />
          </button>
        )}
      </div>
    </div>
  );
}

function SocialBtn({ icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      padding: '12px 10px', border: '1.5px solid var(--line)', borderRadius: 14,
      background: '#fff', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 14, fontWeight: 600, color: 'var(--ink)',
      boxShadow: 'var(--sh-1)',
    }}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const AppleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.28.07 2.18.8 3.04.82 1.14-.22 2.24-.97 3.44-.84 1.46.18 2.56.82 3.28 2.06-3.01 1.8-2.34 5.63.38 6.72-.47 1.37-1.07 2.72-2.14 4.12zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
  </svg>
);

export function AuthScreen({ onDone }) {
  const [mode, setMode] = React.useState('login'); // 'login' | 'register'
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [city, setCity] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const isLogin = mode === 'login';

  const validate = () => {
    if (!email.trim()) return 'Введите email';
    if (!email.includes('@')) return 'Некорректный email';
    if (!password || password.length < 6) return 'Пароль — минимум 6 символов';
    if (!isLogin && !name.trim()) return 'Введите имя';
    return null;
  };

  const submit = () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setLoading(true);
    setTimeout(() => { setLoading(false); onDone(); }, 900);
  };

  return (
    <div className="app" style={{ background: 'var(--bg)' }}>
      <div className="safe-top" />

      {/* header */}
      <div className="col" style={{ alignItems: 'center', padding: '32px 24px 24px', gap: 10 }}>
        <div className="coin" style={{ width: 56, height: 56, fontSize: 30 }}>Б</div>
        <div className="col" style={{ alignItems: 'center', gap: 4 }}>
          <span className="h2">Дай бери</span>
          <span className="sub" style={{ textAlign: 'center' }}>
            {isLogin ? 'Войдите в аккаунт' : 'Создайте аккаунт'}
          </span>
        </div>
      </div>

      {/* tab switcher */}
      <div className="row" style={{ margin: '0 24px 24px', background: 'var(--line-2)', borderRadius: 14, padding: 4, gap: 4 }}>
        {[['login', 'Войти'], ['register', 'Регистрация']].map(([id, label]) => (
          <button key={id} onClick={() => { setMode(id); setError(''); }} style={{
            flex: 1, padding: '10px 0', border: 'none', borderRadius: 11, cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 14, fontWeight: 700, transition: 'all .15s',
            background: mode === id ? '#fff' : 'transparent',
            color: mode === id ? 'var(--ink)' : 'var(--ink-3)',
            boxShadow: mode === id ? 'var(--sh-1)' : 'none',
          }}>{label}</button>
        ))}
      </div>

      {/* form */}
      <div className="app-scroll">
        <div className="col gap14" style={{ padding: '0 24px 24px' }}>

          {!isLogin && (
            <Field label="Имя" value={name} onChange={setName} placeholder="Как вас зовут?" autoComplete="name" />
          )}
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" />
          {!isLogin && (
            <Field label="Телефон" type="tel" value={phone} onChange={setPhone} placeholder="+7 (___) ___-__-__" autoComplete="tel" />
          )}
          <Field label="Пароль" type="password" value={password} onChange={setPassword} placeholder={isLogin ? 'Ваш пароль' : 'Минимум 6 символов'} autoComplete={isLogin ? 'current-password' : 'new-password'} />
          {!isLogin && (
            <Field label="Город" value={city} onChange={setCity} placeholder="Москва" autoComplete="address-level2" />
          )}

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 12, background: '#fff0f3', border: '1px solid var(--berry-200)', color: 'var(--berry-700)', fontSize: 13.5, fontWeight: 500 }}>
              {error}
            </div>
          )}

          <button
            className="btn btn-primary btn-block btn-lg"
            onClick={submit}
            disabled={loading}
            style={{ opacity: loading ? 0.7 : 1, marginTop: 4 }}
          >
            {loading ? 'Подождите...' : isLogin ? 'Войти' : 'Создать аккаунт'}
          </button>

          {isLogin && (
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--berry)', fontSize: 14, fontFamily: 'var(--font)', fontWeight: 600, textAlign: 'center' }}>
              Забыли пароль?
            </button>
          )}

          <div className="row gap10" style={{ alignItems: 'center', margin: '4px 0' }}>
            <div className="divider grow" />
            <span className="sub" style={{ fontSize: 12 }}>или</span>
            <div className="divider grow" />
          </div>

          <div className="row gap10">
            <SocialBtn icon={<GoogleIcon />} label="Google" onClick={onDone} />
            <SocialBtn icon={<AppleIcon />} label="Apple" onClick={onDone} />
          </div>

          {!isLogin && (
            <p style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
              Регистрируясь, вы принимаете{' '}
              <span style={{ color: 'var(--berry)', cursor: 'pointer' }}>Пользовательское соглашение</span>{' '}
              и{' '}
              <span style={{ color: 'var(--berry)', cursor: 'pointer' }}>Политику конфиденциальности</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
