import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { AudioEngine } from './audio/engine.js';
import { usePatternStore } from './store.js';
import { Sidebar } from './components/Sidebar.jsx';
import { PatternHeader } from './components/PatternHeader.jsx';
import { LayerGrid } from './components/LayerGrid.jsx';
import { Editor } from './components/Editor.jsx';
import { Transport } from './components/Transport.jsx';
import { Icon } from './components/ui.jsx';

const MASTER_KEY = 'dph.master';

function readMaster() {
  try {
    const v = Number(localStorage.getItem(MASTER_KEY));
    return localStorage.getItem(MASTER_KEY) !== null && Number.isFinite(v) ? v : 0.9;
  } catch {
    return 0.9;
  }
}

// Bildschirm beim Üben nicht abdunkeln lassen.
function useWakeLock(active) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return undefined;
    let lock = null;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        // z. B. Energiesparmodus – kein Problem.
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && acquire();
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

export function App() {
  const store = usePatternStore();
  const engine = useMemo(() => new AudioEngine(), []);
  const [playing, setPlaying] = useState(false);
  const [solo, setSolo] = useState(() => new Set());
  const [master, setMaster] = useState(readMaster);
  const [listOpen, setListOpen] = useState(false);
  const pattern = store.selected;

  useEffect(() => engine.setPattern(pattern), [engine, pattern]);
  useEffect(() => engine.setSolo(solo), [engine, solo]);
  useEffect(() => {
    engine.setMasterVolume(master);
    try {
      localStorage.setItem(MASTER_KEY, String(master));
    } catch {
      // nur Komfort
    }
  }, [engine, master]);
  useWakeLock(playing);

  const togglePlay = useCallback(() => {
    if (engine.playing) {
      engine.stop();
      setPlaying(false);
    } else if (engine.pattern) {
      engine.start();
      setPlaying(true);
    }
  }, [engine]);

  // Leertaste = Play/Stop wie in jeder DAW (außer beim Tippen in Textfeldern).
  const toggleRef = useRef(togglePlay);
  toggleRef.current = togglePlay;
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      const t = e.target;
      if (t instanceof HTMLInputElement && t.type === 'text') return;
      if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      e.preventDefault();
      toggleRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!pattern && engine.playing) {
      engine.stop();
      setPlaying(false);
    }
  }, [engine, pattern]);

  const edit = useCallback((fn) => pattern && store.update(pattern.id, fn), [pattern, store.update]);

  const toggleSolo = useCallback((key) => {
    setSolo((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectPattern = (id) => {
    store.select(id);
    setListOpen(false);
  };

  const deletePattern = () => {
    if (pattern && window.confirm(`Pattern „${pattern.name}“ wirklich löschen?`)) store.remove(pattern.id);
  };

  return (
    <div class="app">
      <Sidebar
        patterns={store.patterns}
        selectedId={pattern?.id}
        onSelect={selectPattern}
        onAdd={() => {
          store.add();
          setListOpen(false);
        }}
        open={listOpen}
        onClose={() => setListOpen(false)}
      />

      <main class="main">
        {pattern ? (
          <>
            <PatternHeader
              pattern={pattern}
              status={store.status}
              onEdit={edit}
              onDuplicate={() => store.add(pattern)}
              onDelete={deletePattern}
              onOpenList={() => setListOpen(true)}
            />
            <div class="workspace">
              <LayerGrid
                pattern={pattern}
                engine={engine}
                playing={playing}
                solo={solo}
                onToggleSolo={toggleSolo}
                onEdit={edit}
              />
              <Editor pattern={pattern} onEdit={edit} />
            </div>
            <Transport
              engine={engine}
              playing={playing}
              onTogglePlay={togglePlay}
              master={master}
              onMaster={setMaster}
              beats={pattern.beats}
            />
          </>
        ) : (
          <div class="empty-state">
            <button type="button" class="icon-btn drawer-open" aria-label="Pattern-Liste öffnen" onClick={() => setListOpen(true)}>
              <Icon name="menu" />
            </button>
            {store.status === 'loading' && <p>Lade Pattern …</p>}
            {store.status === 'offline' && <p>Server nicht erreichbar. Bitte Verbindung prüfen.</p>}
            {store.status !== 'loading' && store.status !== 'offline' && (
              <>
                <p>Kein Pattern ausgewählt.</p>
                <button type="button" class="btn" onClick={() => store.add()}>
                  Neues Pattern anlegen
                </button>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
