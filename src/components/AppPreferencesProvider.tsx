'use client';

import {
  AppPreferences,
  defaultAppPreferences,
  loadAppPreferences,
  saveAppPreferences,
} from '@/lib/appPreferences';
import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';

type AppPreferencesContextValue = {
  preferences: AppPreferences;
  updatePreferences: (patch: Partial<AppPreferences>) => void;
  resetPreferences: () => void;
};

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

export function AppPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<AppPreferences>(defaultAppPreferences);

  useEffect(() => {
    setPreferences(loadAppPreferences());
  }, []);

  const updatePreferences = useCallback((patch: Partial<AppPreferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      saveAppPreferences(next);
      return next;
    });
  }, []);

  const resetPreferences = useCallback(() => {
    saveAppPreferences(defaultAppPreferences);
    setPreferences(defaultAppPreferences);
  }, []);

  return (
    <AppPreferencesContext.Provider value={{ preferences, updatePreferences, resetPreferences }}>
      {children}
    </AppPreferencesContext.Provider>
  );
}

export function useAppPreferences() {
  const value = useContext(AppPreferencesContext);
  if (!value) {
    throw new Error('useAppPreferences must be used inside AppPreferencesProvider');
  }
  return value;
}
