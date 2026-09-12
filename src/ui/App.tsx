/**
 * App shell: router, sidebar, mobile nav, global search palette (⌘K),
 * boot logic (seed, theme, notifications).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ServicesContext, getServices, navigate, currentRoute, parseRoute } from '../appContext';
import { ToastProvider, Icon } from './components';
import { TodayView } from './views/TodayView';
import { LibraryView } from './views/LibraryView';
import { ConceptView } from './views/ConceptView';
import { SessionView } from './views/SessionView';
import { MapView } from './views/MapView';
import { GapsView } from './views/GapsView';
import { ProgressView } from './views/ProgressView';
import { ExamsView } from './views/ExamsView';
import { PlannerView } from './views/PlannerView';
import { IngestView } from './views/IngestView';
import { SettingsView } from './views/SettingsView';
import { SearchIndex } from '../domain/search';
import { seedIfEmpty } from '../seed';

const NAV = [
  { path: '/today', label: 'Today', icon: 'today' },
  { path: '/library', label: 'Library', icon: 'library' },
  { path: '/session', label: 'Study', icon: 'learn' },
  { path: '/map', label: 'Map', icon: 'map' },
  { path: '/gaps', label: 'Gaps', icon: 'gaps' },
  { path: '/progress', label: 'Progress', icon: 'progress' },
  { path: '/exams', label: 'Exams', icon: 'exams' },
  { path: '/planner', label: 'Planner', icon: 'planner' },
  { path: '/ingest', label: 'Add material', icon: 'import' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
];

const MOBILE_NAV = ['/today', '/library', '/session', '/progress'];

function SearchPalette({ onClose }: { onClose: () => void }) {
  const services = getServices();
  const [q, setQ] = useState('');
  const [index, setIndex] = useState<SearchIndex | null>(null);
  useEffect(() => {
    void services.content.buildSearchIndex().then(setIndex);
  }, [services]);
  const hits = useMemo(() => (index && q.length >= 2 ? index.query(q) : []), [index, q]);
  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="Search">
        <input
          autoFocus
          placeholder="Search concepts, questions, notes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && hits[0]) {
              go(hits[0].kind, hits[0].id);
              onClose();
            }
          }}
        />
        <div className="results">
          {hits.map((h) => (
            <button key={`${h.kind}-${h.id}`} className="p-hit" onClick={() => { go(h.kind, h.id); onClose(); }}>
              <span className="p-kind">{h.kind}</span>
              <span>
                <div style={{ fontWeight: 600 }}>{h.title}</div>
                <div className="tiny muted">{h.subtitle}</div>
              </span>
            </button>
          ))}
          {q.length >= 2 && !hits.length && <div className="empty">Nothing found for “{q}”.</div>}
        </div>
      </div>
    </div>
  );
}

function go(kind: string, id: string) {
  if (kind === 'concept') navigate(`/concept/${id}`);
  else if (kind === 'subject') navigate('/library');
  else if (kind === 'topic') navigate('/library');
  else if (kind === 'question') navigate('/library');
  else navigate('/library');
}

export function App() {
  const services = getServices();
  const [route, setRoute] = useState(currentRoute());
  const [booted, setBooted] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    void (async () => {
      await services.db.open();
      await seedIfEmpty(services.db);
      await services.learning.getLearner(); // ensure learner exists
      setBooted(true);
      void services.notifications.check();
      services.notifications.startPeriodicCheck();
    })();
  }, [services]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const dueCount = useLiveQuery(
    async () => {
      const states = await services.db.conceptStates.toArray();
      const now = Date.now();
      return states.filter((s) => s.scheduler.lastReviewedAt != null && now >= s.scheduler.dueAt).length;
    },
    [],
    0,
  );

  const { path, param } = parseRoute(route);

  const view = (() => {
    switch (path) {
      case '/library': return <LibraryView />;
      case '/concept': return <ConceptView conceptId={param ?? ''} />;
      case '/session': return <SessionView sessionId={param} />;
      case '/map': return <MapView />;
      case '/gaps': return <GapsView />;
      case '/progress': return <ProgressView />;
      case '/exams': return <ExamsView />;
      case '/planner': return <PlannerView />;
      case '/ingest': return <IngestView />;
      case '/settings': return <SettingsView />;
      default: return <TodayView />;
    }
  })();

  if (!booted) {
    return (
      <div className="center" style={{ paddingTop: '20vh' }}>
        <div className="brand-name" style={{ letterSpacing: '0.2em' }}>AVENIQ</div>
        <p className="muted">Preparing your learning system…</p>
      </div>
    );
  }

  return (
    <ServicesContext.Provider value={services}>
      <ToastProvider>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <div className="app">
          <nav className="sidebar" aria-label="Main">
            <div className="brand">
              <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true">
                <path d="M14 46 C 26 46, 30 32, 46 32" stroke="var(--primary)" strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray="4 7" />
                <circle cx="14" cy="46" r="5.5" fill="var(--primary)" />
                <circle cx="30" cy="39.5" r="5" fill="var(--amber)" />
                <circle cx="50" cy="32" r="6" fill="var(--green)" />
              </svg>
              <div>
                <div className="brand-name">AVENIQ</div>
                <div className="brand-tag">unknown → understood</div>
              </div>
            </div>
            {NAV.map((n) => (
              <a
                key={n.path}
                href={`#${n.path}`}
                className={`nav-item ${path === n.path ? 'active' : ''}`}
                aria-current={path === n.path ? 'page' : undefined}
              >
                <Icon name={n.icon} size={18} />
                {n.label}
                {n.path === '/today' && dueCount > 0 && <span className="nav-badge">{dueCount}</span>}
              </a>
            ))}
            <button className="nav-item" onClick={() => setPaletteOpen(true)}>
              <Icon name="search" size={18} />
              Search <span style={{ marginLeft: 'auto' }} className="kbd">⌘K</span>
            </button>
            <div className="sidebar-foot">
              Local-first. Your learning history belongs to you.
            </div>
          </nav>
          <main className="main" id="main-content">
            {view}
          </main>
          <nav className="mobile-nav" aria-label="Mobile">
            {NAV.filter((n) => MOBILE_NAV.includes(n.path)).map((n) => (
              <a key={n.path} href={`#${n.path}`} className={`nav-item ${path === n.path ? 'active' : ''}`}>
                <Icon name={n.icon} size={20} />
                {n.label === 'Add material' ? 'Add' : n.label}
              </a>
            ))}
            <a href="#/exams" className={`nav-item ${path === '/exams' ? 'active' : ''}`}>
              <Icon name="more" size={20} />
              More
            </a>
          </nav>
        </div>
        {paletteOpen && <SearchPalette onClose={() => setPaletteOpen(false)} />}
      </ToastProvider>
    </ServicesContext.Provider>
  );
}
