'use client';

import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { useLocalWorld } from './LocalWorldProvider';
import { AgentSession } from '@/lib/localWorld';

type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  tone: 'warning' | 'error' | 'info';
  ts: number;
};

function buildNotifications(sessions: AgentSession[]): NotificationItem[] {
  const items: NotificationItem[] = [];
  for (const session of sessions) {
    if (session.status === 'failed') {
      items.push({
        id: `${session.id}:failed`,
        title: session.name,
        detail: 'Session failed',
        tone: 'error',
        ts: session.updatedAt,
      });
    } else if (session.status === 'limited') {
      items.push({
        id: `${session.id}:limited`,
        title: session.name,
        detail: 'Usage limit reached',
        tone: 'warning',
        ts: session.updatedAt,
      });
    }
  }
  return items.sort((a, b) => b.ts - a.ts).slice(0, 8);
}

export default function NotificationBell() {
  const { agentSessions } = useLocalWorld();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const notifications = buildNotifications(agentSessions);
  const unreadCount = notifications.length;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
          <path
            d="M10 4a4 4 0 00-4 4v2.5c0 .6-.2 1.2-.6 1.7L4.5 14h11l-.9-1.8c-.4-.5-.6-1.1-.6-1.7V8a4 4 0 00-4-4z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M8 15a2 2 0 004 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-950">Notifications</h3>
            <p className="mt-0.5 text-xs text-slate-500">Session alerts from local agents</p>
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">No alerts right now.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {notifications.map((item) => (
                <li key={item.id} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <span
                      className={clsx(
                        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                        item.tone === 'error' && 'bg-rose-500',
                        item.tone === 'warning' && 'bg-amber-400',
                        item.tone === 'info' && 'bg-sky-400',
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">{item.detail}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
