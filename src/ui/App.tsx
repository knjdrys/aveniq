/**
 * AVENIQ shell — StudyBuddy's UX architecture on AVENIQ's engine.
 * Sidebar wordmark + goal nav (Home · Learn · Practice · Review · Progress),
 * secondary tools, topbar with inline search + streak/XP pills, mobile
 * bottom nav, ⌘K command palette with quick actions, runner overlays.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ServicesContext, getServices, navigate, currentRoute, parseRoute } from '../appContext';
import { ToastProvider, Icon } from './components';
import { RunnerProvider } from './runnerHost';
import { Onboarding } from './views/Onboarding';
import { HomeView } from './views/HomeView';
import { LearnView, SubjectView } from './views/LearnView';
import { PracticeView } from './views/PracticeView';
import { ReviewView } from './views/ReviewView';
import { ProgressView } from './views/ProgressView';
import { PlanView } from './views/PlannerView';
import { LibraryView } from './views/LibraryView';
import { IngestView } from './views/IngestView';
import { ConceptView } from './views/ConceptView';
import { MapView } from './views/MapView';
import { ExamsView } from './views/ExamsView';
import { SettingsView } from './views/SettingsView';
import { SearchIndex } from '../domain/search';
import { seedIfEmpty } from '../seed';
import { useRunner } from './runnerHost';

/* ---------------- nav model (StudyBuddy IA) ---------------- */

const GOALS = [
  { path: '/home', label: 'Home', icon: 'home' },
  { path: '/learn', label: 'Learn', icon: 'library' },
  { path: '/practice', label: 'Practice', icon: 'target' },
  { path: '/review', label: 'Review', icon: 'review' },
  { path: '/progress', label: 'Progress', icon: 'progress' },
];

const TOOLS = [
  { path: '/plan', label: 'Plan', icon: 'planner' },
  { path: '/map', label: 'Map', icon: 'map' },
  { path: '/exams', label: 'Exams', icon: 'exams' },
  { path: '/library', label: 'Library', icon: 'import' },
  { path: '/tutor', label: 'Tutor', icon: 'sound' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
];

const MOBILE_BOTTOM = ['/home', '/learn', '/practice', '/review'];

/* ---------------- command palette (⌘K): search + quick actions ---------------- */

interface QuickAction { id: string; label: string; hint?: string; icon: string; run: () => void }

function useQuickActions(): QuickAction[] {
  const runner = useRunner();
  return useMemo(() => [
    { id: 'session', label: 'Start a study session', hint: 'Best use of your time, sized to your day', icon: 'play', run: () => runner.open({ kind: 'session-setup' }) },
    { id: 'review-due', label: 'Review due concepts', hint: 'Clear the review queue', icon: 'review', run: () => navigate('/review') },
    { id: 'learn', label: 'Learn a new concept', hint: 'From zero — vocabulary, analogy, example', icon: 'spark', run: () => navigate('/learn') },
    { id: 'blurt', label: 'Brain dump', hint: 'Write everything you remember, find the gaps', icon: 'blurt', run: () => runner.open({ kind: 'session-setup', minutes: 5 }) },
    { id: 'exam', label: 'Take a practice exam', hint: 'Interleaved, exam-style', icon: 'exams', run: () => navigate('/practice') },
    { id: 'material', label: 'Add material', hint: 'Paste notes — review before they’re saved', icon: 'import', run: () => navigate('/library') },
  ], [runner]);
}

function Palette({ onClose }: { onClose: () => void }) {
  const services = getServices();
  const actions = useQuickActions();
  const [q, setQ] = useState('');
  const [index, setIndex] = useState<SearchIndex | null>(null);
  useEffect(() => {
    void services.content.buildSearchIndex().then(setIndex);
  }, [services]);
  const hits = useMemo(() => (index && q.length >= 2 ? index.query(q) : []), [index, q]);
  const showActions = q.length < 2;

  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="Command palette">
        <input
          autoFocus
          placeholder="Search concepts or type a command…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter') {
              if (hits[0]) navigate(`/concept/${hits[0].id}`);
              else if (showActions && actions[0]) actions[0].run();
              onClose();
            }
          }}
        />
        <div className="results">
          {showActions && (
            <>
              <div className="p-kind" style={{ padding: '8px 12px 2px' }}>Quick actions</div>
              {actions.map((a) => (
                <button key={a.id} className="p-hit" onClick={() => { a.run(); onClose(); }}>
                  <span style={{ color: 'var(--pine)', display: 'grid', placeItems: 'center', width: 20 }}><Icon name={a.icon} size={15} /></span>
                  <span>
                    <div style={{ fontWeight: 600 }}>{a.label}</div>
                    {a.hint && <div className="tiny muted">{a.hint}</div>}
                  </span>
                </button>
              ))}
            </>
          )}
          {!showActions && hits.map((h) => (
            <button key={`${h.kind}-${h.id}`} className="p-hit" onClick={() => { navigate(h.kind === 'subject' ? `/subject/${h.id}` : h.kind === 'concept' ? `/concept/${h.id}` : '/library'); onClose(); }}>
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

/* ---------------- app ---------------- */

export function App() {
  const services = getServices();
  const [route, setRoute] = useState(currentRoute());
  const [booted, setBooted] = useState(false);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

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
  const learner = useLiveQuery(
    () => (booted ? services.learning.getLearner() : Promise.resolve(null)),
    [booted],
  );

  const { path, param } = parseRoute(route);

  if (!booted || onboarded === null) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 640, fontSize: 22 }}>Aven<em>iq</em></div>
        <p className="muted small">Preparing your learning system…</p>
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

  const view = (() => {
    switch (path) {
      case '/learn': return <LearnView />;
      case '/subject': return <SubjectView subjectId={param ?? ''} />;
      case '/practice': return <PracticeView />;
      case '/review': return <ReviewView />;
      case '/progress': return <ProgressView />;
      case '/plan': return <PlanView />;
      case '/library': return <LibraryView />;
      case '/ingest': return <IngestView />;
      case '/concept': return <ConceptView conceptId={param ?? ''} />;
      case '/map': return <MapView />;
      case '/exams': return <ExamsView />;
      case '/settings': return <SettingsView />;
      case '/tutor': return <TutorStub />;
      case '/today': case '/home': default: return <HomeView />;
    }
  })();

  const activePath = path === '/today' ? '/home' : path;
  const activeItem = [...GOALS, ...TOOLS].find((n) => n.path === activePath);

  return (
    <ServicesContext.Provider value={services}>
      <ToastProvider>
        <RunnerProvider>
          <a className="skip-link" href="#main-content">Skip to content</a>
          <div className="shell">
            <aside className="shell-sidebar">
              <a className="wordmark" href="#/home">
                <span className="wordmark-mark">
                  <svg width="19" height="19" viewBox="0 0 64 64" aria-hidden="true">
                    <path d="M14 46 C 26 46, 30 32, 46 32" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray="4 7" />
                    <circle cx="14" cy="46" r="6" fill="currentColor" />
                    <circle cx="46" cy="32" r="6.5" fill="currentColor" />
                  </svg>
                </span>
                <span>
                  <span className="wordmark-name">Aven<em>iq</em></span>
                  <span className="wordmark-tag">unknown → understood</span>
                </span>
              </a>

              <nav aria-label="Goals">
                {GOALS.map((n) => (
                  <a key={n.path} href={`#${n.path}`} className={`nav-item ${activePath === n.path ? 'active' : ''}`} aria-current={activePath === n.path ? 'page' : undefined}>
                    <Icon name={n.icon} size={17} />
                    {n.label}
                    {n.path === '/review' && dueCount > 0 && <span className="nav-badge">{dueCount}</span>}
                  </a>
                ))}
              </nav>

              <div className="nav-group" />
              <nav aria-label="Tools">
                {TOOLS.map((n) => (
                  <a key={n.path} href={`#${n.path}`} className={`nav-item ${activePath === n.path ? 'active' : ''}`} aria-current={activePath === n.path ? 'page' : undefined}>
                    <Icon name={n.icon} size={17} />
                    {n.label}
                  </a>
                ))}
              </nav>

              <div className="sidebar-foot">
                <p className="sidebar-note">
                  Everything lives on this device. Your learning history belongs to you.
                </p>
              </div>
            </aside>

            <div className="shell-main">
              <header className="topbar">
                <div className="topbar-search" onClick={() => setPaletteOpen(true)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setPaletteOpen(true)}>
                  <Icon name="search" size={15} />
                  <input placeholder="Search or jump to…" readOnly aria-label="Open search" />
                  <span className="search-kbd kbd">⌘K</span>
                </div>
                <div className="topbar-right">
                  {learner && learner.streakDays > 0 && (
                    <span className="pill warm" title="Day streak — earned by real learning acts">
                      <Icon name="flame" size={13} /> {learner.streakDays}d
                    </span>
                  )}
                  {learner && <span className="pill" title="Level — XP from evidence-weighted learning">L{learner.level} · {learner.xp} XP</span>}
                  {dueCount > 0 && <a className="pill due" href="#/review" title="Concepts due for review"><Icon name="review" size={13} /> {dueCount} due</a>}
                </div>
              </header>

              <main className="shell-content" id="main-content">
                {view}
              </main>
            </div>
          </div>

          <nav className="bottomnav" aria-label="Mobile">
            {GOALS.filter((n) => MOBILE_BOTTOM.includes(n.path)).map((n) => (
              <a key={n.path} href={`#${n.path}`} className={`nav-item ${activePath === n.path ? 'active' : ''}`}>
                <Icon name={n.icon} size={20} />
                {n.label}
              </a>
            ))}
            <a href="#/settings" className={`nav-item ${activePath === '/settings' ? 'active' : ''}`}>
              <Icon name="more" size={20} />
              More
            </a>
          </nav>

          {paletteOpen && <Palette onClose={() => setPaletteOpen(false)} />}
        </RunnerProvider>
      </ToastProvider>
    </ServicesContext.Provider>
  );
}

/* Tutor gets a proper view of its own (AVENIQ's Socratic engine) */
function TutorStub() {
  const [Tutor, setTutor] = useState<React.ComponentType | null>(null);
  useEffect(() => {
    void import('./views/TutorView').then((m) => setTutor(() => m.TutorView));
  }, []);
  if (!Tutor) return <div className="panel muted">Loading tutor…</div>;
  return <Tutor />;
}
