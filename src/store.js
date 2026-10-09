import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { arrangementApi, patternApi } from './api.js';
import { createPattern } from '../shared/pattern.js';
import { createArrangement } from '../shared/arrangement.js';

const SAVE_DELAY = 350;
const RETRY_DELAY = 4000;

function readSelected(key) {
  try {
    return Number(localStorage.getItem(key)) || null;
  } catch {
    return null;
  }
}

function writeSelected(key, id) {
  try {
    localStorage.setItem(key, String(id));
  } catch {
    // Speicher nicht verfügbar (z. B. privates Fenster) – nur Komfortfunktion.
  }
}

const PATTERNS = {
  api: patternApi,
  selectedKey: 'dph.selected',
  blank: (list) => createPattern({ name: `Pattern ${list.length + 1}` }),
};

const ARRANGEMENTS = {
  api: arrangementApi,
  selectedKey: 'dph.selectedArrangement',
  blank: (list) => createArrangement({ name: `Arrangement ${list.length + 1}` }),
};

export const usePatternStore = () => useCollection(PATTERNS);
export const useArrangementStore = () => useCollection(ARRANGEMENTS);

// Hält alle Einträge einer Sammlung im Speicher (wenige KB) und speichert Änderungen sofort,
// entprellt pro Eintrag. Fehlgeschlagene Speicherungen werden wiederholt.
function useCollection({ api, selectedKey, blank }) {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | saved | saving | error | offline
  const itemsRef = useRef(items);
  const pending = useRef(new Map()); // id → timer
  itemsRef.current = items;

  const persist = useCallback(
    async (id, opts) => {
      clearTimeout(pending.current.get(id));
      pending.current.delete(id);
      const item = itemsRef.current.find((p) => p.id === id);
      if (!item) return;
      setStatus('saving');
      try {
        await api.save(item, opts);
        if (pending.current.size === 0) setStatus('saved');
      } catch {
        setStatus('error');
        if (!pending.current.has(id)) {
          pending.current.set(id, setTimeout(() => persist(id), RETRY_DELAY));
        }
      }
    },
    [api],
  );

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
        setItems(list);
        const stored = readSelected(selectedKey);
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
  }, [api, selectedKey, flush]);

  const select = useCallback(
    (id) => {
      setSelectedId(id);
      writeSelected(selectedKey, id);
    },
    [selectedKey],
  );

  const setLocal = (next) => {
    itemsRef.current = next;
    setItems(next);
  };

  const update = useCallback(
    (id, fn) => {
      setLocal(itemsRef.current.map((p) => (p.id === id ? fn(p) : p)));
      clearTimeout(pending.current.get(id));
      pending.current.set(id, setTimeout(() => persist(id), SAVE_DELAY));
      setStatus('saving');
    },
    [persist],
  );

  // Nur lokal ändern, ohne zu speichern (z. B. wenn der Server bereits aufgeräumt hat).
  const mapLocal = useCallback((fn) => setLocal(itemsRef.current.map(fn)), []);

  // source: Kopiervorlage (Duplizieren); extra: zusätzliche Felder für ein neues Element.
  const add = useCallback(
    async (source, extra) => {
      const base = source
        ? { ...source, name: `${source.name} (Kopie)`.slice(0, 60) }
        : { ...blank(itemsRef.current), ...extra };
      try {
        const created = await api.create(base);
        setLocal([...itemsRef.current, created]);
        select(created.id);
      } catch {
        setStatus('error');
      }
    },
    [api, blank, select],
  );

  const remove = useCallback(
    async (id) => {
      clearTimeout(pending.current.get(id));
      pending.current.delete(id);
      try {
        await api.remove(id);
      } catch {
        setStatus('error');
        return false;
      }
      const list = itemsRef.current;
      const index = list.findIndex((p) => p.id === id);
      const rest = list.filter((p) => p.id !== id);
      setLocal(rest);
      const neighbor = rest[Math.min(index, rest.length - 1)];
      if (neighbor) select(neighbor.id);
      else setSelectedId(null);
      return true;
    },
    [api, select],
  );

  const selected = items.find((p) => p.id === selectedId) ?? null;
  return { items, selected, status, select, update, mapLocal, add, remove };
}
