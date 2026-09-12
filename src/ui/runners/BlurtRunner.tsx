/**
 * Blurt runner (StudyBuddy blurt runner pattern): timed memory dump, then
 * AVENIQ's blurt engine classifies every idea (remembered / partial / trap)
 * and records explanation evidence through the pipeline.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices } from '../../appContext';
import { Icon } from '../components';
import { RunnerProps } from '../runnerHost';
import { evaluateBlurt } from '../../domain/blurt';
import { Concept } from '../../domain/types';

export function BlurtRunner({ conceptIds, title, close }: RunnerProps & { conceptIds: string[]; title: string }) {
  const services = useServices();
  const concepts = useLiveQuery(async () => {
    const all = await services.db.concepts.toArray();
    return all.filter((c) => conceptIds.includes(c.id));
  }, [conceptIds.join(',')], undefined);

  const [phase, setPhase] = useState<'write' | 'results'>('write');
  const [text, setText] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(300);
  const [timerOn, setTimerOn] = useState(false);

  useEffect(() => {
    if (!timerOn || secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [timerOn, secondsLeft]);

  const results = useMemo(
    () => (phase === 'results' && concepts ? concepts.map((c) => ({ concept: c, res: evaluateBlurt(c, text) })) : []),
    [phase, concepts, text],
  );

  const avgScore = results.length ? results.reduce((s, r) => s + r.res.score, 0) / results.length : 0;

  const submit = async () => {
    setPhase('results');
    setTimerOn(false);
    if (!concepts) return;
    for (const c of concepts) {
      const res = evaluateBlurt(c, text);
      await services.learning.recordAttempt({
        conceptId: c.id,
        questionId: null,
        score: res.score,
        responseMs: 300000 - secondsLeft * 1000,
        cognitiveLevel: 'explanation',
        givenAnswer: text,
        context: 'review',
      });
    }
  };

  if (concepts === undefined) return <div className="panel muted">Preparing…</div>;
  if (!concepts.length) {
    return (
      <div className="panel center">
        <div className="empty-title">Nothing to dump yet</div>
        <p className="small muted">Learn at least one concept first.</p>
        <button className="btn" onClick={close}>Close</button>
      </div>
    );
  }

  return (
    <div>
      <div className="runner-meta">
        <span>{title}</span>
        {phase === 'write' && (
          <span className="btn-row" style={{ gap: 8 }}>
            <button className="btn btn-quiet btn-sm" onClick={() => setTimerOn(!timerOn)}>
              <Icon name="clock" size={14} /> {timerOn ? 'Pause' : 'Timer'}
            </button>
            <span className="num">{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</span>
          </span>
        )}
      </div>

      {phase === 'write' && (
        <>
          <p className="small muted" style={{ marginBottom: 'var(--space-3)' }}>
            Write <strong>everything you remember</strong> about {concepts.length === 1 ? `“${concepts[0].name}”` : `these ${concepts.length} concepts`} — order doesn’t matter, perfection doesn’t matter.
            The gaps we find are the study plan.
          </p>
          <textarea
            className="textarea"
            style={{ minHeight: 260 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Go. Type everything that comes to mind…"
            aria-label="Memory dump"
          />
          <div className="btn-row mt-3" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={close}>Cancel</button>
            <button className="btn btn-primary" disabled={!text.trim()} onClick={submit}>Map my gaps</button>
          </div>
        </>
      )}

      {phase === 'results' && (
        <>
          <div className={`panel ${avgScore >= 0.7 ? '' : ''}`} style={{ borderColor: 'var(--pine)' }}>
            <div className="page-kicker">Dump mapped</div>
            <h2 style={{ margin: '4px 0' }}>
              {avgScore >= 0.7 ? 'Strong recall' : avgScore >= 0.45 ? 'Partly there' : 'Lots of open ground'}
            </h2>
            <p className="small muted">{Math.round(avgScore * 100)}% of the key ideas appeared in your words. Everything below is now scheduled.</p>
          </div>
          {results.map(({ concept, res }) => (
            <div className="panel mt-3" key={concept.id}>
              <h3>{concept.name}</h3>
              <div className="tb-ideas">
                {res.ideas.map((idea, i) => (
                  <div key={i} className={`tb-idea ${idea.classification === 'remembered' ? 'hit' : idea.classification === 'partial' ? 'miss' : 'miss'}`}>
                    <Icon name={idea.classification === 'remembered' ? 'check' : 'gaps'} size={14} />
                    {idea.label}
                  </div>
                ))}
                {res.misconceptionHits.length > 0 && res.misconceptionHits.map((m, i) => (
                  <div key={`t${i}`} className="tb-idea trap"><Icon name="x" size={14} />{m}</div>
                ))}
              </div>
              {res.miniReview.focusIdeaLabels.length > 0 && (
                <p className="tiny muted">Next pass focuses on: {res.miniReview.focusIdeaLabels.slice(0, 4).join(' · ')}</p>
              )}
            </div>
          ))}
          <div className="btn-row mt-4" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={close}>Done</button>
          </div>
        </>
      )}
    </div>
  );
}
