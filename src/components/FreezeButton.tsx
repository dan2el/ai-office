'use client';
import { useState } from 'react';

export default function FreezeButton() {
  const [isFrozen, setFrozen] = useState(false);

  const flipSwitch = () => {
    setFrozen(!isFrozen);
  };

  return (
    <>
      <a
        className="button text-white shadow-solid text-2xl pointer-events-auto"
        onClick={flipSwitch}
        title="When freezing a world, the agents will take some time to stop what they are doing before they become frozen. "
      >
        <div className="inline-block bg-clay-700">
          <span>
            <div className="inline-flex items-center gap-4">
              <img className="w-6 h-6" src="/assets/star.svg" />
              {isFrozen ? 'Unfreeze' : 'Freeze'}
            </div>
          </span>
        </div>
      </a>
    </>
  );
}
