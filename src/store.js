import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { api } from './api.js';
import { createPattern } from '../shared/pattern.js';

const SAVE_DELAY = 350;
const RETRY_DELAY = 4000;
const SELECTED_KEY = 'dph.selected';

function readSelected() {
  try {
    return Number(localStorage.getItem(SELECTED_KEY)) || null;
  } catch {
    return null;
  }
}

function writeSelected(id) {
  try {
    localStorage.setItem(SELECTED_KEY, String(id));
  } catch {
    // Speicher nicht verfügbar (z. B. privates Fenster) – nur Komfortfunktion.
  }
}

// Hält alle Pattern im Speicher (wenige KB) und speichert Änderungen sofort,
// entprellt pro Pattern. Fehlgeschlagene Speicherungen werden wiederholt.
export function usePatternStore() {
  const [patterns, setPatterns] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | saved | saving | error | offline
  const patternsRef = useRef(patterns);
  const pending = useRef(new Map()); // id → timer
  patternsRef.current = patterns;

  const persist = useCallback(async (id, opts) => {
    clearTimeout(pending.current.get(id));
    pending.current.delete(id);
    const pattern = patternsRef.current.find((p) => p.id === id);
    if (!pattern) return;
    setStatus('saving');
    try {
      await api.save(pattern, opts);
      if (pending.current.size === 0) setStatus('saved');
    } catch {
      setStatus('error');
      if (!pending.current.has(id)) {
        pending.current.set(id, setTimeout(() => persist(id), RETRY_DELAY));
      }
    }
  }, []);

  const flush = useCallback(
    (opts) => {
      for (const id of [...pending.current.keys()]) persist(id, opts);
    },
    [persist],
  );

  useEffect(() => {
    api
      .list()
      .then((list) => {
        setPatterns(list);
        const stored = readSelected();
        setSelectedId(list.some((p) => p.id === stored) ? stored : list[0]?.id ?? null);
        setStatus('saved');
      })
      .catch(() => setStatus('offline'));

    const onHide = () => {
      if (document.visibilityState === 'hidden') flush({ keepalive: true });
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [flush]);

  const select = useCallback((id) => {
    setSelectedId(id);
    writeSelected(id);
  }, []);

  const update = useCallback(
    (id, fn) => {
      const next = patternsRef.current.map((p) => (p.id === id ? fn(p) : p));
      patternsRef.current = next;
      setPatterns(next);
      clearTimeout(pending.current.get(id));
      pending.current.set(id, setTimeout(() => persist(id), SAVE_DELAY));
      setStatus('saving');
    },
    [persist],
  );

  const add = useCallback(
    async (source) => {
      const base = source
        ? { ...source, name: `${source.name} (Kopie)`.slice(0, 60) }
        : createPattern({ name: `Pattern ${patternsRef.current.length + 1}` });
      try {
        const created = await api.create(base);
        setPatterns((list) => [...list, created]);
        select(created.id);
      } catch {
        setStatus('error');
      }
    },
    [select],
  );

  const remove = useCallback(
    async (id) => {
      clearTimeout(pending.current.get(id));
      pending.current.delete(id);
      try {
        await api.remove(id);
      } catch {
        setStatus('error');
        return;
      }
      const list = patternsRef.current;
      const index = list.findIndex((p) => p.id === id);
      const rest = list.filter((p) => p.id !== id);
      setPatterns(rest);
      const neighbor = rest[Math.min(index, rest.length - 1)];
      if (neighbor) select(neighbor.id);
      else setSelectedId(null);
    },
    [select],
  );

  const selected = patterns.find((p) => p.id === selectedId) ?? null;
  return { patterns, selected, status, select, update, add, remove };
}
