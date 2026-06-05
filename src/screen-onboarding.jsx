// screen-onboarding.jsx — onboarding + create listing (with AI assist)
import React from 'react';
import { MY_LOT } from './data.js';
import { Icon } from './icons.jsx';
import { fmt, Photo, CatTag, Credit, AIBadge, IconBtn } from './ui.jsx';

const SLIDES = [
  {
    badge: 'Проблема', title: 'Прямой бартер почти\nникогда не сходится',
    body: 'Маше нравится куртка Саши, но Саше не нужен её телефон. Поэтому обычный обмен «вещь на вещь» так редко срабатывает.',
    art: 'mismatch',
  },
  {
    badge: 'Решение', title: 'Бартер-кредиты —\nуниверсальный эквивалент',
    body: 'Отдали вещь — получили баллы. 1 балл = 1 ₽. Тратьте их на что угодно: технику, услуги, вещи. Совпадение желаний больше не нужно.',
    art: 'credits',
  },
  {
    badge: 'Надёжно', title: 'Эскроу и умные\nцепочки обмена',
    body: 'Баллы замораживаются до подтверждения сделки. А если прямого обмена нет — система соберёт цепочку из 3–5 человек, где каждый получит своё.',
    art: 'chain',
  },
];

function OnboardArt({ kind }) {
  if (kind === 'mismatch') return (
    <div className="row" style={{ justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      <Photo label="КУРТКА" url="https://images.unsplash.com/photo-1551028719-00167b16eac5?w=200&q=80" cat="eco" style={{ width: 96, height: 96, borderRadius: 20 }} />
      <div className="col" style={{ alignItems: 'center', gap: 4 }}><Icon name="swap" size={28} color="var(--ink-3)" /><span style={{ fontSize: 22 }}>🚫</span></div>
      <Photo label="ТЕЛЕФОН" url="https://images.unsplash.com/photo-1678685888221-cda773a3dcdb?w=200&q=80" cat="gadget" style={{ width: 96, height: 96, borderRadius: 20 }} />
    </div>
  );
  if (kind === 'credits') return (
    <div className="row" style={{ justifyContent: 'center', alignItems: 'center', gap: 14 }}>
      <Photo label="ВЕЩЬ" url="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200&q=80" cat="eco" style={{ width: 80, height: 80, borderRadius: 18 }} />
      <Icon name="arrowR" size={24} color="var(--berry-200)" />
      <div className="col gap6" style={{ alignItems: 'center' }}>
        <div className="coin" style={{ width: 64, height: 64, fontSize: 34 }}>Б</div>
        <span className="cap">баллы</span>
      </div>
      <Icon name="arrowR" size={24} color="var(--berry-200)" />
      <Photo label="УСЛУГА" url="https://images.unsplash.com/photo-1547658719-da2b51169166?w=200&q=80" cat="digital" style={{ width: 80, height: 80, borderRadius: 18 }} />
    </div>
  );
  return (
    <div className="row" style={{ justifyContent: 'center', alignItems: 'center', gap: 4 }}>
      {['А', 'Б', 'В'].map((x, i) => (
        <React.Fragment key={i}>
          <div className="avatar" style={{ width: 56, height: 56, fontSize: 22 }}>{x}</div>
          {i < 2 && <Icon name="chevR" size={20} color="var(--berry-200)" />}
        </React.Fragment>
      ))}
      <Icon name="arrowR" size={20} color="var(--berry-200)" />
      <div className="avatar" style={{ width: 56, height: 56, background: 'var(--berry-50)' }}><Icon name="check" size={26} color="var(--berry)" /></div>
    </div>
  );
}

export function Onboarding({ onDone }) {
  const [i, setI] = React.useState(0);
  const last = i === SLIDES.length - 1;
  const s = SLIDES[i];
  return (
    <div className="app" style={{ position: 'absolute', background: 'var(--bg)' }}>
      <div className="safe-top" />
      <div className="row" style={{ justifyContent: 'space-between', padding: '4px 18px 0' }}>
        <span className="row gap8"><div className="coin" style={{ width: 26, height: 26, fontSize: 15 }}>Б</div><span className="h3">Дай бери</span></span>
        <button className="cap" style={{ border: 'none', background: 'none', color: 'var(--ink-3)', cursor: 'pointer' }} onClick={onDone}>Пропустить</button>
      </div>

      <div className="grow col" style={{ justifyContent: 'center', padding: '0 26px', gap: 30 }}>
        <div className="card" style={{ padding: '36px 18px', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} key={i}>
          <div className="fade-in"><OnboardArt kind={s.art} /></div>
        </div>
        <div className="col gap12 fade-in" key={'t' + i}>
          <span className="tag" style={{ alignSelf: 'flex-start', background: 'var(--berry-50)', color: 'var(--berry)' }}>{s.badge}</span>
          <span className="h1" style={{ fontSize: 30, whiteSpace: 'pre-line', lineHeight: 1.12 }}>{s.title}</span>
          <span className="body" style={{ color: 'var(--ink-2)', fontSize: 16, lineHeight: 1.5 }}>{s.body}</span>
        </div>
      </div>

      <div className="col gap16" style={{ padding: '0 26px calc(28px + env(safe-area-inset-bottom))' }}>
        <div className="row gap6" style={{ justifyContent: 'center' }}>
          {SLIDES.map((_, k) => <span key={k} style={{ width: k === i ? 22 : 7, height: 7, borderRadius: 999, background: k === i ? 'var(--berry)' : 'var(--line)', transition: 'all .25s' }} />)}
        </div>
        <button className="btn btn-primary btn-block btn-lg" onClick={() => last ? onDone() : setI(i + 1)}>
          {last ? 'Начать обмен' : 'Дальше'}<Icon name="arrowR" size={20} color="#fff" />
        </button>
      </div>
    </div>
  );
}

export function CreateListing({ onClose, onPublish }) {
  const [step, setStep] = React.useState('photo');
  const [analyzing, setAnalyzing] = React.useState(false);

  const runAI = () => { setAnalyzing(true); setStep('ai'); setTimeout(() => { setAnalyzing(false); setStep('review'); }, 1800); };

  return (
    <div className="app" style={{ position: 'absolute' }}>
      <div className="safe-top" />
      <div className="row gap10" style={{ padding: '4px 14px 12px', alignItems: 'center' }}>
        <IconBtn name="close" onClick={onClose} />
        <span className="h3 grow">Новое объявление</span>
      </div>

      <div className="app-scroll px col gap16" style={{ paddingBottom: 20 }}>
        <div className="col gap8">
          <span className="over">Фото</span>
          <div className="row gap10" style={{ overflowX: 'auto' }}>
            <div className="col gap6" style={{ width: 92, height: 92, flex: 'none', borderRadius: 16, border: '2px dashed var(--berry-200)', background: 'var(--berry-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Icon name="camera" size={24} color="var(--berry)" /><span className="cap" style={{ color: 'var(--berry)' }}>Добавить</span>
            </div>
            {step !== 'photo' && [1, 2, 3].map(n => <Photo key={n} label={MY_LOT.photo} cat={MY_LOT.cat} style={{ width: 92, height: 92, flex: 'none', borderRadius: 16 }} />)}
          </div>
        </div>

        {step === 'photo' && (
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div className="avatar" style={{ width: 54, height: 54, background: 'var(--berry-50)', margin: '0 auto 12px' }}><Icon name="sparkLine" size={26} color="var(--berry)" /></div>
            <span className="h3" style={{ display: 'block', marginBottom: 6 }}>AI заполнит за вас</span>
            <span className="sub" style={{ display: 'block', marginBottom: 14 }}>Загрузите фото — алгоритм определит категорию, напишет описание и подскажет честную цену в баллах.</span>
            <button className="btn btn-primary btn-block" onClick={runAI}><Icon name="spark" size={18} color="#fff" />Распознать по фото</button>
          </div>
        )}

        {step === 'ai' && analyzing && (
          <div className="card" style={{ padding: 26, textAlign: 'center' }}>
            <div className="avatar pop" style={{ width: 60, height: 60, background: 'var(--berry-50)', margin: '0 auto 14px' }}><Icon name="spark" size={28} color="var(--berry)" /></div>
            <span className="h3" style={{ display: 'block' }}>Анализирую…</span>
            <span className="sub" style={{ display: 'block', marginTop: 6 }}>Сверяю с 1 240 объявлениями на внешних площадках</span>
            <div className="escrow-track" style={{ marginTop: 16 }}><div className="escrow-fill" style={{ width: '100%', transition: 'width 1.6s ease' }} /></div>
          </div>
        )}

        {step === 'review' && (
          <div className="col gap14 fade-in">
            <Field label="Название" ai><div className="title">{MY_LOT.title}</div></Field>
            <Field label="Категория" ai><CatTag cat={MY_LOT.cat} /></Field>
            <Field label="Описание" ai><span className="body" style={{ color: 'var(--ink-2)' }}>{MY_LOT.desc}</span></Field>
            <Field label="Оценка стоимости" ai>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Credit n={MY_LOT.value} size={22} coin={18} />
                <span className="cap">диапазон ₽{fmt(MY_LOT.aiLow)}–{fmt(MY_LOT.aiHigh)}</span>
              </div>
            </Field>
            <Field label="Готов(а) обменять на"><span className="body">{MY_LOT.wants}</span></Field>
          </div>
        )}
      </div>

      <div className="px" style={{ padding: '12px 18px calc(12px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--line)', background: '#fff' }}>
        <button className="btn btn-primary btn-block btn-lg" disabled={step !== 'review'} onClick={onPublish}>
          {step === 'review' ? 'Опубликовать' : 'Сначала добавьте фото'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, ai, children }) {
  return (
    <div className="col gap6">
      <div className="row gap8"><span className="over">{label}</span>{ai && <AIBadge>заполнено AI</AIBadge>}</div>
      <div className="card" style={{ padding: 13 }}>{children}</div>
    </div>
  );
}
