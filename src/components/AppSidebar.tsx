'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';

export type AppSection = 'office' | 'agents' | 'monitor' | 'settings' | 'help';

type NavItem = {
  id: AppSection | 'focus';
  label: string;
  icon: ReactNode;
};

const navItems: NavItem[] = [
  {
    id: 'office',
    label: 'Live office',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
        <rect x="2" y="3" width="16" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 8h16M8 8v9" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
        <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="13" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 16c0-2.2 1.8-4 4-4s4 1.8 4 4M11 16c0-1.5 1-2.8 2.3-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'monitor',
    label: 'Monitor',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
        <path d="M4 4h12v9H4z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 17h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'focus',
    label: 'Focus mode',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
        <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="10" cy="10" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
        <path
          d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M3.5 11.5l1-.6a1 1 0 00.4-1.4l-.2-1.1a1 1 0 011.2-1.2l1.1.2a1 1 0 001.4-.4l.6-1h2l.6 1a1 1 0 001.4.4l1.1-.2a1 1 0 011.2 1.2l-.2 1.1a1 1 0 00.4 1.4l1 .6v2l-1 .6a1 1 0 00-.4 1.4l.2 1.1a1 1 0 01-1.2 1.2l-1.1-.2a1 1 0 00-1.4.4l-.6 1h-2l-.6-1a1 1 0 00-1.4-.4l-1.1.2a1 1 0 01-1.2-1.2l.2-1.1a1 1 0 00-.4-1.4l-1-.6v-2z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    ),
  },
  {
    id: 'help',
    label: 'Help',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 8a2 2 0 114 0c0 1.5-2 1.5-2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="14.5" r=".75" fill="currentColor" />
      </svg>
    ),
  },
];

export default function AppSidebar({
  activeSection,
  onNavigate,
  onToggleFocus,
  focusMode,
  agentCount,
}: {
  activeSection: AppSection;
  onNavigate: (section: AppSection) => void;
  onToggleFocus: () => void;
  focusMode: boolean;
  agentCount: number;
}) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2.5 border-b border-slate-200 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-xs font-bold text-white">
          AI
        </div>
        <span className="text-base font-semibold text-slate-950">AI Office</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isFocus = item.id === 'focus';
          const active = !isFocus && activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (isFocus) {
                  onToggleFocus();
                  return;
                }
                onNavigate(item.id as AppSection);
              }}
              className={clsx(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                isFocus && focusMode
                  ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-200'
                  : active
                    ? 'bg-teal-50 text-teal-800'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
              )}
            >
              <span className={clsx(active || (isFocus && focusMode) ? 'text-teal-700' : 'text-slate-400')}>
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span
            className={clsx(
              'h-2 w-2 rounded-full',
              agentCount > 0 ? 'bg-emerald-500' : 'bg-slate-300',
            )}
          />
          <span>
            {agentCount > 0
              ? `${agentCount} agent${agentCount === 1 ? '' : 's'} active`
              : 'No agents active'}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {agentCount > 0 ? 'All systems operational' : 'Waiting for sessions'}
        </p>
      </div>
    </aside>
  );
}
