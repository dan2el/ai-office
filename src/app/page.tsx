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

        <footer className="left-0 mt-4 flex w-full flex-col items-center gap-6 p-6 pointer-events-none">
          <div className="flex w-full max-w-[1400px] flex-col items-center">
            <div className="mx-auto grid w-full grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 pointer-events-none sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
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
