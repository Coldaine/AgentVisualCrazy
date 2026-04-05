import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Branches,
  ChevronRight,
  Clock3,
  FileCode2,
  Gauge,
  GitBranch,
  Layers3,
  Network,
  Sparkles,
} from "lucide-react";

type ViewId = "dag" | "timeline" | "walkthrough" | "architecture" | "momentum";

type ViewDef = {
  id: ViewId;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  subtitle: string;
};

const views: ViewDef[] = [
  {
    id: "dag",
    name: "Relationship DAG",
    icon: Network,
    eyebrow: "Agent-curated subgraph",
    subtitle: "PRs, issues, branches, and blockers shown as a focused narrative web.",
  },
  {
    id: "timeline",
    name: "Activity Narrative",
    icon: Clock3,
    eyebrow: "Alternating timeline",
    subtitle: "Only interesting moments appear. Cards fold from both sides and connect across themes.",
  },
  {
    id: "walkthrough",
    name: "PR Walkthrough",
    icon: GitBranch,
    eyebrow: "Spatial explanation",
    subtitle: "A PR as the central node, with commit satellites, file tiles, and an agent thought bubble.",
  },
  {
    id: "architecture",
    name: "Architecture Snapshot",
    icon: Layers3,
    eyebrow: "Simplified module map",
    subtitle: "Boxes represent concerns, not directories. Heat and flow indicate where work is moving.",
  },
  {
    id: "momentum",
    name: "What’s Next / Momentum",
    icon: Gauge,
    eyebrow: "Inference layer",
    subtitle: "A quick read on whether the repo is accelerating, coasting, or decaying — plus in-flight work.",
  },
];

const accentByKind: Record<string, string> = {
  pr: "from-cyan-400/70 to-sky-500/70",
  issue: "from-amber-400/70 to-orange-500/70",
  branch: "from-fuchsia-400/70 to-purple-500/70",
  release: "from-emerald-400/70 to-teal-500/70",
  commit: "from-violet-400/70 to-indigo-500/70",
  file: "from-rose-400/70 to-pink-500/70",
  module: "from-blue-400/70 to-cyan-500/70",
};

const chipStyles =
  "rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/70";

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function curvedPath(a: { x: number; y: number }, b: { x: number; y: number }, intensity = 9) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const curve = a.y < b.y ? -intensity : intensity;
  return `M ${a.x} ${a.y} Q ${mx} ${my + curve} ${b.x} ${b.y}`;
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = ((startDeg - 90) * Math.PI) / 180;
  const end = ((endDeg - 90) * Math.PI) / 180;
  const sx = cx + r * Math.cos(start);
  const sy = cy + r * Math.sin(start);
  const ex = cx + r * Math.cos(end);
  const ey = cy + r * Math.sin(end);
  const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-[720px] overflow-hidden rounded-[30px] border border-white/10 bg-[#050914] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_30px_80px_rgba(0,0,0,0.65)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_32%),radial-gradient(circle_at_75%_10%,rgba(192,132,252,0.14),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(52,211,153,0.10),transparent_24%)]" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.9)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:60px_60px]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent_12%,transparent_88%,rgba(255,255,255,0.02))]" />
      {children}
    </div>
  );
}

function ExhibitNode({
  x,
  y,
  title,
  subtitle,
  kind,
  urgent,
  selected,
  onHover,
}: {
  x: number;
  y: number;
  title: string;
  subtitle: string;
  kind: string;
  urgent?: boolean;
  selected?: boolean;
  onHover?: () => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      onMouseEnter={onHover}
      onFocus={onHover}
      className={classNames(
        "absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-black/50 px-4 py-3 text-left backdrop-blur-sm transition",
        selected ? "border-white/30 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_30px_rgba(56,189,248,0.14)]" : "border-white/10 hover:border-white/20",
      )}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <div className="flex items-start gap-3">
        <div className={classNames("mt-0.5 h-3.5 w-3.5 rounded-full bg-gradient-to-br", accentByKind[kind] || accentByKind.pr)} />
        <div>
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-white">{title}</div>
            {urgent ? (
              <motion.div
                animate={{ opacity: [0.45, 1, 0.45], scale: [1, 1.12, 1] }}
                transition={{ repeat: Infinity, duration: 1.8 }}
                className="rounded-full border border-red-400/25 bg-red-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-red-200"
              >
                urgent
              </motion.div>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-white/60">{subtitle}</div>
        </div>
      </div>
    </motion.button>
  );
}

function RelationshipDAG() {
  const nodes = [
    { id: "issue42", title: "Issue #42", subtitle: "retry edge case", kind: "issue", x: 16, y: 44, note: "Oldest unresolved issue still touching current auth work." },
    { id: "pr47", title: "PR #47", subtitle: "OAuth groundwork", kind: "pr", x: 33, y: 26, note: "Introduced the auth surface that later regressed." },
    { id: "branch-live", title: "feat/live-notify", subtitle: "12 commits, no PR", kind: "branch", x: 34, y: 72, note: "Likely next feature wave; active but still private." },
    { id: "pr54", title: "PR #54", subtitle: "auth refactor", kind: "pr", x: 56, y: 44, urgent: true, note: "Most important node in the graph: fixes the regression chain and blocks follow-on work." },
    { id: "pr55", title: "PR #55", subtitle: "test scaffolding", kind: "pr", x: 72, y: 24, note: "Companion work to harden the auth refactor before merge." },
    { id: "release", title: "v2.3.0", subtitle: "pending release", kind: "release", x: 84, y: 58, note: "Release is being held until the auth path stabilizes." },
    { id: "branch-hotfix", title: "hotfix/tls", subtitle: "stale branch", kind: "branch", x: 76, y: 78, note: "Branch exists, but the exhibit curates it as low priority compared to the auth path." },
  ];

  const edges = [
    { from: "issue42", to: "pr54", label: "blocks", strong: true },
    { from: "pr47", to: "pr54", label: "regression chain" },
    { from: "pr54", to: "pr55", label: "needs tests" },
    { from: "pr54", to: "release", label: "gates release", strong: true },
    { from: "branch-live", to: "pr54", label: "will depend on" },
    { from: "branch-hotfix", to: "release", label: "optional" },
  ];

  const [selected, setSelected] = useState(nodes[3].id);
  const selectedNode = nodes.find((n) => n.id === selected) ?? nodes[3];
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  return (
    <Frame>
      <div className="absolute left-7 top-7 z-10 flex items-center gap-3">
        <span className={chipStyles}>curated graph</span>
        <span className={chipStyles}>8-20 noteworthy nodes max</span>
      </div>

      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
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
          const d = curvedPath(a, b, idx % 2 === 0 ? 8 : 12);
          return (
            <g key={`${edge.from}-${edge.to}`}>
              <motion.path
                d={d}
                fill="none"
                stroke={edge.strong ? "url(#dagHot)" : "url(#dagLine)"}
                strokeWidth={edge.strong ? 0.6 : 0.36}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0.4 }}
                animate={{ pathLength: 1, opacity: edge.strong ? 1 : 0.8 }}
                transition={{ duration: 1.2, delay: idx * 0.08 }}
              />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 2.2} fontSize="1.6" fill="rgba(255,255,255,0.46)">
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

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute bottom-7 right-7 w-[340px] rounded-[24px] border border-white/10 bg-black/45 p-5 backdrop-blur-md"
      >
        <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/80">Agent Commentary</div>
        <div className="mt-3 text-xl font-semibold text-white">{selectedNode.title}</div>
        <p className="mt-2 text-sm leading-6 text-white/68">{selectedNode.note}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-white/60">
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Display</div>
            <div className="mt-1 text-white">priority 0.92</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Cycles</div>
            <div className="mt-1 text-white">3 shown</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">State</div>
            <div className="mt-1 text-white">active</div>
          </div>
        </div>
      </motion.div>
    </Frame>
  );
}

function ActivityNarrative() {
  const events = [
    {
      day: "Mar 06",
      title: "Regression recognized",
      body: "Auth retries broke token refresh under intermittent mobile connectivity.",
      side: "top" as const,
      thread: "auth",
    },
    {
      day: "Mar 08",
      title: "Issue #42 revived",
      body: "Old ticket reopened after the failure reproduced in staging and on iOS.",
      side: "bottom" as const,
      thread: "auth",
    },
    {
      day: "Mar 11",
      title: "PR #47 merged",
      body: "Groundwork landed for OAuth cleanup, but also introduced the regression path.",
      side: "top" as const,
      thread: "auth",
    },
    {
      day: "Mar 18",
      title: "Telemetry spike",
      body: "Error traces cluster around two API paths, suggesting retry logic is too aggressive.",
      side: "bottom" as const,
      thread: "ops",
    },
    {
      day: "Mar 22",
      title: "PR #54 opens",
      body: "Refactor proposes exponential backoff and circuit-breaker logic beyond the initial plan.",
      side: "top" as const,
      thread: "auth",
    },
    {
      day: "Mar 27",
      title: "Feature branch accelerates",
      body: "Live notification branch continues in parallel, but stays blocked on auth stability.",
      side: "bottom" as const,
      thread: "notify",
    },
  ];

  const [active, setActive] = useState(4);

  useEffect(() => {
    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % events.length);
    }, 2600);
    return () => window.clearInterval(id);
  }, [events.length]);

  return (
    <Frame>
      <div className="absolute left-7 top-7 z-10 flex items-center gap-3">
        <span className={chipStyles}>interesting moments only</span>
        <span className={chipStyles}>alternating tile foldout</span>
      </div>

      <div className="absolute inset-x-12 top-[49%] h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        {events.slice(0, active + 1).map((event, idx) => {
          if (idx === 0) return null;
          const ax = 10 + (idx - 1) * 14.5;
          const bx = 10 + idx * 14.5;
          const sameThread = events[idx - 1].thread === event.thread;
          const y = sameThread ? 47 : 53;
          return (
            <motion.path
              key={`${events[idx - 1].day}-${event.day}`}
              d={`M ${ax} 50 Q ${(ax + bx) / 2} ${y} ${bx} 50`}
              fill="none"
              stroke={sameThread ? "rgba(56,189,248,0.65)" : "rgba(255,255,255,0.18)"}
              strokeWidth="0.5"
              initial={{ pathLength: 0, opacity: 0.2 }}
              animate={{ pathLength: idx <= active ? 1 : 0, opacity: idx <= active ? 1 : 0.15 }}
              transition={{ duration: 0.6 }}
            />
          );
        })}
      </svg>

      {events.map((event, idx) => {
        const x = 10 + idx * 14.5;
        const activeNow = idx <= active;
        const selected = idx === active;
        return (
          <React.Fragment key={event.day}>
            <motion.div
              className={classNames(
                "absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border",
                selected ? "border-cyan-200 bg-cyan-300 shadow-[0_0_30px_rgba(103,232,249,0.7)]" : activeNow ? "border-white/30 bg-white/80" : "border-white/15 bg-white/10",
              )}
              style={{ left: `${x}%`, top: "50%" }}
              animate={selected ? { scale: [1, 1.25, 1] } : { scale: 1 }}
              transition={selected ? { repeat: Infinity, duration: 1.8 } : { duration: 0.2 }}
            />
            <motion.div
              initial={{ opacity: 0, y: event.side === "top" ? 12 : -12 }}
              animate={{
                opacity: activeNow ? 1 : 0.18,
                y: 0,
                scale: selected ? 1.02 : 1,
              }}
              transition={{ duration: 0.45 }}
              className={classNames(
                "absolute w-[240px] -translate-x-1/2 rounded-[22px] border border-white/10 bg-black/45 p-4 backdrop-blur-md",
                selected ? "shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_26px_rgba(34,211,238,0.18)]" : "",
              )}
              style={{ left: `${x}%`, top: event.side === "top" ? "15%" : "58%" }}
            >
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">{event.day}</div>
              <div className="mt-2 text-base font-semibold text-white">{event.title}</div>
              <p className="mt-2 text-sm leading-6 text-white/65">{event.body}</p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-white/50">
                thread · {event.thread}
              </div>
            </motion.div>
          </React.Fragment>
        );
      })}

      <div className="absolute inset-x-10 bottom-6">
        <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-white/42">
          <span>scrub interesting days</span>
          <span>{events[active].day}</span>
        </div>
        <input
          type="range"
          min={0}
          max={events.length - 1}
          value={active}
          onChange={(e) => setActive(Number(e.target.value))}
          className="w-full accent-cyan-300"
        />
      </div>
    </Frame>
  );
}

function PRWalkthrough() {
  const commits = [
    { id: "c1", label: "a91b3c", x: 22, y: 26, note: "Backoff introduced" },
    { id: "c2", label: "b4d2fe", x: 78, y: 30, note: "Circuit breaker added" },
    { id: "c3", label: "c0a7f9", x: 25, y: 72, note: "Tests added" },
    { id: "c4", label: "d18e2b", x: 76, y: 70, note: "Edge-case cleanup" },
  ];

  const files = [
    { label: "lib/api.ts", x: 59, y: 22 },
    { label: "auth/retry.ts", x: 68, y: 14 },
    { label: "hooks/useAuth.ts", x: 33, y: 80 },
    { label: "__tests__/auth.spec.ts", x: 47, y: 88 },
  ];

  return (
    <Frame>
      <div className="absolute left-7 top-7 z-10 flex items-center gap-3">
        <span className={chipStyles}>central narrative node</span>
        <span className={chipStyles}>commit satellites + file tiles</span>
      </div>

      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        {commits.map((commit, idx) => (
          <motion.path
            key={commit.id}
            d={curvedPath({ x: 50, y: 48 }, { x: commit.x, y: commit.y }, idx % 2 === 0 ? 7 : 10)}
            fill="none"
            stroke="rgba(167,139,250,0.5)"
            strokeWidth="0.45"
            initial={{ pathLength: 0, opacity: 0.3 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.85, delay: idx * 0.08 }}
          />
        ))}
        {files.map((file, idx) => (
          <motion.path
            key={file.label}
            d={curvedPath({ x: 50, y: 48 }, { x: file.x, y: file.y }, 5)}
            fill="none"
            stroke="rgba(244,114,182,0.28)"
            strokeDasharray="1.4 1.2"
            strokeWidth="0.35"
            initial={{ pathLength: 0, opacity: 0.2 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.35 + idx * 0.07 }}
          />
        ))}
      </svg>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="absolute left-1/2 top-[48%] z-10 w-[330px] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-cyan-300/20 bg-black/55 p-5 shadow-[0_0_40px_rgba(34,211,238,0.12)] backdrop-blur-md"
      >
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-cyan-200/80">
          <GitBranch className="h-3.5 w-3.5" />
          pr #54 · auth refactor
        </div>
        <div className="mt-4 text-2xl font-semibold text-white">Plan vs implementation diverged in a useful way.</div>
        <p className="mt-3 text-sm leading-6 text-white/68">
          The issue asked for retry logic on API failures. The PR delivered that, but also added a circuit breaker and reshaped the auth surface into a more durable abstraction.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">match · retry logic</span>
          <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-3 py-1 text-xs text-fuchsia-200">addition · circuit breaker</span>
          <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs text-amber-200">touches auth surface</span>
        </div>
      </motion.div>

      {commits.map((commit) => (
        <motion.div
          key={commit.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm"
          style={{ left: `${commit.x}%`, top: `${commit.y}%` }}
        >
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">commit</div>
          <div className="mt-1 text-sm font-semibold text-white">{commit.label}</div>
          <div className="mt-1 text-xs text-white/58">{commit.note}</div>
        </motion.div>
      ))}

      {files.map((file) => (
        <motion.div
          key={file.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-pink-300/15 bg-pink-400/8 px-3 py-2 text-xs text-pink-100/85 backdrop-blur-sm"
          style={{ left: `${file.x}%`, top: `${file.y}%` }}
        >
          {file.label}
        </motion.div>
      ))}

      <motion.div
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        className="absolute right-7 top-12 w-[280px] rounded-[22px] border border-white/10 bg-black/45 p-4 backdrop-blur-md"
      >
        <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">agent thought bubble</div>
        <div className="mt-3 text-sm leading-6 text-white/72">
          This is the sort of PR that deserves a walkthrough: it is not just “what changed,” but “what pattern replaced what pattern.” The spatial arrangement should tell that story at a glance.
        </div>
      </motion.div>
    </Frame>
  );
}

function ArchitectureSnapshot() {
  const modules = [
    { id: "ui", title: "UI Shell", role: "navigation + page state", x: 18, y: 22, w: 23, h: 18, heat: "high" },
    { id: "auth", title: "Auth Core", role: "retry, token refresh, session edge cases", x: 45, y: 18, w: 28, h: 22, heat: "very-high" },
    { id: "api", title: "API Layer", role: "query wrappers + transport rules", x: 74, y: 24, w: 20, h: 18, heat: "high" },
    { id: "notify", title: "Notifications", role: "branch in progress", x: 21, y: 58, w: 22, h: 18, heat: "medium" },
    { id: "data", title: "Data Model", role: "shared shapes and cache contracts", x: 50, y: 58, w: 25, h: 18, heat: "medium" },
    { id: "ops", title: "Telemetry / CI", role: "staging signal + test quality", x: 79, y: 62, w: 18, h: 16, heat: "low" },
  ];

  const flows = [
    ["ui", "auth"],
    ["auth", "api"],
    ["notify", "auth"],
    ["auth", "data"],
    ["data", "ops"],
  ] as const;

  const heatClass: Record<string, string> = {
    low: "from-slate-400/15 to-slate-500/10 border-white/10",
    medium: "from-cyan-400/20 to-sky-500/12 border-cyan-300/15",
    high: "from-fuchsia-400/20 to-violet-500/14 border-fuchsia-300/15",
    "very-high": "from-rose-400/24 to-orange-500/18 border-orange-300/20",
  };

  const byId = Object.fromEntries(modules.map((m) => [m.id, m]));
  const [selected, setSelected] = useState("auth");
  const current = byId[selected];

  return (
    <Frame>
      <div className="absolute left-7 top-7 z-10 flex items-center gap-3">
        <span className={chipStyles}>5-8 concern boxes</span>
        <span className={chipStyles}>labels say what it does</span>
      </div>

      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        {flows.map(([aId, bId], idx) => {
          const a = byId[aId];
          const b = byId[bId];
          const from = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
          const to = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
          return (
            <motion.path
              key={`${aId}-${bId}`}
              d={curvedPath(from, to, idx % 2 === 0 ? 6 : 9)}
              fill="none"
              stroke="rgba(103,232,249,0.35)"
              strokeWidth="0.45"
              initial={{ pathLength: 0, opacity: 0.25 }}
              animate={{ pathLength: 1, opacity: 0.9 }}
              transition={{ duration: 1, delay: idx * 0.1 }}
            />
          );
        })}
      </svg>

      {modules.map((module) => (
        <motion.button
          key={module.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onMouseEnter={() => setSelected(module.id)}
          onFocus={() => setSelected(module.id)}
          className={classNames(
            "absolute rounded-[24px] border bg-gradient-to-br p-4 text-left backdrop-blur-md transition",
            heatClass[module.heat],
            selected === module.id ? "shadow-[0_0_30px_rgba(34,211,238,0.14)]" : "",
          )}
          style={{ left: `${module.x}%`, top: `${module.y}%`, width: `${module.w}%`, height: `${module.h}%` }}
        >
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">module</div>
          <div className="mt-2 text-lg font-semibold text-white">{module.title}</div>
          <div className="mt-2 text-sm leading-6 text-white/65">{module.role}</div>
        </motion.button>
      ))}

      <div className="absolute bottom-7 right-7 w-[320px] rounded-[22px] border border-white/10 bg-black/45 p-5 backdrop-blur-md">
        <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/80">selected concern</div>
        <div className="mt-3 text-xl font-semibold text-white">{current.title}</div>
        <p className="mt-2 text-sm leading-6 text-white/68">{current.role}</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-fuchsia-300 to-orange-300"
            style={{ width: current.heat === "very-high" ? "92%" : current.heat === "high" ? "74%" : current.heat === "medium" ? "48%" : "24%" }}
          />
        </div>
        <div className="mt-2 text-xs uppercase tracking-[0.18em] text-white/42">recent activity heat</div>
      </div>
    </Frame>
  );
}

function MomentumView() {
  const value = 74;
  const angle = -120 + (value / 100) * 240;
  const x = 120 + 82 * Math.cos(((angle - 90) * Math.PI) / 180);
  const y = 120 + 82 * Math.sin(((angle - 90) * Math.PI) / 180);

  const nextItems = [
    { title: "feat/live-notify", evidence: "12 commits in 5 days, no PR yet", confidence: 82 },
    { title: "Draft PR for auth tests", evidence: "CI scaffolding branch referenced in review comments", confidence: 67 },
    { title: "README drift cleanup", evidence: "2 endpoints documented but not present in current handlers", confidence: 54 },
  ];

  return (
    <Frame>
      <div className="absolute left-7 top-7 z-10 flex items-center gap-3">
        <span className={chipStyles}>single-glance state</span>
        <span className={chipStyles}>what’s next inferred</span>
      </div>

      <div className="absolute left-8 top-20 grid w-[44%] gap-6">
        <div className="rounded-[28px] border border-white/10 bg-black/45 p-6 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">momentum indicator</div>
              <div className="mt-2 text-3xl font-semibold text-white">Accelerating</div>
            </div>
            <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200">shipping daily</div>
          </div>
          <div className="mt-6 flex items-center gap-8">
            <svg width="240" height="150" viewBox="0 0 240 150" className="shrink-0">
              <path d={arcPath(120, 120, 82, -120, 120)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="16" strokeLinecap="round" />
              <path d={arcPath(120, 120, 82, -120, 35)} fill="none" stroke="rgba(34,211,238,0.55)" strokeWidth="16" strokeLinecap="round" />
              <path d={arcPath(120, 120, 82, 35, 120)} fill="none" stroke="rgba(251,146,60,0.3)" strokeWidth="16" strokeLinecap="round" />
              <motion.circle cx={x} cy={y} r="8" fill="white" animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 1.8 }} />
              <line x1="120" y1="120" x2={x} y2={y} stroke="rgba(255,255,255,0.82)" strokeWidth="4" strokeLinecap="round" />
            </svg>
            <div className="space-y-4">
              <p className="text-sm leading-7 text-white/68">
                Three PRs merged this week, review velocity is healthy, and open work is still pulling new branches behind it rather than stalling.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Merged</div>
                  <div className="mt-1 text-xl font-semibold text-white">3</div>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Stale PRs</div>
                  <div className="mt-1 text-xl font-semibold text-white">1</div>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Drift Risk</div>
                  <div className="mt-1 text-xl font-semibold text-white">medium</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-black/45 p-6 backdrop-blur-md">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/80">what’s next</div>
          <div className="mt-4 space-y-4">
            {nextItems.map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-white">{item.title}</div>
                    <div className="mt-1 text-sm text-white/62">{item.evidence}</div>
                  </div>
                  <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">{item.confidence}%</div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-fuchsia-300" style={{ width: `${item.confidence}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute right-8 top-20 w-[42%] rounded-[28px] border border-white/10 bg-black/45 p-6 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">curation hooks</div>
            <div className="mt-2 text-2xl font-semibold text-white">Why this artifact is still on the floor</div>
          </div>
          <Sparkles className="h-5 w-5 text-cyan-200/80" />
        </div>
        <div className="mt-5 space-y-4 text-sm leading-7 text-white/68">
          <p>
            It is still useful because the auth chain remains unresolved, the live notification branch depends on it, and the release is still gated by the same underlying decision.
          </p>
          <p>
            A weekly curator could now choose between refreshing the auth exhibit, generating a separate release narrative, or retiring the stale branch tile if it stops teaching anything new.
          </p>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-100/70">refresh candidate</div>
            <div className="mt-2 text-lg font-semibold text-white">Release Narrative</div>
            <div className="mt-1 text-sm text-white/62">Between last two tags, summarized as human change.</div>
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-amber-100/70">retire candidate</div>
            <div className="mt-2 text-lg font-semibold text-white">hotfix/tls</div>
            <div className="mt-1 text-sm text-white/62">Low interaction, stale for 6 cycles, no longer central to the story.</div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function ViewStage({ view }: { view: ViewId }) {
  if (view === "dag") return <RelationshipDAG />;
  if (view === "timeline") return <ActivityNarrative />;
  if (view === "walkthrough") return <PRWalkthrough />;
  if (view === "architecture") return <ArchitectureSnapshot />;
  return <MomentumView />;
}

export default function RepoExhibitVisualizationPrototype() {
  const [active, setActive] = useState<ViewId>("dag");
  const [paused, setPaused] = useState(false);

  const activeIndex = useMemo(() => views.findIndex((v) => v.id === active), [active]);
  const current = views[activeIndex];

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setActive((prev) => {
        const idx = views.findIndex((v) => v.id === prev);
        return views[(idx + 1) % views.length].id;
      });
    }, 7000);
    return () => window.clearInterval(id);
  }, [paused]);

  return (
    <div className="min-h-screen bg-[#02060d] text-white">
      <div className="mx-auto max-w-[1600px] px-6 py-6 lg:px-8">
        <div className="mb-6 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/10 p-3">
                <Sparkles className="h-5 w-5 text-cyan-200" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">first visual pass</div>
                <div className="mt-1 text-xl font-semibold">Repo Exhibit Language</div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-white/68">
              This is not a dashboard grid. It is a set of exhibit-style visualizations with a shared dark spatial language, a little idle cycling, and room for agent commentary.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className={chipStyles}>spatial</span>
              <span className={chipStyles}>interpretive</span>
              <span className={chipStyles}>agent-authored</span>
              <span className={chipStyles}>curated over time</span>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/80">{current.eyebrow}</div>
                <div className="mt-2 text-2xl font-semibold">{current.name}</div>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-white/66">{current.subtitle}</p>
              </div>
              <div className="flex items-center gap-3 text-sm text-white/55">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
                  <Activity className="h-4 w-4" />
                  idle cycle {paused ? "paused" : "active"}
                </div>
                <button
                  onClick={() => setPaused((p) => !p)}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-white/80 transition hover:bg-white/10"
                >
                  {paused ? "Resume cycling" : "Pause cycling"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-3 backdrop-blur-sm">
            <div className="mb-2 px-3 pt-3 text-[11px] uppercase tracking-[0.2em] text-white/40">Exhibit set</div>
            <div className="space-y-2">
              {views.map((view, idx) => {
                const Icon = view.icon;
                const isActive = view.id === active;
                return (
                  <button
                    key={view.id}
                    onMouseEnter={() => setPaused(true)}
                    onMouseLeave={() => setPaused(false)}
                    onClick={() => setActive(view.id)}
                    className={classNames(
                      "w-full rounded-[24px] border px-4 py-4 text-left transition",
                      isActive
                        ? "border-cyan-300/20 bg-cyan-300/10 shadow-[0_0_30px_rgba(34,211,238,0.1)]"
                        : "border-white/8 bg-white/[0.02] hover:bg-white/[0.04]",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={classNames("rounded-2xl border p-2.5", isActive ? "border-cyan-300/15 bg-cyan-300/10" : "border-white/10 bg-white/5")}>
                        <Icon className={classNames("h-4 w-4", isActive ? "text-cyan-100" : "text-white/70")} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-white">{view.name}</div>
                          <div className="text-xs text-white/35">0{idx + 1}</div>
                        </div>
                        <div className="mt-1 text-sm leading-6 text-white/56">{view.subtitle}</div>
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-white/30" />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-[24px] border border-white/8 bg-black/25 p-4 text-sm leading-7 text-white/62">
              <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-white/40">
                <Branches className="h-3.5 w-3.5" />
                next directions
              </div>
              The next obvious additions would be a code churn heatmap, a release narrative, and issue archaeology — all in the same visual language rather than as conventional dashboard widgets.
            </div>
          </div>

          <div
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            className="relative"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 12, scale: 0.992 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.992 }}
                transition={{ duration: 0.32, ease: "easeOut" }}
              >
                <ViewStage view={active} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 rounded-[28px] border border-white/10 bg-white/[0.03] px-5 py-4 text-sm text-white/58 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <FileCode2 className="h-4 w-4" />
            This is intentionally a visual prototype rather than a literal product implementation.
          </div>
          <div className="flex items-center gap-3">
            <ArrowRight className="h-4 w-4" />
            Start here, then choose which visual language to harden into a reusable artifact system.
          </div>
        </div>
      </div>
    </div>
  );
}
