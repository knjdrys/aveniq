/**
 * Library (req 49): subjects → topics → concepts with states; filter & search.
 */
import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices, navigate } from '../../appContext';
import { Icon, StateChip, Empty, Ring } from '../components';
import { progressionLabel } from '../../domain/knowledgeState';

export function LibraryView() {
  const services = useServices();
  const subjects = useLiveQuery(() => services.db.subjects.toArray(), [], []);
  const topics = useLiveQuery(() => services.db.topics.toArray(), [], []);
  const concepts = useLiveQuery(() => services.db.concepts.toArray(), [], []);
  const states = useLiveQuery(() => services.db.conceptStates.toArray(), [], []);
  const [filter, setFilter] = useState<'all' | 'unknown' | 'learning' | 'mastered' | 'weak' | 'due'>('all');
  const [q, setQ] = useState('');

  const stateOf = (id: string) => states.find((s) => s.conceptId === id);

  const matchesFilter = (id: string) => {
    const s = stateOf(id);
    switch (filter) {
      case 'unknown': return !s || s.state === 'unknown';
      case 'learning': return s && ['encountered', 'emerging', 'learning', 'familiar', 'developing'].includes(s.state);
      case 'mastered': return s?.state === 'mastered';
      case 'weak': return s && s.mastery < 45 && s.attempts > 0;
      case 'due': return s && s.scheduler.lastReviewedAt != null && Date.now() >= s.scheduler.dueAt;
      default: return true;
    }
  };

  const filtered = useMemo(
    () =>
      concepts.filter(
        (c) =>
          matchesFilter(c.id) &&
          (!q || c.name.toLowerCase().includes(q.toLowerCase()) || c.aliases.some((a) => a.toLowerCase().includes(q.toLowerCase()))),
      ),
    [concepts, states, filter, q],
  );

  return (
    <div className="content">
      <div className="view-title">
        <div>
          <h1>Library</h1>
          <div className="sub">{concepts.length} concepts · {subjects.length} subjects</div>
        </div>
        <a className="btn" href="#/ingest"><Icon name="import" size={16} /> Add material</a>
      </div>

      <div className="row mb">
        <input type="text" placeholder="Filter by name…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 180 }} aria-label="Filter concepts" />
        {(['all', 'unknown', 'learning', 'weak', 'due', 'mastered'] as const).map((f) => (
          <button key={f} className={`time-chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'unknown' ? 'Not started' : f === 'due' ? 'Due' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {subjects.map((subject) => {
        const subjectConcepts = filtered.filter((c) => c.subjectId === subject.id);
        if (!subjectConcepts.length) return null;
        const subjectTopics = topics.filter((t) => t.subjectId === subject.id);
        return (
          <div className="card mb" key={subject.id}>
            <div className="row between mb">
              <h2 className="row" style={{ gap: 8 }}>
                <span style={{ color: subject.color }}><Icon name={subject.icon} size={22} /></span>
                {subject.name}
              </h2>
              <span className="tiny muted">{subjectConcepts.length} concepts</span>
            </div>
            {subjectTopics.map((topic) => {
              const topicConcepts = subjectConcepts.filter((c) => c.topicId === topic.id);
              if (!topicConcepts.length) return null;
              return (
                <div key={topic.id} className="mb">
                  <h3 className="tiny" style={{ marginBottom: 6 }}>{topic.name}</h3>
                  {topicConcepts.map((c) => {
                    const s = stateOf(c.id);
                    return (
                      <button key={c.id} className="list-row clickable" style={{ width: '100%' }} onClick={() => navigate(`/concept/${c.id}`)}>
                        <Ring value={s?.mastery ?? 0} size={36} stroke={4} />
                        <span className="grow" style={{ textAlign: 'left' }}>
                          <span className="title">{c.name}</span>
                          <span className="sub">{s ? progressionLabel(s.mastery) : c.intro.slice(0, 76) + '…'}</span>
                        </span>
                        <StateChip state={s?.state ?? 'unknown'} flag={s?.flag} />
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {subjectConcepts.filter((c) => !c.topicId).map((c) => {
              const s = stateOf(c.id);
              return (
                <button key={c.id} className="list-row clickable" style={{ width: '100%' }} onClick={() => navigate(`/concept/${c.id}`)}>
                  <Ring value={s?.mastery ?? 0} size={36} stroke={4} />
                  <span className="grow" style={{ textAlign: 'left' }}>
                    <span className="title">{c.name}</span>
                    <span className="sub">{s ? progressionLabel(s.mastery) : c.intro.slice(0, 76) + '…'}</span>
                  </span>
                  <StateChip state={s?.state ?? 'unknown'} flag={s?.flag} />
                </button>
              );
            })}
          </div>
        );
      })}
      {!filtered.length && <Empty icon="library">No concepts match. Try clearing the filter.</Empty>}
    </div>
  );
}
