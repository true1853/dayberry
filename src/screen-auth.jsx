// screen-auth.jsx — login + registration
import React from 'react';
import { Icon } from './icons.jsx';
import { Logo } from './ui.jsx';
import { loginAction, registerAction, getOAuthUrlAction, requestPasswordResetAction } from './server/actions.js';
import { PhoneField, CityField } from './fields.jsx';
import { checkPassword, passwordScore, MIN_LENGTH } from './password.js';

function Field({ label, name, type = 'text', value, onChange, placeholder, autoComplete, hint }) {
  const [show, setShow] = React.useState(false);
  const isPassword = type === 'password';
  const id = 'auth-' + (name || autoComplete || type);
  return (
    <div className="col gap6">
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>{label}</label>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          id={id}
          name={name || autoComplete}
          className="ym-hide-content ym-disable-keys"
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
      {hint}
    </div>
  );
}

function SocialBtn({ icon, label, onClick, soon }) {
  return (
    <button onClick={soon ? undefined : onClick} disabled={soon} style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      padding: '12px 10px', border: '1.5px solid var(--line)', borderRadius: 14,
      background: '#fff', cursor: soon ? 'default' : 'pointer', fontFamily: 'var(--font)', fontSize: 14, fontWeight: 600, color: 'var(--ink)',
      boxShadow: 'var(--sh-1)', opacity: soon ? 0.65 : 1, position: 'relative',
    }}>
      {icon}
      <span>{label}</span>
      {soon && <span style={{ position: 'absolute', top: 6, right: 8, fontSize: 9.5, fontWeight: 800, color: 'var(--berry)', background: 'var(--berry-50)', borderRadius: 999, padding: '2px 7px' }}>СКОРО</span>}
    </button>
  );
}

const VkIcon = () => (
  <svg width="18" height="18" viewBox="0 0 101 100" fill="none">
    <path d="M0 48.5C0 22.6 22.6 0 48.5 0H52C78 0 101 22.6 101 48.5V52C101 78 78 101 52 101H48.5C22.6 101 0 78 0 52v-3.5Z" fill="#0077FF"/>
    <path d="M53.7 70.2C33.5 70.2 21.6 55.6 21.1 31.4h10.2c.4 17.7 8.1 25.3 14.2 26.8V31.4h9.9v15.3c6.1-.7 12.5-9.7 14.7-15.3h9.9c-1.7 9.5-8.6 18.5-13.6 21.7 5 2.3 13 8.6 16 16.8h-10.3c-2.3-7.4-8.2-13.1-16-13.8v13.8h-1.2Z" fill="#fff"/>
  </svg>
);

const YandexIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0Z" fill="#FC3F1D"/>
    <path d="M12 4.4c1.5 0 3.2.6 4.3 2.2 1.1 1.6 1.6 4.1 1.6 6.7 0 1.1-.1 2.2-.3 3.2-.1.4-.3.6-.6.6-.3 0-.5-.2-.6-.5-.3-1.1-.6-2-.9-2.6-.2-.5-.5-.9-1-1.1v3.3c0 .7-.4 1.2-1.1 1.2s-1.1-.5-1.1-1.2v-3.3c-.5.2-.8.6-1 1.1-.3.6-.6 1.5-.9 2.6-.1.3-.3.5-.6.5-.3 0-.5-.2-.6-.6-.2-1-.3-2.1-.3-3.2 0-2.6.5-5.1 1.6-6.7C8.8 5 10.5 4.4 12 4.4Z" fill="#fff"/>
  </svg>
);

// Полоска под полем пароля: без неё требование «буквы и цифры» человек
// узнаёт только из отказа после нажатия кнопки.
function PasswordHint({ password }) {
  const n = passwordScore(password);
  const err = checkPassword(password);
  const label = err || (n >= 3 ? 'Надёжный пароль' : 'Пароль подходит');
  const color = err ? 'var(--warn)' : (n >= 3 ? 'var(--ok)' : 'var(--ink-2)');
  return (
    <div className="col gap4" style={{ marginTop: 2 }}>
      <div className="row gap4">
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            flex: 1, height: 3, borderRadius: 999,
            background: i < n ? (err ? 'var(--warn)' : 'var(--ok)') : 'var(--line)',
          }} />
        ))}
      </div>
      <span style={{ fontSize: 12, color, lineHeight: 1.4 }}>{label}</span>
    </div>
  );
}

export function AuthScreen({ onDone, onClose, message = '' }) {
  const [mode, setMode] = React.useState('login'); // 'login' | 'register'
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [city, setCity] = React.useState('');
  const [error, setError] = React.useState('');
  // Забытый пароль: письма со ссылкой нет, поэтому оставляем заявку —
  // администратор выдаст временный пароль. Молча оставлять кнопку-обманку
  // хуже: человек теряет аккаунт вместе с балансом и сделками.
  const [resetOpen, setResetOpen] = React.useState(false);
  const [resetMail, setResetMail] = React.useState('');
  const [resetDone, setResetDone] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    try {
      const m = document.cookie.match(/(?:^|;\s*)oauth_error=([^;]*)/);
      if (m) {
        setError(decodeURIComponent(m[1]));
        document.cookie = 'oauth_error=; Max-Age=0; path=/';
      }
    } catch {}
  }, []);

  const isLogin = mode === 'login';

  const validate = () => {
    if (!email.trim()) return 'Введите email';
    if (!email.includes('@')) return 'Некорректный email';
    if (!password) return 'Введите пароль';
    // При входе пароль не проверяем на стойкость: у старых аккаунтов он может
    // быть слабым, а отказать во входе из-за этого нельзя.
    if (!isLogin) {
      const weak = checkPassword(password);
      if (weak) return weak;
      if (!name.trim()) return 'Введите имя';
    }
    return null;
  };

  const submit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setLoading(true);
    try {
      const res = isLogin
        ? await loginAction({ email, password })
        : await registerAction({ name, email, phone, password, city });
      setLoading(false);
      if (!res.ok) { setError(res.error); return; }
      onDone(res.user, { registered: !isLogin });
    } catch (e) {
      setLoading(false);
      setError('Ошибка сети — попробуйте ещё раз');
    }
  };

  const socialAuth = async (provider) => {
    setLoading(true);
    setError('');
    try {
      const origin = (typeof window !== 'undefined' ? window.location.origin : '').replace(/^http:/, 'https:');
      const res = await getOAuthUrlAction(provider, origin);
      if (!res.ok) { setError(res.error); setLoading(false); return; }
      window.location.href = res.url;
    } catch (e) {
      setLoading(false);
      setError('Ошибка — попробуйте ещё раз');
    }
  };

  return (
    <div className="app auth-card" style={{ background: 'var(--bg)' }}>
      <div className="safe-top" />

      {/* header */}
      <div className="col" style={{ alignItems: 'center', padding: '32px 24px 24px', gap: 10, position: 'relative' }}>
        {onClose && (
          <button onClick={onClose} aria-label="Закрыть" style={{ position: 'absolute', top: 14, right: 14, width: 36, height: 36, borderRadius: 999, border: 'none', background: 'var(--line-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" size={18} color="var(--ink-2)" />
          </button>
        )}
        <Logo size={56} />
        <div className="col" style={{ alignItems: 'center', gap: 4 }}>
          <span className="h2">Дайбери</span>
          <span className="sub" style={{ textAlign: 'center' }}>
            {isLogin ? 'Войдите в аккаунт' : 'Создайте аккаунт'}
          </span>
          {message && <span className="cap" style={{ color: 'var(--berry)', fontWeight: 600, textAlign: 'center', marginTop: 2 }}>{message}</span>}
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

      {/* form
          Поля лежат внутри <form> с именами и autoComplete: без формы
          браузер и менеджер паролей не понимают, что это вход, и автовставка
          не срабатывала — приходилось набирать пароль руками. Заодно
          работает Enter. */}
      <div className="app-scroll">
        <form className="col gap14" style={{ padding: '0 24px 24px' }} onSubmit={submit} noValidate>

          {!isLogin && (
            <Field label="Имя" name="name" value={name} onChange={setName} placeholder="Как вас зовут?" autoComplete="name" />
          )}
          <Field label="Email" name="email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="username" />
          {!isLogin && (
            <PhoneField value={phone} onChange={setPhone} />
          )}
          <Field
            label="Пароль" name="password" type="password" value={password} onChange={setPassword}
            placeholder={isLogin ? 'Ваш пароль' : `Минимум ${MIN_LENGTH} символов, буквы и цифры`}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            hint={!isLogin && password ? <PasswordHint password={password} /> : null}
          />
          {!isLogin && (
            <CityField value={city} onChange={setCity} />
          )}

          {error && (
            <div role="alert" style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--berry-50)', border: '1px solid var(--berry-200)', color: 'var(--berry-700)', fontSize: 13.5, fontWeight: 500 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg"
            disabled={loading}
            style={{ opacity: loading ? 0.7 : 1, marginTop: 4 }}
          >
            {loading ? 'Подождите...' : isLogin ? 'Войти' : 'Создать аккаунт'}
          </button>

          {isLogin && (
            <button
              type="button"
              onClick={() => { setResetMail(email); setResetDone(''); setResetOpen(true); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--berry)', fontSize: 14, fontFamily: 'var(--font)', fontWeight: 600, textAlign: 'center' }}
            >
              Забыли пароль?
            </button>
          )}

          <div className="row gap10" style={{ alignItems: 'center', margin: '4px 0' }}>
            <div className="divider grow" />
            <span className="sub" style={{ fontSize: 12 }}>или</span>
            <div className="divider grow" />
          </div>

          <div className="row gap10">
            <SocialBtn icon={<VkIcon />} label="VK ID" onClick={() => socialAuth('vk')} />
            <SocialBtn icon={<YandexIcon />} label="Яндекс ID" soon />
          </div>

          {!isLogin && (
            <p style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
              Регистрируясь, вы принимаете{' '}
              <span style={{ color: 'var(--berry)', cursor: 'pointer' }}>Пользовательское соглашение</span>{' '}
              и{' '}
              <span style={{ color: 'var(--berry)', cursor: 'pointer' }}>Политику конфиденциальности</span>
            </p>
          )}
        </form>
      </div>

      {resetOpen && (
        <div className="scrim" onClick={() => setResetOpen(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-grab" />
            <div className="px col gap12" style={{ padding: '6px 18px 10px' }}>
              <span className="h3">Забыли пароль?</span>
              {resetDone ? (
                <>
                  <span className="body">{resetDone}</span>
                  <button className="btn btn-primary btn-block btn-lg" onClick={() => setResetOpen(false)}>Понятно</button>
                </>
              ) : (
                <>
                  <span className="sub" style={{ lineHeight: 1.5 }}>
                    Оставьте почту, на которую регистрировались. Мы сбросим пароль вручную и передадим новый —
                    ответим на эту же почту или в переписку, если вы уже общались с нами.
                  </span>
                  <span className="cap" style={{ lineHeight: 1.45 }}>Если вы входили через VK — пароль не нужен, просто нажмите «VK ID».</span>
                  <input
                    type="email"
                    value={resetMail}
                    onChange={e => setResetMail(e.target.value)}
                    placeholder="you@example.com"
                    style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', fontSize: 15, fontFamily: 'var(--font)', outline: 'none', background: 'var(--bg)', color: 'var(--ink)' }}
                  />
                  <button
                    className="btn btn-primary btn-block btn-lg"
                    onClick={async () => {
                      const res = await requestPasswordResetAction(resetMail);
                      setResetDone(res?.ok
                        ? 'Заявка принята. Если аккаунт с такой почтой есть, мы свяжемся и передадим новый пароль.'
                        : (res?.error || 'Не получилось — попробуйте позже'));
                    }}
                  >Отправить заявку</button>
                  <button className="btn btn-soft btn-block" onClick={() => setResetOpen(false)}>Отмена</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
