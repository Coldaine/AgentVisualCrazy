import { animated, useSpring } from '@react-spring/web';
import type { ShadowInsight } from '../../shared/schema';

interface ShadowPanelProps {
  phase: string;
  objective: string;
  riskSignals: string[];
  nextMoves: string[];
  insights: ShadowInsight[];
}

function ConfidenceRing({ confidence }: { confidence: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = circ * confidence;
  const color = confidence > 0.75 ? '#66ffaa' : confidence > 0.4 ? '#ffbb44' : '#ff5566';
  return (
    <svg width="72" height="72" className="confidence-ring" aria-label={`${Math.round(confidence * 100)}% confidence`}>
      <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
      <circle
        cx="36" cy="36" r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 36 36)"
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      />
      <text x="36" y="40" textAnchor="middle" fontSize="12" fontWeight="700" fill={color}>
        {Math.round(confidence * 100)}%
      </text>
    </svg>
  );
}

const AnimatedAside = animated.aside as React.ElementType;

export default function ShadowPanel({ phase, objective, riskSignals, nextMoves, insights }: ShadowPanelProps) {
  // Slide in from right
  const slideStyle = useSpring({
    from: { opacity: 0, transform: 'translateX(32px)' },
    to: { opacity: 1, transform: 'translateX(0)' },
    config: { tension: 220, friction: 28 },
  });

  const overallConfidence = insights.length > 0
    ? insights.reduce((s, i) => s + i.confidence, 0) / insights.length
    : 0;

  return (
    <AnimatedAside className="shadow-panel glass-card" style={slideStyle}>
      <div className="shadow-panel__header">
        <span className="eyebrow">Shadow Interpretation</span>
        <div className="shadow-panel__confidence">
          <ConfidenceRing confidence={overallConfidence} />
        </div>
      </div>

      <div className="shadow-panel__body">
        <section className="shadow-section">
          <p className="shadow-section__eyebrow">Phase</p>
          <span className="pill pill--accent">{phase}</span>
        </section>

        <section className="shadow-section">
          <p className="shadow-section__eyebrow">Objective</p>
          <p className="shadow-section__text">{objective}</p>
        </section>

        <section className="shadow-section">
          <p className="shadow-section__eyebrow">
            Risk Signals
            {riskSignals.length > 0 && (
              <span className="shadow-panel__badge shadow-panel__badge--danger">{riskSignals.length}</span>
            )}
          </p>
          {riskSignals.length > 0 ? (
            <ul className="shadow-list shadow-list--risk">
              {riskSignals.map((r, i) => (
                <li key={i} className="shadow-list__item shadow-list__item--risk">
                  <span className="shadow-list__dot shadow-list__dot--risk" />
                  {r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="shadow-section__empty">No risk signals detected.</p>
          )}
        </section>

        <section className="shadow-section">
          <p className="shadow-section__eyebrow">
            Next Moves
            {nextMoves.length > 0 && (
              <span className="shadow-panel__badge shadow-panel__badge--accent">{nextMoves.length}</span>
            )}
          </p>
          {nextMoves.length > 0 ? (
            <ul className="shadow-list">
              {nextMoves.map((m, i) => (
                <li key={i} className="shadow-list__item shadow-list__item--accent">
                  <span className="shadow-list__dot shadow-list__dot--accent" />
                  {m}
                </li>
              ))}
            </ul>
          ) : (
            <p className="shadow-section__empty">No predictions yet.</p>
          )}
        </section>

        {insights.length > 0 && (
          <section className="shadow-section shadow-section--insights">
            <p className="shadow-section__eyebrow">Inference Signals</p>
            <div className="shadow-insights">
              {insights.map((insight, i) => (
                <div key={i} className="shadow-insight-card">
                  <div className="shadow-insight-card__header">
                    <span className="shadow-insight-card__kind">{insight.kind}</span>
                    <ConfidenceRing confidence={insight.confidence} />
                  </div>
                  <p className="shadow-insight-card__summary">{insight.summary}</p>
                  <span className="shadow-insight-card__scope">{insight.scope} scope</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </AnimatedAside>
  );
}
