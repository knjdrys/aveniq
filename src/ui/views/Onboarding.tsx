/**
 * First-run onboarding (StudyBuddy UX pattern): a short, honest intro —
 * philosophy, name, daily goal, first subject — straight into learning.
 * Zero-to-value in under a minute; nothing is asked twice.
 */
import React, { useState } from 'react';
import { useServices, navigate } from '../../appContext';
import { Icon } from '../components';

const PRINCIPLES = [
  ['spark', 'Not knowing is the start', 'Every concept begins at “unknown” — and that’s fine. AVENIQ teaches from zero: vocabulary, analogy, tiny example, then the real thing.'],
  ['gaps', 'Wrong answers are data', 'A mistake gets diagnosed — missing foundation, vocabulary, a trap you fell into — and the fix targets the cause. You are never just “wrong”.'],
  ['check', 'Mastery needs proof', 'Recognizing an answer isn’t knowing. Mastery requires retrieving it days later, applying it to new problems, and explaining it in your own words.'],
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const services = useServices();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState(10);
  const [subjectId, setSubjectId] = useState<string>('');
  const [subjects, setSubjects] = useState<{ id: string; name: string; icon: string; color: string }[]>([]);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    void services.content.subjects().then((s) => {
      setSubjects(s.map((x) => ({ id: x.id, name: x.name, icon: x.icon, color: x.color })));
      if (s[0]) setSubjectId(s[0].id);
    });
  }, [services]);

  const finish = async (startLearning: boolean) => {
    setBusy(true);
    try {
      const learner = await services.learning.getLearner();
      await services.db.learner.put({
        ...learner,
        name: name.trim() || 'Learner',
        settings: { ...learner.settings, dailyMinutesGoal: minutes, defaultSessionMinutes: minutes },
        updatedAt: Date.now(),
      });
      localStorage.setItem('aveniq.onboarded', '1');
      onDone();
      if (startLearning) navigate('/learn');
      else navigate('/home');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="onboard">
      <div className="onboard-card">
        <div className="onboard-steps" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className={step >= i ? 'on' : ''} />
          ))}
        </div>

        {step === 0 && (
          <>
            <div className="row mb" style={{ gap: 10 }}>
              <svg width="38" height="38" viewBox="0 0 64 64" aria-hidden="true">
                <path d="M14 46 C 26 46, 30 32, 46 32" stroke="var(--primary)" strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray="4 7" />
                <circle cx="14" cy="46" r="5.5" fill="var(--primary)" />
                <circle cx="30" cy="39.5" r="5" fill="var(--amber)" />
                <circle cx="50" cy="32" r="6" fill="var(--green)" />
              </svg>
              <div>
                <h1 style={{ fontSize: 26, letterSpacing: '-0.02em' }}>AVENIQ</h1>
                <div className="tiny muted" style={{ letterSpacing: '0.14em', textTransform: 'uppercase' }}>unknown → understood → remembered</div>
              </div>
            </div>
            <p className="small muted mb" style={{ fontSize: 14.5 }}>
              A learning system, not a quiz app. It figures out <em>why</em> something isn’t working and fixes
              the root — and it never makes you feel stupid for not knowing.
            </p>
            {PRINCIPLES.map(([icon, title, body]) => (
              <div key={title} className="row" style={{ gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                <span className="quick-ico" style={{ background: 'var(--primary-soft)', color: 'var(--primary)', width: 34, height: 34, borderRadius: 10 }}>
                  <Icon name={icon} size={17} />
                </span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{title}</div>
                  <div className="tiny muted">{body}</div>
                </div>
              </div>
            ))}
            <button className="btn primary lg block mt" onClick={() => setStep(1)}>
              Let’s go <Icon name="arrow" size={16} style={{ transform: 'rotate(-90deg)' }} />
            </button>
            <button className="btn subtle sm block mt" onClick={() => void finish(false)}>Skip — just show me the app</button>
          </>
        )}

        {step === 1 && (
          <>
            <h1>Two quick things</h1>
            <p className="small muted mb">Both change later in Settings.</p>
            <div className="field">
              <label>What should we call you?</label>
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                onKeyDown={(e) => e.key === 'Enter' && setStep(2)}
              />
            </div>
            <div className="field">
              <label>How much time do you usually have?</label>
              <div className="time-chips">
                {[5, 10, 25, 60].map((m) => (
                  <button key={m} className={`time-chip ${minutes === m ? 'active' : ''}`} onClick={() => setMinutes(m)}>
                    {m === 5 ? '5 min · micro' : m === 10 ? '10 min · focused' : m === 25 ? '25 min · balanced' : '60 min · deep'}
                  </button>
                ))}
              </div>
              <div className="hint">Even 5 minutes counts — a micro session is one meaningful unit of progress.</div>
            </div>
            <div className="row">
              <button className="btn primary" onClick={() => setStep(2)} disabled={!name.trim()}>Continue</button>
              <button className="btn subtle" onClick={() => setStep(0)}>Back</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1>Pick your first subject</h1>
            <p className="small muted mb">
              It already comes with concepts, questions, traps, and a learning map — you can add your own material any time.
            </p>
            {subjects.map((s) => (
              <button key={s.id} className={`onboard-choice ${subjectId === s.id ? 'sel' : ''}`} onClick={() => setSubjectId(s.id)}>
                <span className="quick-ico" style={{ background: 'var(--surface-2)', color: s.color, width: 36, height: 36 }}>
                  <Icon name={s.icon} size={18} />
                </span>
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                {subjectId === s.id && <Icon name="check" size={16} style={{ marginLeft: 'auto', color: 'var(--primary)' }} />}
              </button>
            ))}
            <div className="row mt">
              <button className="btn primary lg" disabled={busy} onClick={() => void finish(true)}>
                Start learning {busy ? '…' : '→'}
              </button>
              <button className="btn subtle" onClick={() => setStep(1)}>Back</button>
            </div>
            <div className="tiny muted mt">Your data stays on this device. No account, no tracking.</div>
          </>
        )}
      </div>
    </div>
  );
}
