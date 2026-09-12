/**
 * Exam setup + runner (StudyBuddy exam runner pattern): pick the paper type,
 * sit it under time, get an honest result that feeds mastery, readiness,
 * and the plan. AVENIQ's exam engine generates interleaved, adaptive papers.
 */
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices } from '../../appContext';
import { Icon } from '../components';
import { useRunner, RunnerProps } from '../runnerHost';
import { putTest, getTest, updateTest } from './examRunnerState';
import { Question } from '../../domain/types';
import { evaluateShortAnswer } from '../../domain/teachback';

const KINDS: { id: 'mixed' | 'weak-area' | 'due-review' | 'timed'; label: string; hint: string }[] = [
  { id: 'mixed', label: 'Full mix', hint: 'interleaved, like the real exam' },
  { id: 'weak-area', label: 'Weak areas', hint: 'targets what you keep missing' },
  { id: 'due-review', label: 'Due review', hint: 'scheduled retrievals, exam format' },
  { id: 'timed', label: 'Timed', hint: 'against the clock' },
];

export function ExamSetup({ subjectId, examId, close }: RunnerProps & { subjectId: string; examId?: string }) {
  const services = useServices();
  const runner = useRunner();
  const [kind, setKind] = useState<'mixed' | 'weak-area' | 'due-review' | 'timed'>('mixed');
  const [count, setCount] = useState(8);
  const [busy, setBusy] = useState(false);
  const subject = useLiveQuery(() => services.db.subjects.get(subjectId), [subjectId]);

  const start = async () => {
    setBusy(true);
    try {
      const test = await services.exams.generatePracticeTest({
        subjectId,
        kind,
        count,
        timeLimitMinutes: kind === 'timed' ? Math.max(5, Math.round(count * 1.2)) : undefined,
        examId,
      });
      if (!test.questionIds.length) {
        setBusy(false);
        return;
      }
      putTest(test);
      close();
      runner.open({ kind: 'exam', testId: test.id });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="page-kicker">{subject?.name ?? 'Practice'}</div>
      <h2 style={{ marginBottom: 'var(--space-4)' }}>Sit a practice paper.</h2>
      <p className="small muted mb">Questions are interleaved on purpose — blocking by topic is easier and teaches less. Results feed mastery, readiness and your plan.</p>

      <div className="label">Paper type</div>
      <div className="btn-row mt-1" style={{ gap: 6 }}>
        {KINDS.map((k) => (
          <button key={k.id} className={`mode-chip ${kind === k.id ? 'on' : ''}`} onClick={() => setKind(k.id)} aria-pressed={kind === k.id}>
            {k.label}
          </button>
        ))}
      </div>
      <p className="tiny muted mt-2">{KINDS.find((k) => k.id === kind)?.hint}</p>

      <div className="label mt-3">Length</div>
      <div className="btn-row mt-1">
        {[5, 8, 12, 20].map((n) => (
          <button key={n} className={`btn btn-sm ${count === n ? 'btn-primary' : ''}`} onClick={() => setCount(n)}>{n} questions</button>
        ))}
      </div>

      <div className="btn-row mt-4" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={close}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={start}>
          <Icon name="target" size={15} /> {busy ? 'Setting the paper…' : 'Begin'}
        </button>
      </div>
    </div>
  );
}

export function ExamRunner({ testId, close }: RunnerProps & { testId: string }) {
  const services = useServices();
  const [test, setTest] = useState(() => getTest(testId));
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [startAt] = useState(Date.now());
  const [finished, setFinished] = useState(false);

  React.useEffect(() => {
    void (async () => {
      if (!test) return;
      const qs = await Promise.all(test.questionIds.map((id) => services.db.questions.get(id)));
      setQuestions(qs.filter(Boolean) as Question[]);
    })();
  }, [test, services]);

  if (!test) return <div className="panel">Test not found. <button className="btn" onClick={close}>Close</button></div>;
  if (!questions) return <div className="panel muted">Setting the paper…</div>;

  const q = questions[i];
  const correct = test.results.filter((r) => r.correct).length;

  const submit = async () => {
    if (!q) return;
    const score = q.kind === 'mc'
      ? (q.choices ?? []).find((c) => c.id === chosen)?.correct ? 1 : 0
      : evaluateShortAnswer(answer, q.keywords, q.partialKeywords).score;
    const updated = await services.exams.submitTestAnswer(test, q.id, score, Date.now() - startAt);
    updateTest(updated);
    setTest(updated);
    setChosen(null);
    setAnswer('');
    if (i + 1 >= questions.length) setFinished(true);
    else setI(i + 1);
  };

  if (finished || !q) {
    const pct = Math.round((correct / Math.max(1, test.results.length)) * 100);
    return (
      <div>
        <div className="runner-progress"><span style={{ width: '100%' }} /></div>
        <div className="panel center">
          <div className="page-kicker">Paper done</div>
          <h2 style={{ fontSize: 30, margin: '6px 0' }}>{correct}/{test.results.length}</h2>
          <p className="small muted">
            {pct >= 80 ? 'Strong paper — readiness just moved up.' : pct >= 60 ? 'Solid middle — the misses are now diagnosed and queued.' : 'Rough paper, and that’s information: every miss has a root cause on your Review page.'}
          </p>
          <div className="btn-row mt-3" style={{ justifyContent: 'center' }}>
            <button className="btn" onClick={() => runner_openReview()}>Review what this changed</button>
            <button className="btn btn-primary" onClick={close}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="runner-progress"><span style={{ width: `${(i / questions.length) * 100}%` }} /></div>
      <div className="runner-meta">
        <span>Practice paper · question {i + 1} of {questions.length}</span>
        <span className="num">{correct} correct so far</span>
      </div>

      <div className="panel">
        <div className="tiny muted mb">{q.cognitiveLevel}{q.scenario ? ' · scenario' : ''}</div>
        {q.scenario && <div className="q-scenario">{q.scenario}</div>}
        <div className="q-prompt">{q.prompt}</div>
        {q.kind === 'mc' ? (
          (q.choices ?? []).map((c, ci) => (
            <button key={c.id} className={`choice ${chosen === c.id ? 'sel' : ''}`} onClick={() => setChosen(c.id)}>
              <span className="letter">{String.fromCharCode(65 + ci)}</span>
              {c.text}
            </button>
          ))
        ) : (
          <textarea className="textarea" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer…" aria-label="Answer" />
        )}
        <div className="btn-row mt-3" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" disabled={q.kind === 'mc' ? !chosen : !answer.trim()} onClick={submit}>Next</button>
        </div>
      </div>
    </div>
  );

  function runner_openReview() {
    close();
    window.location.hash = '#/review';
  }
}
