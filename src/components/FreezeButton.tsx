'use client';
import { useState } from 'react';

export default function FreezeButton() {
  const [isFrozen, setFrozen] = useState(false);

  const flipSwitch = () => {
    setFrozen(!isFrozen);
  };

  return (
    <button
      type="button"
      className="pointer-events-auto inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-teal-300 hover:text-slate-950"
      onClick={flipSwitch}
      title="When freezing a world, the agents will take some time to stop what they are doing before they become frozen. "
    >
      <img className="h-4 w-4" src="/assets/star.svg" alt="" aria-hidden="true" />
      {isFrozen ? 'Unfreeze' : 'Freeze'}
    </button>
  );
}
