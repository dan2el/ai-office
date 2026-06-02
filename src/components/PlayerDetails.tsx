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
    return <p className="text-center text-sm text-brown-700">No activity yet.</p>;
  }
  return (
    <>
      {[...messages].reverse().map((message) => (
        <div className="mb-6 leading-tight" key={message.ts}>
          {message.type === 'responded' ? (
            <>
              <div className="flex gap-4">
                <span className="flex-grow uppercase">{message.fromName}</span>
                <time dateTime={message.ts.toString()}>
                  {new Date(message.ts).toLocaleString()}
                </time>
              </div>
              <div className={clsx('bubble', message.from === currentPlayerId && 'bubble-mine')}>
                <p className="-mx-3 -my-1 bg-white">{message.content}</p>
              </div>
            </>
          ) : (
            <p className="text-center text-brown-700">
              {message.fromName} {message.type === 'left' ? 'left' : 'started'}
              {' the conversation.'}
            </p>
          )}
        </div>
      ))}
    </>
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
    <>
      <h2 className="p-2 text-center font-display text-4xl tracking-wider text-yellow shadow-solid">
        {playerState.name}
      </h2>

      <div className="desc my-4">
        <p className="-m-4 bg-white text-lg leading-tight text-black">{playerState.identity}</p>
      </div>

      {sessions.length > 0 && (
        <div className="my-4 space-y-1">
          <div className="text-xs uppercase text-brown-700">Sessions ({sessions.length})</div>
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => setSelectedConversation(session.conversationId)}
              className={clsx(
                'pointer-events-auto block w-full border-2 px-2 py-1 text-left leading-tight',
                activeConversation === session.conversationId
                  ? 'border-white bg-brown-500 text-white'
                  : 'border-brown-700 bg-brown-900 text-silver hover:border-silver',
              )}
            >
              <span className="block truncate text-sm">
                {session.role === 'subagent' ? '↳ ' : ''}
                {session.name}
              </span>
              <span className="text-xs uppercase">
                {session.source} · {session.status}
              </span>
            </button>
          ))}
        </div>
      )}

      {activeConversation && (
        <div className="chats">
          <div className="bg-brown-200 p-2 text-black">
            <Messages conversationId={activeConversation} currentPlayerId={playerState.id} />
          </div>
        </div>
      )}
    </>
  );
}
