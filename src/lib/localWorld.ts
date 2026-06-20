import { Descriptions, characters as characterData } from '../../convex/characterdata/data';
import { bgtiles, objmap, tiledim, tilefiledim, tilesetpath } from '../../convex/maps/firstmap';

export type LocalId = string;

export type Position = {
  x: number;
  y: number;
};

export type Pose = {
  position: Position;
  orientation: number;
};

export type StoppedMotion = {
  type: 'stopped';
  reason: 'interrupted' | 'idle';
  pose: Pose;
};

export type WalkingMotion = {
  type: 'walking';
  route: Position[];
  endOrientation?: number;
  ignore: LocalId[];
  startTs: number;
  targetEndTs: number;
};

export type Motion = StoppedMotion | WalkingMotion;

export type LocalMessage = {
  from: LocalId;
  fromName: string;
  to: LocalId[];
  toNames: string[];
  ts: number;
} & (
  | { type: 'started' }
  | { type: 'responded'; content: string }
  | { type: 'left' }
);

export type LocalMap = {
  _id: LocalId;
  tileSetUrl: string;
  tileSetDim: number;
  tileDim: number;
  bgTiles: number[][][];
  objectTiles: number[][];
};

export type LocalWorld = {
  _id: LocalId;
  width: number;
  height: number;
  mapId: LocalId;
  frozen: boolean;
};

export type LocalCharacter = {
  _id: LocalId;
  name: string;
  textureUrl: string;
  spritesheetData: any;
  speed: number;
};

export type LocalPlayerDoc = {
  _id: LocalId;
  name: string;
  worldId: LocalId;
  agentId?: LocalId;
  characterId: LocalId;
};

export type LocalPlayerState = {
  id: LocalId;
  name: string;
  agentId?: LocalId;
  characterId: LocalId;
  identity: string;
  motion: Motion;
  thinking: boolean;
  lastPlan?: { plan: string; ts: number };
  lastChat?: { message: LocalMessage; conversationId: LocalId };
  sleeping?: boolean;
  isSubagent?: boolean;
  // All sessions of this project (the lead carries the whole team's list).
  projectSessions?: Array<{
    id: string;
    name: string;
    status: string;
    source: string;
    role: 'lead' | 'subagent';
    conversationId: LocalId;
  }>;
};

export type LocalTeam = {
  id: LocalId;
  name: string;
  center: Position;
  source: string;
};

export type LocalWorldState = {
  world: LocalWorld;
  map: LocalMap;
  players: LocalPlayerDoc[];
  playerStates: Record<LocalId, LocalPlayerState>;
  characters: Record<LocalId, LocalCharacter>;
  messages: Record<LocalId, LocalMessage[]>;
  teams: LocalTeam[];
};

const worldId = 'local:world:office';
const mapId = 'local:map:first-office';
const localStartTs = Date.now();

// Team areas: each project clusters around a room center (a walkable floor tile).
const teamAreas: Position[] = [
  { x: 3, y: 5 },
  { x: 9, y: 5 },
  { x: 18, y: 5 },
  { x: 9, y: 10 },
  { x: 18, y: 9 },
  { x: 3, y: 12 },
  { x: 10, y: 14 },
  { x: 18, y: 14 },
];

const conversationId = 'local:conversation:office-floor';

const playerIdsByName = Object.fromEntries(
  Descriptions.map((description) => [description.name, `local:player:${description.name}`]),
);

const characterIdsByName = Object.fromEntries(
  characterData.map((character) => [character.name, `local:character:${character.name}`]),
);

function identityFor(name: string) {
  const description = Descriptions.find((entry) => entry.name === name);
  return (
    description?.memories.find((memory) => memory.type === 'identity')?.description ??
    `${name} works in the AI Office.`
  );
}

function clampGrid(value: number) {
  return Math.max(4, Math.min(21, value));
}

// Walkable floor tiles: objmap === -1 means no furniture/wall on that tile.
const walkableTiles: Set<string> = (() => {
  const set = new Set<string>();
  objmap.forEach((row, y) =>
    row.forEach((value, x) => {
      if (value === -1) set.add(`${x},${y}`);
    }),
  );
  return set;
})();

// Find the nearest free floor tile around a center (spiral out), skipping
// furniture/walls and tiles already taken by other teammates.
function findFloorSpot(center: Position, occupied: Set<string>): Position {
  for (let radius = 0; radius <= 8; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = center.x + dx;
        const y = center.y + dy;
        const key = `${x},${y}`;
        if (walkableTiles.has(key) && !occupied.has(key)) {
          occupied.add(key);
          return { x, y };
        }
      }
    }
  }
  return center;
}

// A small loop of nearby floor tiles around a home, so characters mill about
// their team area instead of standing still (stays within the room).
function wanderRoute(home: Position): Position[] {
  const deltas: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
  ];
  const spots = deltas
    .map(([dx, dy]) => ({ x: home.x + dx, y: home.y + dy }))
    .filter((p) => walkableTiles.has(`${p.x},${p.y}`));
  return spots.length >= 2 ? spots : [home];
}

function wanderMotion(home: Position, index: number, now: number, active: boolean): Motion {
  const route = wanderRoute(home);
  if (route.length < 2) return idleMotion(home);
  const segmentCount = route.length - 1;
  const cycleMs = (active ? 11_000 : 24_000) + (index % 9) * 900;
  const segmentMs = cycleMs / segmentCount;
  const elapsed = (now - localStartTs + (index % 13) * 1_500) % cycleMs;
  const segment = Math.min(segmentCount - 1, Math.floor(elapsed / segmentMs));
  const segmentStartTs = now - (elapsed % segmentMs);
  return {
    type: 'walking',
    route: [route[segment], route[segment + 1]],
    ignore: [],
    startTs: segmentStartTs,
    targetEndTs: segmentStartTs + segmentMs,
  };
}

function patrolRoute(position: Position, index: number) {
  const dx = index % 2 === 0 ? 2 : -2;
  const dy = index % 3 === 0 ? 2 : -1;
  return [
    position,
    { x: clampGrid(position.x + dx), y: position.y },
    { x: clampGrid(position.x + dx), y: clampGrid(position.y + dy) },
    { x: position.x, y: clampGrid(position.y + dy) },
    position,
  ];
}

function motionFor(position: Position, index: number, now: number): Motion {
  const route = patrolRoute(position, index);
  const segmentCount = route.length - 1;
  const cycleMs = 18_000 + index * 1_400;
  const segmentMs = cycleMs / segmentCount;
  const elapsed = (now - localStartTs + index * 1_700) % cycleMs;
  const segment = Math.min(segmentCount - 1, Math.floor(elapsed / segmentMs));
  const segmentStartTs = now - (elapsed % segmentMs);
  return {
    type: 'walking',
    route: [route[segment], route[segment + 1]],
    ignore: [],
    startTs: segmentStartTs,
    targetEndTs: segmentStartTs + segmentMs,
  };
}

export function calculateFraction(start: number, end: number, ts: number): number {
  if (start === end) return 0;
  const progress = (ts - start) / (end - start);
  return Math.max(Math.min(1, progress), 0);
}

export function calculateOrientation(start: Position, end: Position): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return dx ? (dx > 0 ? 0 : 180) : dy >= 0 ? 270 : 90;
}

export function getPoseFromMotion(motion: Motion, ts: number): Pose {
  if (motion.type === 'stopped') return motion.pose;
  const [start, end] = motion.route;
  const fraction = calculateFraction(motion.startTs, motion.targetEndTs, ts);
  return {
    position: {
      x: start.x + (end.x - start.x) * fraction,
      y: start.y + (end.y - start.y) * fraction,
    },
    orientation:
      ts >= motion.targetEndTs && motion.endOrientation !== undefined
        ? motion.endOrientation
        : calculateOrientation(start, end),
  };
}

function makeMessages(now: number): LocalMessage[] {
  const michael = playerIdsByName.Michael;
  const pam = playerIdsByName.Pam;
  const jim = playerIdsByName.Jim;
  const dwight = playerIdsByName.Dwight;
  return [
    {
      type: 'started',
      from: michael,
      fromName: 'Michael',
      to: [pam, jim, dwight],
      toNames: ['Pam', 'Jim', 'Dwight'],
      ts: now - 90_000,
    },
    {
      type: 'responded',
      from: michael,
      fromName: 'Michael',
      to: [pam, jim, dwight],
      toNames: ['Pam', 'Jim', 'Dwight'],
      ts: now - 78_000,
      content: 'Local mode meeting. No cloud database, still very official.',
    },
    {
      type: 'responded',
      from: jim,
      fromName: 'Jim',
      to: [michael, pam, dwight],
      toNames: ['Michael', 'Pam', 'Dwight'],
      ts: now - 56_000,
      content: 'So the office is running entirely on this machine now?',
    },
    {
      type: 'responded',
      from: dwight,
      fromName: 'Dwight',
      to: [michael, pam, jim],
      toNames: ['Michael', 'Pam', 'Jim'],
      ts: now - 34_000,
      content: 'Correct. Superior operational security.',
    },
    {
      type: 'responded',
      from: pam,
      fromName: 'Pam',
      to: [michael, jim, dwight],
      toNames: ['Michael', 'Jim', 'Dwight'],
      ts: now - 18_000,
      content: 'At least the monitor finally looks like people are working.',
    },
  ];
}

export type AgentEvent = {
  ts: number;
  kind: string;
  channel?: string | null;
  text?: string | null;
  source?: string;
};

export type AgentSession = {
  id: string;
  source: 'codex' | 'claude' | 'cursor';
  name: string;
  status: string;
  updatedAt: number;
  cwd?: string;
  branch?: string | null;
  model?: string | null;
  parentThreadId?: string | null;
  agentRole?: string | null;
  recentEvents?: AgentEvent[];
};

function idleMotion(position: Position): Motion {
  return { type: 'stopped', reason: 'idle', pose: { position, orientation: 270 } };
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function sortSessionsForOffice(sessions: AgentSession[]) {
  const rank = (status: string) =>
    status === 'running' ? 0 : status === 'starting' ? 1 : status === 'idle' ? 2 : 3;
  return [...sessions].sort(
    (a, b) => rank(a.status) - rank(b.status) || (b.updatedAt || 0) - (a.updatedAt || 0),
  );
}

// Human-friendlier team label from a cwd: use the last path segment, but keep
// the parent too when the leaf is numeric or very short (e.g. ".../file/1").
function projectLabel(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || 'project';
  if (parts.length >= 2 && (/^\d+$/.test(last) || last.length <= 2)) {
    return parts.slice(-2).join('/');
  }
  return last;
}

function eventFromName(event: AgentEvent, session: AgentSession) {
  if (event.source === 'user') return 'You';
  if (event.source === 'tool') return event.channel?.toUpperCase() ?? 'Tool';
  if (event.source === 'subagent') return 'Subagent';
  if (session.source === 'claude') return 'Claude';
  if (session.source === 'cursor') return 'Cursor';
  return 'Codex';
}

function eventToMessage(event: AgentEvent, playerId: LocalId, session: AgentSession): LocalMessage {
  const prefix = event.channel && event.kind !== 'message' ? `[${event.channel}] ` : '';
  return {
    type: 'responded',
    from: playerId,
    fromName: eventFromName(event, session),
    to: [],
    toNames: [],
    ts: event.ts,
    content: `${prefix}${event.text ?? event.kind}`,
  };
}

function isConversationEvent(event: AgentEvent) {
  const text = event.text?.trim() ?? '';
  if (!text) return false;
  if (event.channel === 'turn') return false;
  if (/turn usage:|decision: approved|finished: success=true|call started$/i.test(text)) {
    return false;
  }
  return ['message', 'tool', 'subagent', 'error'].includes(event.kind);
}

function conversationEvents(events: AgentEvent[] | undefined) {
  const filtered = (events ?? []).filter(isConversationEvent);
  const primary = filtered.filter((event) =>
    ['message', 'subagent', 'error'].includes(event.kind),
  );
  if (primary.length) return primary.slice(-8);
  if (filtered.length) return filtered.slice(-8);
  return (events ?? []).filter((event) => event.text?.trim()).slice(-3);
}

export function createLocalWorld(
  now = Date.now(),
  agentSessions: AgentSession[] = [],
): LocalWorldState {
  const map: LocalMap = {
    _id: mapId,
    tileSetUrl: tilesetpath,
    tileSetDim: tilefiledim,
    tileDim: tiledim,
    bgTiles: bgtiles,
    objectTiles: objmap,
  };

  const characters = Object.fromEntries(
    characterData.map((character) => [
      characterIdsByName[character.name],
      {
        _id: characterIdsByName[character.name],
        ...character,
      },
    ]),
  );

  const demoPlayers = Descriptions.map((description) => ({
    _id: playerIdsByName[description.name],
    name: description.name,
    worldId,
    agentId: `local:agent:${description.name}`,
    characterId: characterIdsByName[description.character],
  }));

  const worldShell = {
    world: {
      _id: worldId,
      width: bgtiles[0].length,
      height: bgtiles[0][0].length,
      mapId,
      frozen: false,
    },
    map,
    characters,
  };

  if (agentSessions.length === 0) {
    // No live sessions yet — render an empty office (no demo characters).
    return { ...worldShell, players: [], playerStates: {}, messages: {}, teams: [] };
  }

  // Live mode: each project (cwd) is a team in its own area; every session and
  // subagent is its own character, clustered with its teammates.
  const sorted = sortSessionsForOffice(agentSessions);

  // Group ALL sessions (leads + subagents) by project.
  const byProject = new Map<string, AgentSession[]>();
  for (const session of sorted) {
    const key = session.cwd || 'unknown';
    const list = byProject.get(key) ?? [];
    list.push(session);
    byProject.set(key, list);
  }
  // Running projects first, then deterministic by cwd; cap to the team areas.
  const teamCwds = [...byProject.keys()]
    .sort((a, b) => {
      const ra = (byProject.get(a) ?? []).some((s) => s.status === 'running') ? 0 : 1;
      const rb = (byProject.get(b) ?? []).some((s) => s.status === 'running') ? 0 : 1;
      return ra - rb || a.localeCompare(b);
    })
    .slice(0, teamAreas.length);

  const players: LocalPlayerDoc[] = [];
  const playerStates: Record<LocalId, LocalPlayerState> = {};
  const messages: Record<LocalId, LocalMessage[]> = {};
  const teams: LocalTeam[] = [];
  const occupied = new Set<string>();

  teamCwds.forEach((cwd, teamIndex) => {
    const center = teamAreas[teamIndex];
    const projectName = projectLabel(cwd);
    const members = (byProject.get(cwd) ?? []).slice(0, 16);
    teams.push({
      id: `local:team:${cwd}`,
      name: projectName,
      center,
      source: members[0]?.source ?? 'claude',
    });

    // One character per project (the lead). Every session of the project lives
    // on the lead and shows up as a list when you click it.
    const lead = members[0];
    if (!lead) return;
    const playerId = `local:player:${cwd}`;
    const characterDef = characterData[hashString(cwd) % characterData.length];
    const characterId = characterIdsByName[characterDef.name];
    const position = findFloorSpot(center, occupied);
    const running = members.some((session) => session.status === 'running');

    const projectSessions = members.map((session) => {
      const conversationKey = `local:conversation:${session.id}`;
      const sessionMessages = conversationEvents(session.recentEvents).map((event) =>
        eventToMessage(event, playerId, session),
      );
      if (sessionMessages.length) messages[conversationKey] = sessionMessages;
      return {
        id: session.id,
        name: session.name,
        status: session.status,
        source: session.source,
        role: (session.parentThreadId ? 'subagent' : 'lead') as 'lead' | 'subagent',
        conversationId: conversationKey,
      };
    });

    const leadConversation = `local:conversation:${lead.id}`;
    const leadMessages = messages[leadConversation] ?? [];
    const lastMessage = leadMessages[leadMessages.length - 1];

    players.push({
      _id: playerId,
      name: projectName,
      worldId,
      agentId: `local:agent:${cwd}`,
      characterId,
    });
    playerStates[playerId] = {
      id: playerId,
      name: projectName,
      agentId: `local:agent:${cwd}`,
      characterId,
      identity: `${projectName} · ${projectSessions.length} sessions`,
      // Wanders while any session runs; rests (asleep) when all are idle.
      motion: running
        ? wanderMotion(position, hashString(cwd), now, true)
        : idleMotion(position),
      thinking: running,
      sleeping: !running,
      projectSessions,
      lastChat: lastMessage
        ? { message: lastMessage, conversationId: leadConversation }
        : undefined,
    };
  });

  return { ...worldShell, players, playerStates, messages, teams };
}
