'use client';

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAppPreferences } from '@/components/AppPreferencesProvider';
import {
  AgentSession,
  LocalCharacter,
  LocalId,
  LocalMessage,
  LocalPlayerState,
  LocalWorldState,
  createLocalWorld,
} from '@/lib/localWorld';

type LocalWorldContextValue = {
  worldState: LocalWorldState;
  now: number;
  agentSessions: AgentSession[];
  getCharacter(characterId: LocalId): LocalCharacter | undefined;
  getPlayerState(playerId: LocalId): LocalPlayerState | undefined;
  getMessages(conversationId: LocalId): LocalMessage[];
};

const LocalWorldContext = createContext<LocalWorldContextValue | null>(null);

async function loadSessions(
  url: string,
  source: 'codex' | 'claude' | 'cursor',
): Promise<AgentSession[] | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as { sessions?: Array<Record<string, unknown>> };
    return (data.sessions ?? []).map((session) => ({ ...session, source } as AgentSession));
  } catch {
    return null;
  }
}

export function LocalWorldProvider({ children }: { children: ReactNode }) {
  const { preferences } = useAppPreferences();
  const [now, setNow] = useState(() => Date.now());
  const [agentSessions, setAgentSessions] = useState<AgentSession[]>([]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const [codex, claude, cursor] = await Promise.all([
        loadSessions('/api/codex-local', 'codex'),
        loadSessions('/api/claude-local', 'claude'),
        loadSessions('/api/cursor-local', 'cursor'),
      ]);
      if (!cancelled && (codex || claude || cursor)) {
        const nextSessions = [...(codex ?? []), ...(claude ?? []), ...(cursor ?? [])];
        setAgentSessions((currentSessions) =>
          nextSessions.length > 0 || currentSessions.length === 0
            ? nextSessions
            : currentSessions,
        );
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), preferences.refreshIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [preferences.refreshIntervalMs]);

  const worldState = useMemo(() => createLocalWorld(now, agentSessions), [now, agentSessions]);
  const value = useMemo<LocalWorldContextValue>(
    () => ({
      worldState,
      now,
      agentSessions,
      getCharacter: (characterId) => worldState.characters[characterId],
      getPlayerState: (playerId) => worldState.playerStates[playerId],
      getMessages: (conversationId) => worldState.messages[conversationId] ?? [],
    }),
    [agentSessions, now, worldState],
  );

  return <LocalWorldContext.Provider value={value}>{children}</LocalWorldContext.Provider>;
}

export function useLocalWorld() {
  const value = useContext(LocalWorldContext);
  if (!value) throw new Error('useLocalWorld must be used inside LocalWorldProvider');
  return value;
}
