/**
 * Onboarding — StudyBuddy's four short steps: You → Subject → Goal → Time.
 * Paste becomes real concepts (AVENIQ's parser + draft review), samples
 * seed demo subjects, and you land in a working product. Nothing is asked
 * twice; everything is honest.
 */
import React, { useState } from 'react';
import { useServices, navigate } from '../../appContext';
import { Icon, useToast } from '../components';

const STEPS = ['You', 'Subject', 'Goal', 'Time'];

const SAMPLE_OPTIONS = [
  { id: 'biology', label: 'Cell biology (sample)' },
  { id: 'code', label: 'Sorting algorithms (sample)' },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const services = useServices();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [goal, setGoal] = useState('');
  const [examDate, setExamDate] = useState('');
  const [minutes, setMinutes] = useState(10);
  const [paste, setPaste] = useState('');
  const [withSamples, setWithSamples] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const canNext =
    step === 0 ? true
    : step === 1 ? subject.trim().length > 0 || paste.trim().length > 0 || withSamples
    : true;

  const finish = async () => {
    setBusy(true);
    setErr('');
    try {
      const learner = await services.learning.getLearner();
      if (name.trim()) {
        await services.db.learner.put({
          ...learner,
          name: name.trim(),
          settings: { ...learner.settings, dailyMinutesGoal: minutes, defaultSessionMinutes: minutes },
          updatedAt: Date.now(),
        });
      }
      let subjectId: string | undefined;
      if (subject.trim()) {
        const created = await services.content.createSubject(
          subject.trim(),
          goal.trim() || 'Added during setup',
          '#2e3650',
          'library',
        );
        subjectId = created.id;
        if (paste.trim()) {
          const parsed = await services.content.parseImport(paste, 'auto');
          if (parsed.format === 'term-def' && parsed.drafts.length) {
            await services.content.commitDrafts(parsed.drafts, { subjectId: created.id });
            toast(`Imported ${parsed.drafts.length} concepts from your paste.`, 'info');
          }
        }
        if (examDate) {
          await services.exams.createExam({
            title: `${subject.trim()} exam`,
            subjectId: created.id,
            date: new Date(examDate).getTime(),
          });
        }
      }
      if (!withSamples) {
        // remove the pristine seeded sample subjects (nothing studied yet)
        const seeded = await services.db.subjects.toArray();
        const states = await services.db.conceptStates.toArray();
        const studied = new Set(states.filter((x) => x.attempts > 0).map((x) => x.conceptId));
        const concepts = await services.db.concepts.toArray();
        for (const sub of seeded) {
          const own = concepts.filter((c) => c.subjectId === sub.id);
          if (own.length && !own.some((c) => studied.has(c.id))) {
            for (const c of own) await services.content.deleteConcept(c.id);
            await services.db.topics.where('subjectId').equals(sub.id).delete();
            await services.db.subjects.delete(sub.id);
          }
        }
      }
      localStorage.setItem('aveniq.onboarded', '1');
      onDone();
      navigate('/home');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong — nothing was lost.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ob-wrap">
      <div className="ob-brand">
        <span className="wordmark-mark">
          <svg width="19" height="19" viewBox="0 0 64 64" aria-hidden="true">
            <path d="M14 46 C 26 46, 30 32, 46 32" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray="4 7" />
            <circle cx="14" cy="46" r="6" fill="currentColor" />
            <circle cx="46" cy="32" r="6.5" fill="currentColor" />
          </svg>
        </span>
        <span className="ob-brand-name">Aven<em>iq</em></span>
      </div>

      <div className="ob-card">
        <div className="runner-progress"><span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>

        {step === 0 && (
          <>
            <h1>A calm place to study with purpose.</h1>
            <p className="muted">
              Aveniq learns your state — every concept, what you know, what’s slipping — and turns it into
              the right next step. It all stays on this device.
            </p>
            <div className="mt">
              <label className="label" htmlFor="ob-name">What should we call you?</label>
              <input
                id="ob-name"
                className="input"
                placeholder="Your name (optional)"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setStep(1)}
              />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1>What are you studying?</h1>
            <p className="muted">Paste notes or a vocab list — Aveniq turns them into concepts you can review before saving. Or start from a sample.</p>
            <div className="mt">
              <label className="label" htmlFor="ob-subject">Subject name</label>
              <input
                id="ob-subject"
                className="input"
                placeholder="e.g. Biology, Spanish, CS fundamentals"
                value={subject}
                autoFocus
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="mt">
              <label className="label" htmlFor="ob-paste">Paste material (optional)</label>
              <textarea
                id="ob-paste"
                className="textarea"
                rows={5}
                placeholder={'One concept per line, e.g.\nosmosis — water moves across a semipermeable membrane\nmitosis — cell division producing two identical cells'}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
              <span className="hint">You’ll review exactly what was understood before anything is saved.</span>
            </div>
            <div className="mt">
              <label className="label">Samples</label>
              {SAMPLE_OPTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`mode-chip ${withSamples ? 'on' : ''}`}
                  onClick={() => setWithSamples(!withSamples)}
                  style={{ marginRight: 6 }}
                >
                  {s.label}
                </button>
              ))}
              <span className="hint"> {withSamples ? 'will be added' : 'skip samples'}</span>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1>Any goal or deadline?</h1>
            <p className="muted">Optional — but a goal changes how AVENIQ paces you: catch-up, load-lightening, exam weighting.</p>
            <div className="mt">
              <label className="label" htmlFor="ob-goal">Goal</label>
              <input
                id="ob-goal"
                className="input"
                placeholder="e.g. Pass the June final with a B+"
                value={goal}
                autoFocus
                onChange={(e) => setGoal(e.target.value)}
              />
            </div>
            <div className="mt">
              <label className="label" htmlFor="ob-exam">Exam date (optional)</label>
              <input id="ob-exam" className="input" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1>How much time do you have, honestly?</h1>
            <p className="muted">Daily goal — change it any time. Small and real beats big and imagined; streaks count real learning acts, not logins.</p>
            <div className="mt">
              <div className="btn-row">
                {[5, 10, 15, 25, 40].map((m) => (
                  <button key={m} className={`btn ${minutes === m ? 'btn-primary' : ''}`} onClick={() => setMinutes(m)}>{m}m</button>
                ))}
              </div>
            </div>
          </>
        )}

        {err && <p className="small" style={{ color: 'var(--berry)' }}>{err}</p>}

        <div className="form-actions mt">
          <span>
            {step > 0 && (
              <button className="btn btn-ghost" onClick={() => setStep(step - 1)} disabled={busy}>
                <Icon name="back" size={15} /> Back
              </button>
            )}
          </span>
          <span>
            {step < STEPS.length - 1 ? (
              <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</button>
            ) : (
              <button className="btn btn-primary" disabled={busy} onClick={finish}>
                {busy ? 'Setting things up…' : 'Open Aveniq →'}
              </button>
            )}
          </span>
        </div>
      </div>
      <p className="tiny muted" style={{ marginTop: 14, textAlign: 'center' }}>
        Offline-first · your learning history belongs to you · AI is optional
      </p>
    </div>
  );
}
