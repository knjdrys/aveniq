/** Minimal ambient typing for the dynamically imported jsdom test helper. */
declare module 'jsdom' {
  export class JSDOM {
    constructor(html: string, opts?: Record<string, unknown>);
    window: unknown;
  }
}
