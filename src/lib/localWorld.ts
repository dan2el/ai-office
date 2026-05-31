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
};

export type LocalWorldState = {
  world: LocalWorld;
  map: LocalMap;
  players: LocalPlayerDoc[];
  playerStates: Record<LocalId, LocalPlayerState>;
  characters: Record<LocalId, LocalCharacter>;
  messages: Record<LocalId, LocalMessage[]>;
};

const worldId = 'local:world:office';
const mapId = 'local:map:first-office';
const localStartTs = Date.now();

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
  source: 'codex' | 'claude';
  name: string;
  status: string;
  updatedAt: number;
  cwd?: string;
  branch?: string | null;
  model?: string | null;
  recentEvents?: AgentEvent[];
};

function idleMotion(position: Position): Motion {
  return { type: 'stopped', reason: 'idle', pose: { position, orientation: 270 } };
}

function sortSessionsForOffice(sessions: AgentSession[]) {
  const rank = (status: string) =>
    status === 'running' ? 0 : status === 'starting' ? 1 : status === 'idle' ? 2 : 3;
  return [...sessions].sort(
    (a, b) => rank(a.status) - rank(b.status) || (b.updatedAt || 0) - (a.updatedAt || 0),
  );
}

function eventToMessage(event: AgentEvent, playerId: LocalId, name: string): LocalMessage {
  const prefix = event.channel && event.kind !== 'message' ? `[${event.channel}] ` : '';
  return {
    type: 'responded',
    from: playerId,
    fromName: name,
    to: [],
    toNames: [],
    ts: event.ts,
    content: `${prefix}${event.text ?? event.kind}`,
  };
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

  const players = Descriptions.map((description) => ({
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
    players,
    characters,
  };

  if (agentSessions.length === 0) {
    // No live agent sessions yet — fall back to the seeded demo office.
    const messages = makeMessages(now);
    const latestMessageByPlayer = new Map<LocalId, LocalMessage>();
    for (const message of messages) {
      latestMessageByPlayer.set(message.from, message);
      for (const recipient of message.to) {
        latestMessageByPlayer.set(recipient, message);
      }
    }
    const playerStates = Object.fromEntries(
      Descriptions.map((description, index) => {
        const playerId = playerIdsByName[description.name];
        const lastMessage = latestMessageByPlayer.get(playerId);
        return [
          playerId,
          {
            id: playerId,
            name: description.name,
            agentId: `local:agent:${description.name}`,
            characterId: characterIdsByName[description.character],
            identity: identityFor(description.name),
            motion: motionFor(description.position ?? { x: 1, y: 1 + index }, index, now),
            thinking: index % 3 === 0,
            lastPlan: {
              plan: 'Keep the local AI Office running without Convex.',
              ts: now - 60_000,
            },
            lastChat: lastMessage ? { message: lastMessage, conversationId } : undefined,
          },
        ];
      }),
    );
    return { ...worldShell, playerStates, messages: { [conversationId]: messages } };
  }

  // Live mode: assign each character to a real Codex/Claude session.
  const sorted = sortSessionsForOffice(agentSessions);
  const messages: Record<LocalId, LocalMessage[]> = {};
  const playerStates = Object.fromEntries(
    Descriptions.map((description, index) => {
      const playerId = playerIdsByName[description.name];
      const characterId = characterIdsByName[description.character];
      const agentId = `local:agent:${description.name}`;
      const position = description.position ?? { x: 1, y: 1 + index };
      const session = sorted[index];

      if (!session) {
        // No session assigned to this desk — keep them milling around, idle.
        return [
          playerId,
          {
            id: playerId,
            name: description.name,
            agentId,
            characterId,
            identity: identityFor(description.name),
            motion: motionFor(position, index, now),
            thinking: false,
            lastPlan: { plan: 'Waiting for a task.', ts: now },
            lastChat: undefined,
          },
        ];
      }

      const running = session.status === 'running';
      const conversationKey = `local:conversation:${session.id}`;
      const sessionMessages = (session.recentEvents ?? []).map((event) =>
        eventToMessage(event, playerId, description.name),
      );
      if (sessionMessages.length) messages[conversationKey] = sessionMessages;
      const lastMessage = sessionMessages[sessionMessages.length - 1];

      return [
        playerId,
        {
          id: playerId,
          name: description.name,
          agentId,
          characterId,
          identity: `${session.source.toUpperCase()} · ${session.name}`,
          motion: running ? motionFor(position, index, now) : idleMotion(position),
          thinking: running,
          lastPlan: { plan: session.name, ts: session.updatedAt },
          lastChat: lastMessage
            ? { message: lastMessage, conversationId: conversationKey }
            : undefined,
        },
      ];
    }),
  );

  return { ...worldShell, playerStates, messages };
}
