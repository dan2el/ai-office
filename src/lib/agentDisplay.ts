// Shared display helpers for agent/session UI (avatars, source badges).

export function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return Array.from(trimmed).slice(0, 2).join('').toUpperCase();
}

export function sourceTone(source: string): string {
  if (source === 'codex') return 'border-teal-200 bg-teal-50/70 text-teal-700';
  if (source === 'cursor') return 'border-sky-200 bg-sky-50/70 text-sky-700';
  return 'border-amber-200 bg-amber-50/70 text-amber-700';
}

export function sourceLabel(source?: string): string {
  if (source === 'codex') return 'Codex';
  if (source === 'cursor') return 'Cursor';
  return 'Claude';
}
