/**
 * Concept detail (req 3, 4, 13, 75): depth layers 0–7, adaptive default layer,
 * vocabulary decoding, examples, misconceptions, mastery WHY, history,
 * start first-encounter.
 */
import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices, navigate } from '../../appContext';
import { useRunner } from '../runnerHost';
import { Empty, Icon, Ring, StateChip, useToast, VocabText } from '../components';
import { LAYER_LABELS, LAYER_ORDER, LayerKind, ExplanationStyle } from '../../domain/types';
import { masteryGateReport, DEFAULT_CHECKPOINTS } from '../../domain/mastery';
import { progressionLabel } from '../../domain/knowledgeState';
import { pickExplanation } from '../../domain/explanation';
import { t } from '../../domain/i18n';

export function ConceptView({ conceptId }: { conceptId: string }) {
  const services = useServices();
  const runner = useRunner();
  const toast = useToast();
  const concept = useLiveQuery(() => services.db.concepts.get(conceptId), [conceptId], undefined);
  const state = useLiveQuery(() => services.db.conceptStates.get(conceptId), [conceptId], undefined);
  const attempts = useLiveQuery(() => services.db.attempts.where('conceptId').equals(conceptId).toArray(), [conceptId], []);
  const learner = useLiveQuery(() => services.learning.getLearner(), []);
  const prereqStates = useLiveQuery(async () => {
    if (!concept) return [];
    return Promise.all(concept.prerequisites.map((p) => services.db.concepts.get(p)));
  }, [concept], []);
  const related = useLiveQuery(async () => {
    const all = await services.db.concepts.toArray();
    return all.filter((c) => c.id !== conceptId && c.prerequisites.includes(conceptId));
  }, [conceptId], []);

  const knownVocab = useLiveQuery(() => services.learning.knownVocabulary(), [], new Set<string>());

  // adaptive default layer (req 3): choose from mastery
  const defaultLayer: LayerKind = useMemo(() => {
    const m = state?.mastery ?? 0;
    if (!state || m < 10) return 'what';
    if (m < 30) return 'eli5';
    if (m < 45) return 'simple-example';
    if (m < 60) return 'how-it-works';
    if (m < 75) return 'realistic';
    if (m < 85) return 'formal';
    return 'edge-cases';
  }, [state]);
  const [layer, setLayer] = useState<LayerKind | null>(null);
  const activeLayer = layer ?? defaultLayer;
  const [triedStyles, setTriedStyles] = useState<ExplanationStyle[]>([]);
  const [starting, setStarting] = useState(false);

  if (!concept) return <div className="content"><Empty>Concept not found.</Empty></div>;
  if (!learner) return null;

  const explanation = pickExplanation(concept, activeLayer, learner.styleStats, triedStyles)
    ?? concept.explanations.find((e) => e.layer === activeLayer)
    ?? concept.explanations[0];

  const gateReport = state ? masteryGateReport(state, learner.settings.checkpoints, concept.name) : [];
  const speak = (text: string) => {
    if (!services.speech.speak(text)) toast('Speech is not supported in this browser.', 'error');
  };

  const startFE = async () => {
    setStarting(true);
    try {
      const session = await services.sessions.start({ minutes: 12, conceptIds: [conceptId] });
      runner.open({ kind: 'session', sessionId: session.id });
    } catch {
      toast('Could not start.', 'error');
    } finally {
      setStarting(false);
    }
  };

  const layerContent = (kind: LayerKind): string => {
    switch (kind) {
      case 'what': return concept.intro;
      case 'eli5': return explanation?.content ?? concept.intro;
      case 'simple-example': return concept.examples.simple ?? explanation?.content ?? concept.intro;
      case 'how-it-works': return explanation?.content ?? '';
      case 'realistic': return concept.examples.realistic ?? '';
      case 'formal': return explanation?.content ?? '';
      case 'edge-cases': return [concept.examples.edge, concept.examples.counter, concept.examples.incorrect].filter(Boolean).join('\n\n');
      case 'apply': return 'Test yourself: start a study session and the system will pick the right level of question.';
      default: return '';
    }
  };

  return (
    <div className="content">
      <button className="btn subtle sm mb" onClick={() => history.back()}><Icon name="back" size={15} /> Back</button>
      <div className="view-title">
        <div>
          <h1>{concept.name}</h1>
          <div className="sub">{state ? progressionLabel(state.mastery) : 'Not encountered yet'}</div>
        </div>
        <div className="row">
          {state && <Ring value={state.mastery} size={58} />}
          {state && <StateChip state={state.state} flag={state.flag} />}
        </div>
      </div>

      {(!state || state.state === 'unknown') && (
        <div className="card row between mb" style={{ borderColor: 'var(--primary)' }}>
          <div>
            <h3>First encounter</h3>
            <div className="small muted">Never seen this before? We’ll start from zero — vocabulary, analogy, tiny example — and build up.</div>
          </div>
          <button className="btn primary" disabled={starting} onClick={startFE}>Learn from zero →</button>
        </div>
      )}

      {/* depth layers 0-7 */}
      <div className="card">
        <div className="layer-tabs" role="tablist">
          {LAYER_ORDER.map((l, i) => (
            <button key={l} role="tab" aria-selected={activeLayer === l} className={`layer-tab ${activeLayer === l ? 'active' : ''}`} onClick={() => { setLayer(l); setTriedStyles([]); }}>
              L{i} · {LAYER_LABELS[l]}
            </button>
          ))}
        </div>
        {activeLayer === 'what' ? (
          <div className="read"><p><VocabText text={concept.intro} concept={concept} knownVocabulary={knownVocab} onSpeak={speak} /></p></div>
        ) : (
          <div className="read">
            {layerContent(activeLayer).split(/\n+/).map((p, i) => (
              <p key={i}><VocabText text={p} concept={concept} knownVocabulary={knownVocab} onSpeak={speak} /></p>
            ))}
          </div>
        )}
        <div className="row mt">
          <button className="btn sm" onClick={() => { if (explanation) { setTriedStyles((s) => [...s, explanation.style]); void services.learning.recordStyleOutcome(concept.id, explanation.style, false); } }}>
            <Icon name="bulb" size={15} /> I don’t understand — explain differently
          </button>
          <button className="btn subtle sm" onClick={() => speak(layerContent(activeLayer) || concept.intro)}><Icon name="sound" size={15} /> Read aloud</button>
          {explanation && <span className="chip">style: {explanation.style}{explanation.source === 'ai' ? ' · AI-generated' : ''}</span>}
        </div>
        {activeLayer === 'eli5' && (
          <div className="tiny muted mt">Why it matters: {concept.whyItMatters}</div>
        )}
      </div>

      {/* vocabulary */}
      {concept.terms.length > 0 && (
        <div className="card">
          <h2 className="mb">Vocabulary decoder</h2>
          {concept.terms.map((term) => (
            <div key={term.id} className="term-card" style={{ marginBottom: 8 }}>
              <div className="word">{term.word}</div>
              {term.simple && <div className="row2"><span className="lbl">Simply</span>{term.simple}</div>}
              <div className="row2"><span className="lbl">Meaning</span>{term.definition}</div>
              {term.example && <div className="row2"><span className="lbl">Example</span>{term.example}</div>}
              <div className="row2"><span className="lbl">Why here</span>{term.why}</div>
            </div>
          ))}
        </div>
      )}

      {/* examples */}
      {(concept.examples.simple || concept.examples.realistic || concept.examples.counter || concept.examples.edge || concept.examples.incorrect) && (
        <div className="card">
          <h2 className="mb">Examples</h2>
          {(['simple', 'realistic', 'counter', 'edge', 'incorrect'] as const).map((k) =>
            concept.examples[k] ? (
              <div key={k} className="mb">
                <h3>{k === 'simple' ? 'Simple' : k === 'realistic' ? 'Realistic' : k === 'counter' ? 'Counterexample' : k === 'edge' ? 'Edge case' : 'When it does NOT apply'}</h3>
                <div className="read small">{concept.examples[k]}</div>
              </div>
            ) : null,
          )}
        </div>
      )}

      {/* misconceptions */}
      {concept.misconceptionDefs.length > 0 && (
        <div className="card">
          <h2 className="mb">Common traps</h2>
          {concept.misconceptionDefs.map((m) => {
            const active = state?.activeMisconceptions.includes(m.id);
            return (
              <div key={m.id} className="term-card" style={{ marginBottom: 8, borderColor: active ? 'var(--coral)' : undefined }}>
                <div className="word" style={{ color: active ? 'var(--coral)' : undefined }}>{active ? '⚠ ' : ''}{m.label}</div>
                <div className="row2"><span className="lbl">Wrong idea</span>{m.wrongIdea}</div>
                <div className="row2"><span className="lbl">Why it looks right</span>{m.whyPlausible}</div>
                <div className="row2"><span className="lbl">Where it breaks</span>{m.whereItBreaks}</div>
                <div className="row2"><span className="lbl">Correct idea</span>{m.correction}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* prerequisites */}
      <div className="card">
        <h2 className="mb">Foundations</h2>
        {prereqStates.filter(Boolean).length === 0 && <div className="small muted">No prerequisites — this is a foundation concept.</div>}
        {prereqStates.filter(Boolean).map((p) => {
          const ps = prereqStates && null;
          void ps;
          return <PrereqRow key={p!.id} id={p!.id} />;
        })}
        {related.length > 0 && (
          <>
            <h3 className="mt" style={{ marginBottom: 6 }}>Builds toward</h3>
            {related.map((r) => <PrereqRow key={r.id} id={r.id} />)}
          </>
        )}
      </div>

      {/* mastery WHY (req 75) */}
      {state && (
        <div className="card">
          <h2 className="mb">Mastery — why this number</h2>
          <div className="bar-row"><span>Retrieval</span><Bar2 value={state.breakdown.retrieval} /></div>
          <div className="bar-row"><span>Application</span><Bar2 value={state.breakdown.application} /></div>
          <div className="bar-row"><span>Explanation</span><Bar2 value={state.breakdown.explanation} /></div>
          <div className="bar-row"><span>Stability</span><Bar2 value={state.breakdown.stability} /></div>
          <div className="bar-row"><span>Freshness</span><Bar2 value={state.breakdown.recency} /></div>
          <div className="bar-row"><span>Consistency</span><Bar2 value={state.breakdown.consistency} /></div>
          <div className="bar-row"><span>Foundations</span><Bar2 value={state.breakdown.prerequisiteHealth} /></div>
          <div className="mt">
            <h3>Evidence gates to “mastered”</h3>
            {gateReport.map((g, i) => (
              <div key={i} className="small row" style={{ gap: 6, marginBottom: 3 }}>
                <span style={{ color: g.ok ? 'var(--green)' : 'var(--amber)' }}><Icon name={g.ok ? 'check' : 'x'} size={13} /></span>
                <span className={g.ok ? '' : 'muted'}>{t(g.key, g.params)}</span>
              </div>
            ))}
          </div>
          <div className="tiny muted mt">
            {attempts.length} attempts · stability {Math.round(state.scheduler.stabilityDays * 10) / 10}d ·
            due {state.scheduler.lastReviewedAt ? new Date(state.scheduler.dueAt).toLocaleDateString() : '—'} ·
            lapses {state.scheduler.lapses}
          </div>
        </div>
      )}
    </div>
  );
}

function Bar2({ value }: { value: number }) {
  return (
    <>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.round(value * 100)}%` }} /></div>
      <span className="tiny muted">{Math.round(value * 100)}%</span>
    </>
  );
}

function PrereqRow({ id }: { id: string }) {
  const services = useServices();
  const concept = useLiveQuery(() => services.db.concepts.get(id), [id], undefined);
  const state = useLiveQuery(() => services.db.conceptStates.get(id), [id], undefined);
  if (!concept) return null;
  return (
    <button className="list-row clickable" style={{ width: '100%' }} onClick={() => navigate(`/concept/${id}`)}>
      <Ring value={state?.mastery ?? 0} size={32} stroke={4} />
      <span className="grow" style={{ textAlign: 'left' }}>{concept.name}</span>
      <StateChip state={state?.state ?? 'unknown'} flag={state?.flag} />
    </button>
  );
}
