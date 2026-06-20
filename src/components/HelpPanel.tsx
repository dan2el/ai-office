'use client';

const steps = [
  {
    title: 'Start the app',
    body: 'Run npm run dev and open the workspace in your browser. Sessions are read from your machine only.',
  },
  {
    title: 'Pick an agent',
    body: 'Click a circle on the live office map or a row in the agents table. The monitor filters to that project’s sessions.',
  },
  {
    title: 'Watch activity',
    body: 'Use the Monitor panel tabs — All, Tasks, Messages, Events — to follow tool calls, messages, and errors in real time.',
  },
  {
    title: 'Focus on the floor',
    body: 'Turn on Focus mode to hide the sidebar, agents table, and monitor so you can concentrate on the live office map.',
  },
];

const shortcuts = [
  { keys: '1 – 3', action: 'Jump to Live office, Agents, or Monitor (sidebar)' },
  { keys: 'F', action: 'Toggle Focus mode' },
  { keys: 'Esc', action: 'Clear agent selection' },
];

export default function HelpPanel() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-slate-950">Help</h2>
        <p className="mt-1 text-sm text-slate-500">
          Quick guide for the local-first AI Office workspace.
        </p>
      </div>

      <div className="space-y-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-950">Getting started</h3>
          <ol className="mt-4 space-y-4">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-800 ring-1 ring-teal-200">
                  {index + 1}
                </span>
                <span>
                  <span className="block text-sm font-medium text-slate-900">{step.title}</span>
                  <span className="mt-0.5 block text-sm leading-6 text-slate-600">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-950">Keyboard shortcuts</h3>
          <ul className="mt-4 divide-y divide-slate-100">
            {shortcuts.map((shortcut) => (
              <li
                key={shortcut.keys}
                className="flex items-center justify-between gap-4 py-2.5 text-sm"
              >
                <span className="text-slate-600">{shortcut.action}</span>
                <kbd className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-700">
                  {shortcut.keys}
                </kbd>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-950">Troubleshooting</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
            <li>
              If no sessions appear, confirm Codex, Claude Code, or Cursor has run at least once on
              this machine.
            </li>
            <li>
              The monitor polls local APIs every few seconds. Increase the interval in Settings if
              your machine feels busy.
            </li>
            <li>
              Demo characters (Michael, Pam, …) appear when no live sessions are detected. Start a
              coding agent to see real projects on the floor.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
