// screen-profile.jsx — user profile screen
import React from 'react';
import { ME, WALLET } from './data.js';
import { Icon } from './icons.jsx';
import { Avatar, Credit, Stars, AppBar, IconBtn, TabBar, Photo } from './ui.jsx';

function StatBox({ value, label }) {
  return (
    <div className="col" style={{ alignItems: 'center', gap: 3, flex: 1 }}>
      <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.03em' }}>{value}</span>
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
        background: danger ? '#fff0f3' : 'var(--line-2)', flex: 'none',
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

export function ProfileScreen({ tab, setTab, onCreate, onLogout, user, myLots = [] }) {
  const [activeTab, setActiveTab] = React.useState('lots'); // 'lots' | 'reviews'

  const name = (user && user.name) || ME.name;
  const city = (user && user.city) || ME.city;
  const initial = (name || '?').trim().charAt(0).toUpperCase();

  const reviews = [
    { from: 'Кирилл М.', rating: 5, text: 'Отличный обмен, всё честно и быстро. Рекомендую!', date: '12 мая' },
    { from: 'Даша П.',   rating: 5, text: 'Приятно иметь дело, вещи точно как на фото.', date: '3 мая' },
    { from: 'Марина В.', rating: 4, text: 'Всё хорошо, немного задержалась с передачей.', date: '21 апр' },
  ];

  return (
    <div className="app">
      <div className="safe-top" />
      <AppBar
        title="Профиль"
        right={<IconBtn name="info" onClick={() => {}} />}
      />

      <div className="app-scroll">

        {/* hero */}
        <div className="col" style={{ alignItems: 'center', padding: '8px 24px 24px', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              width: 88, height: 88, borderRadius: 999,
              background: 'linear-gradient(135deg, var(--berry), var(--berry-500))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36, fontWeight: 800, color: '#fff',
              boxShadow: '0 6px 20px rgba(193,18,79,0.35)',
            }}>{initial}</div>
            <button style={{
              position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 999,
              background: 'var(--berry)', border: '2.5px solid var(--bg)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <Icon name="camera" size={13} color="#fff" />
            </button>
          </div>

          <div className="col" style={{ alignItems: 'center', gap: 4 }}>
            <span className="h2">{name}</span>
            <div className="row gap6" style={{ alignItems: 'center' }}>
              <Icon name="map" size={13} color="var(--ink-3)" />
              <span className="sub">{city}</span>
            </div>
            <div className="row gap4" style={{ marginTop: 2 }}>
              {[1,2,3,4,5].map(i => (
                <Icon key={i} name="star" size={14} color={i <= Math.round(ME.rating) ? '#f5a623' : 'var(--line)'} />
              ))}
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginLeft: 4 }}>{ME.rating}</span>
            </div>
          </div>

          {/* stats */}
          <div className="card row" style={{ width: '100%', padding: '16px 8px', marginTop: 4 }}>
            <StatBox value={ME.deals} label="сделок" />
            <div style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch' }} />
            <StatBox value={myLots.length} label="объявлений" />
            <div style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch' }} />
            <StatBox value={<span style={{ display:'flex', alignItems:'center', gap:3 }}><Credit n={WALLET.balance} size={18} coin={16} /></span>} label="баллов" />
          </div>

          {/* bio */}
          <div style={{ width: '100%', padding: '12px 14px', background: 'var(--berry-50)', borderRadius: 14, border: '1px solid var(--berry-100)' }}>
            <span style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              Меняю технику, книги и вещи. Обмен в Москве или по договорённости.
            </span>
          </div>
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
            {myLots.map(l => (
              <div key={l.id} className="card" style={{ overflow: 'hidden', cursor: 'pointer' }}>
                <Photo label={l.photo} url={l.photoUrl} cat={l.cat} style={{ aspectRatio: '1/1' }} />
                <div className="col" style={{ padding: '10px 12px 12px', gap: 4 }}>
                  <Credit n={l.value} size={15} coin={14} />
                  <span className="title" style={{ fontSize: 13, lineHeight: 1.3 }}>{l.title}</span>
                  <span className="cap">{l.condition} · {l.posted}</span>
                </div>
              </div>
            ))}
            <div
              className="card col"
              style={{ overflow: 'hidden', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', gap: 8, aspectRatio: '1/1', border: '2px dashed var(--line)', background: 'transparent', boxShadow: 'none' }}
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
            {reviews.map((r, i) => (
              <div key={i} className="card" style={{ padding: '14px 16px', gap: 8 }} >
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="row gap8">
                    <Avatar user={['kirill', 'dasha', 'marina'][i]} size={34} />
                    <div className="col" style={{ gap: 2 }}>
                      <span className="title" style={{ fontSize: 13.5 }}>{r.from}</span>
                      <div className="row gap3">
                        {[1,2,3,4,5].map(s => <Icon key={s} name="star" size={11} color={s <= r.rating ? '#f5a623' : 'var(--line)'} />)}
                      </div>
                    </div>
                  </div>
                  <span className="cap">{r.date}</span>
                </div>
                <span style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5 }}>{r.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* settings */}
        <SectionHeader title="Настройки" />
        <GroupCard>
          <SettingsRow icon="user" label="Редактировать профиль" sub="Имя, фото, биография" />
          <Divider />
          <SettingsRow icon="bell" label="Уведомления" sub="Push, email" />
          <Divider />
          <SettingsRow icon="shield" label="Безопасность" sub="Пароль, двухфакторная" />
          <Divider />
          <SettingsRow icon="map" label="Город и доставка" sub={city} />
        </GroupCard>

        <SectionHeader title="Приложение" />
        <GroupCard>
          <SettingsRow icon="wallet" label="Кошелёк и баллы"
            right={<div className="row gap6"><Credit n={WALLET.balance} size={13} coin={13} /><Icon name="chevR" size={18} color="var(--ink-3)" /></div>}
            onClick={() => setTab('wallet')}
          />
          <Divider />
          <SettingsRow icon="gift" label="Пригласить друга" sub="+1 000 Б за каждого" />
          <Divider />
          <SettingsRow icon="info" label="О приложении" sub="Версия 1.0.0" />
        </GroupCard>

        <SectionHeader title="" />
        <GroupCard>
          <SettingsRow icon="lock" label="Выйти из аккаунта" danger onClick={onLogout} />
        </GroupCard>

        <div style={{ height: 32 }} />
      </div>

      <TabBar tab={tab} setTab={setTab} onCreate={onCreate} unread={2} />
    </div>
  );
}
