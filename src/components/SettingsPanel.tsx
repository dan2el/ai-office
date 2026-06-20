'use client';

import { useAppPreferences } from './AppPreferencesProvider';

export default function SettingsPanel() {
  const { preferences, updatePreferences, resetPreferences } = useAppPreferences();

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-slate-950">Settings</h2>
        <p className="mt-1 text-sm text-slate-500">
          Workspace preferences are saved in this browser.
        </p>
      </div>

      <div className="space-y-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-950">Data refresh</h3>
          <p className="mt-1 text-sm text-slate-500">
            How often agent sessions and the office floor update.
          </p>
          <label className="mt-4 block">
            <span className="text-sm font-medium text-slate-700">Refresh interval</span>
            <select
              value={preferences.refreshIntervalMs}
              onChange={(event) =>
                updatePreferences({ refreshIntervalMs: Number(event.target.value) })
              }
              className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
            >
              <option value={1000}>Every 1 second</option>
              <option value={2000}>Every 2 seconds</option>
              <option value={5000}>Every 5 seconds</option>
              <option value={10000}>Every 10 seconds</option>
            </select>
          </label>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-950">Agents table</h3>
          <label className="mt-4 flex items-start gap-3">
            <input
              type="checkbox"
              checked={preferences.showOfflineAgents}
              onChange={(event) =>
                updatePreferences({ showOfflineAgents: event.target.checked })
              }
              className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">Show offline agents</span>
              <span className="mt-0.5 block text-sm text-slate-500">
                Include idle or sleeping projects in the agents list.
              </span>
            </span>
          </label>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-950">Monitor</h3>
          <label className="mt-4 flex items-start gap-3">
            <input
              type="checkbox"
              checked={preferences.autoOpenMonitorOnSelect}
              onChange={(event) =>
                updatePreferences({ autoOpenMonitorOnSelect: event.target.checked })
              }
              className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">
                Open monitor when an agent is selected
              </span>
              <span className="mt-0.5 block text-sm text-slate-500">
                Filter the activity feed to the selected project and show session details.
              </span>
            </span>
          </label>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-950">Local data sources</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>Codex — <code className="text-xs">~/.codex</code></li>
            <li>Claude Code — <code className="text-xs">~/.claude/projects</code></li>
            <li>Cursor — <code className="text-xs">~/.cursor/projects</code></li>
          </ul>
        </section>

        <button
          type="button"
          onClick={resetPreferences}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
