/**
 * Exams view (req 35, 36, 37): exam list, create exam, explainable
 * readiness, practice tests (mixed / weak-area / due-review / timed).
 */
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices } from '../../appContext';
import { Empty, Icon, Ring, useToast } from '../components';
import { Question } from '../../domain/types';
import { PracticeTest } from '../../services/examService';
import { evaluateShortAnswer } from '../../domain/teachback';
import { DAY } from '../../domain/utils';

export function ExamsView() {
  const services = useServices();
  const toast = useToast();
  const subjects = useLiveQuery(() => services.db.subjects.toArray(), [], []);
  const exams = useLiveQuery(() => services.db.exams.orderBy('date').toArray(), [], []);
  const [creating, setCreating] = useState(false);
  const [newExam, setNewExam] = useState({ title: '', subjectId: '', date: '' });
  const [openExam, setOpenExam] = useState<string | null>(null);
  const [test, setTest] = useState<{ pt: PracticeTest; qIndex: number; questions: Question[] } | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [startAt] = useState(Date.now());

  const exam = openExam ? exams.find((e) => e.id === openExam) : null;
  const readiness = useLiveQuery(
    async () => (exam ? services.exams.readiness(exam.id) : null),
    [openExam, exams.length],
    null,
  );

  const conceptName = useLiveQuery(async () => {
    const all = await services.db.concepts.toArray();
    return (id: string) => all.find((c) => c.id === id)?.name ?? id;
  }, [], (id: string) => id);

  const create = async () => {
    if (!newExam.title || !newExam.subjectId || !newExam.date) {
      toast('Title, subject and date are needed.', 'error');
      return;
    }
    await services.exams.createExam({
      title: newExam.title,
      subjectId: newExam.subjectId,
      date: new Date(newExam.date + 'T09:00:00').getTime(),
    });
    setCreating(false);
    setNewExam({ title: '', subjectId: '', date: '' });
    toast('Exam added. A study plan was generated.', 'info');
  };

  const startTest = async (kind: 'mixed' | 'weak-area' | 'due-review' | 'timed') => {
    if (!exam) return;
    const pt = await services.exams.generatePracticeTest({ subjectId: exam.subjectId, kind, count: 6, examId: exam.id });
    const questions = await Promise.all(pt.questionIds.map((id) => services.db.questions.get(id)));
    setTest({ pt, qIndex: 0, questions: questions.filter(Boolean) as Question[] });
    setChosen(null);
    setAnswer('');
  };

  const submitTestAnswer = async () => {
    if (!test || !exam) return;
    const q = test.questions[test.qIndex];
    if (!q) return;
    const score = q.kind === 'mc'
      ? (q.choices ?? []).find((c) => c.id === chosen)?.correct ? 1 : 0
      : evaluateShortAnswer(answer, q.keywords, q.partialKeywords).score;
    const updated = await services.exams.submitTestAnswer(test.pt, q.id, score, Date.now() - startAt);
    setTest({ pt: updated, qIndex: test.qIndex + 1, questions: test.questions });
    setChosen(null);
    setAnswer('');
  };

  /* ---------- practice test runner ---------- */
  if (test) {
    const q = test.questions[test.qIndex];
    if (!q) {
      const correct = test.pt.results.filter((r) => r.correct).length;
      return (
        <div className="content" style={{ maxWidth: 720 }}>
          <div className="card card-pad-lg center">
            <h1 className="mb">{correct}/{test.pt.results.length} correct</h1>
            <p className="small muted mb">Practice answers were recorded — weak areas now feed your recommendations and plan.</p>
            <button className="btn primary" onClick={() => setTest(null)}>Back to exams</button>
          </div>
        </div>
      );
    }
    return (
      <div className="content" style={{ maxWidth: 720 }}>
        <div className="card card-pad-lg">
          <div className="tiny muted mb">Practice test · {test.qIndex + 1}/{test.questions.length}</div>
          {q.scenario && <div className="q-scenario">{q.scenario}</div>}
          <div className="q-prompt">{q.prompt}</div>
          {q.kind === 'mc' ? (
            (q.choices ?? []).map((c) => (
              <button key={c.id} className={`choice ${chosen === c.id ? 'sel' : ''}`} onClick={() => setChosen(c.id)}>
                <span className="letter">{String.fromCharCode(65 + (q.choices ?? []).indexOf(c))}</span>
                {c.text}
              </button>
            ))
          ) : (
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer…" aria-label="Answer" />
          )}
          <button
            className="btn primary mt"
            disabled={q.kind === 'mc' ? !chosen : !answer.trim()}
            onClick={submitTestAnswer}
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  /* ---------- exam detail ---------- */
  if (exam && readiness) {
    const daysLeft = Math.max(0, Math.round((exam.date - Date.now()) / DAY));
    return (
      <div className="content" style={{ maxWidth: 760 }}>
        <button className="btn subtle sm mb" onClick={() => setOpenExam(null)}><Icon name="back" size={15} /> All exams</button>
        <div className="view-title">
          <div>
            <h1>{exam.title}</h1>
            <div className="sub">{new Date(exam.date).toLocaleDateString()} · {daysLeft} days left</div>
          </div>
          <div className="row" style={{ gap: 16 }}>
            <div className="center">
              <Ring value={readiness.insufficientEvidence ? 0 : readiness.score} size={72} color={readiness.score >= exam.targetMastery ? 'var(--green)' : 'var(--amber)'} />
              <div className="tiny muted mt">readiness</div>
            </div>
          </div>
        </div>

        {readiness.insufficientEvidence ? (
          <div className="card">
            <h2 className="mb">Not enough evidence yet</h2>
            <p className="small">
              We won’t show a fake readiness number. You need more real attempts on this subject before a score means anything.
              ({readiness.attemptCount} attempts so far.)
            </p>
            <div className="row">
              <button className="btn primary" onClick={() => startTest('mixed')}>Take a diagnostic practice test</button>
            </div>
          </div>
        ) : (
          <div className="card">
            <h2 className="mb">Why this readiness score</h2>
            <div className="bar-row"><span>Coverage</span><Bar v={readiness.coverage} /><span>{Math.round(readiness.coverage * 100)}%</span></div>
            <div className="bar-row"><span>Accuracy</span><Bar v={readiness.accuracy} /><span>{Math.round(readiness.accuracy * 100)}%</span></div>
            <div className="bar-row"><span>Freshness</span><Bar v={readiness.freshness} /><span>{Math.round(readiness.freshness * 100)}%</span></div>
            <div className="bar-row"><span>Mastery</span><Bar v={readiness.mastery} /><span>{Math.round(readiness.mastery * 100)}%</span></div>
            <div className="small mt">
              {readiness.gaps > 0 && <span>{readiness.gaps} open gaps are dragging this down. </span>}
              {readiness.weakConcepts.length > 0 && (
                <span>Weakest: {readiness.weakConcepts.slice(0, 4).map((w) => conceptName(w)).join(', ')}.</span>
              )}
              {readiness.score >= exam.targetMastery
                ? ' You’re at target — keep reviews light to stay fresh.'
                : ` You need ${Math.round(exam.targetMastery)}% for exam-ready; the plan below prioritizes weak spots.`}
            </div>
          </div>
        )}

        <div className="card">
          <h2 className="mb">Practice</h2>
          <div className="row">
            <button className="btn" onClick={() => startTest('mixed')}>Mixed</button>
            <button className="btn" onClick={() => startTest('weak-area')}>Weak areas</button>
            <button className="btn" onClick={() => startTest('due-review')}>Due review</button>
            <button className="btn" onClick={() => startTest('timed')}>Timed</button>
          </div>
          <div className="tiny muted mt">Interleaved practice: concepts are mixed on purpose — like the real exam.</div>
        </div>
      </div>
    );
  }

  /* ---------- list ---------- */
  return (
    <div className="content">
      <div className="view-title">
        <div>
          <h1>Exams</h1>
          <div className="sub">Explainable readiness — no fake confidence.</div>
        </div>
        <button className="btn primary" onClick={() => setCreating(!creating)}>+ Add exam</button>
      </div>

      {creating && (
        <div className="card mb">
          <div className="field"><label>Title</label><input type="text" value={newExam.title} onChange={(e) => setNewExam({ ...newExam, title: e.target.value })} placeholder="Midterm — Databases" /></div>
          <div className="grid-2">
            <div className="field">
              <label>Subject</label>
              <select value={newExam.subjectId} onChange={(e) => setNewExam({ ...newExam, subjectId: e.target.value })}>
                <option value="">Choose…</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Date</label><input type="date" value={newExam.date} onChange={(e) => setNewExam({ ...newExam, date: e.target.value })} /></div>
          </div>
          <div className="row">
            <button className="btn primary" onClick={create}>Create exam + plan</button>
            <button className="btn subtle" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}

      {!exams.length && <Empty icon="exams">No exams yet. Adding one generates a day-by-day study plan that adapts when you fall behind.</Empty>}
      {exams.map((e) => {
        const daysLeft = Math.max(0, Math.round((e.date - Date.now()) / DAY));
        return (
          <button key={e.id} className="list-row clickable" style={{ width: '100%' }} onClick={() => setOpenExam(e.id)}>
            <span className={`chip ${daysLeft <= 7 ? 'coral' : daysLeft <= 21 ? 'amber' : 'blue'}`}>{daysLeft === 0 ? 'today' : `${daysLeft}d`}</span>
            <span className="grow" style={{ textAlign: 'left' }}>
              <span className="title">{e.title}</span>
              <span className="sub">{subjects.find((s) => s.id === e.subjectId)?.name} · {new Date(e.date).toLocaleDateString()}</span>
            </span>
            <Icon name="back" size={16} />
          </button>
        );
      })}
    </div>
  );
}

function Bar({ v, color }: { v: number; color?: string }) {
  return (
    <>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.round(v * 100)}%`, ...(color ? { background: color } : {}) }} /></div>
      <span className="tiny muted">{Math.round(v * 100)}%</span>
    </>
  );
}
