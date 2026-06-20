'use client';

import AgentMonitor from '@/components/AgentMonitor';
import AgentsTable from '@/components/AgentsTable';
import AppSidebar, { AppSection } from '@/components/AppSidebar';
import HelpPanel from '@/components/HelpPanel';
import NotificationBell from '@/components/NotificationBell';
import OfficeMap from '@/components/OfficeMap';
import SettingsPanel from '@/components/SettingsPanel';
import { useLocalWorld } from '@/components/LocalWorldProvider';
import { LocalId } from '@/lib/localWorld';
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';

const workspaceSections: AppSection[] = ['office', 'agents', 'monitor'];

export default function Home() {
  const [selectedPlayer, setSelectedPlayer] = useState<LocalId>();
  const [focusMode, setFocusMode] = useState(false);
  const [activeSection, setActiveSection] = useState<AppSection>('office');
  const { worldState } = useLocalWorld();
  const players = worldState.players;
  const officeRef = useRef<HTMLElement>(null);
  const agentsRef = useRef<HTMLElement>(null);
  const monitorRef = useRef<HTMLElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);

  const showWorkspace = workspaceSections.includes(activeSection);
  const isMonitorPage = showWorkspace && !focusMode && activeSection === 'monitor';
  const showRightMonitor = showWorkspace && !focusMode && activeSection !== 'monitor';
  const showAgentsTable = showRightMonitor;

  const scrollToSection = useCallback((section: AppSection) => {
    const target =
      section === 'office'
        ? officeRef.current
        : section === 'agents'
          ? agentsRef.current
          : monitorRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleNavigate = useCallback(
    (section: AppSection) => {
      if (section === 'settings' || section === 'help') {
        setFocusMode(false);
        setActiveSection(section);
        mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      setActiveSection(section);
      if (section === 'monitor' && window.matchMedia('(min-width: 1024px)').matches) {
        return;
      }
      requestAnimationFrame(() => scrollToSection(section));
    },
    [scrollToSection],
  );

  const toggleFocusMode = useCallback(() => {
    setFocusMode((value) => {
      const next = !value;
      if (next) {
        setActiveSection('office');
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if (event.key === 'Escape') {
        setSelectedPlayer(undefined);
        return;
      }

      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        toggleFocusMode();
        return;
      }

      if (event.key === '1') {
        handleNavigate('office');
      } else if (event.key === '2') {
        handleNavigate('agents');
      } else if (event.key === '3') {
        handleNavigate('monitor');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNavigate, toggleFocusMode]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-950">
      {!focusMode && (
        <AppSidebar
          activeSection={activeSection}
          onNavigate={handleNavigate}
          onToggleFocus={() => setFocusMode(true)}
          focusMode={focusMode}
          agentCount={players.length}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-50 flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            {focusMode && (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-[10px] font-bold text-white">
                AI
              </div>
            )}
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <span
                className={clsx(
                  'h-2 w-2 rounded-full',
                  players.length > 0 ? 'bg-emerald-500' : 'bg-slate-300',
                )}
              />
              {players.length > 0
                ? `${players.length} agent${players.length === 1 ? '' : 's'} active`
                : 'No agents active'}
            </div>
            {selectedPlayer && showWorkspace && (
              <button
                type="button"
                onClick={() => setSelectedPlayer(undefined)}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
              >
                Clear selection
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleFocusMode}
              className={clsx(
                'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition',
                focusMode
                  ? 'border-teal-300 bg-teal-50 text-teal-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
              )}
              aria-pressed={focusMode}
            >
              <span
                className={clsx(
                  'relative h-5 w-9 rounded-full transition',
                  focusMode ? 'bg-teal-600' : 'bg-slate-200',
                )}
              >
                <span
                  className={clsx(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition',
                    focusMode ? 'left-4' : 'left-0.5',
                  )}
                />
              </span>
              {focusMode ? 'Exit focus' : 'Focus mode'}
            </button>
            <NotificationBell />
          </div>
        </header>

        <div
          className={clsx(
            'grid min-h-0 flex-1',
            showRightMonitor && 'lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]',
          )}
        >
          <div ref={mainScrollRef} className="min-h-0 overflow-y-auto">
            {activeSection === 'settings' && <SettingsPanel />}
            {activeSection === 'help' && <HelpPanel />}

            {isMonitorPage && (
              <div className="h-full min-h-0 p-4">
                <AgentMonitor />
              </div>
            )}

            {showWorkspace && activeSection !== 'monitor' && (
              <>
                <section
                  id="live-office"
                  ref={officeRef}
                  className={clsx(
                    'flex flex-col border-b border-slate-200 bg-white',
                    focusMode ? 'min-h-[calc(100vh-57px)]' : 'min-h-[min(52vh,520px)]',
                  )}
                >
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
                    <div>
                      <h2 className="text-base font-semibold text-slate-950">Live office</h2>
                      <p className="text-sm text-slate-500">
                        {focusMode
                          ? 'Focus view — map only'
                          : 'Agent positions on the floor'}
                      </p>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 p-4">
                    <OfficeMap
                      selectedPlayer={selectedPlayer}
                      setSelectedPlayer={setSelectedPlayer}
                    />
                  </div>
                </section>

                {showAgentsTable && (
                  <section id="agents" ref={agentsRef}>
                    <AgentsTable
                      selectedPlayer={selectedPlayer}
                      setSelectedPlayer={setSelectedPlayer}
                    />
                  </section>
                )}
              </>
            )}
          </div>

          {showRightMonitor && (
            <aside
              id="monitor"
              ref={monitorRef}
              className="min-h-0 overflow-hidden border-t border-slate-200 bg-white lg:border-l lg:border-t-0"
            >
              <AgentMonitor selectedPlayer={selectedPlayer} compact />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
