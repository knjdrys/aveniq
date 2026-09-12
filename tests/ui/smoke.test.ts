/**
 * UI smoke test: boots the real <App /> in jsdom + fake-indexeddb and walks
 * every route, asserting each view renders content without crashing.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';

// jsdom + fake indexeddb globals BEFORE importing app code
beforeAll(async () => {
  const jsdom = await import('jsdom');
  const dom = new jsdom.JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  const w = dom.window as unknown as typeof globalThis;
  Object.defineProperty(globalThis, 'window', { value: w, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'document', { value: w.document, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: w.localStorage, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'matchMedia', { value: w.matchMedia ?? ((q: string) => ({ matches: false, media: q, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })), configurable: true, writable: true });
  (globalThis as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 16);
  (globalThis as Record<string, unknown>).cancelAnimationFrame = (id: unknown) => clearTimeout(id as number);
  (globalThis as Record<string, unknown>).MutationObserver = w.MutationObserver;
  (globalThis as Record<string, unknown>).Element = w.Element;
  (globalThis as Record<string, unknown>).HTMLElement = w.HTMLElement;
  (globalThis as Record<string, unknown>).SVGElement = w.SVGElement;

  const fidb = await import('fake-indexeddb');
  const fakeIndexedDB = (fidb as unknown as { indexedDB: typeof indexedDB }).indexedDB ?? (fidb as unknown as { default: typeof indexedDB }).default;
  (globalThis as Record<string, unknown>).indexedDB = fakeIndexedDB;
  (globalThis as Record<string, unknown>).IDBKeyRange = (fidb as unknown as { IDBKeyRange: typeof IDBKeyRange }).IDBKeyRange;
});

// speech + notifications not available in jsdom — silence
vi.spyOn(console, 'error').mockImplementation(() => {});

const ROUTES = [
  ['/#/today', ['What should I study right now', 'Library']],
  ['/#/library', ['Library', 'Primary Key']],
  ['/#/map', ['Learning map']],
  ['/#/gaps', ['Gaps', 'Confused pairs']],
  ['/#/progress', ['Progress', 'Real signals only']],
  ['/#/exams', ['Exams']],
  ['/#/planner', ['Study planner']],
  ['/#/ingest', ['Add material']],
  ['/#/settings', ['Settings', 'Mastery checkpoints']],
] as const;

describe('UI smoke (all views boot)', () => {
  it('renders app shell + every route', async () => {
    const { App } = await import('../../src/ui/App');
    const rootEl = document.getElementById('root')!;
    const root: Root = createRoot(rootEl);
    root.render(React.createElement(React.StrictMode, null, React.createElement(App)));

    // wait for boot (seed + learner)
    let html = '';
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 100));
      html = rootEl.innerHTML;
      if (html.includes('unknown → understood')) break;
    }
    expect(html).toContain('unknown → understood');
    expect(html).toContain('Today');

    // seed content made it in
    for (let i = 0; i < 60 && !html.includes('Database'); i++) {
      await new Promise((r) => setTimeout(r, 100));
      html = rootEl.innerHTML;
    }

    for (const [hash, needles] of ROUTES) {
      window.location.hash = hash.replace('#', '');
      window.dispatchEvent(new window.HashChangeEvent('hashchange'));
      await new Promise((r) => setTimeout(r, 350));
      html = rootEl.innerHTML;
      for (const needle of needles) {
        if (!html.includes(needle)) {
          throw new Error(`Route ${hash}: expected "${needle}" in output. Got: ${html.slice(0, 400)}…`);
        }
      }
    }

    // concept detail for a seeded concept
    const db = (await import('../../src/db/db')).db;
    const concept = (await db.concepts.toArray()).find((c) => c.name === 'Functional Dependency')!;
    window.location.hash = `/concept/${concept.id}`;
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    await new Promise((r) => setTimeout(r, 400));
    html = rootEl.innerHTML;
    expect(html).toContain('Functional Dependency');
    expect(html).toContain('First encounter');

    root.unmount();
  }, 30000);
});
