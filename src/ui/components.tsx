/**
 * Shared UI atoms: icons, state chips, mastery ring, toggle, modal, toasts,
 * vocabulary decoder chip (req 6).
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Concept, KnowledgeState, StateFlag, Term, ExplanationStyle } from '../domain/types';
import { t } from '../domain/i18n';

/* ---------------- icons (inline, tiny) ---------------- */

const paths: Record<string, string> = {
  today: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  library: 'M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v4zm-4 4H9v-2h6v2zm4-8H9V5h10v2z',
  map: 'M15 6 9 3 3 6v15l6-3 6 3 6-3V3l-6 3zM9 5l6 3v11l-6-3V5z',
  gaps: 'M12 2 1 21h22L12 2zm1 14h-2v2h2v-2zm0-6h-2v4h2v-4z',
  progress: 'M3 17h4v7H3zM10 11h4v13h-4zM17 4h4v20h-4z',
  exams: 'M19 3h-4.2A3 3 0 0 0 12 1a3 3 0 0 0-2.8 2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-7 2a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-2 14H7v-2h3v2zm0-4H7v-2h3v2zm0-4H7V9h3v2zm5 8h-3v-2h3v2zm0-4h-3v-2h3v2zm0-4h-3V9h3v2z',
  planner: 'M7 11v2h10v-2H7zm5-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z',
  settings: 'M19.4 13a7.9 7.9 0 0 0 0-2l2-1.6-2-3.4-2.4 1a8 8 0 0 0-1.7-1L15 3h-4l-.3 2.6a8 8 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.9 7.9 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 1.7 1L11 21h4l.3-2.6a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
  learn: 'M12 3 1 9l11 6 9-4.9V17h2V9L12 3zM5 13.2v3.3l7 3.8 7-3.8v-3.3l-7 3.8-7-3.8z',
  spark: 'M12 2l1.9 6.3L20 10l-6.1 1.7L12 18l-1.9-6.3L4 10l6.1-1.7L12 2z',
  check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z',
  x: 'M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4z',
  bulb: 'M12 2a7 7 0 0 0-4 12.7V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.3A7 7 0 0 0 12 2zM9 21h6v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1z',
  sound: 'M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z',
  search: 'M15.5 14h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z',
  flame: 'M13.5 1s.5 3-1.5 5-4 3-4 6a5 5 0 0 0 10 0c0-4-4.5-11-4.5-11zM8 13a3 3 0 0 0 3 3v2a5 5 0 0 1-5-5h2z',
  back: 'M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20v-2z',
  database: 'M12 2C7.6 2 4 3.3 4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5c0-1.7-3.6-3-8-3zm0 2c3.9 0 6 1.1 6 1.5S15.9 7 12 7 6 5.9 6 5.5 8.1 4 12 4zm6 15c0 .4-2.1 1.5-6 1.5S6 19.4 6 19v-2.5c1.5.9 3.6 1.3 6 1.3s4.5-.4 6-1.3V19zm0-5c0 .4-2.1 1.5-6 1.5S6 14.4 6 14v-2.5c1.5.9 3.6 1.3 6 1.3s4.5-.4 6-1.3V14z',
  bio: 'M6.5 2a4.5 4.5 0 0 0 0 9 4.5 4.5 0 0 0 0-9zM6.5 11a4.5 4.5 0 0 0 0 9 4.5 4.5 0 0 0 0-9zM17.5 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM17.5 11a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z',
  code: 'M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
  import: 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-6 14h-2v-4H7l5-5 5 5h-4v4z',
  more: 'M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  home: 'M12 3 2 12h3v8h6v-6h2v6h6v-8h3L12 3z',
  target: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  review: 'M12 5V2L7 6.5 12 11V8c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6H4c0 4.4 3.6 8 8 8s8-3.6 8-8-3.6-8-8-8z',
  arrow: 'M5 13l7 7 7-7h-4V4h-6v9H5z',
  blurt: 'M4 5h16v2H4V5zm0 5h10v2H4v-2zm0 5h16v2H4v-2zm0 5h7v2H4v-2z',
  play: 'M8 5v14l11-7L8 5z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5h-2v6l5 3 1-1.7-4-2.3V7z',
  compare: 'M9 3 5 7l4 4V8h4V6H9V3zm6 14v3l4-4-4-4v3h-4v2h4z',
};

export function Icon({ name, size = 20, style }: { name: string; size?: number; style?: React.CSSProperties }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={style}>
      <path d={paths[name] ?? paths.spark} />
    </svg>
  );
}

/* ---------------- state chips ---------------- */

export function StateChip({ state, flag }: { state: KnowledgeState; flag?: StateFlag }) {
  if (flag === 'confused') return <span className={`chip state-chip flag-confused`}>{t('flag.confused')}</span>;
  if (flag === 'decaying') return <span className={`chip state-chip flag-decaying`}>{t('flag.decaying')}</span>;
  return <span className={`chip state-chip state-${state}`}>{t(`state.${state}`)}</span>;
}

/* ---------------- mastery ring ---------------- */

export function Ring({ value, size = 56, stroke = 6, color }: { value: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = c * Math.min(1, Math.max(0, value / 100));
  return (
    <span className="ring" style={{ width: size, height: size }} role="img" aria-label={`mastery ${Math.round(value)}%`}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color ?? 'var(--primary)'} strokeWidth={stroke} strokeDasharray={`${filled} ${c - filled}`} strokeLinecap="round" />
      </svg>
      <span className="ring-label">{Math.round(value)}</span>
    </span>
  );
}

/* ---------------- toggle ---------------- */

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
    />
  );
}

/* ---------------- modal ---------------- */

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <div className="row between mb">
          <h2>{title}</h2>
          <button className="btn subtle sm" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------------- toasts ---------------- */

export interface ToastMsg { id: number; text: string; kind?: 'info' | 'error' }

const ToastCtx = createContext<(text: string, kind?: 'info' | 'error') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const push = useCallback((text: string, kind: 'info' | 'error' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------- vocabulary decoder chip (req 6) ---------------- */

export function VocabText({
  text,
  concept,
  knownVocabulary,
  onSpeak,
}: {
  text: string;
  concept: Concept;
  knownVocabulary: Set<string>;
  onSpeak?: (text: string) => void;
}) {
  const [openTerm, setOpenTerm] = useState<Term | null>(null);
  const termsByName = new Map<string, Term>();
  for (const term of concept.terms) {
    termsByName.set(term.word.toLowerCase(), term);
    // alias form: "term|display" markers
  }
  const parts: { text: string; term?: string }[] = [];
  const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: m[2] ?? m[1], term: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });

  return (
    <>
      {parts.map((p, i) => {
        if (!p.term) return <span key={i}>{p.text}</span>;
        const term = termsByName.get(p.term.toLowerCase());
        const known = knownVocabulary.has(p.term.toLowerCase());
        return (
          <button
            key={i}
            className={`vterm ${known ? 'known' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpenTerm(term ?? { id: 'x', word: p.term!, definition: 'No decoder entry for this term yet.', simple: '', example: '', why: '' });
            }}
            title={`What does “${p.text}” mean?`}
          >
            {p.text}
          </button>
        );
      })}
      {openTerm && (
        <Modal title={openTerm.word} onClose={() => setOpenTerm(null)}>
          <div className="stack">
            <div className="term-card">
              <div className="word">{openTerm.word}</div>
              {openTerm.simple && <div className="row2"><span className="lbl">Simply</span>{openTerm.simple}</div>}
              {openTerm.definition && <div className="row2"><span className="lbl">Meaning</span>{openTerm.definition}</div>}
              {openTerm.example && <div className="row2"><span className="lbl">Example</span>{openTerm.example}</div>}
              {openTerm.why && <div className="row2"><span className="lbl">Why it matters here</span>{openTerm.why}</div>}
            </div>
            {onSpeak && (
              <button className="btn sm" onClick={() => onSpeak(`${openTerm.word}. ${openTerm.simple} ${openTerm.definition}`)}>
                <Icon name="sound" size={15} /> Read aloud
              </button>
            )}
            {openTerm.conceptId && (
              <a className="btn sm" href={`#/concept/${openTerm.conceptId}`}>Open as concept →</a>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------------- misc ---------------- */

export function Empty({
  glyph, icon, title, body, children,
}: {
  glyph?: string; icon?: string; title?: string; body?: string; children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-art" aria-hidden="true">{glyph ?? <Icon name={icon ?? 'spark'} size={30} />}</div>
      {title && <div className="empty-title">{title}</div>}
      {body && <p className="empty-body">{body}</p>}
      {children}
    </div>
  );
}

export function Bar({ value, color }: { value: number; color?: string }) {
  return (
    <div className="bar-track" role="presentation">
      <div className="bar-fill" style={{ width: `${Math.round(value * 100)}%`, ...(color ? { background: color } : {}) }} />
    </div>
  );
}

export function styleLabel(style: ExplanationStyle): string {
  return style.charAt(0).toUpperCase() + style.slice(1);
}
