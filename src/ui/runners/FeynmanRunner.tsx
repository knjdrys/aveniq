/**
 * Feynman runner (StudyBuddy feynman runner pattern): explain a concept in
 * your own words; AVENIQ's teach-back engine scores idea coverage, spots
 * misconception traps in your own words, rewards examples, flags jargon —
 * and records explanation evidence (the strongest kind).
 */
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices } from '../../appContext';
import { Icon } from '../components';
import { RunnerProps } from '../runnerHost';
import { evaluateTeachBack, TeachBackEvaluation } from '../../domain/teachback';

export function FeynmanRunner({ conceptId, close }: RunnerProps & { conceptId: string }) {
  const services = useServices();
  const concept = useLiveQuery(() => services.db.concepts.get(conceptId), [conceptId], undefined);
  const [text, setText] = useState('');
  const [result, setResult] = useState<TeachBackEvaluation | null>(null);
  const [busy, setBusy] = useState(false);

  if (concept === undefined) return <div className="panel muted">Preparing…</div>;
  if (!concept) return <div className="panel">Concept not found. <button className="btn" onClick={close}>Close</button></div>;

  const submit = async () => {
    setBusy(true);
    const evalRes = evaluateTeachBack(concept, text);
    await services.learning.recordAttempt({
      conceptId: concept.id,
      questionId: null,
      score: evalRes.score,
      responseMs: 60000,
      cognitiveLevel: 'explanation',
      givenAnswer: text,
      context: 'review',
    });
    setResult(evalRes);
    setBusy(false);
  };

  return (
    <div>
      <div className="runner-meta">
        <span>Feynman · teach it back</span>
        <span>the strongest test of understanding</span>
      </div>

      {!result ? (
        <>
          <div className="panel">
            <div className="page-kicker">Explain “{concept.name}”</div>
            <h2 style={{ margin: '4px 0 10px' }}>Like the reader has never heard of it.</h2>
            <p className="small muted">
              Plain words, your own structure. Missing pieces are fine — they tell us exactly what to review next.
              Including an example earns bonus credit.
            </p>
          </div>
          <textarea
            className="textarea mt-3"
            style={{ minHeight: 240 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Imagine a classmate asks: “What is ${concept.name}, and why should I care?”…`}
            aria-label="Your explanation"
          />
          <div className="btn-row mt-3" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={close}>Cancel</button>
            <button className="btn btn-primary" disabled={!text.trim() || busy} onClick={submit}>
              {busy ? 'Reading it…' : 'Check my explanation'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="panel" style={{ borderColor: 'var(--pine)' }}>
            <div className="page-kicker">Verdict</div>
            <h2 style={{ margin: '4px 0' }}>
              {result.verdict === 'strong' ? 'A strong explanation' : result.verdict === 'partial' ? 'Partly there' : 'Keep building'}
            </h2>
            <p className="small muted">
              Covered {Math.round(result.coverage * 100)}% of the key ideas in {result.wordCount} words
              {result.hasExample && ' · included an example (+bonus)'}.
              {result.misconceptionHits.length > 0 && ' A known trap appeared in your words — it’s now queued for correction.'}
            </p>
          </div>
          <div className="panel mt-3">
            <h3>Idea by idea</h3>
            <div className="tb-ideas">
              {result.ideaResults.map((idea, i) => (
                <div key={i} className={`tb-idea ${idea.covered ? 'hit' : 'miss'}`}>
                  <Icon name={idea.covered ? 'check' : 'gaps'} size={14} />
                  {idea.idea.label}
                </div>
              ))}
              {result.misconceptionHits.map((m, i) => (
                <div key={`t${i}`} className="tb-idea trap"><Icon name="x" size={14} />{m.label}</div>
              ))}
            </div>
            {result.jargonFlags.length > 0 && (
              <p className="tiny muted">Jargon to unpack: {result.jargonFlags.join(', ')} — you used terms a beginner wouldn’t know yet.</p>
            )}
          </div>
          <div className="btn-row mt-4" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => { setResult(null); setText(''); }}>Try again</button>
            <button className="btn btn-primary" onClick={close}>Done</button>
          </div>
        </>
      )}
    </div>
  );
}
