/**
 * Session setup dialog — StudyBuddy's signature UX: pick subject, time and
 * intent, see the live plan preview ("Your session"), then start.
 */
import React, { useEffect, useState } from 'react';
import { useServices } from '../../appContext';
import { Icon } from '../components';
import { useRunner, RunnerProps } from '../runnerHost';
import { SegmentPlan } from '../../domain/types';
import { t } from '../../domain/i18n';

const TIMES = [5, 10, 15, 25, 40];

const FOCUS: { id: string; label: string }[] = [
  { id: 'auto', label: 'Smart mix' },
  { id: 'due', label: 'Due review' },
  { id: 'weak', label: 'Weak spots' },
  { id: 'application', label: 'Application' },
  { id: 'compare', label: 'Contrast' },
  { id: 'blurt', label: 'Brain dump' },
];

const SEG_ICON: Record<string, string> = {
  warmup: 'review',
  'first-encounter': 'spark',
  review: 'gaps',
  retrieval: 'learn',
  application: 'target',
  'teach-back': 'sound',
  comparison: 'compare',
  blurt: 'blurt',
  reflection: 'bulb',
};

const SEG_TITLE: Record<string, string> = {
  warmup: 'Warm-up · what’s due',
  'first-encounter': 'First encounter · learn from zero',
  review: 'Review · strengthen shaky ground',
  retrieval: 'Retrieval · from memory, no hints',
  application: 'Application · use it somewhere new',
  'teach-back': 'Teach it back',
  comparison: 'Contrast training',
  blurt: 'Brain dump',
  reflection: 'Reflection',
};

export function SessionSetup({ subjectId, conceptIds, minutes: mins, focus: focusIn, close }: RunnerProps & { subjectId?: string; conceptIds?: string[]; minutes?: number; focus?: { type: string } }) {
  const services = useServices();
  const runner = useRunner();
  const subjects = useServicesSafeSubjects();
  const [subject, setSubject] = useState(subjectId ?? '');
  const [minutes, setMinutes] = useState(mins ?? 10);
  const [focus, setFocus] = useState(focusIn?.type ?? 'auto');
  const [plan, setPlan] = useState<SegmentPlan[] | null>(null);
  const [reason, setReason] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    void (async () => {
      const preview: { plan: SegmentPlan[]; reasonKey: string } = conceptIds?.length
        ? { plan: [{ type: 'first-encounter', conceptIds, estMinutes: minutes, reasonKey: 'focus.due' }], reasonKey: 'focus.due' }
        : await services.sessions.preview({
            minutes,
            subjectId: subject || undefined,
            focus: focus === 'auto' ? undefined : ({ type: focus } as never),
          });
      setPlan(preview.plan);
      setReason(t(preview.reasonKey));
    })();
  }, [services, subject, minutes, focus, conceptIds]);

  const start = async () => {
    setStarting(true);
    try {
      const session = await services.sessions.start({
        minutes,
        subjectId: subject || undefined,
        conceptIds,
        focus: focus === 'auto' ? undefined : ({ type: focus } as never),
      });
      close();
      if (session.items.length) runner.open({ kind: 'session', sessionId: session.id });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="panel">
      <div className="page-kicker">Plan a study session</div>
      <h2 style={{ marginBottom: 'var(--space-4)' }}>You have {minutes} minutes — let’s use them well.</h2>

      {subjects.length > 1 && (
        <div className="field">
          <label className="label">Subject</label>
          <select className="select" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">Everything</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <span className="hint">leave on Everything for a global session</span>
        </div>
      )}

      <div className="label">How much time do you have?</div>
      <div className="btn-row mt-1">
        {TIMES.map((m) => (
          <button key={m} className={`btn btn-sm ${minutes === m ? 'btn-primary' : ''}`} onClick={() => setMinutes(m)}>{m}m</button>
        ))}
      </div>

      <div className="mt-3">
        <div className="label">Session intent <span className="hint">· shapes the segment mix</span></div>
        <div className="btn-row mt-1" style={{ gap: 6 }}>
          {FOCUS.map((f) => (
            <button key={f.id} className={`mode-chip ${focus === f.id ? 'on' : ''}`} aria-pressed={focus === f.id} onClick={() => setFocus(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="page-kicker">Your session</div>
        <p className="small muted">{reason}</p>
        <div className="stack mt-2">
          {plan?.filter((seg) => seg.conceptIds.length > 0 || seg.type === 'reflection').map((seg, i) => (
            <div key={i} className="split" style={{ alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span className="small" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name={SEG_ICON[seg.type] ?? 'learn'} size={15} />
                {SEG_TITLE[seg.type] ?? seg.type}
                <span className="tiny muted">{seg.conceptIds.length ? `${seg.conceptIds.length} items` : ''}</span>
              </span>
              <span className="tiny num muted">~{seg.estMinutes}m</span>
            </div>
          ))}
          {plan && !plan.some((seg) => seg.conceptIds.length > 0) && (
            <p className="small muted">Nothing queued for this intent yet — try another intent, or learn a concept first.</p>
          )}
        </div>
      </div>

      <div className="btn-row mt-4" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={close}>Cancel</button>
        <button className="btn btn-primary" disabled={starting || !plan?.some((seg) => seg.conceptIds.length > 0)} onClick={start}>
          <Icon name="play" size={15} /> {starting ? 'Planning…' : `Start · ~${minutes} min`}
        </button>
      </div>
    </div>
  );
}

function useServicesSafeSubjects() {
  const services = useServices();
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    void services.content.subjects().then((s) => setSubjects(s.map((x) => ({ id: x.id, name: x.name }))));
  }, [services]);
  return subjects;
}
