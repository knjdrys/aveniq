/**
 * Session view (req 13, 14, 15, 16, 18, 19, 20, 21, 22, 32, 47, 55):
 * renders the adaptive plan: FE flow, questions with confidence + hint
 * ladder + error-first feedback, compare exercises, teach-back, blurt,
 * reflection, fatigue banner, summary.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices, navigate } from '../../appContext';
import { Empty, Icon, useToast, VocabText } from '../components';
import { Concept, Question, StudySession, FEState, CognitiveLevel, FE_STAGES } from '../../domain/types';
import { FEView } from '../../services/feService';
import { hintForLevel, nextScaffold, SCAFFOLD_LADDER, scaffoldPenalty, ScaffoldLevel } from '../../domain/scaffold';
import { evaluateShortAnswer, evaluateTeachBack, TeachBackEvaluation } from '../../domain/teachback';
import { PipelineResult } from '../../domain/pipeline';
import { t } from '../../domain/i18n';
import { DAY } from '../../domain/utils';

const STAGE_LABEL: Record<string, string> = {
  'prereq-check': 'Foundations',
  encounter: 'Meet the idea',
  why: 'Why it matters',
  analogy: 'Analogy',
  plain: 'In plain words',
  vocabulary: 'Vocabulary',
  example: 'Tiny example',
  build: 'How it works',
  'guided-check': 'Check — with help available',
  confirm: 'Check again — on your own',
  apply: 'Use it somewhere new',
  retrieval: 'Retrieve it',
  'teach-back': 'Explain it back',
  scheduled: 'Locked in',
  done: 'Done',
};

export function SessionView({ sessionId }: { sessionId?: string }) {
  const services = useServices();
  const session = useLiveQuery(
    async () => {
      if (sessionId) return services.sessions.get(sessionId);
      return services.sessions.current();
    },
    [sessionId],
    undefined,
  );

  if (session === undefined) return <div className="content" />; // loading
  if (!session) {
    return (
      <div className="content">
        <Empty icon="learn">
          No active session. Head to <a href="#/today">Today</a> and press “Start”.
        </Empty>
      </div>
    );
  }

  return <SessionRunner session={session} />;
}

function SessionRunner({ session }: { session: StudySession }) {
  const services = useServices();
  const toast = useToast();
  const [fatigue, setFatigue] = useState<{ level: number; recommendation: string } | null>(null);

  const doneIds = new Set(session.executed.map((o) => o.itemId));
  const idx = session.items.findIndex((it, i) => !doneIds.has(i));
  const finished = idx === -1;

  useEffect(() => {
    if (session.executed.length > 0 && session.executed.length % 4 === 0) {
      void services.sessions.fatigue(session.id).then(setFatigue);
    }
  }, [session.executed.length, session.id, services]);

  if (session.status !== 'active' || finished) {
    return <SessionSummary session={session} />;
  }

  const item = session.items[idx];
  const itemNumber = session.executed.length + 1;
  const total = session.items.length;
  const segment = session.plan.find((s) => s.conceptIds.includes(item.conceptId) || s.type === 'reflection');
  const segLabel = segment ? t(`seg.${segment.type === 'first-encounter' ? 'first' : segment.type === 'teach-back' ? 'teachBack' : segment.type}`) : '';

  const complete = async (correct: boolean | null, score: number | null) => {
    await services.sessions.recordOutcome(session.id, { itemId: idx, conceptId: item.conceptId, correct, score });
    if (doneIds.size + 1 >= total) {
      // last item — show summary (reflection happens there)
      toast('Session complete — nice work.', 'info');
    }
  };

  return (
    <div className="content" style={{ maxWidth: 720 }}>
      <div className="session-top">
        <div className="row between small" style={{ marginBottom: 6 }}>
          <span className="muted">{segLabel || 'Study'}</span>
          <span className="muted">{itemNumber} / {total} · {session.plannedMinutes} min session</span>
        </div>
        <div className="progress-track" role="progressbar" aria-valuenow={Math.round(((itemNumber - 1) / Math.max(1, total)) * 100)} aria-valuemax={total} aria-valuemin={0}>
          <div className="progress-fill" style={{ width: `${(itemNumber - 1) / Math.max(1, total) * 100}%` }} />
        </div>
      </div>

      {fatigue && fatigue.level >= 2 && (
        <div className="card row between" style={{ borderColor: 'var(--amber)' }}>
          <div className="small"><strong>Feeling heavy?</strong> {fatigue.recommendation}</div>
          <button className="btn subtle sm" onClick={() => navigate('/today')}>Wrap up</button>
        </div>
      )}

      {item.kind === 'explanation' ? (
        <FEFlow
          key={`${session.id}-${idx}`}
          sessionId={session.id}
          conceptId={item.conceptId}
          initialStage={item.feStage}
          onComplete={complete}
        />
      ) : item.kind === 'compare' ? (
        <CompareExercise
          key={`${session.id}-${idx}`}
          sessionId={session.id}
          aId={item.conceptId}
          bId={item.questionId ?? ''}
          onComplete={complete}
        />
      ) : (
        <QuestionCard
          key={`${session.id}-${idx}`}
          sessionId={session.id}
          conceptId={item.conceptId}
          questionId={item.questionId ?? null}
          note={item.note}
          onComplete={complete}
        />
      )}
    </div>
  );
}

/* ================= FIRST-ENCOUNTER FLOW (req 13) ================= */

function FEFlow({
  sessionId, conceptId, initialStage, onComplete,
}: {
  sessionId: string; conceptId: string; initialStage?: FEState['stage'];
  onComplete: (correct: boolean | null, score: number | null) => Promise<void>;
}) {
  const services = useServices();
  const [view, setView] = useState<FEView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void services.fe.start(conceptId, sessionId).then(setView);
  }, [conceptId, services, sessionId]);

  if (!view) return <div className="card muted">Preparing…</div>;
  const { state, concept } = view;
  const stageI = FE_STAGES.indexOf(state.stage);

  const adv = async (event: Parameters<typeof services.fe.advance>[1], payload?: Parameters<typeof services.fe.advance>[2]) => {
    try {
      const next = await services.fe.advance(state, event, payload);
      setView(next);
      if (next.state.stage === 'done') {
        await onComplete(true, null);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const speak = (text: string) => services.speech.speak(text);

  return (
    <div className="card card-pad-lg">
      <div className="fe-stages" aria-hidden="true">
        {FE_STAGES.map((s, i) => (
          <span key={s} className={`fe-stage-dot ${i < stageI ? 'done' : i === stageI ? 'now' : ''}`} />
        ))}
      </div>
      <h1 style={{ fontSize: 22, margin: '10px 0 2px' }}>{concept.name}</h1>
      <div className="tiny muted mb">{STAGE_LABEL[state.stage]}</div>
      {error && <div className="insight warn">{error}</div>}

      {/* ---- prerequisite check ---- */}
      {state.stage === 'prereq-check' && (
        <>
          <h2 className="mb">Before we start</h2>
          {view.prereqGaps.length === 0 ? (
            <>
              <p className="read">
                {concept.name} builds on a few foundations. Let’s make sure they’re solid — a quick check first.
              </p>
              <button className="btn primary" onClick={() => adv({ type: 'continue' })}>Check my foundations →</button>
            </>
          ) : (
            <>
              <p className="read">
                You haven’t met {view.prereqGaps.length === 1 ? 'one foundation' : `${view.prereqGaps.length} foundations`} this
                concept needs. That’s fine — we’ll teach {' '}them first, from zero, and come right back.
              </p>
              <div className="stack mb">
                {view.prereqGaps.map((g) => (
                  <div key={g.concept.id} className="list-row">
                    <div className="grow">
                      <div className="title">{g.concept.name}</div>
                      <div className="sub">{g.concept.intro.slice(0, 90)}…</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="row">
                <button className="btn primary" onClick={() => adv({ type: 'prereq-teach', conceptId: view.prereqGaps[view.prereqGaps.length - 1].concept.id })}>
                  Teach me these first
                </button>
                <button className="btn subtle" onClick={() => adv({ type: 'prereq-skip' })}>I know these — skip</button>
              </div>
            </>
          )}
        </>
      )}

      {/* ---- explanation stages ---- */}
      {['encounter', 'why', 'analogy', 'plain', 'build'].includes(state.stage) && view.explanation && (
        <>
          <div className="read">
            {view.explanation.content.split(/\n+/).map((p, i) => (
              <p key={i}><VocabText text={p} concept={concept} knownVocabulary={new Set()} onSpeak={speak} /></p>
            ))}
          </div>
          {state.simplified && state.stage === 'plain' && (
            <div className="tiny muted">Simpler version — no worries, we’ll rebuild up to the full idea.</div>
          )}
          <div className="row mt">
            <button className="btn primary" onClick={() => adv({ type: 'continue' })}>Got it →</button>
            <button className="btn" onClick={() => adv({ type: 'dont-understand' })}>
              <Icon name="bulb" size={15} /> I don’t understand
            </button>
            <button className="btn subtle sm" onClick={() => speak(view.explanation!.content)}><Icon name="sound" size={15} /></button>
          </div>
          {state.stylesTried.length >= 2 && (
            <div className="tiny muted mt">Tried {state.stylesTried.length} different explanations so far.</div>
          )}
        </>
      )}

      {/* ---- vocabulary ---- */}
      {state.stage === 'vocabulary' && (
        <>
          <h2 className="mb">Two words before we continue</h2>
          {concept.terms.slice(state.vocabIndex, state.vocabIndex + 1).map((term) => (
            <div key={term.id} className="term-card">
              <div className="word">{term.word}</div>
              {term.simple && <div className="row2"><span className="lbl">Simply</span>{term.simple}</div>}
              <div className="row2"><span className="lbl">Means</span>{term.definition}</div>
              {term.example && <div className="row2"><span className="lbl">Example</span>{term.example}</div>}
              <div className="row2"><span className="lbl">Why here</span>{term.why}</div>
            </div>
          ))}
          <p className="tiny muted mt">Tap any dotted term anywhere in AVENIQ to decode it.</p>
          <button className="btn primary mt" onClick={() => adv({ type: 'continue' })}>
            {state.vocabIndex >= concept.terms.length - 1 ? 'Continue →' : 'Next word →'}
          </button>
        </>
      )}

      {/* ---- example stage ---- */}
      {state.stage === 'example' && (
        <>
          <h2 className="mb">A tiny example</h2>
          <div className="read"><p>{concept.examples.simple ?? view.explanation?.content ?? concept.intro}</p></div>
          <button className="btn primary" onClick={() => adv({ type: 'continue' })}>Continue →</button>
        </>
      )}

      {/* ---- check stages (guided / confirm / apply / retrieval) ---- */}
      {['guided-check', 'confirm', 'apply', 'retrieval'].includes(state.stage) && (
        <CheckStage
          view={view}
          sessionId={sessionId}
          onFailed={(p) => adv({ type: 'check-failed' }, p)}
          onPassed={(p) => adv({ type: 'check-passed' }, p)}
        />
      )}

      {/* ---- teach-back ---- */}
      {state.stage === 'teach-back' && (
        <TeachBackStage concept={concept} onSubmit={async (text) => {
          const evalRes = evaluateTeachBack(concept, text);
          await adv({ type: 'check-passed' }, { text, score: evalRes.score, givenAnswer: text });
          return evalRes;
        }} />
      )}

      {/* ---- scheduled ---- */}
      {state.stage === 'scheduled' && (
        <>
          <h2 className="mb">Locked into memory — see you soon</h2>
          <p className="read">
            You just learned <strong>{concept.name}</strong>. Memory needs a second meeting: we’ve scheduled a quick
            retrieval for <strong>{new Date(Math.max(Date.now(), Date.now() + 2 * DAY)).toLocaleDateString()}</strong>.
            No explanation that time — just you, recalling.
          </p>
          <button className="btn primary" onClick={() => adv({ type: 'continue' })}>Finish first encounter ✓</button>
        </>
      )}
    </div>
  );
}

/* ---- check stage inside FE: uses view.question ---- */

function CheckStage({
  view, onFailed, onPassed,
}: {
  view: FEView;
  sessionId: string;
  onFailed: (p: { score?: number; confidence?: number; responseMs?: number; hintsUsed?: number; givenAnswer?: string }) => Promise<void>;
  onPassed: (p: { score?: number; confidence?: number; responseMs?: number; hintsUsed?: number; givenAnswer?: string }) => Promise<void>;
}) {
  const q = view.question;
  const [answer, setAnswer] = useState<string>('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [scaffold, setScaffold] = useState<ScaffoldLevel>('none');
  const [chosen, setChosen] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [wasCorrect, setWasCorrect] = useState(false);
  const startRef = useRef(Date.now());

  if (!q) {
    return (
      <>
        <h2 className="mb">{STAGE_LABEL[view.state.stage]}</h2>
        <p className="read">No question available for this stage — let’s just continue.</p>
        <button className="btn primary" onClick={() => void onPassed({})}>Continue →</button>
      </>
    );
  }

  const evaluate = (): { score: number; given: string } => {
    if (q.kind === 'mc') return { score: (q.choices ?? []).find((c) => c.id === chosen)?.correct ? 1 : 0, given: chosen ?? '' };
    return { score: evaluateShortAnswer(answer, q.keywords, q.partialKeywords).score, given: answer };
  };

  const submit = async () => {
    if (q.kind === 'mc' && !chosen) return;
    if (q.kind !== 'mc' && !answer.trim()) return;
    const { score, given } = evaluate();
    const passed = score >= 0.7;
    const hintsUsed = SCAFFOLD_LADDER.indexOf(scaffold);
    setChecked(true);
    setWasCorrect(passed);
    const payload = {
      score,
      confidence: confidence ?? undefined,
      responseMs: Date.now() - startRef.current,
      hintsUsed,
      givenAnswer: given,
    };
    if (passed) await onPassed(payload);
    else await onFailed(payload);
  };

  const hint = scaffold === 'none' ? null : hintForLevel(q, scaffold);

  return (
    <>
      <h2 className="mb">{STAGE_LABEL[view.state.stage]}</h2>
      {q.scenario && <div className="q-scenario">{q.scenario}</div>}
      <div className="q-prompt"><VocabText text={q.prompt} concept={view.concept} knownVocabulary={new Set()} /></div>

      {q.kind === 'mc' ? (
        (q.choices ?? []).map((c) => (
          <button
            key={c.id}
            className={`choice ${chosen === c.id ? 'sel' : ''} ${checked ? (c.correct ? 'right' : chosen === c.id ? 'wrong' : '') : ''}`}
            disabled={checked}
            onClick={() => setChosen(c.id)}
          >
            <span className="letter">{String.fromCharCode(65 + (q.choices ?? []).indexOf(c))}</span>
            {c.text}
          </button>
        ))
      ) : (
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type your answer…"
          disabled={checked}
          aria-label="Answer"
        />
      )}

      {!checked && (
        <>
          <ConfidenceRow value={confidence} onChange={setConfidence} />
          <div className="row between mt">
            <div className="hint-ladder" aria-label="Hints used">
              {SCAFFOLD_LADDER.slice(1).map((l) => (
                <span key={l} className={`hint-dot ${SCAFFOLD_LADDER.indexOf(l) <= SCAFFOLD_LADDER.indexOf(scaffold) && scaffold !== 'none' ? 'used' : ''}`} />
              ))}
              <button className="btn subtle sm" onClick={() => setScaffold(nextScaffold(scaffold))} disabled={scaffold === 'full'}>
                Give me a hint
              </button>
            </div>
            <button className="btn primary" onClick={submit} disabled={q.kind === 'mc' ? !chosen : !answer.trim()}>
              Check
            </button>
          </div>
          {hint && <div className="insight info mt"><Icon name="bulb" size={15} /> {hint}</div>}
        </>
      )}

      {checked && wasCorrect && (
        <div className="fb-good">
          <strong>Correct.</strong> {q.answer ? `The idea: ${q.answer}` : 'This will be remembered because you produced it yourself.'}
        </div>
      )}
      {checked && !wasCorrect && <div className="tiny muted mt">Let’s see what happened — a simpler explanation is coming.</div>}
    </>
  );
}

/* ---- teach-back stage (req 18) ---- */

function TeachBackStage({
  concept, onSubmit,
}: {
  concept: Concept;
  onSubmit: (text: string) => Promise<TeachBackEvaluation>;
}) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<TeachBackEvaluation | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const r = await onSubmit(text);
    setResult(r);
    setBusy(false);
  };

  return (
    <>
      <h2 className="mb">Explain {concept.name} back</h2>
      <p className="small muted mb">
        As if to a friend. Missing pieces are fine — they tell us what to review. Copy-pasting isn’t learning; your own words are.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Imagine a classmate asks: “What is ${concept.name}, and why does it matter?” …`}
        style={{ minHeight: 150 }}
        disabled={!!result || busy}
      />
      {!result ? (
        <button className="btn primary mt" disabled={!text.trim() || busy} onClick={submit}>
          {busy ? 'Evaluating…' : 'Submit explanation'}
        </button>
      ) : (
        <div className="mt">
          <div className={`insight ${result.score >= 0.7 ? 'good' : 'warn'}`}>
            <strong>{result.verdict === 'strong' ? 'Strong explanation' : result.verdict === 'partial' ? 'Partly there' : 'Keep building'}</strong> — covered {Math.round(result.coverage * 100)}% of the key ideas.
            {result.misconceptionHits.length > 0 && ' A trap was detected in your words: we’ll fix it with a targeted exercise.'}
          </div>
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
            {result.hasExample && <div className="tb-idea hit"><Icon name="check" size={14} />Included an example (+bonus)</div>}
          </div>
          <div className="tiny muted">Continuing automatically…</div>
        </div>
      )}
    </>
  );
}

/* ================= QUESTION CARD (session items) ================= */

function QuestionCard({
  sessionId, conceptId, questionId, note, onComplete,
}: {
  sessionId: string; conceptId: string; questionId: string | null; note?: string;
  onComplete: (correct: boolean | null, score: number | null) => Promise<void>;
}) {
  const services = useServices();
  const concept = useLiveQuery(() => services.db.concepts.get(conceptId), [conceptId], undefined);
  const question = useLiveQuery(
    async () => {
      if (questionId) return (await services.db.questions.get(questionId)) ?? null;
      const pool = await services.learning.questionsFor(conceptId);
      return pool[0] ?? null;
    },
    [conceptId, questionId],
    undefined,
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [scaffold, setScaffold] = useState<ScaffoldLevel>('none');
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const startRef = useRef(Date.now());

  if (concept === undefined || question === undefined) return <div className="card muted">Loading…</div>;
  if (!concept) return <div className="card"><Empty>Concept missing.</Empty></div>;
  if (!question) {
    return (
      <div className="card card-pad-lg">
        <h2 className="mb">{concept.name}</h2>
        <p className="read">{concept.intro}</p>
        <button className="btn primary" onClick={() => onComplete(true, null)}>Continue →</button>
      </div>
    );
  }

  const hintsUsed = SCAFFOLD_LADDER.indexOf(scaffold);
  const penalty = scaffoldPenalty(hintsUsed);
  const hint = scaffold === 'none' ? null : hintForLevel(question, scaffold);
  const answered = result !== null;

  const isBlurt = question.kind === 'blurt';
  const isFree = question.kind === 'free';
  const isTeach = question.kind === 'teach-back';

  const submit = async () => {
    setEvaluating(true);
    try {
      let score: number;
      let given: string;
      if (question.kind === 'mc') {
        score = (question.choices ?? []).find((c) => c.id === chosen)?.correct ? 1 : 0;
        given = chosen ?? '';
      } else if (isTeach) {
        score = evaluateTeachBack(concept, answer).score;
        given = answer;
      } else {
        score = evaluateShortAnswer(answer, question.keywords, question.partialKeywords).score * (1 - penalty);
        given = answer;
      }
      const correctChoice = question.kind === 'mc' ? (question.choices ?? []).find((c) => c.id === chosen) : undefined;
      const res = await services.learning.recordAttempt({
        conceptId,
        questionId: question.id,
        sessionId,
        score,
        confidence: confidence ?? undefined,
        responseMs: Date.now() - startRef.current,
        hintsUsed,
        cognitiveLevel: question.cognitiveLevel as CognitiveLevel,
        misconceptionIds: correctChoice && !correctChoice.correct && correctChoice.misconceptionId ? [correctChoice.misconceptionId] : undefined,
        chosenConceptId: correctChoice && !correctChoice.correct ? correctChoice.conceptId : undefined,
        givenAnswer: given,
        context: 'review',
      });
      setResult(res);
      const ok = score >= 0.7;
      await onComplete(ok, score);
    } finally {
      setEvaluating(false);
    }
  };

  const blurtEval = isBlurt && answered ? evaluateBlurtDisplay(answer, question) : null;

  return (
    <div className="card card-pad-lg">
      {note && <div className="insight info" style={{ marginBottom: 10 }}>{note}</div>}
      <div className="tiny muted mb">{concept.name} · {question.cognitiveLevel}{isBlurt ? ' · memory dump' : isTeach ? ' · explain-back' : ''}</div>

      {(isBlurt || isFree) && !answered && (
        <>
          <h2 className="mb">{isBlurt ? 'Brain dump' : 'Free recall'}</h2>
          <p className="small muted mb">
            {isBlurt
              ? 'Set a timer if you like. Write everything you remember about the topic — order doesn’t matter. We’ll find the gaps.'
              : 'Say everything you can about this concept, from memory. No peeking.'}
          </p>
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} style={{ minHeight: 170 }} placeholder="Go…" aria-label="Free recall" />
        </>
      )}

      {isTeach && !answered && (
        <>
          <h2 className="mb">Teach it back</h2>
          <p className="small muted mb">{question.prompt}</p>
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} style={{ minHeight: 150 }} placeholder="Your explanation…" aria-label="Teach back" />
        </>
      )}

      {!isBlurt && !isFree && !isTeach && (
        <>
          {question.scenario && <div className="q-scenario">{question.scenario}</div>}
          <div className="q-prompt"><VocabText text={question.prompt} concept={concept} knownVocabulary={new Set()} /></div>
          {question.kind === 'mc' ? (
            (question.choices ?? []).map((c) => {
              const isChosen = chosen === c.id;
              const showRight = answered && c.correct;
              const showWrong = answered && isChosen && !c.correct;
              return (
                <button
                  key={c.id}
                  className={`choice ${isChosen ? 'sel' : ''} ${showRight ? 'right' : ''} ${showWrong ? 'wrong' : ''}`}
                  disabled={answered}
                  onClick={() => setChosen(c.id)}
                >
                  <span className="letter">{String.fromCharCode(65 + (question.choices ?? []).indexOf(c))}</span>
                  {c.text}
                </button>
              );
            })
          ) : (
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={answered} placeholder="Your answer…" aria-label="Answer" />
          )}
        </>
      )}

      {!answered && (
        <>
          <ConfidenceRow value={confidence} onChange={setConfidence} />
          <div className="row between mt">
            <div className="hint-ladder">
              {SCAFFOLD_LADDER.slice(1).map((l) => (
                <span key={l} className={`hint-dot ${SCAFFOLD_LADDER.indexOf(l) <= hintsUsed && scaffold !== 'none' ? 'used' : ''}`} />
              ))}
              <button className="btn subtle sm" onClick={() => setScaffold(nextScaffold(scaffold))} disabled={scaffold === 'full'}>
                Give me a hint
              </button>
              <span className="tiny muted">{hintsUsed > 0 ? `−${Math.round(penalty * 100)}% credit` : ''}</span>
            </div>
            <button
              className="btn primary"
              disabled={evaluating || (question.kind === 'mc' ? !chosen : !answer.trim())}
              onClick={submit}
            >
              {evaluating ? 'Checking…' : 'Check'}
            </button>
          </div>
          {hint && <div className="insight info mt"><Icon name="bulb" size={15} /> {hint}</div>}
        </>
      )}

      {answered && result && <Feedback result={result} question={question} concept={concept} blurtText={blurtEval} />}

      {answered && (
        <button className="btn primary mt" onClick={() => void 0} style={{ display: 'none' }} aria-hidden="true" />
      )}
    </div>
  );
}

function evaluateBlurtDisplay(text: string, q: Question): { gaps: string[] } {
  const lower = ` ${text.toLowerCase()} `;
  const gaps: string[] = [];
  for (const group of q.keywords ?? []) {
    if (!group.some((k) => lower.includes(k.toLowerCase()))) gaps.push(group[0]);
  }
  return { gaps };
}

/* ---- error-first feedback (req 12) ---- */

function Feedback({ result, question, concept, blurtText }: {
  result: PipelineResult; question: Question; concept: Concept; blurtText: { gaps: string[] } | null;
}) {
  const services = useServices();
  const ok = result.attempt.score >= 0.7;
  const misRecs = result.misconceptionRecords.filter((m) => m.status === 'active' && m.lastAt === result.attempt.ts);
  const [speak] = useState(() => (text: string) => services.speech.speak(text));

  return (
    <div className="mt">
      <div className={`insight ${ok ? 'good' : 'warn'}`}>
        <strong>{ok ? 'Correct' : 'Not quite'}.</strong>{' '}
        {question.answer ? `${question.answer}` : ok ? 'Safely in memory — for now.' : 'Let’s look at what actually happened.'}
      </div>

      {blurtText && blurtText.gaps.length > 0 && (
        <div className="card">
          <h3 className="mb">Gap check on your dump</h3>
          <p className="small">You covered the core. These pieces didn’t appear — worth a look:</p>
          <div className="row">{blurtText.gaps.map((g) => <span key={g} className="chip amber">{g}</span>)}</div>
        </div>
      )}

      {!ok && misRecs.length > 0 && misRecs.map((rec) => {
        const def = concept.misconceptionDefs.find((d) => d.id === rec.defId);
        if (!def) return null;
        return (
          <div className="error-first" key={rec.id}>
            <div className="ef-head">A very common trap — and you just fell into it (that’s useful!)</div>
            <div className="ef-body">
              <div className="ef-step"><h4>What you answered</h4><p>{def.wrongIdea}</p></div>
              <div className="ef-step"><h4>Why it looks right</h4><p>{def.whyPlausible}</p></div>
              <div className="ef-step"><h4>Where it breaks</h4><p>{def.whereItBreaks}</p></div>
              <div className="ef-step"><h4>The correct idea</h4><p>{def.correction}</p></div>
              <div className="ef-step"><h4>How to recognize it next time</h4><p>{def.targetedExample}</p></div>
            </div>
          </div>
        );
      })}

      {!ok && !misRecs.length && question.hints.length > 0 && (
        <div className="insight warn">
          <strong>Why the answer is what it is:</strong> {question.answer ?? question.hints[question.hints.length - 1]}
        </div>
      )}

      <div className="row mt tiny muted">
        <span>Mastery {Math.round(result.state.mastery)} · next review {new Date(result.state.scheduler.dueAt).toLocaleDateString()}</span>
        <button className="btn subtle sm" onClick={() => speak(question.answer ?? concept.intro)}><Icon name="sound" size={14} /></button>
      </div>
    </div>
  );
}

/* ---- confidence (req 27) ---- */

function ConfidenceRow({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="conf-row" role="radiogroup" aria-label="How sure are you?">
      <span className="tiny muted">How sure are you?</span>
      {[
        [1, 'No idea'],
        [2, 'Shaky'],
        [3, 'Maybe'],
        [4, 'Pretty sure'],
        [5, 'Certain'],
      ].map(([v, label]) => (
        <button key={v} role="radio" aria-checked={value === v} className={`conf-btn ${value === v ? 'active' : ''}`} onClick={() => onChange(v as number)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/* ================= COMPARE (req 11, 24) ================= */

function CompareExercise({
  sessionId, aId, bId, onComplete,
}: {
  sessionId: string; aId: string; bId: string;
  onComplete: (correct: boolean | null, score: number | null) => Promise<void>;
}) {
  const services = useServices();
  const a = useLiveQuery(() => services.db.concepts.get(aId), [aId], undefined);
  const b = useLiveQuery(() => services.db.concepts.get(bId), [bId], undefined);
  const [phase, setPhase] = useState<'side' | 'question' | 'done'>('side');

  if (!a || !b) return <div className="card muted">Loading…</div>;

  return (
    <div className="card card-pad-lg">
      <div className="tiny muted mb">Comparison — you’ve mixed these up before</div>
      <h2 className="mb">{a.name} vs {b.name}</h2>
      {phase === 'side' && (
        <>
          <div className="compare-cols">
            <div className="compare-col">
              <h4>{a.name}</h4>
              <div className="small read">{a.intro}</div>
            </div>
            <div className="compare-col">
              <h4>{b.name}</h4>
              <div className="small read">{b.intro}</div>
            </div>
          </div>
          <p className="small muted mt">Where the line is: {a.name} {a.intro.slice(0, 40)}… — while {b.name} {b.intro.slice(0, 40)}…</p>
          <button className="btn primary" onClick={() => setPhase('question')}>Now test the difference →</button>
        </>
      )}
      {phase === 'question' && (
        <InlineCompareQuestion
          sessionId={sessionId}
          a={a}
          b={b}
          onDone={async (score) => {
            setPhase('done');
            await onComplete(score >= 0.7, score);
          }}
        />
      )}
      {phase === 'done' && <div className="insight good">Lines sharpened. Moving on…</div>}
    </div>
  );
}

function InlineCompareQuestion({
  sessionId, a, b, onDone,
}: {
  sessionId: string; a: Concept; b: Concept; onDone: (score: number) => Promise<void>;
}) {
  const services = useServices();
  const [chosen, setChosen] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const startRef = useRef(Date.now());

  const correctId = Math.random() < 0.5 ? a.id : b.id;
  const target = correctId === a.id ? a : b;
  const other = correctId === a.id ? b : a;

  const submit = async () => {
    setChecked(true);
    const score = chosen === correctId ? 1 : 0;
    await services.learning.recordAttempt({
      conceptId: target.id,
      questionId: null,
      sessionId,
      score,
      responseMs: Date.now() - startRef.current,
      cognitiveLevel: 'understanding',
      chosenConceptId: chosen && chosen !== correctId ? other.id : undefined,
      context: 'review',
    });
    await onDone(score);
  };

  return (
    <>
      <div className="q-prompt">Which concept does this describe: “{target.intro.slice(0, 110)}…”?</div>
      {[a, b].map((c) => (
        <button key={c.id} className={`choice ${chosen === c.id ? 'sel' : ''} ${checked ? (c.id === correctId ? 'right' : chosen === c.id ? 'wrong' : '') : ''}`} disabled={checked} onClick={() => setChosen(c.id)}>
          <span className="letter">{c.id === a.id ? 'A' : 'B'}</span>
          {c.name}
        </button>
      ))}
      {!checked && <button className="btn primary mt" disabled={!chosen} onClick={submit}>Check</button>}
      {checked && <div className="fb-good mt"><strong>{chosen === correctId ? 'Right.' : `It was ${target.name}.`}</strong> {target.name}: {target.intro}</div>}
    </>
  );
}

/* ================= SUMMARY + REFLECTION (req 55, 56) ================= */

function SessionSummary({ session }: { session: StudySession }) {
  const services = useServices();
  const toast = useToast();
  const [reflection, setReflection] = useState({ clearer: '', confusing: '', revisit: '' });
  const [saved, setSaved] = useState(session.status !== 'active' && !!session.reflection);
  const xp = useMemo(() => session.executed.filter((o) => o.correct).length * 10, [session.executed]);

  const finish = async () => {
    await services.sessions.finish(session.id, {
      clearer: reflection.clearer || undefined,
      confusing: reflection.confusing || undefined,
      revisit: (reflection.revisit as never) || undefined,
      ts: Date.now(),
    });
    setSaved(true);
    toast('Session saved.', 'info');
    navigate('/today');
  };

  return (
    <div className="content" style={{ maxWidth: 720 }}>
      <div className="card card-pad-lg center">
        <div style={{ fontSize: 40 }}>🧠</div>
        <h1 className="mb">{session.executed.length} items completed</h1>
        <div className="row center mb">
          <span className="xp-toast">+{xp} XP earned by real learning</span>
        </div>
        <div className="small muted mb">
          {session.executed.filter((e) => e.correct).length} successful ·{' '}
          {session.executed.filter((e) => e.correct === false).length} to revisit ·{' '}
          {Math.round((session.endedAt ?? Date.now()) - session.startedAt) / 60000 < 1
            ? 'quick session'
            : `${Math.round(((session.endedAt ?? Date.now()) - session.startedAt) / 60000)} min`}
        </div>
        {!saved ? (
          <>
            <h3 className="mb">Quick reflection</h3>
            <div className="field"><label>What got clearer?</label><input type="text" value={reflection.clearer} onChange={(e) => setReflection({ ...reflection, clearer: e.target.value })} placeholder="Optional" /></div>
            <div className="field"><label>What’s still confusing?</label><input type="text" value={reflection.confusing} onChange={(e) => setReflection({ ...reflection, confusing: e.target.value })} placeholder="Optional — this feeds your gap list" /></div>
            <button className="btn primary" onClick={finish}>Save session</button>
          </>
        ) : (
          <a className="btn primary" href="#/today">Back to Today</a>
        )}
      </div>
    </div>
  );
}
