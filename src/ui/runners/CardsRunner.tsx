/**
 * Flashcard runner (StudyBuddy cards runner pattern): front → reveal →
 * confidence grade. Every grade flows through AVENIQ's real pipeline
 * (scheduler, mastery, calibration), so cards are not a separate game.
 */
import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices } from '../../appContext';
import { Icon } from '../components';
import { RunnerProps } from '../runnerHost';

const GRADES: { label: string; score: number; hint: string }[] = [
  { label: 'Again', score: 0, hint: 'in ~10 min' },
  { label: 'Hard', score: 0.55, hint: 'sooner' },
  { label: 'Good', score: 0.9, hint: 'normal step' },
  { label: 'Easy', score: 1, hint: 'big step' },
];

export function CardsRunner({ conceptIds, title, close }: RunnerProps & { conceptIds: string[]; title: string }) {
  const services = useServices();
  const cards = useLiveQuery(async () => {
    const all = await services.db.cards.toArray();
    const set = new Set(conceptIds);
    const own = all.filter((c) => set.has(c.conceptId) && !c.deleted);
    return own.sort(() => Math.random() - 0.5);
  }, [conceptIds.join(',')], undefined);

  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const [graded, setGraded] = useState<{ again: number; good: number }>({ again: 0, good: 0 });
  const startRef = React.useRef(Date.now());

  const card = cards?.[i];

  const grade = async (score: number) => {
    if (!card) return;
    await services.learning.recordAttempt({
      conceptId: card.conceptId,
      questionId: null,
      score,
      responseMs: Date.now() - startRef.current,
      cognitiveLevel: 'recall',
      context: 'review',
    });
    setGraded((g) => ({ again: g.again + (score < 0.5 ? 1 : 0), good: g.good + (score >= 0.7 ? 1 : 0) }));
    setRevealed(false);
    startRef.current = Date.now();
    if (!cards || i + 1 >= cards.length) setDone(true);
    else setI(i + 1);
  };

  if (cards === undefined) return <div className="panel muted">Shuffling…</div>;
  if (!cards.length) {
    return (
      <div className="panel center">
        <div className="empty-title">No cards for this yet</div>
        <p className="small muted">Cards are generated for every concept — this one may not have any yet. Try a session instead.</p>
        <button className="btn" onClick={close}>Close</button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="panel center">
        <div className="page-kicker">Deck done</div>
        <h2 style={{ margin: '6px 0' }}>{graded.good}/{cards.length} recalled</h2>
        <p className="small muted">
          {graded.again > 0
            ? `${graded.again} came back “Again” — they’re rescheduled for soon, and mastery knows.`
            : 'Everything stuck on the first pass. The scheduler noticed.'}
        </p>
        <button className="btn btn-primary" onClick={close}>Done</button>
      </div>
    );
  }

  return (
    <div>
      <div className="runner-progress"><span style={{ width: `${(i / cards.length) * 100}%` }} /></div>
      <div className="runner-meta">
        <span>{title}</span>
        <span className="num">{i + 1} / {cards.length}</span>
      </div>

      <div className="fc-card">
        <div className="fc-front">{card!.front}</div>
        {revealed ? (
          <>
            <div className="fc-back">{card!.back}</div>
            <div className="btn-row" style={{ justifyContent: 'center', marginTop: 'var(--space-4)' }}>
              {GRADES.map((g) => (
                <button key={g.label} className={`btn ${g.score >= 0.9 ? 'btn-primary' : g.score === 0 ? 'btn-danger' : ''}`} onClick={() => grade(g.score)}>
                  {g.label} <span className="tiny muted">{g.hint}</span>
                </button>
              ))}
            </div>
            <p className="tiny muted mt-2">Grades feed the real scheduler — “Easy” grows stability more than “Good”.</p>
          </>
        ) : (
          <button className="btn btn-primary btn-lg" onClick={() => setRevealed(true)}>
            <Icon name="learn" size={16} /> Show answer
          </button>
        )}
      </div>
      <div className="center mt-3">
        <button className="btn btn-quiet btn-sm" onClick={close}>End deck early</button>
      </div>
    </div>
  );
}

