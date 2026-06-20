export type AppPreferences = {
  refreshIntervalMs: number;
  showOfflineAgents: boolean;
  autoOpenMonitorOnSelect: boolean;
};

export const defaultAppPreferences: AppPreferences = {
  refreshIntervalMs: 2000,
  showOfflineAgents: true,
  autoOpenMonitorOnSelect: true,
};

const STORAGE_KEY = 'ai-office-preferences';

export function loadAppPreferences(): AppPreferences {
  if (typeof window === 'undefined') return defaultAppPreferences;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultAppPreferences;
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      refreshIntervalMs:
        typeof parsed.refreshIntervalMs === 'number'
          ? Math.min(10_000, Math.max(1000, parsed.refreshIntervalMs))
          : defaultAppPreferences.refreshIntervalMs,
      showOfflineAgents:
        typeof parsed.showOfflineAgents === 'boolean'
          ? parsed.showOfflineAgents
          : defaultAppPreferences.showOfflineAgents,
      autoOpenMonitorOnSelect:
        typeof parsed.autoOpenMonitorOnSelect === 'boolean'
          ? parsed.autoOpenMonitorOnSelect
          : defaultAppPreferences.autoOpenMonitorOnSelect,
    };
  } catch {
    return defaultAppPreferences;
  }
}

export function saveAppPreferences(preferences: AppPreferences) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
