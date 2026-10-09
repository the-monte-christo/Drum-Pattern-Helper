import { useEffect, useState } from 'preact/hooks';

// Ansichts-Einstellungen dieses Geräts (Liste eingeklappt, Editor offen, …) in localStorage.
// Fehlt der Speicher (z. B. privates Fenster), gilt einfach der Standardwert.
export function usePref(name, initial) {
  const key = `dph.${name}`;
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw === null ? initial : JSON.parse(raw);
      return typeof parsed === typeof initial ? parsed : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // nur Komfort
    }
  }, [key, value]);
  return [value, setValue];
}
