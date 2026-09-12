/**
 * App context: wires services to React. Single AveniqDB instance,
 * services with the real clock, theme handling, router state.
 */
import { createContext, useContext } from 'react';
import { AveniqDB, db } from './db/db';
import { LearningService } from './services/learningService';
import { FEService } from './services/feService';
import { SessionService } from './services/sessionService';
import { RecommendService } from './services/recommendService';
import { ExamService } from './services/examService';
import { ContentService } from './services/contentService';
import { AIService } from './services/aiService';
import { SpeechService, NotificationService } from './services/platformService';

export interface Services {
  db: AveniqDB;
  learning: LearningService;
  fe: FEService;
  sessions: SessionService;
  recommend: RecommendService;
  exams: ExamService;
  content: ContentService;
  ai: AIService;
  speech: SpeechService;
  notifications: NotificationService;
}

let cached: Services | null = null;

export function getServices(): Services {
  if (!cached) {
    const learning = new LearningService(db);
    cached = {
      db,
      learning,
      fe: new FEService(db, learning),
      sessions: new SessionService(db, learning),
      recommend: new RecommendService(db, learning),
      exams: new ExamService(db, learning),
      content: new ContentService(db),
      ai: new AIService(db, learning),
      speech: new SpeechService(),
      notifications: new NotificationService(db, learning),
    };
  }
  return cached;
}

export const ServicesContext = createContext<Services>(getServices());

export function useServices(): Services {
  return useContext(ServicesContext);
}

/* ---------- routing (hash-based, offline-friendly) ---------- */

export function navigate(path: string): void {
  window.location.hash = `#${path}`;
}

export function currentRoute(): string {
  return window.location.hash.replace(/^#/, '') || '/today';
}

export function parseRoute(route: string): { path: string; param?: string } {
  const parts = route.split('/').filter(Boolean);
  return { path: `/${parts[0] ?? 'today'}`, param: parts[1] };
}

/* ---------- theme ---------- */

export function applyTheme(theme: 'light' | 'dark' | 'system'): void {
  localStorage.setItem('aveniq.theme', JSON.stringify(theme));
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}
