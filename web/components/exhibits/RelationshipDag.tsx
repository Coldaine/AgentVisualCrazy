/**
 * Exhibit 01 — Relationship DAG. Ported from prototype view 01: a curated
 * subgraph of the session's noteworthy entities (8-20 nodes max). Edges draw on
 * left-to-right, staggered by index; hovering a node focuses it and surfaces
 * its curator note in the in-frame focus card.
 */
import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Chip, ExhibitNode, Frame, curvedPath } from './primitives';
import type { ExhibitArtifactOf, RelationshipDagPayload } from './types';

export interface RelationshipDagProps {
  payload: RelationshipDagPayload;
  artifact: ExhibitArtifactOf<'relationship_dag'>;
}

export default function RelationshipDag({ payload, artifact }: RelationshipDagProps) {
  const reduce = useReducedMotion();
  const { nodes, edges, focusNodeId } = payload;
  const [selected, setSelected] = useState(focusNodeId);
  const byId = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  const selectedNode = byId[selected] ?? nodes.find((n) => n.id === focusNodeId) ?? nodes[0];

  return (
    <Frame>
      <div className="exhibit-frame__chips">
        <Chip>curated graph</Chip>
        <Chip>8-20 noteworthy nodes max</Chip>
      </div>

      <svg viewBox="0 0 100 100" className="exhibit-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="dagLine" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="rgba(56,189,248,0.45)" />
            <stop offset="100%" stopColor="rgba(192,132,252,0.45)" />
          </linearGradient>
          <linearGradient id="dagHot" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="rgba(251,146,60,0.65)" />
            <stop offset="100%" stopColor="rgba(248,113,113,0.75)" />
          </linearGradient>
        </defs>
        {edges.map((edge, idx) => {
          const a = byId[edge.from];
          const b = byId[edge.to];
          if (!a || !b) return null;
          return (
            <g key={`${edge.from}-${edge.to}`}>
              <motion.path
                d={curvedPath(a, b, idx % 2 === 0 ? 8 : 12)}
                fill="none"
                stroke={edge.strong ? 'url(#dagHot)' : 'url(#dagLine)'}
                strokeWidth={edge.strong ? 0.6 : 0.36}
                strokeLinecap="round"
                initial={reduce ? false : { pathLength: 0, opacity: 0.4 }}
                animate={{ pathLength: 1, opacity: edge.strong ? 1 : 0.8 }}
                transition={{ duration: reduce ? 0 : 1.2, delay: reduce ? 0 : idx * 0.08 }}
              />
              <text
                x={(a.x + b.x) / 2}
                y={(a.y + b.y) / 2 - 2.2}
                fontSize="1.6"
                fill="rgba(255,255,255,0.46)"
              >
                {edge.label}
              </text>
            </g>
          );
        })}
      </svg>

      {nodes.map((node) => (
        <ExhibitNode
          key={node.id}
          x={node.x}
          y={node.y}
          title={node.title}
          subtitle={node.subtitle}
          kind={node.kind}
          urgent={node.urgent}
          selected={selected === node.id}
          onHover={() => setSelected(node.id)}
        />
      ))}

      {selectedNode ? (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="exhibit-focus-card"
        >
          <div className="exhibit-focus-card__eyebrow">focused node</div>
          <div className="exhibit-focus-card__title">{selectedNode.title}</div>
          <p className="exhibit-focus-card__note">{selectedNode.note}</p>
          <div className="exhibit-focus-card__stats">
            <div className="exhibit-stat-tile">
              <div className="exhibit-stat-tile__label">Kind</div>
              <div className="exhibit-stat-tile__value">{selectedNode.kind}</div>
            </div>
            <div className="exhibit-stat-tile">
              <div className="exhibit-stat-tile__label">Relevance</div>
              <div className="exhibit-stat-tile__value">{artifact.relevance.toFixed(2)}</div>
            </div>
            <div className="exhibit-stat-tile">
              <div className="exhibit-stat-tile__label">State</div>
              <div className="exhibit-stat-tile__value">{artifact.status}</div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </Frame>
  );
}
