import { useRef, useCallback } from 'react';
import type { TimelineItem } from '../../shared/schema';
import { animated, useSpring } from '@react-spring/web';

const AnimatedDiv = animated.div as React.ElementType;

interface TimelineScrubberProps {
  timeline: TimelineItem[];
}

function formatTick(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.valueOf())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function EventMarker({ event: timelineEvent }: { event: TimelineItem }) {
  const accentMap: Record<string, string> = {
    tool_started:      '#ffbb44',
    tool_completed:    '#66ffaa',
    tool_failed:       '#ff5566',
    subagent_dispatched: '#cc88ff',
    agent_spawned:    '#66ccff',
    agent_completed:  '#66ffaa',
    agent_idle:       '#888899',
    risk:             '#ff5566',
    default:          '#7be0ff',
  };
  const color = accentMap[timelineEvent.kind] ?? accentMap.default;
  return (
    <div
      className="ts-marker"
      title={`${timelineEvent.kind}: ${timelineEvent.label}`}
      style={{ background: color, boxShadow: `0 0 6px ${color}` }}
    />
  );
}

export default function TimelineScrubber({ timeline }: TimelineScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const [{ playhead }, playheadApi] = useSpring(() => ({
    playhead: 0,
    config: { tension: 200, friction: 40 },
  }));

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const track = trackRef.current;
      if (!track || timeline.length === 0) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      playheadApi.start({ playhead: ratio });
    },
    [timeline.length, playheadApi]
  );

  if (timeline.length === 0) {
    return (
      <div className="timeline-scrubber timeline-scrubber--empty">
        <span className="timeline-scrubber__empty-text">No events yet</span>
      </div>
    );
  }

  const firstTs = timeline[0]?.timestamp ?? '';
  const lastTs = timeline[timeline.length - 1]?.timestamp ?? '';

  return (
    <div className="timeline-scrubber">
      <div className="timeline-scrubber__header">
        <span className="timeline-scrubber__label">Timeline</span>
        <span className="timeline-scrubber__range">
          {formatTick(firstTs)} → {formatTick(lastTs)}
        </span>
      </div>

      {/* Event markers row */}
      <div className="timeline-scrubber__track" ref={trackRef} onClick={handleTrackClick}>
        {timeline.map((timelineEvent) => (
          <EventMarker key={timelineEvent.id} event={timelineEvent} />
        ))}
        {/* Playhead */}
        <AnimatedDiv
          className="timeline-scrubber__playhead"
          style={{
            left: playhead.to((value: number) => `${value * 100}%`)
          }}
        />
      </div>
    </div>
  );
}
