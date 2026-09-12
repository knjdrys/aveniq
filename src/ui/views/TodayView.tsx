/**
 * Today view (req 31, 32, 33): what should I study right now, with WHY.
 */
import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices, navigate } from '../../appContext';
import { Icon, Ring, useToast } from '../components';
import { t } from '../../domain/i18n';
import { Candidate } from '../../domain/recommend';
import { DAY } from '../../domain/utils';

const TIMES = [5, 10, 25, 60];

export function TodayView() {
  const services = useServices();
  const toast = useToast();
  const [minutes, setMinutes] = useState(10);
  const [starting, setStarting] = useState(false);

  const learner = useLiveQuery(() => services.learning.getLearner(), []);
  const concepts = useLiveQuery(() => services.db.concepts.toArray(), [], []);
  const states = useLiveQuery(() => services.db.conceptStates.toArray(), [], []);
  const rec = useLiveQuery(() => services.recommend.whatToStudy(minutes), [minutes], null);
  const activeSession = useLiveQuery(() => services.sessions.current(), []);
  const exams = useLiveQuery(() => services.db.exams.toArray(), [], []);

  const conceptName = (id: string) => concepts.find((c) => c.id === id)?.name ?? id;
  const mastered = states.filter((s) => s.state === 'mastered' && s.flag === 'none').length;
  const learning = states.filter((s) => !['unknown'].includes(s.state)).length;
  const dueNow = states.filter((s) => s.scheduler.lastReviewedAt != null && Date.now() >= s.scheduler.dueAt).length;
  const nextExam = exams.filter((e) => e.date > Date.now()).sort((a, b) => a.date - b.date)[0];

  const start = async (opts?: { conceptId?: string }) => {
    setStarting(true);
    try {
      const session = await services.sessions.start({ minutes, conceptIds: opts?.conceptId ? [opts.conceptId] : undefined });
      navigate(`/session/${session.id}`);
    } catch {
      toast('Could not start the session. Please try again.', 'error');
    } finally {
      setStarting(false);
    }
  };

  if (!learner) return null;

  return (
    <div className="content">
      <div className="view-title">
        <div>
          <h1>Hi{learner.name !== 'Learner' ? `, ${learner.name}` : ''} 👋</h1>
          <div className="sub">
            {learner.streakDays > 0 ? (
              <span title="Days with at least one successful retrieval"><Icon name="flame" size={14} /> {learner.streakDays}-day streak</span>
            ) : (
              'Not knowing this is normal. Let’s build it.'
            )}
            {' · '}Level {learner.level} · {learner.xp} XP
          </div>
        </div>
        <Ring value={Math.min(100, (mastered / Math.max(1, concepts.length)) * 100)} size={54} />
      </div>

      {activeSession && (
        <div className="card row between" style={{ borderColor: 'var(--primary)' }}>
          <div>
            <h3>Session in progress</h3>
            <div className="small muted">
              {activeSession.executed.length} items done · {activeSession.plannedMinutes} min planned
            </div>
          </div>
          <button className="btn primary" onClick={() => navigate(`/session/${activeSession.id}`)}>
            Continue <Icon name="back" size={15} />
          </button>
        </div>
      )}

      <div className="card today-hero">
        <h2>What should I study right now?</h2>
        {rec ? (
          <>
            <div className="rec-why">
              <strong>{conceptName(rec.top.conceptId)}</strong>
              {rec.top.type === 'confusion' && rec.top.relatedId ? ` ↔ ${conceptName(rec.top.relatedId)}` : ''} —{' '}
              {t(rec.top.reasons[0].key, { ...rec.top.reasons[0].params, concept: conceptName(rec.top.conceptId), a: conceptName(rec.top.conceptId), b: conceptName(rec.top.relatedId ?? ''), root: conceptName(rec.top.relatedId ?? '') })}
            </div>
            <div className="row between">
              <div className="time-chips" role="radiogroup" aria-label="Available time">
                {TIMES.map((m) => (
                  <button key={m} className={`time-chip ${minutes === m ? 'active' : ''}`} role="radio" aria-checked={minutes === m} onClick={() => setMinutes(m)}>
                    {m === 5 ? '5 min · micro' : m === 10 ? '10 min · focused' : m === 25 ? '25 min · balanced' : '60 min · deep'}
                  </button>
                ))}
              </div>
              <button className="btn primary lg" disabled={starting} onClick={() => start()}>
                Start {minutes}-minute session
              </button>
            </div>
            {rec.bundle.length > 1 && (
              <div className="tiny muted mt">
                This session will cover: {rec.bundle.map((c) => conceptName(c.conceptId)).slice(0, 6).join(' · ')}
              </div>
            )}
          </>
        ) : (
          <div className="empty">
            <div className="big"><Icon name="spark" size={34} /></div>
            Everything you’ve started is fresh. Learn something new from the{' '}
            <a href="#/library">Library</a>.
          </div>
        )}
      </div>

      {rec && rec.alternatives.length > 0 && (
        <div className="card">
          <h3 className="mb">Also worth your time</h3>
          {rec.alternatives.slice(0, 4).map((c: Candidate) => (
            <div key={`${c.conceptId}-${c.type}`} className="list-row">
              <span className={`chip ${c.type === 'misconception' || c.type === 'confusion' || c.type === 'gap' ? 'coral' : c.type === 'due' ? 'amber' : 'blue'}`}>
                {c.type}
              </span>
              <div className="grow">
                <div className="title">{conceptName(c.conceptId)}</div>
                <div className="sub">{t(c.reasons[0].key, { ...c.reasons[0].params, concept: conceptName(c.conceptId), a: conceptName(c.conceptId), b: conceptName(c.relatedId ?? ''), root: conceptName(c.relatedId ?? '') })}</div>
              </div>
              <button className="btn sm" onClick={() => start({ conceptId: c.conceptId })}>Do it</button>
            </div>
          ))}
        </div>
      )}

      <div className="stat-grid mt">
        <div className="stat"><div className="n">{learning}</div><div className="l">concepts in progress</div></div>
        <div className="stat"><div className="n" style={{ color: 'var(--green)' }}>{mastered}</div><div className="l">mastered</div></div>
        <div className="stat"><div className="n" style={{ color: 'var(--amber)' }}>{dueNow}</div><div className="l">due now</div></div>
        {nextExam && (
          <div className="stat">
            <div className="n">{Math.max(0, Math.round((nextExam.date - Date.now()) / DAY))}</div>
            <div className="l">days to “{nextExam.title}”</div>
          </div>
        )}
      </div>
    </div>
  );
}
