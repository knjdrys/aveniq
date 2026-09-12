/**
 * Review — StudyBuddy's structure: "Review these" queue grouped by subject
 * (→ cards runner), spaced repetition with AVENIQ's stability-aware
 * scheduler, mistakes section, deepen section (blurt / Feynman), and
 * AVENIQ's blockers (misconceptions & confusion pairs) as their own rows.
 */
import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices } from '../../appContext';
import { Icon, StateChip } from '../components';
import { useRunner } from '../runnerHost';

function dueLabel(dueAt: number): string {
  const diff = Date.now() - dueAt;
  if (diff < 0) return `in ${Math.round(-diff / 3600000)}h`;
  if (diff < 3600000) return 'now';
  const h = Math.round(diff / 3600000);
  if (h < 24) return `${h}h overdue`;
  return `${Math.round(h / 24)}d overdue`;
}

export function ReviewView() {
  const services = useServices();
  const runner = useRunner();
  const subjects = useLiveQuery(() => services.db.subjects.toArray(), [], []);
  const concepts = useLiveQuery(() => services.db.concepts.toArray(), [], []);
  const states = useLiveQuery(() => services.db.conceptStates.toArray(), [], []);
  const attempts = useLiveQuery(() => services.db.attempts.orderBy('ts').reverse().limit(400).toArray(), [], []);
  const misconceptions = useLiveQuery(() => services.db.misconceptions.where('status').equals('active').toArray(), [], []);
  const pairs = useLiveQuery(() => services.db.confusionPairs.where('status').equals('active').toArray(), [], []);

  const conceptOf = (id: string) => concepts.find((c) => c.id === id);
  const stateOf = (id: string) => states.find((s) => s.conceptId === id);

  const due = useMemo(
    () => states
      .filter((s) => s.scheduler.lastReviewedAt != null && Date.now() >= s.scheduler.dueAt)
      .sort((a, b) => a.scheduler.dueAt - b.scheduler.dueAt),
    [states],
  );
  const bySubject = subjects
    .map((s) => ({ subject: s, items: due.filter((d) => conceptOf(d.conceptId)?.subjectId === s.id) }))
    .filter((g) => g.items.length > 0);

  const learnedConceptIds = new Set(states.filter((s) => s.attempts >= 1).map((s) => s.conceptId));

  // mistakes: last 14 days, ≥2 misses or last attempt wrong, not already due
  const dueIds = new Set(due.map((d) => d.conceptId));
  const mistakes = useMemo(() => {
    const windowStart = Date.now() - 14 * 24 * 3600 * 1000;
    const byConcept = new Map<string, typeof attempts>();
    for (const a of attempts) {
      if (a.ts < windowStart) break;
      const list = byConcept.get(a.conceptId) ?? [];
      list.push(a);
      byConcept.set(a.conceptId, list);
    }
    const out: { conceptId: string; misses: number; total: number }[] = [];
    for (const [conceptId, list] of byConcept) {
      const misses = list.filter((a) => a.score < 0.5).length;
      if ((misses >= 2 || (list.length > 0 && list[0].score < 0.5 && misses >= 1)) && !dueIds.has(conceptId)) {
        out.push({ conceptId, misses, total: list.length });
      }
    }
    return out.sort((a, b) => b.misses - a.misses).slice(0, 6);
  }, [attempts, dueIds]);

  const deepen = useMemo(
    () => states
      .filter((s) => s.attempts >= 1 && s.mastery >= 45 && s.mastery < 90)
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 4),
    [states],
  );

  const blockers = useMemo(
    () => [...misconceptions.map((m) => ({ kind: 'trap' as const, m })), ...pairs.map((p) => ({ kind: 'pair' as const, p }))],
    [misconceptions, pairs],
  );

  return (
    <div>
      <div className="page-head">
        <div className="grow">
          <div className="page-kicker">Review</div>
          <h1 className="page-title">{due.length > 0 ? `${due.length} to review` : 'Nothing due — nice'}</h1>
          <p className="page-sub">Spacing does the heavy lifting: each review lands right when memory starts to fade. Grades feed the real scheduler.</p>
        </div>
        {due.length > 0 && (
          <button className="btn btn-primary" onClick={() => runner.open({ kind: 'cards', conceptIds: due.map((d) => d.conceptId), title: 'Review queue' })}>
            <Icon name="review" size={15} /> Review all · {due.length}
          </button>
        )}
      </div>

      {bySubject.map(({ subject, items }) => (
        <div className="mt-4" key={subject.id}>
          <div className="section-label">
            <h3>{subject.name}</h3>
            <button className="more" onClick={() => runner.open({ kind: 'cards', conceptIds: items.map((i) => i.conceptId), title: subject.name })}>
              Review {items.length} →
            </button>
          </div>
          {items.map((s) => (
            <button key={s.conceptId} className="row" onClick={() => runner.open({ kind: 'cards', conceptIds: [s.conceptId], title: conceptOf(s.conceptId)?.name ?? 'Review' })}>
              <div className="row-main">
                <div className="row-title">{conceptOf(s.conceptId)?.name ?? s.conceptId}</div>
                <div className="row-sub">
                  {dueLabel(s.scheduler.dueAt)} · stability {Math.round(s.scheduler.stabilityDays)}d
                </div>
              </div>
              <StateChip state={s.state} flag={s.flag} />
            </button>
          ))}
        </div>
      ))}
      {due.length === 0 && learnedConceptIds.size > 0 && (
        <div className="empty">
          <div className="empty-art">✓</div>
          <div className="empty-title">All clear</div>
          <p className="empty-body">Reviews appear as memory fades — come back tomorrow, or deepen now below.</p>
        </div>
      )}
      {learnedConceptIds.size === 0 && (
        <div className="empty">
          <div className="empty-art">◎</div>
          <div className="empty-title">Nothing to review yet</div>
          <p className="empty-body">Learn a concept — reviews are scheduled from your first real attempt.</p>
          <a className="btn btn-primary" href="#/learn">Learn something</a>
        </div>
      )}

      {blockers.length > 0 && (
        <div className="mt-4">
          <div className="section-label"><h3>Blockers — fix before moving on</h3></div>
          {blockers.map((b, i) => b.kind === 'trap' ? (
            <button key={i} className="row" onClick={() => runner.open({ kind: 'feynman', conceptId: b.m.conceptId })}>
              <Icon name="x" size={16} style={{ color: 'var(--berry)' }} />
              <div className="row-main">
                <div className="row-title">Trap: {conceptOf(b.m.conceptId)?.misconceptionDefs.find((d) => d.id === b.m.defId)?.label ?? 'Known misconception'}</div>
                <div className="row-sub">{conceptOf(b.m.conceptId)?.name} · triggered {b.m.triggerCount}×</div>
              </div>
              <span className="chip berry">correct it</span>
            </button>
          ) : (
            <button key={i} className="row" onClick={() => runner.open({ kind: 'session-setup', focus: { type: 'compare' } })}>
              <Icon name="compare" size={16} style={{ color: 'var(--amber-strong)' }} />
              <div className="row-main">
                <div className="row-title">{conceptOf(b.p.aId)?.name} ↔ {conceptOf(b.p.bId)?.name}</div>
                <div className="row-sub">confused {b.p.abCount + b.p.baCount}× — needs contrast training</div>
              </div>
              <span className="chip amber">untangle</span>
            </button>
          ))}
        </div>
      )}

      {mistakes.length > 0 && (
        <div className="mt-4">
          <div className="section-label"><h3>Recent mistakes</h3></div>
          {mistakes.map((m) => (
            <button key={m.conceptId} className="row" onClick={() => runner.open({ kind: 'cards', conceptIds: [m.conceptId], title: 'Fix the miss' })}>
              <div className="row-main">
                <div className="row-title">{conceptOf(m.conceptId)?.name ?? m.conceptId}</div>
                <div className="row-sub">{m.misses} miss{m.misses > 1 ? 'es' : ''} in the last 2 weeks</div>
              </div>
              <Icon name="arrow" size={15} style={{ transform: 'rotate(-90deg)' }} />
            </button>
          ))}
        </div>
      )}

      {deepen.length > 0 && (
        <div className="mt-4">
          <div className="section-label"><h3>Deepen — push past “know it”</h3></div>
          {deepen.map((s) => (
            <div className="row" key={s.conceptId} style={{ cursor: 'default' }}>
              <div className="row-main">
                <div className="row-title">{conceptOf(s.conceptId)?.name ?? s.conceptId}</div>
                <div className="row-sub">mastery {Math.round(s.mastery)} — explain it to lock it in</div>
              </div>
              <button className="btn btn-quiet btn-sm" onClick={() => runner.open({ kind: 'blurt', conceptIds: [s.conceptId], title: 'Brain dump' })}>
                <Icon name="blurt" size={14} /> Blurt
              </button>
              <button className="btn btn-quiet btn-sm" onClick={() => runner.open({ kind: 'feynman', conceptId: s.conceptId })}>
                <Icon name="sound" size={14} /> Feynman
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
