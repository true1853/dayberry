// screen-onboarding.jsx — onboarding + create listing
import React from 'react';
import { Icon } from './icons.jsx';
import { fmt, Photo, IconBtn, Coin } from './ui.jsx';
import { analyzeListingAction } from './server/actions.js';

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
        <span className="row gap8"><div className="logo" style={{ width: 26, height: 26, fontSize: 12 }}>ДБ</div><span className="h3">Дай бери</span></span>
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

const KIND_OPTIONS = [
  { id: 'item',    label: 'Товар',  icon: 'tag' },
  { id: 'service', label: 'Услуга', icon: 'spark' },
];

const CATS = {
  item: [
    ['gadget', 'Техника'],
    ['eco', 'Вещи и эко'],
  ],
  service: [
    ['digital', 'Услуги и цифра'],
  ],
};

const inputStyle = {
  width: '100%', padding: '13px 16px', border: '1.5px solid var(--line)', borderRadius: 14, fontSize: 15,
  fontFamily: 'var(--font)', background: '#fff', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box',
  transition: 'border-color .15s',
};

export function CreateListing({ onClose, onPublish, initialWants = '', editLot = null }) {
  const [kind, setKind] = React.useState(editLot ? (editLot.cat === 'digital' ? 'service' : 'item') : 'item'); // 'item' | 'service'
  const [cat, setCat] = React.useState(editLot ? editLot.cat : 'gadget');
  const [condition, setCondition] = React.useState(editLot ? (editLot.condition || 'Новое или Б/У') : 'Новое или Б/У');
  const [title, setTitle] = React.useState(editLot ? editLot.title : '');
  const [value, setValue] = React.useState(editLot ? String(editLot.value) : '');
  const [wants, setWants] = React.useState(editLot ? editLot.wants : (initialWants || ''));
  const [desc, setDesc] = React.useState('');
  const [photo, setPhoto] = React.useState('');
  const [photoName, setPhotoName] = React.useState('');
  const [error, setError] = React.useState('');
  const [aiBusy, setAiBusy] = React.useState(false);
  const aiBusyRef = React.useRef(false);
  const [aiNote, setAiNote] = React.useState('');
  const [aiError, setAiError] = React.useState('');
  const [wantsHints, setWantsHints] = React.useState([]);
  const [aiRange, setAiRange] = React.useState(null);
  const [publishing, setPublishing] = React.useState(false);
  const publishingRef = React.useRef(false);

  const chooseKind = (k) => {
    setKind(k);
    setCat(k === 'service' ? 'digital' : 'gadget');
    setCondition(k === 'service' ? 'Услуга' : 'Новое или Б/У');
  };

  const valueNum = Number(value);
  const aiLow = valueNum > 0 ? Math.round(valueNum * 0.92) : 0;
  const aiHigh = valueNum > 0 ? Math.round(valueNum * 1.08) : 0;

  const runAI = async (mode) => {
    if (aiBusyRef.current) return;
    aiBusyRef.current = true;
    setAiBusy(true);
    setAiError('');
    try {
      const res = await analyzeListingAction({
        kind,
        title: title.trim(),
        photo: photo && photo.length <= 3500000 ? photo : '',
        value: valueNum,
        wants: wants.trim(),
      });
      if (!res.ok) { setAiError(res.error || 'Не удалось получить ответ ИИ'); return; }
      const d = res.draft || {};
      setWantsHints((d.wants || '').split(',').map(s => s.trim()).filter(Boolean));
      if (d.aiLow > 0 && d.aiHigh > d.aiLow) setAiRange({ low: d.aiLow, high: d.aiHigh });
      if (mode === 'price') {
        if (d.value > 0) setValue(String(d.value));
        setAiNote(`AI-оценка: ${fmt(d.value)} Б · диапазон ${fmt(d.aiLow)}–${fmt(d.aiHigh)} Б. ${d.reasoning || ''}`);
      } else {
        if (d.title && !title.trim()) setTitle(d.title);
        if (d.cat) setCat(d.cat);
        if (d.condition && kind === 'item') setCondition(d.condition);
        if (d.desc && (!desc.trim() || desc.trim().startsWith('Готов(а)'))) setDesc(d.desc);
        if (d.wants && !wants.trim()) setWants(d.wants);
        if (d.value > 0 && !valueNum) setValue(String(d.value));
        setAiNote(`${d.ai === false ? 'Быстрый черновик. ' : ''}${d.reasoning || 'Проверьте и поправьте поля.'}`);
      }
    } catch (e) {
      setAiError('Не удалось получить ответ ИИ');
    } finally {
      aiBusyRef.current = false;
      setAiBusy(false);
    }
  };

  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { setPhoto(reader.result); setPhotoName(f.name); };
    reader.readAsDataURL(f);
  };

  const submit = async () => {
    if (publishingRef.current) return;
    if (!title.trim()) return setError('Введите название');
    if (!valueNum || valueNum <= 0) return setError('Укажите оценку в баллах');
    if (!wants.trim()) return setError('Укажите, на что хотите обменять');
    setError('');
    const placeholder = kind === 'service' ? 'УСЛУГА' : (cat === 'gadget' ? 'ТЕХНИКА' : 'ВЕЩЬ');
    const lot = {
      id: editLot ? editLot.id : undefined,
      title: title.trim(),
      cat,
      value: valueNum,
      aiLow: aiRange ? aiRange.low : (valueNum > 0 ? Math.round(valueNum * 0.92) : 0),
      aiHigh: aiRange ? aiRange.high : (valueNum > 0 ? Math.round(valueNum * 1.08) : 0),
      valuationSource: aiRange ? 'ai' : 'manual',
      photo: photoName || placeholder,
      photoUrl: photo || undefined,
      photos: 1,
      condition: condition || (kind === 'service' ? 'Услуга' : 'Новое или Б/У'),
      posted: 'только что',
      owner: 'me',
      wants: wants.trim(),
      desc: desc.trim() || (kind === 'service'
        ? 'Готов(а) оказать услугу на условиях бартера. Обсудим детали в чате.'
        : 'Готов(а) обменять вещь на условиях бартера. Обсудим детали в чате.'),
      views: 0,
      hot: false,
    };
    publishingRef.current = true;
    setPublishing(true);
    try {
      await onPublish(lot);
    } catch (e) {
      setError('Не удалось опубликовать — попробуйте ещё раз');
      publishingRef.current = false;
      setPublishing(false);
    }
  };

  return (
    <div className="app" style={{ position: 'absolute' }}>
      <div className="safe-top" />
      <div className="row gap10" style={{ padding: '4px 14px 12px', alignItems: 'center' }}>
        <IconBtn name="close" onClick={onClose} />
        <span className="h3 grow">{editLot ? 'Редактировать объявление' : 'Новое объявление'}</span>
      </div>

      <div className="app-scroll px col gap16" style={{ paddingBottom: 20 }}>
        <div className="col gap8">
          <span className="over">Что вы добавляете?</span>
          <div className="row gap8">
            {KIND_OPTIONS.map(k => (
              <button key={k.id} onClick={() => chooseKind(k.id)} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '13px 10px', borderRadius: 14, cursor: 'pointer', fontFamily: 'var(--font)',
                fontSize: 14.5, fontWeight: 700, border: '1.5px solid', transition: 'all .15s',
                background: kind === k.id ? 'var(--berry)' : '#fff',
                borderColor: kind === k.id ? 'var(--berry)' : 'var(--line)',
                color: kind === k.id ? '#fff' : 'var(--ink-2)',
              }}>
                <Icon name={k.icon} size={18} color={kind === k.id ? '#fff' : 'var(--ink-3)'} />
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div className="col gap8">
          <span className="over">Фото</span>
          <div className="row gap10" style={{ overflowX: 'auto' }}>
            {photo ? (
              <div className="photo" style={{ width: 96, height: 96, flex: 'none', borderRadius: 16, position: 'relative' }}>
                <img src={photo} alt="фото" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <button onClick={() => setPhoto('')} style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 999, border: 'none', background: 'rgba(28,12,18,0.6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Icon name="close" size={13} color="#fff" />
                </button>
              </div>
            ) : (
              <label className="col gap6" style={{ width: 96, height: 96, flex: 'none', borderRadius: 16, border: '2px dashed var(--berry-200)', background: 'var(--berry-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <Icon name="camera" size={24} color="var(--berry)" />
                <span className="cap" style={{ color: 'var(--berry)' }}>Добавить</span>
                <input type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
              </label>
            )}
            <Photo label={photoName || (kind === 'service' ? 'УСЛУГА' : (cat === 'gadget' ? 'ТЕХНИКА' : 'ВЕЩЬ'))} cat={cat} style={{ width: 96, height: 96, flex: 'none', borderRadius: 16 }} />
          </div>
          <span className="cap">Можно без фото — подставится заглушка категории.</span>
        </div>

        <div className="card" style={{ padding: 12, background: 'var(--berry-50)', border: '1px dashed var(--berry-200)' }}>
          <div className="row gap10" style={{ alignItems: 'center' }}>
            <Icon name="ai" size={20} color="var(--berry)" />
            <div className="grow col" style={{ gap: 2 }}>
              <span className="title" style={{ fontSize: 13.5 }}>AI-помощник</span>
              <span className="cap">Добавьте фото или название — заполним категорию, цену и описание.</span>
            </div>
            <button className="btn btn-primary" style={{ padding: '10px 14px', fontSize: 13 }} disabled={aiBusy} onClick={() => runAI('all')}>
              {aiBusy ? 'Думаю…' : 'Заполнить'}
            </button>
          </div>
          {aiNote && <span className="cap row gap6" style={{ color: 'var(--berry)', marginTop: 8 }}><Icon name="ai" size={13} color="var(--berry)" />{aiNote}</span>}
          {aiError && <span className="cap" style={{ color: 'var(--warn)', marginTop: 6 }}>{aiError}</span>}
        </div>

        <div className="col gap8">
          <span className="over">Категория</span>
          <div className="row gap8" style={{ flexWrap: 'wrap' }}>
            {CATS[kind].map(([id, label]) => (
              <div key={id} className={'chip chip-berry' + (cat === id ? ' is-on' : '')} onClick={() => setCat(id)}>{label}</div>
            ))}
          </div>
        </div>

        {kind === 'item' && (
          <div className="col gap8">
            <span className="over">Состояние</span>
            <div className="row gap8" style={{ flexWrap: 'wrap' }}>
              {['Новое или Б/У', 'Отличное', 'Хорошее'].map(c => (
                <div key={c} className={'chip chip-berry' + (condition === c ? ' is-on' : '')} onClick={() => setCondition(c)}>{c}</div>
              ))}
            </div>
          </div>
        )}

        <div className="col gap6">
          <span className="over">{kind === 'service' ? 'Название услуги' : 'Название товара'}</span>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={kind === 'service' ? 'Например: Лендинг под ключ' : 'Например: PlayStation 5 Slim'}
            style={inputStyle}
          />
        </div>

        <div className="col gap6">
          <span className="over">Оценка в баллах (Б)</span>
          <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--line)', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
            <input
              type="number" inputMode="numeric" min="0" step="500"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="Например: 45000"
              style={{ flex: 1, padding: '13px 16px', border: 'none', outline: 'none', fontSize: 15, fontFamily: 'var(--font)', background: 'transparent' }}
            />
            <button onClick={() => runAI('price')} disabled={aiBusy} title="Подобрать цену с помощью ИИ" style={{ background: 'var(--berry-50)', border: 'none', color: 'var(--berry)', padding: '0 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Icon name="ai" size={18} /></button>
            <Coin size={26} />
            <span style={{ paddingRight: 12 }} />
          </div>
          {aiRange && (
            <span className="cap row gap6" style={{ color: 'var(--berry)' }}>
              <Icon name="ai" size={13} color="var(--berry)" />AI-диапазон: {fmt(aiRange.low)}–{fmt(aiRange.high)} Б
            </span>
          )}
        </div>

        <div className="col gap6">
          <span className="over">Готов(а) обменять на</span>
          <input
            value={wants}
            onChange={e => setWants(e.target.value)}
            placeholder="Например: техника Apple, фотоаппарат, реклама"
            style={inputStyle}
          />
          {wantsHints.length > 0 && (
            <div className="row gap6" style={{ flexWrap: 'wrap', marginTop: 4 }}>
              <span className="cap row gap4" style={{ color: 'var(--ink-3)' }}><Icon name="ai" size={12} color="var(--berry)" />AI подобрал:</span>
              {wantsHints.map((h, i) => (
                <div key={i} className="chip chip-berry" onClick={() => setWants(h)}>{h}</div>
              ))}
            </div>
          )}
        </div>

        <div className="col gap6">
          <span className="over">Описание</span>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Состояние, комплект, сроки и детали…"
            rows={4}
            style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }}
          />
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--berry-50)', border: '1px solid var(--berry-200)', color: 'var(--berry-700)', fontSize: 13.5, fontWeight: 500 }}>
            {error}
          </div>
        )}
      </div>

      <div className="px" style={{ padding: '12px 18px calc(12px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--line)', background: '#fff' }}>
        <button className="btn btn-primary btn-block btn-lg" onClick={submit} disabled={publishing} style={{ opacity: publishing ? 0.8 : 1 }}>
          {publishing ? (
            <><span className="spin" />{editLot ? 'Сохраняем…' : 'Публикуем…'}</>
          ) : (
            <><Icon name="check" size={18} color="#fff" />{editLot ? 'Сохранить' : 'Опубликовать'}</>
          )}
        </button>
      </div>
    </div>
  );
}
