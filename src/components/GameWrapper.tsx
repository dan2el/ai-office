'use client';
import PlayerDetails from './PlayerDetails';
import OfficeMap from './OfficeMap';
import { SelectPlayer } from './Player';
import { LocalId } from '@/lib/localWorld';

export default function GameWrapper({
  selectedPlayer,
  setSelectedPlayer,
}: {
  selectedPlayer: LocalId | undefined;
  setSelectedPlayer: SelectPlayer;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Live office</h2>
          <p className="mt-1 text-sm text-slate-500">Current agent positions and conversations</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Online
        </div>
      </header>

      <div className="grid min-h-[680px] lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-h-[460px] p-4">
          <OfficeMap selectedPlayer={selectedPlayer} setSelectedPlayer={setSelectedPlayer} />
        </div>

        <aside className="flex min-h-0 flex-col border-t border-slate-200 bg-slate-50/70 p-5 lg:border-l lg:border-t-0">
          {selectedPlayer ? (
            <PlayerDetails key={selectedPlayer} playerId={selectedPlayer} />
          ) : (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
                AI
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-950">No agent selected</h3>
              <p className="mt-2 max-w-[240px] text-sm leading-6 text-slate-500">
                Select an agent from the floorplan or roster to review context.
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
