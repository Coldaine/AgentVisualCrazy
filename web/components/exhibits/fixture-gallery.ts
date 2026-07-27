/**
 * Fixture gallery — a hand-authored exhibition of the REAL Codex homelab
 * coordinator session (see
 * `tests/fixtures/transcripts/codex/rollout-2026-07-23-homelab-coordinator.ground-truth.md`).
 *
 * This lets the stage render the full exhibit floor with zero inference
 * configured: it is the standing demo. Every narrative here is interpretive
 * ("what it means / why it's on the floor"), never an event recap — that is the
 * bar the curator prompt (PR-C) must clear when it authors these live.
 *
 * The session's true shape: a plan pivot (~08:39 → 09:04), PG18 recovery of
 * eight databases, an exposed FORGEJO_INTERNAL_TOKEN left deliberately
 * untouched, a GHCR-403 push stall, and an ending that is decidedly NOT "done."
 */
import type { ExhibitArtifact } from './types';

const activityNarrative: ExhibitArtifact = {
  id: 'homelab-narrative',
  exhibitType: 'activity_narrative',
  title: 'The database session, as a story',
  narrative:
    'This session is not "some database work." It is the moment a homelab pivots from ' +
    'open-ended platform ambition to a disciplined, database-only recovery — and then ' +
    'runs out of runway before the payoff. The threads that matter are the plan pivot, ' +
    'the PG18 recovery, the token it chose not to touch, and the registry wall it hit. ' +
    'It is on the floor because the ending is unfinished: the story is still live.',
  relevance: 0.95,
  decayClass: 'slow',
  createdAtEvent: 12,
  status: 'active',
  payload: {
    threads: [
      { id: 'plan', label: 'plan pivot', color: 'rgba(52,211,153,0.7)' },
      { id: 'pg18', label: 'PG18 recovery', color: 'rgba(56,189,248,0.7)' },
      { id: 'token', label: 'token exposure', color: 'rgba(251,146,60,0.75)' },
      { id: 'ghcr', label: 'GHCR stall', color: 'rgba(232,121,249,0.7)' },
    ],
    beats: [
      {
        at: '08:39',
        title: 'Scope narrows to databases',
        body: 'The directive drops platform breadth and asks for one thing: stand up the databases, carrying every prior lesson. Ambition becomes a bounded problem.',
        side: 'top',
        thread: 'plan',
      },
      {
        at: '09:04',
        title: 'The plan becomes the authority',
        body: '"Implement the plan." From here the plan written inside this session — not the repo doc — is the operative spec. The doc is only its projection.',
        side: 'bottom',
        thread: 'plan',
      },
      {
        at: '09:36',
        title: 'Eight databases, not the guesses',
        body: 'config_fleet and cloud_inventory fall away as wrong guesses. The real PG18 surface resolves to eight named databases — the recovery target is finally concrete.',
        side: 'top',
        thread: 'pg18',
      },
      {
        at: '10:12',
        title: 'The registry says no (403)',
        body: 'The image push stalls on a GHCR 403. Momentum parks against a credential wall, not a code defect — a distinction that decides what "next" even means.',
        side: 'bottom',
        thread: 'ghcr',
      },
      {
        at: '10:48',
        title: 'A token found, and left alone',
        body: 'An exposed FORGEJO_INTERNAL_TOKEN surfaces. The agent neither echoes nor unilaterally rotates it — restraint is the correct move; rotation is deferred to Doppler.',
        side: 'top',
        thread: 'token',
      },
      {
        at: '11:20',
        title: 'Recovery proven, not shipped',
        body: 'Physical PG18 recovery and FalkorDB compatibility are verified. The proof exists — but proof is not a cutover, and nothing is live yet.',
        side: 'bottom',
        thread: 'pg18',
      },
      {
        at: '11:48',
        title: 'Ends mid critical-path',
        body: 'Custom image done; manifests and recovery tooling still being repaired; data-platform undeployed; restores and cutovers not started. The session stops, unfinished.',
        side: 'top',
        thread: 'plan',
      },
    ],
  },
};

const relationshipDag: ExhibitArtifact = {
  id: 'session-entities',
  exhibitType: 'relationship_dag',
  title: 'What this session was really about',
  narrative:
    'Nine entities carry the whole session. The plan scopes everything; the custom PG18 ' +
    'image is the unblock; the eight databases are the payload; and the exposed token is ' +
    'the one urgent node that gates every downstream cutover. Read the urgent node first — ' +
    'it explains why "done" never arrived.',
  relevance: 0.78,
  decayClass: 'medium',
  createdAtEvent: 20,
  status: 'active',
  payload: {
    focusNodeId: 'token',
    nodes: [
      { id: 'plan', title: 'Database plan', subtitle: 'authored in-session · 08:39', kind: 'goal', x: 17, y: 22, note: 'The operative authority for the homelab data-platform work; the repo doc is just a projection of it.' },
      { id: 'image', title: 'Custom PG18 image', subtitle: 'build complete', kind: 'artifact', x: 20, y: 70, note: 'The one thing that finished. It is the unblock for physical PG18 recovery — the rest of the graph waits on it.' },
      { id: 'pg18', title: 'PG18 · 8 databases', subtitle: 'hangar, soil, moosegoose, …', kind: 'file', x: 45, y: 30, note: 'Exactly eight databases: hangar, llm_archiver, llm_measurements, market_live, moosegoose, techdeals_work, todo_cards, and historical soil.' },
      { id: 'falkor', title: 'FalkorDB gate', subtitle: 'compatibility proven', kind: 'tool', x: 43, y: 74, note: 'Reconciled first, with PG18; PG19 is only allowed through this compatibility gate.' },
      { id: 'token', title: 'FORGEJO_INTERNAL_TOKEN', subtitle: 'exposed · rotate via Doppler', kind: 'incident', x: 71, y: 18, urgent: true, note: 'Identified in-session and deliberately not repeated or rotated unilaterally. Until it rotates, consumer cutovers cannot safely proceed.' },
      { id: 'manifests', title: 'Platform manifests', subtitle: 'being repaired', kind: 'artifact', x: 68, y: 46, note: 'Deploy specs for data-platform. Unfinished at session end — a gate on deployment.' },
      { id: 'tooling', title: 'Recovery tooling', subtitle: 'being repaired', kind: 'tool', x: 70, y: 66, note: 'Scripts to restore physical PG18 backups. Proven in principle, not yet production-ready.' },
      { id: 'dataplatform', title: 'data-platform', subtitle: 'NOT deployed', kind: 'artifact', x: 88, y: 40, note: 'The deployment target. It never went out — an interpreter that reports this session as "done" has failed here.' },
      { id: 'cutovers', title: 'Restores & cutovers', subtitle: 'not started', kind: 'goal', x: 85, y: 78, note: 'The actual finish line: restore PG18/PG19/FalkorDB, then move consumers over. Not started.' },
    ],
    edges: [
      { from: 'plan', to: 'pg18', label: 'scopes recovery', strong: true },
      { from: 'plan', to: 'image', label: 'requires' },
      { from: 'image', to: 'pg18', label: 'enables restore' },
      { from: 'pg18', to: 'falkor', label: 'reconcile first' },
      { from: 'plan', to: 'manifests', label: 'defines' },
      { from: 'manifests', to: 'dataplatform', label: 'gates', strong: true },
      { from: 'tooling', to: 'cutovers', label: 'unblocks' },
      { from: 'dataplatform', to: 'cutovers', label: 'precedes' },
      { from: 'token', to: 'cutovers', label: 'blocks until rotated', strong: true },
    ],
  },
};

const walkthrough: ExhibitArtifact = {
  id: 'plan-walkthrough',
  exhibitType: 'walkthrough',
  title: 'The plan-authoring turn',
  narrative:
    'One turn deserves the deep dive: the one where the session stopped taking orders and ' +
    'wrote its own contract. It did not just list tasks — it fixed a definition of "complete" ' +
    'and an ordering constraint that every later decision obeyed. That is why this turn, not ' +
    'the code, is the spine of the whole session.',
  relevance: 0.7,
  decayClass: 'slow',
  createdAtEvent: 15,
  status: 'active',
  payload: {
    headline: 'The turn where the session wrote its own contract.',
    body:
      'Asked for "a plan to stand up the databases," the turn produced a database-only ' +
      'execution plan with two teeth: a hard completion definition and a strict ordering ' +
      'gate. Everything downstream — recovery order, the compat gate, the deferred token — ' +
      'is that contract being honored.',
    tags: [
      { label: 'match · database-only scope', kind: 'match' },
      { label: 'addition · explicit completion definition', kind: 'addition' },
      { label: 'addition · PG18→FalkorDB ordering gate', kind: 'addition' },
      { label: 'risk · token rotation deferred', kind: 'risk' },
    ],
    satellites: [
      { id: 'research', label: 'web research', note: 'prior lessons pulled forward', x: 22, y: 24 },
      { id: 'survey', label: 'repo survey', note: 'existing homelab state read', x: 78, y: 26 },
      { id: 'define', label: 'completion def', note: 'healthy · restored · roles · reads/writes · backup proved', x: 23, y: 73 },
      { id: 'order', label: 'ordering gate', note: 'PG18 + FalkorDB first; PG19 via compat only', x: 77, y: 73 },
    ],
    files: [
      { label: 'docs/plans/data-platform-databases.md', x: 51, y: 15 },
      { label: 'PG18 recovery scope (8 dbs)', x: 66, y: 88 },
    ],
  },
};

const concernSnapshot: ExhibitArtifact = {
  id: 'concern-map',
  exhibitType: 'concern_snapshot',
  title: 'Where the heat is',
  narrative:
    'Abstract the work into concerns, not directories, and the shape of the ending is ' +
    'obvious: the image build ran hottest and finished, tooling and manifests are still ' +
    'warm and half-repaired, and the thing that actually ships value — restores and ' +
    'cutovers — is stone cold and not started. Heat here is effort spent, not progress made.',
  relevance: 0.85,
  decayClass: 'medium',
  createdAtEvent: 28,
  status: 'active',
  payload: {
    concerns: [
      { id: 'image', title: 'PG18 image build', role: 'custom Postgres 18 image — the unblock', x: 8, y: 16, w: 25, h: 24, heat: 'very-high' },
      { id: 'tooling', title: 'Recovery tooling', role: 'scripts to restore physical PG18 backups', x: 37, y: 14, w: 25, h: 22, heat: 'high' },
      { id: 'manifests', title: 'Platform manifests', role: 'deploy specs for data-platform', x: 67, y: 16, w: 25, h: 22, heat: 'high' },
      { id: 'token', title: 'Token rotation', role: 'exposed FORGEJO token, deferred to Doppler', x: 10, y: 48, w: 25, h: 20, heat: 'high' },
      { id: 'falkor', title: 'FalkorDB compat', role: 'compatibility gate — proven', x: 39, y: 50, w: 23, h: 18, heat: 'medium' },
      { id: 'cutovers', title: 'Restores & cutovers', role: 'not started', x: 66, y: 48, w: 22, h: 18, heat: 'low' },
    ],
    flows: [
      ['image', 'tooling'],
      ['image', 'falkor'],
      ['tooling', 'cutovers'],
      ['manifests', 'cutovers'],
      ['token', 'cutovers'],
    ],
  },
};

const seismograph: ExhibitArtifact = {
  id: 'session-seismograph',
  exhibitType: 'seismograph',
  title: 'The session as a seismic trace',
  narrative:
    'Plotted as tremors, the session tells the truth its status update softens: two sharp ' +
    'downward spikes — the GHCR-403 stall and an aborted turn — bracket the exposed-token ' +
    'dip, and the only strong upward tremor is "recovery proven," which is a proof, not a ' +
    'shipment. A calm final reading is not the same as a finished one.',
  relevance: 0.8,
  decayClass: 'medium',
  createdAtEvent: 30,
  status: 'active',
  payload: {
    windowMinutes: 190,
    trace: [
      { at: '08:39', magnitude: 0.5, kind: 'turn', label: 'plan authored' },
      { at: '09:04', magnitude: 0.65, kind: 'turn', label: 'implement' },
      { at: '09:40', magnitude: 0.3, kind: 'tool' },
      { at: '10:12', magnitude: -0.9, kind: 'failure', label: 'GHCR 403 stall' },
      { at: '10:35', magnitude: 0.35, kind: 'tool' },
      { at: '10:48', magnitude: -0.7, kind: 'incident', label: 'token exposed' },
      { at: '11:05', magnitude: -0.82, kind: 'abort', label: 'turn aborted' },
      { at: '11:20', magnitude: 0.6, kind: 'merge', label: 'recovery proven' },
      { at: '11:48', magnitude: 0.12, kind: 'quiet', label: 'ends mid-path' },
    ],
    annotations: [
      { at: '10:12', text: 'credential wall, not a code bug' },
      { at: '11:05', text: 'turn abort — the one in the rollout' },
    ],
  },
};

const momentum: ExhibitArtifact = {
  id: 'session-momentum',
  exhibitType: 'momentum',
  title: 'Momentum: parked mid-path',
  narrative:
    'The honest read: real, proven progress on the hardest primitives, and zero delivered ' +
    'outcomes. The needle sits below halfway on purpose — the image is done and recovery is ' +
    'proven, but deployment, restores, and cutovers have not started. Anyone reporting ' +
    '"databases done" is reading effort as completion.',
  relevance: 0.9,
  decayClass: 'medium',
  createdAtEvent: 34,
  status: 'active',
  payload: {
    value: 44,
    label: 'Parked mid-path',
    stats: [
      { label: 'PG18 image', value: 'complete', tone: 'positive' },
      { label: 'Recovery', value: 'proven', tone: 'positive' },
      { label: 'Manifests', value: 'repairing', tone: 'caution' },
      { label: 'Cutovers', value: 'not started', tone: 'negative' },
    ],
    next: [
      { title: 'Rotate FORGEJO_INTERNAL_TOKEN via Doppler', evidence: 'exposed in-session; rotation deliberately deferred, not skipped', confidence: 88 },
      { title: 'Finish & merge manifests + recovery tooling', evidence: 'both "being repaired" at the final status', confidence: 72 },
      { title: 'Restore PG18 → PG19 → FalkorDB, then cut consumers over', evidence: 'stated critical path; none of it started', confidence: 64 },
    ],
    curation: [
      { artifactId: 'early-db-guess', action: 'retire', reason: 'config_fleet / cloud_inventory disproved in-session; superseded by the confirmed eight-database scope' },
      { artifactId: 'session-seismograph', action: 'refresh', reason: 'the GHCR stall resolves once the token rotates — refresh the trace when credentials land' },
    ],
  },
};

const liveGraph: ExhibitArtifact = {
  id: 'live-graph',
  exhibitType: 'live_graph',
  title: 'Live agent graph',
  narrative:
    'The force-directed topology of the observed agent and its tool activity. It is the one ' +
    'exhibit that moves with the session in real time — kept on the floor as the live pulse ' +
    'beneath the curated, interpreted exhibits around it.',
  relevance: 0.5,
  decayClass: 'fast',
  createdAtEvent: 1,
  status: 'active',
  payload: {},
};

const retiredEarlyGuess: ExhibitArtifact = {
  id: 'early-db-guess',
  exhibitType: 'relationship_dag',
  title: 'Early database guess',
  narrative:
    'An early reading that the recovery surface included config_fleet and cloud_inventory. ' +
    'It taught the session what to disprove, then stopped being true. Retired, not deleted — ' +
    'the archive remembers the wrong turns too.',
  relevance: 0.2,
  decayClass: 'fast',
  createdAtEvent: 9,
  status: 'retired',
  retirementReason: 'config_fleet / cloud_inventory disproved in-session; replaced by the confirmed eight-database PG18 scope.',
  payload: {
    focusNodeId: 'guess',
    nodes: [
      { id: 'guess', title: 'Guessed DB set', subtitle: 'incl. config_fleet, cloud_inventory', kind: 'file', x: 30, y: 40, note: 'Superseded by the confirmed eight-database scope.' },
      { id: 'config_fleet', title: 'config_fleet', subtitle: 'disproved', kind: 'file', x: 66, y: 26, note: 'Not part of the PG18 recovery surface.' },
      { id: 'cloud_inventory', title: 'cloud_inventory', subtitle: 'disproved', kind: 'file', x: 66, y: 60, note: 'Not part of the PG18 recovery surface.' },
    ],
    edges: [
      { from: 'guess', to: 'config_fleet', label: 'assumed' },
      { from: 'guess', to: 'cloud_inventory', label: 'assumed' },
    ],
  },
};

/**
 * The standing fixture gallery, in authored order. The stage sorts the active
 * set by relevance for rotation; retired artifacts fall to the archive shelf.
 */
export const fixtureGallery: ExhibitArtifact[] = [
  activityNarrative,
  relationshipDag,
  walkthrough,
  concernSnapshot,
  seismograph,
  momentum,
  liveGraph,
  retiredEarlyGuess,
];

export default fixtureGallery;
