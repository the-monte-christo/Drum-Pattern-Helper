import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { AudioEngine } from './audio/engine.js';
import { useArrangementStore, usePatternStore } from './store.js';
import { usePref } from './prefs.js';
import { appendItem, removePatternRefs, resolveItems } from '../shared/arrangement.js';
import { collectTags, matchesTags, sameTag, toggleTag } from '../shared/tags.js';
import { Topbar } from './components/Topbar.jsx';
import { ArrangementList, ListHead, PatternList, Segmented, Sidebar } from './components/Sidebar.jsx';
import { TagFilter } from './components/Tags.jsx';
import { PatternHeader } from './components/PatternHeader.jsx';
import { LayerGrid } from './components/LayerGrid.jsx';
import { Editor } from './components/Editor.jsx';
import { ArrangementHeader, Strand } from './components/ArrangementView.jsx';
import { Transport } from './components/Transport.jsx';

const NO_SOLO = new Set();
const isNarrow = () => window.matchMedia('(max-width: 900px)').matches;

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

// Tag-Filter einer Liste; Tags, die nicht mehr vorkommen, fallen aus dem Filter.
function useTagFilter(items) {
  const [filter, setFilter] = useState([]);
  const tags = useMemo(() => collectTags(items), [items]);
  const active = filter.filter((t) => tags.some((x) => sameTag(x, t)));
  return {
    tags,
    active,
    visible: items.filter((item) => matchesTags(item, active)),
    toggle: (tag) => setFilter(toggleTag(active, tag)),
    clear: () => setFilter([]),
  };
}

function EmptyState({ status, what, onAdd }) {
  return (
    <div class="empty-state">
      {status === 'loading' && <p>Lade {what} …</p>}
      {status === 'offline' && <p>Server nicht erreichbar. Bitte Verbindung prüfen.</p>}
      {status !== 'loading' && status !== 'offline' && (
        <>
          <p>Kein {what} ausgewählt.</p>
          <button type="button" class="btn" onClick={onAdd}>
            Neues {what} anlegen
          </button>
        </>
      )}
    </div>
  );
}

export function App() {
  const patterns = usePatternStore();
  const arrangements = useArrangementStore();
  const engine = useMemo(() => new AudioEngine(), []);
  const [tab, setTab] = usePref('tab', 'patterns');
  const [listCollapsed, setListCollapsed] = usePref('listCollapsed', false);
  const [editorOpen, setEditorOpen] = usePref('editorOpen', true);
  const [showVolume, setShowVolume] = usePref('showVolume', true);
  const [arrangeSide, setArrangeSide] = usePref('arrangeSide', 'arrangements'); // Liste im Arrangement-Tab
  const [master, setMaster] = usePref('master', 0.9);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [solo, setSolo] = useState(() => new Set());

  const pattern = patterns.selected;
  const arrangement = arrangements.selected;
  const inArrangement = tab === 'arrangements';
  const patternFilter = useTagFilter(patterns.items);
  const arrangementFilter = useTagFilter(arrangements.items);

  const patternsById = useMemo(() => new Map(patterns.items.map((p) => [p.id, p])), [patterns.items]);
  const entries = useMemo(
    () => (arrangement ? resolveItems(arrangement, patternsById) : []),
    [arrangement, patternsById],
  );
  const sequence = useMemo(() => {
    if (inArrangement) return entries.map((e) => e.pattern);
    return pattern ? [pattern] : [];
  }, [inArrangement, entries, pattern]);

  useEffect(() => engine.setSequence(sequence), [engine, sequence]);
  // Solo gilt nur in der Pattern-Ansicht, ein Arrangement spielt immer alle Layer.
  useEffect(() => engine.setSolo(inArrangement ? NO_SOLO : solo), [engine, solo, inArrangement]);
  useEffect(() => engine.setMasterVolume(master), [engine, master]);
  useWakeLock(playing);

  const stop = useCallback(() => {
    engine.stop();
    setPlaying(false);
  }, [engine]);

  const togglePlay = useCallback(() => {
    if (engine.playing) stop();
    else if (engine.hasContent) {
      engine.start();
      setPlaying(true);
    }
  }, [engine, stop]);

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
    if (!sequence.length && engine.playing) stop();
  }, [engine, sequence, stop]);

  const switchTab = (next) => {
    if (next === tab) return;
    stop();
    setTab(next);
  };

  const toggleList = () => {
    if (isNarrow()) setDrawerOpen((o) => !o);
    else setListCollapsed((c) => !c);
  };

  const editPattern = useCallback((fn) => pattern && patterns.update(pattern.id, fn), [pattern, patterns.update]);
  const editArrangement = useCallback(
    (fn) => arrangement && arrangements.update(arrangement.id, fn),
    [arrangement, arrangements.update],
  );

  const toggleSolo = useCallback((key) => {
    setSolo((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Neue Einträge bekommen die gerade gefilterten Tags, damit sie in der Liste sichtbar bleiben.
  const addPattern = () => {
    patterns.add(null, { tags: patternFilter.active });
    setDrawerOpen(false);
  };
  const addArrangement = () => {
    arrangements.add(null, { tags: arrangementFilter.active });
    setArrangeSide('arrangements');
    setDrawerOpen(false);
  };

  const deletePattern = async () => {
    if (!pattern || !window.confirm(`Pattern „${pattern.name}“ wirklich löschen?`)) return;
    const id = pattern.id;
    // Der Server entfernt das Pattern auch aus allen Arrangements – lokal nachziehen.
    if (await patterns.remove(id)) arrangements.mapLocal((a) => removePatternRefs(a, id));
  };

  const deleteArrangement = () => {
    if (arrangement && window.confirm(`Arrangement „${arrangement.name}“ wirklich löschen?`)) {
      arrangements.remove(arrangement.id);
    }
  };

  const counts = useMemo(() => {
    const map = new Map();
    for (const id of arrangement?.items ?? []) map.set(id, (map.get(id) ?? 0) + 1);
    return map;
  }, [arrangement]);

  const showPatternPicker = () => {
    setArrangeSide('patterns');
    if (isNarrow()) setDrawerOpen(true);
    else setListCollapsed(false);
  };

  const patternListSection = (mode) => (
    <>
      <TagFilter
        tags={patternFilter.tags}
        active={patternFilter.active}
        onToggle={patternFilter.toggle}
        onClear={patternFilter.clear}
      />
      <PatternList
        patterns={patternFilter.visible}
        selectedId={pattern?.id}
        mode={mode}
        counts={mode === 'add' ? counts : undefined}
        emptyText={patterns.items.length ? 'Kein Pattern passt zum Filter.' : 'Noch keine Pattern. Lege mit „Neu“ eins an.'}
        onPick={(p) => {
          if (mode === 'add') {
            editArrangement((a) => appendItem(a, p.id));
          } else {
            patterns.select(p.id);
            setDrawerOpen(false);
          }
        }}
      />
    </>
  );

  let sidebar;
  if (!inArrangement) {
    sidebar = (
      <>
        <ListHead title="Pattern" onAdd={addPattern} onClose={() => setDrawerOpen(false)} />
        {patternListSection('select')}
      </>
    );
  } else {
    sidebar = (
      <>
        <Segmented
          label="Liste"
          value={arrangeSide}
          onChange={setArrangeSide}
          options={[
            ['arrangements', 'Arrangements'],
            ['patterns', 'Pattern'],
          ]}
        />
        {arrangeSide === 'arrangements' ? (
          <>
            <ListHead title="Arrangements" onAdd={addArrangement} onClose={() => setDrawerOpen(false)} />
            <TagFilter
              tags={arrangementFilter.tags}
              active={arrangementFilter.active}
              onToggle={arrangementFilter.toggle}
              onClear={arrangementFilter.clear}
            />
            <ArrangementList
              arrangements={arrangementFilter.visible}
              patternsById={patternsById}
              selectedId={arrangement?.id}
              emptyText={
                arrangements.items.length
                  ? 'Kein Arrangement passt zum Filter.'
                  : 'Noch keine Arrangements. Lege mit „Neu“ eins an.'
              }
              onPick={(a) => {
                arrangements.select(a.id);
                setDrawerOpen(false);
              }}
            />
          </>
        ) : (
          <>
            <ListHead title="Pattern hinzufügen" onClose={() => setDrawerOpen(false)} />
            {arrangement ? (
              <>
                <p class="list-hint">Antippen hängt das Pattern hinten an „{arrangement.name}“ an.</p>
                {patternListSection('add')}
              </>
            ) : (
              <p class="empty-hint">Zuerst ein Arrangement anlegen oder auswählen.</p>
            )}
          </>
        )}
      </>
    );
  }

  let main;
  if (!inArrangement) {
    main = pattern ? (
      <>
        <PatternHeader
          pattern={pattern}
          status={patterns.status}
          tagSuggestions={patternFilter.tags}
          onEdit={editPattern}
          onDuplicate={() => patterns.add(pattern)}
          onDelete={deletePattern}
        />
        <div class="workspace">
          <LayerGrid
            pattern={pattern}
            engine={engine}
            playing={playing}
            solo={solo}
            showVolume={showVolume}
            onToggleVolume={() => setShowVolume((v) => !v)}
            onToggleSolo={toggleSolo}
            onEdit={editPattern}
          />
          <Editor pattern={pattern} open={editorOpen} onToggleOpen={() => setEditorOpen((o) => !o)} onEdit={editPattern} />
        </div>
        <Transport
          engine={engine}
          playing={playing}
          onTogglePlay={togglePlay}
          master={master}
          onMaster={setMaster}
          sub={`${pattern.beats}/4`}
        />
      </>
    ) : (
      <EmptyState status={patterns.status} what="Pattern" onAdd={addPattern} />
    );
  } else {
    main = arrangement ? (
      <>
        <ArrangementHeader
          arrangement={arrangement}
          status={arrangements.status}
          tagSuggestions={arrangementFilter.tags}
          onEdit={editArrangement}
          onDuplicate={() => arrangements.add(arrangement)}
          onDelete={deleteArrangement}
        />
        <div class="workspace">
          <Strand
            entries={entries}
            engine={engine}
            playing={playing}
            onEdit={editArrangement}
            onShowPatterns={showPatternPicker}
          />
        </div>
        <Transport
          engine={engine}
          playing={playing}
          disabled={!entries.length}
          onTogglePlay={togglePlay}
          master={master}
          onMaster={setMaster}
          sub={`${entries.length} Pattern`}
        />
      </>
    ) : (
      <EmptyState status={arrangements.status} what="Arrangement" onAdd={addArrangement} />
    );
  }

  return (
    <div class={`app${listCollapsed ? ' is-list-collapsed' : ''}`}>
      <Topbar tab={tab} onTab={switchTab} onToggleList={toggleList} listVisible={!listCollapsed} />
      <Sidebar
        label={inArrangement ? 'Arrangement-Liste' : 'Pattern-Liste'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        {sidebar}
      </Sidebar>
      <main class="main">{main}</main>
    </div>
  );
}
