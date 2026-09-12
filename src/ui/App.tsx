/**
 * AVENIQ shell — goal-first navigation (StudyBuddy UX pattern, AVENIQ engine).
 *
 * Primary nav answers learner goals: Home · Learn · Practice · Review · Progress.
 * System tools (Map, Library, Exams, Planner) sit below; Settings & Add material
 * at the rail foot. Runners (study sessions) open as focused full-screen
 * overlays, never as nav destinations. First run opens onboarding.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ServicesContext, getServices, navigate, currentRoute, parseRoute } from '../appContext';
import { ToastProvider, Icon } from './components';
import { Onboarding } from './views/Onboarding';
import { HomeView } from './views/HomeView';
import { LearnView } from './views/LearnView';
import { PracticeView } from './views/PracticeView';
import { ReviewView } from './views/ReviewView';
import { LibraryView } from './views/LibraryView';
import { ConceptView } from './views/ConceptView';
import { SessionView } from './views/SessionView';
import { MapView } from './views/MapView';
import { ProgressView } from './views/ProgressView';
import { ExamsView } from './views/ExamsView';
import { PlannerView } from './views/PlannerView';
import { IngestView } from './views/IngestView';
import { SettingsView } from './views/SettingsView';
import { SearchIndex } from '../domain/search';
import { seedIfEmpty } from '../seed';

/* ---------------- nav model ---------------- */

const GOALS = [
  { path: '/home', label: 'Home', icon: 'home', title: 'Home', sub: 'Your next best move' },
  { path: '/learn', label: 'Learn', icon: 'spark', title: 'Learn', sub: 'New concepts, from zero' },
  { path: '/practice', label: 'Practice', icon: 'target', title: 'Practice', sub: 'Retrieve, apply, compare' },
  { path: '/review', label: 'Review', icon: 'review', title: 'Review', sub: 'Keep memory alive' },
  { path: '/progress', label: 'Progress', icon: 'progress', title: 'Progress', sub: 'Real signals only' },
];

const TOOLS = [
  { path: '/map', label: 'Map', icon: 'map', title: 'Learning map', sub: 'Foundations → advanced' },
  { path: '/library', label: 'Library', icon: 'library', title: 'Library', sub: 'Everything you can learn' },
  { path: '/exams', label: 'Exams', icon: 'exams', title: 'Exams', sub: 'Explainable readiness' },
  { path: '/planner', label: 'Plan', icon: 'planner', title: 'Study planner', sub: 'A living day-by-day plan' },
];

const FOOT = [
  { path: '/ingest', label: 'Add', icon: 'import', title: 'Add material', sub: 'Paste anything — review before it’s saved' },
  { path: '/settings', label: 'Settings', icon: 'settings', title: 'Settings', sub: 'Everything lives on this device' },
];

const MOBILE_BOTTOM = ['/home', '/learn', '/practice', '/review'];

/* ---------------- search palette (⌘K) ---------------- */

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
  else navigate('/library');
}

/* ---------------- more sheet (mobile) ---------------- */

function MoreSheet({ onClose }: { onClose: () => void }) {
  const items = [...TOOLS, ...FOOT];
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label="More">
        {items.map((n) => (
          <a key={n.path} className="onboard-choice" href={`#${n.path}`} onClick={onClose}>
            <Icon name={n.icon} size={18} />
            <span style={{ fontWeight: 600 }}>{n.label === 'Add' ? 'Add material' : n.label === 'Plan' ? 'Planner' : n.label}</span>
          </a>
        ))}
        <a className="onboard-choice" href="#/progress" onClick={onClose}>
          <Icon name="progress" size={18} />
          <span style={{ fontWeight: 600 }}>Progress</span>
        </a>
      </div>
    </div>
  );
}

/* ---------------- app ---------------- */

export function App() {
  const services = getServices();
  const [route, setRoute] = useState(currentRoute());
  const [booted, setBooted] = useState(false);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    setOnboarded(localStorage.getItem('aveniq.onboarded') === '1');
    void (async () => {
      await services.db.open();
      await seedIfEmpty(services.db);
      await services.learning.getLearner();
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
  // learner query must not run before boot created the row (writes are illegal in liveQuery)
  const learner = useLiveQuery(
    () => (booted ? services.learning.getLearner() : Promise.resolve(null)),
    [booted],
  );

  const { path, param } = parseRoute(route);

  if (!booted || onboarded === null) {
    return (
      <div className="center" style={{ paddingTop: '22vh' }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, letterSpacing: '0.22em' }}>AVENIQ</div>
        <p className="muted">Preparing your learning system…</p>
      </div>
    );
  }

  if (!onboarded) {
    return (
      <ServicesContext.Provider value={services}>
        <ToastProvider>
          <Onboarding onDone={() => setOnboarded(true)} />
        </ToastProvider>
      </ServicesContext.Provider>
    );
  }

  /* runners: full-screen focused overlays */
  if (path === '/session') {
    return (
      <ServicesContext.Provider value={services}>
        <ToastProvider>
          <div className="runner">
            <SessionView sessionId={param} />
          </div>
        </ToastProvider>
      </ServicesContext.Provider>
    );
  }

  const active = [...GOALS, ...TOOLS, ...FOOT].find((n) => n.path === path) ?? GOALS[0];

  const view = (() => {
    switch (path) {
      case '/learn': return <LearnView />;
      case '/practice': return <PracticeView />;
      case '/review': return <ReviewView />;
      case '/today': return <HomeView />;
      case '/library': return <LibraryView />;
      case '/concept': return <ConceptView conceptId={param ?? ''} />;
      case '/map': return <MapView />;
      case '/gaps': return <ReviewView />;
      case '/progress': return <ProgressView />;
      case '/exams': return <ExamsView />;
      case '/planner': return <PlannerView />;
      case '/ingest': return <IngestView />;
      case '/settings': return <SettingsView />;
      default: return <HomeView />;
    }
  })();

  return (
    <ServicesContext.Provider value={services}>
      <ToastProvider>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <div className="shell">
          <nav className="rail" aria-label="Main">
            <div className="rail-brand" title="AVENIQ — from unknown to understood">
              <svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true">
                <path d="M14 46 C 26 46, 30 32, 46 32" stroke="var(--primary)" strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray="4 7" />
                <circle cx="14" cy="46" r="5.5" fill="var(--primary)" />
                <circle cx="30" cy="39.5" r="5" fill="var(--amber)" />
                <circle cx="50" cy="32" r="6" fill="var(--green)" />
              </svg>
            </div>
            <div className="rail-section">Goals</div>
            {GOALS.map((n) => (
              <a key={n.path} href={`#${n.path}`} className={`rail-item ${path === n.path ? 'active' : ''}`} aria-current={path === n.path ? 'page' : undefined}>
                <Icon name={n.icon} size={21} />
                {n.label}
                {n.path === '/review' && dueCount > 0 && <span className="rail-badge">{dueCount}</span>}
              </a>
            ))}
            <div className="rail-section">System</div>
            {TOOLS.map((n) => (
              <a key={n.path} href={`#${n.path}`} className={`rail-item ${path === n.path ? 'active' : ''}`} aria-current={path === n.path ? 'page' : undefined}>
                <Icon name={n.icon} size={21} />
                {n.label}
              </a>
            ))}
            <div className="rail-foot">
              {FOOT.map((n) => (
                <a key={n.path} href={`#${n.path}`} className={`rail-item ${path === n.path ? 'active' : ''}`} aria-current={path === n.path ? 'page' : undefined}>
                  <Icon name={n.icon} size={21} />
                  {n.label}
                </a>
              ))}
            </div>
          </nav>

          <div className="main-col">
            <header className="topbar">
              <div>
                <div className="topbar-title">{active.title}</div>
                <div className="topbar-sub">{active.sub}</div>
              </div>
              <div className="spacer" />
              {learner && (
                <>
                  {learner.streakDays > 0 && (
                    <span className="chip-stat" title="Days with at least one successful retrieval">
                      <span className="dot" style={{ background: 'var(--amber)' }} />
                      {learner.streakDays}d
                    </span>
                  )}
                  <span className="chip-stat" title="Experience — earned by real learning acts">L{learner.level}</span>
                </>
              )}
              <button className="search-pill" onClick={() => setPaletteOpen(true)}>
                <Icon name="search" size={15} />
                <span className="search-label">Search</span>
                <span className="kbd" style={{ marginLeft: 'auto' }}>⌘K</span>
              </button>
            </header>

            <div className="main-scroll" id="main-content">
              {view}
            </div>
          </div>
        </div>

        <nav className="bottom-nav" aria-label="Mobile">
          {GOALS.filter((n) => MOBILE_BOTTOM.includes(n.path)).map((n) => (
            <a key={n.path} href={`#${n.path}`} className={`rail-item ${path === n.path ? 'active' : ''}`}>
              <Icon name={n.icon} size={20} />
              {n.label}
              {n.path === '/review' && dueCount > 0 && <span className="rail-badge">{dueCount}</span>}
            </a>
          ))}
          <button className={`rail-item ${moreOpen ? 'active' : ''}`} onClick={() => setMoreOpen(true)}>
            <Icon name="more" size={20} />
            More
          </button>
        </nav>

        {paletteOpen && <SearchPalette onClose={() => setPaletteOpen(false)} />}
        {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} />}
      </ToastProvider>
    </ServicesContext.Provider>
  );
}
