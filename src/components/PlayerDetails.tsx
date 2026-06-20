'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { useLocalWorld } from './LocalWorldProvider';
import { LocalId } from '@/lib/localWorld';

function Messages({
  conversationId,
  currentPlayerId,
}: {
  conversationId: LocalId;
  currentPlayerId: LocalId;
}) {
  const { getMessages } = useLocalWorld();
  const messages = getMessages(conversationId);
  if (!messages.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
        No activity yet.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {[...messages].reverse().map((message) => (
        <div className="leading-tight" key={message.ts}>
          {message.type === 'responded' ? (
            <div
              className={clsx(
                'rounded-lg border p-3',
                message.from === currentPlayerId
                  ? 'border-teal-200 bg-teal-50'
                  : 'border-slate-200 bg-white',
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span className="font-semibold uppercase tracking-[0.12em] text-slate-700">
                  {message.fromName}
                </span>
                <time dateTime={message.ts.toString()} className="tabular-nums">
                  {new Date(message.ts).toLocaleString()}
                </time>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-700">{message.content}</p>
            </div>
          ) : (
            <p className="rounded-md bg-slate-100 px-3 py-2 text-center text-xs text-slate-500">
              {message.fromName} {message.type === 'left' ? 'left' : 'started'}
              {' the conversation.'}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function PlayerDetails({ playerId }: { playerId: LocalId }) {
  const { getPlayerState } = useLocalWorld();
  const playerState = getPlayerState(playerId);
  const [selectedConversation, setSelectedConversation] = useState<LocalId | undefined>(undefined);

  const sessions = playerState?.projectSessions ?? [];
  const activeConversation =
    selectedConversation && sessions.some((s) => s.conversationId === selectedConversation)
      ? selectedConversation
      : sessions[0]?.conversationId ?? playerState?.lastChat?.conversationId;

  if (!playerState) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-white">
            {playerState.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-950">{playerState.name}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{playerState.identity}</p>
          </div>
        </div>
      </div>

      {sessions.length > 0 && (
        <div className="mt-5 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Sessions ({sessions.length})
          </div>
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => setSelectedConversation(session.conversationId)}
              className={clsx(
                'block w-full rounded-lg border px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2',
                activeConversation === session.conversationId
                  ? 'border-teal-400 bg-teal-50 text-teal-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300',
              )}
            >
              <span className="block truncate text-sm font-medium">
                {session.role === 'subagent' ? '↳ ' : ''}
                {session.name}
              </span>
              <span className="mt-1 block text-xs uppercase tracking-[0.12em] text-slate-500">
                {session.source} · {session.status}
              </span>
            </button>
          ))}
        </div>
      )}

      {activeConversation && (
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
          <Messages conversationId={activeConversation} currentPlayerId={playerState.id} />
        </div>
      )}
    </div>
  );
}
