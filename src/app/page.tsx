'use client';
import GameWrapper from '@/components/GameWrapper';
import PlayerButton from '@/components/PlayerButton';
import AgentMonitor from '@/components/AgentMonitor';
import { useLocalWorld } from '@/components/LocalWorldProvider';
import { LocalId } from '@/lib/localWorld';
import { useState } from 'react';

export default function Home() {
  const [selectedPlayer, setSelectedPlayer] = useState<LocalId>();
  const { worldState } = useLocalWorld();
  const players = worldState.players;

  return (
    <>
      <main className="relative flex min-h-screen flex-col items-center justify-between font-body game-background">
        <div className="relative isolate flex min-h-screen w-full flex-col justify-start overflow-hidden p-6 shadow-2xl lg:p-8">
        <h1 className="mx-auto text-center text-6xl sm:text-7xl lg:text-8xl font-bold font-display leading-none tracking-wide game-title">
          AI Office
        </h1>

        <p className="mx-auto my-4 text-center text-xl sm:text-2xl text-white leading-tight shadow-solid">
          A virtual office with some familiar AI employees...
        </p>

        <GameWrapper selectedPlayer={selectedPlayer} setSelectedPlayer={setSelectedPlayer} />

        <AgentMonitor />

        <footer className="flex flex-col left-0 w-full flex items-center mt-4 gap-6 p-6 flex-wrap pointer-events-none">
          <div className="flex-col jistify-center">
            <div className="mx-auto flex flex-grow justify-center gap-4 pointer-events-none">
              {players.map((player) => (
                <PlayerButton
                  key={player._id}
                  player={player}
                  selectPlayer={setSelectedPlayer}
                  selectedPlayer={selectedPlayer}
                />
              ))}
            </div>

            <div className="mx-auto my-4 text-center text-xl sm:text-2xl text-white leading-tight shadow-solid">
              <p>
                Inspired by{' '}
                <a href="https://" style={{ pointerEvents: 'auto' }}>
                  AI Town
                </a>{' '}
                by A16z
              </p>
            </div>
            <div className="mx-auto my-4 text-center text-xl sm:text-1xl text-white leading-tight shadow-solid">
              <p>
                Want to see how real AI Agents can scale your business? 👉 Try{' '}
                <a
                  className="text-underline"
                  href="https://github.com/a16z-infra/ai-town"
                  style={{ pointerEvents: 'auto' }}
                >
                  Parcha.ai
                </a>
              </p>
            </div>
          </div>
        </footer>
      </div>
    </main>
    </>
  );
}
