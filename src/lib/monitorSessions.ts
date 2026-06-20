import { LocalId, LocalPlayerState } from '@/lib/localWorld';

export type LinkedMonitorSession = {
  source: string;
  rawId: string;
};

export function projectCwdFromPlayerId(playerId: LocalId) {
  const prefix = 'local:player:';
  if (!playerId.startsWith(prefix)) return null;
  return playerId.slice(prefix.length);
}

export function linkedSessionsForPlayer(state: LocalPlayerState | undefined): LinkedMonitorSession[] {
  if (!state?.projectSessions?.length) return [];
  return state.projectSessions.map((session) => ({
    source: session.source,
    rawId: session.id,
  }));
}

export function monitorSessionKey(source: string, rawId: string) {
  return `${source}:${rawId}`;
}

export function sessionMatchesPlayer(
  session: { id: string; cwd?: string },
  playerId: LocalId | undefined,
  playerState: LocalPlayerState | undefined,
): boolean {
  if (!playerId || !playerState) return false;

  const cwd = projectCwdFromPlayerId(playerId);
  if (cwd && session.cwd === cwd) return true;

  const linkedIds = linkedSessionsForPlayer(playerState).map((linked) =>
    monitorSessionKey(linked.source, linked.rawId),
  );
  return linkedIds.includes(session.id);
}
