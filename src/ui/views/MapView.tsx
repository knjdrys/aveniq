/**
 * Learning map (req 43): SVG knowledge graph — concepts as nodes colored
 * by state, prerequisite edges + relationship edges; virtualization not
 * needed at typical scale but we cap rendered edges.
 */
import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices, navigate } from '../../appContext';
import { Icon, StateChip } from '../components';
import { ConceptState } from '../../domain/types';

const STATE_COLOR: Record<string, string> = {
  unknown: 'var(--surface-3)',
  encountered: 'var(--blue)',
  emerging: 'var(--blue)',
  learning: 'var(--amber)',
  familiar: 'var(--amber)',
  developing: 'var(--primary)',
  proficient: 'var(--primary)',
  mastered: 'var(--green)',
};

export function MapView() {
  const services = useServices();
  const concepts = useLiveQuery(() => services.db.concepts.toArray(), [], []);
  const states = useLiveQuery(() => services.db.conceptStates.toArray(), [], []);
  const [selected, setSelected] = useState<string | null>(null);

  const stateOf = (id: string): ConceptState | undefined => states.find((s) => s.conceptId === id);

  // layer-based layout: depth in prerequisite DAG
  const layout = useMemo(() => {
    if (!concepts.length) return { nodes: [], edges: [], width: 700, height: 200 };
    const byId = new Map(concepts.map((c) => [c.id, c]));
    const depth = new Map<string, number>();
    const depthOf = (id: string, seen = new Set<string>()): number => {
      if (depth.has(id)) return depth.get(id)!;
      if (seen.has(id)) return 0;
      seen.add(id);
      const c = byId.get(id);
      if (!c || !c.prerequisites.length) {
        depth.set(id, 0);
        return 0;
      }
      const d = 1 + Math.max(...c.prerequisites.map((p) => depthOf(p, seen)));
      depth.set(id, d);
      return d;
    };
    for (const c of concepts) depthOf(c.id);

    const layers = new Map<number, string[]>();
    for (const c of concepts) {
      const d = depth.get(c.id) ?? 0;
      layers.set(d, [...(layers.get(d) ?? []), c.id]);
    }

    const W = 240, H = 130, PAD = 60;
    const maxLayer = Math.max(0, ...layers.keys());
    const nodes = concepts.map((c) => {
      const d = depth.get(c.id) ?? 0;
      const row = layers.get(d) ?? [];
      const i = row.indexOf(c.id);
      return {
        id: c.id,
        name: c.name,
        x: PAD + d * W + W / 2,
        y: 46 + i * 92,
        col: d,
        row: i,
      };
    });

    // vertical centering per column
    const byCol = new Map<number, typeof nodes>();
    for (const n of nodes) byCol.set(n.col, [...(byCol.get(n.col) ?? []), n]);
    const heights = [...byCol.entries()].map(([col, ns]) => ({ col, h: Math.max(200, ns.length * 100) }));
    const maxH = Math.max(...heights.map((x) => x.h));
    for (const [col, ns] of byCol) {
      const h = Math.max(200, ns.length * 100);
      const offset = (maxH - h) / 2;
      ns.forEach((n, i) => {
        n.y = offset + 50 + i * ((h - 100) / Math.max(1, ns.length - 1) || 0) + (ns.length === 1 ? 0 : 0);
        if (ns.length === 1) n.y = maxH / 2;
        else n.y = offset + 46 + (i * (h - 92)) / (ns.length - 1);
      });
    }

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const edges: { from: { x: number; y: number }; to: { x: number; y: number }; id: string; relation: string }[] = [];
    for (const c of concepts) {
      for (const p of c.prerequisites) {
        const from = nodeMap.get(p), to = nodeMap.get(c.id);
        if (from && to) edges.push({ from, to, id: `${p}->${c.id}`, relation: 'prerequisite' });
      }
    }
    return {
      nodes,
      edges,
      width: (maxLayer + 1) * W + PAD * 2,
      height: maxH + 100,
    };
  }, [concepts]);

  const concept = selected ? concepts.find((c) => c.id === selected) : null;
  const cState = selected ? stateOf(selected) : undefined;
  const prereqs = concept?.prerequisites.map((p) => concepts.find((c) => c.id === p)).filter(Boolean) ?? [];
  const unlocks = concepts.filter((c) => concept && c.prerequisites.includes(concept.id));

  return (
    <div className="content" style={{ maxWidth: 1000 }}>
      <div className="view-title">
        <div>
          <h1>Learning map</h1>
          <div className="sub">Foundations on the left → advanced on the right. Color = your state.</div>
        </div>
        <div className="row small">
          <span className="chip">not started</span>
          <span className="chip blue">seen</span>
          <span className="chip amber">learning</span>
          <span className="chip primary">developing</span>
          <span className="chip green">mastered</span>
        </div>
      </div>

      <div className="map-wrap">
        <svg className="map-svg" width={Math.max(700, layout.width)} height={layout.height} role="img" aria-label="Knowledge graph">
          {layout.edges.map((e) => (
            <path
              key={e.id}
              d={`M ${e.from.x + 90} ${e.from.y} C ${e.from.x + 150} ${e.from.y}, ${e.to.x - 150} ${e.to.y}, ${e.to.x - 90} ${e.to.y}`}
              stroke="var(--line-strong)"
              strokeWidth={1.6}
              fill="none"
              markerEnd="url(#arrow)"
            />
          ))}
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--line-strong)" />
            </marker>
          </defs>
          {layout.nodes.map((n) => {
            const s = stateOf(n.id);
            const color = STATE_COLOR[s?.state ?? 'unknown'] ?? 'var(--surface-3)';
            const flagged = s?.flag === 'confused';
            return (
              <g
                key={n.id}
                className="map-node"
                tabIndex={0}
                role="button"
                aria-label={`${n.name}, ${s?.state ?? 'not started'}`}
                onClick={() => setSelected(n.id)}
                onKeyDown={(e) => e.key === 'Enter' && setSelected(n.id)}
              >
                <rect x={n.x - 90} y={n.y - 24} width={180} height={48} rx={12} fill="var(--surface)" stroke={flagged ? 'var(--coral)' : color} strokeWidth={2.5} />
                <text x={n.x} y={n.y - 4} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--ink)">
                  {n.name.length > 22 ? n.name.slice(0, 21) + '…' : n.name}
                </text>
                <text x={n.x} y={n.y + 13} textAnchor="middle" fontSize={10.5} fill="var(--muted)">
                  {s ? `mastery ${Math.round(s.mastery)}%` : 'not started'}
                  {flagged ? ' · confused' : s?.flag === 'decaying' ? ' · fading' : ''}
                </text>
                <circle cx={n.x + 78} cy={n.y - 14} r={5} fill={color} />
              </g>
            );
          })}
        </svg>
        {!concepts.length && <div className="empty">Nothing to map yet. Add material first.</div>}
      </div>

      {concept && (
        <div className="card mt">
          <div className="row between mb">
            <h2>{concept.name}</h2>
            <div className="row">
              {cState && <StateChip state={cState.state} flag={cState.flag} />}
              <button className="btn subtle sm" onClick={() => setSelected(null)} aria-label="Close"><Icon name="x" size={15} /></button>
            </div>
          </div>
          <p className="small muted">{concept.intro}</p>
          {prereqs.length > 0 && (
            <div className="small mb"><strong>Needs:</strong> {prereqs.map((p) => p!.name).join(', ')}</div>
          )}
          {unlocks.length > 0 && (
            <div className="small mb"><strong>Unlocks:</strong> {unlocks.map((u) => u.name).join(', ')}</div>
          )}
          <a className="btn primary sm" href={`#/concept/${concept.id}`}>Open concept →</a>
        </div>
      )}
    </div>
  );
}
