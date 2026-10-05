import { createContext, useContext, useEffect, useState } from 'react';

import { NO_PREFERENCES, onPreferencesChanged, readPreferences, type Preferences } from './preferences';

const PreferencesContext = createContext<Preferences>(NO_PREFERENCES);

/**
 * The preferences, read once for the whole app and again whenever one
 * changes. Above the lock, so the lock screen and the introduction follow
 * them too.
 */
export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState(readPreferences);
  useEffect(() => onPreferencesChanged(() => setPreferences(readPreferences())), []);
  return <PreferencesContext.Provider value={preferences}>{children}</PreferencesContext.Provider>;
}

export const usePreferences = () => useContext(PreferencesContext);
