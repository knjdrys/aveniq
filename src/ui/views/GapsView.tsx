/**
 * Gaps view (req 41, 42): knowledge gaps with root cause, active
 * misconceptions, confusion pairs — each with a "fix now" action.
 */
import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices, navigate } from '../../appContext';
import { Empty, Icon } from '../components';

const CAUSE_LABEL: Record<string, string> = {
  prerequisite: 'Missing foundation',
  vocabulary: 'Vocabulary',
  misconception: 'Misconception',
  calculation: 'Calculation slip',
  careless: 'Careless mistake',
  memory: 'Forgot',
  application: 'Couldn’t apply',
  interpretation: 'Misread the question',
};

export function GapsView() {
  const services = useServices();
  const gaps = useLiveQuery(() => services.db.gaps.where('status').equals('open').toArray(), [], []);
  const misconceptions = useLiveQuery(() => services.db.misconceptions.where('status').equals('active').toArray(), [], []);
  const confusions = useLiveQuery(() => services.db.confusionPairs.where('status').equals('active').toArray(), [], []);
  const concepts = useLiveQuery(() => services.db.concepts.toArray(), [], []);
  const states = useLiveQuery(() => services.db.conceptStates.toArray(), [], []);

  const name = (id: string) => concepts.find((c) => c.id === id)?.name ?? id;

  const fix = async (conceptId: string) => {
    const session = await services.sessions.start({ minutes: 10, conceptIds: [conceptId] });
    navigate(`/session/${session.id}`);
  };

  const sortedGaps = [...gaps].sort((a, b) => b.occurrences - a.occurrences || b.lastAt - a.lastAt);

  return (
    <div className="content">
      <div className="view-title">
        <div>
          <h1>Gaps & traps</h1>
          <div className="sub">What’s blocking you — and the shortest path to fixing it.</div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb">Confused pairs</h2>
        {!confusions.length && <div className="small muted">None right now. When you mix up two similar concepts, they’ll show up here for contrast training.</div>}
        {confusions.map((p) => (
          <div key={p.id} className="list-row">
            <span className="chip coral">mixed up</span>
            <div className="grow">
              <div className="title">{name(p.aId)} ↔ {name(p.bId)}</div>
              <div className="sub">
                {p.abCount + p.baCount} mix-ups ·{' '}
                {p.exerciseResults.filter(Boolean).length}/{p.exerciseResults.length} contrast exercises passed
              </div>
            </div>
            <button className="btn sm" onClick={() => fix(p.abCount >= p.baCount ? p.aId : p.bId)}>
              <Icon name="learn" size={14} /> Contrast training
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="mb">Active misconceptions</h2>
        {!misconceptions.length && <div className="small muted">No active traps. When a wrong idea shows up twice, it lands here until corrected.</div>}
        {misconceptions.map((m) => {
          const concept = concepts.find((c) => c.id === m.conceptId);
          const def = concept?.misconceptionDefs.find((d) => d.id === m.defId);
          if (!def) return null;
          return (
            <div key={m.id} className="term-card" style={{ marginBottom: 10, borderColor: 'var(--coral)' }}>
              <div className="row between">
                <div className="word" style={{ color: 'var(--coral)' }}>{def.label}</div>
                <span className="chip coral">{m.triggerCount}× triggered</span>
              </div>
              <div className="row2"><span className="lbl">Wrong idea</span>{def.wrongIdea}</div>
              <div className="row2"><span className="lbl">Truth</span>{def.correction}</div>
              <div className="row2"><span className="lbl">Where it breaks</span>{def.whereItBreaks}</div>
              <button className="btn sm mt" onClick={() => fix(m.conceptId)}>Fix it now</button>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h2 className="mb">Knowledge gaps</h2>
        {!sortedGaps.length && <Empty icon="gaps">No open gaps. Every failed attempt gets diagnosed — nothing hides.</Empty>}
        {sortedGaps.map((g) => (
          <div key={g.id} className="list-row">
            <span className={`chip ${g.cause === 'prerequisite' || g.cause === 'misconception' ? 'coral' : 'amber'}`}>
              {CAUSE_LABEL[g.cause] ?? g.cause}
            </span>
            <div className="grow">
              <div className="title">{name(g.conceptId)}</div>
              <div className="sub">
                {g.rootConceptId && g.rootConceptId !== g.conceptId ? `Root: ${name(g.rootConceptId)} — ` : ''}
                {g.evidence.slice(-2).join(' · ') || 'needs diagnosis'}
                {' · '}{g.occurrences}× seen
              </div>
            </div>
            <button className="btn sm" onClick={() => fix(g.rootConceptId && g.cause === 'prerequisite' ? g.rootConceptId : g.conceptId)}>
              Fix the root
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="mb">Root-cause legend</h2>
        <div className="small muted">
          Every failure is diagnosed, not just marked wrong: {Object.values(CAUSE_LABEL).join(' · ')}.
          The fix targets the cause — a vocabulary gap gets the decoder, a missing foundation gets the prerequisite taught,
          a misconception gets error-first correction.
        </div>
      </div>
    </div>
  );
}
