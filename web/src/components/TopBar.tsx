/**
 * Title bar: identity, global search, view mode, backend status.
 *
 * Search resolves against the server, which owns the full neuron table, so it
 * can match a FlyWire ID by prefix across all 138,639 entries rather than only
 * what the client happens to have indexed.
 */

import { useEffect, useRef, useState } from 'react';

import { useStore } from '../store/useStore';
import type { ViewMode } from '../types';
import {
  ProvenanceBadge,
  SegmentedControl,
  fmtFlywire,
} from './ui/primitives';

const MODES: { value: ViewMode; label: string; title: string }[] = [
  { value: 'anatomy', label: 'Anatomy', title: 'The fly, opaque. No neural data drawn.' },
  { value: 'xray', label: 'X-ray', title: 'Cuticle turns to glass; the connectome appears inside the head.' },
  { value: 'connections', label: 'Connectome', title: 'Measured synaptic connections between neurons.' },
  { value: 'active', label: 'Activity', title: 'Only neurons that fired in the loaded simulation.' },
  { value: 'propagation', label: 'Propagation', title: 'Spikes travelling along measured synapses.' },
  { value: 'local', label: 'Local', title: "The selected neuron's measured inputs and outputs." },
  { value: 'pathway', label: 'Pathway', title: 'A measured route between two neurons.' },
];

export function TopBar({ onOpenAbout }: { onOpenAbout: () => void }) {
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const backends = useStore((s) => s.backends);
  const config = useStore((s) => s.config);
  const serviceError = useStore((s) => s.serviceError);
  const debug = useStore((s) => s.debug);
  const toggleDebug = useStore((s) => s.toggleDebug);

  const backend = backends.find((b) => b.key === config.backend);

  return (
    <header
      className="hair-b flex items-center gap-3 px-3 shrink-0"
      style={{ height: 44, background: 'rgba(8,12,18,0.9)' }}
    >
      <div className="flex items-baseline gap-2 shrink-0">
        <span
          className="num"
          style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.14em' }}
        >
          FLY BRAIN LAB
        </span>
        <span className="num hidden lg:inline" style={{ fontSize: 9, color: 'var(--ink-faint)' }}>
          FlyWire 783
        </span>
      </div>

      <SearchBox />

      <div className="hidden xl:block shrink-0" style={{ width: 430 }}>
        <SegmentedControl options={MODES} value={viewMode} onChange={setViewMode} />
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onOpenAbout}
        className="num shrink-0"
        title="Data sources, what is measured and what is drawn"
        style={{
          background: 'transparent',
          border: '1px solid var(--hairline)',
          color: 'var(--ink-dim)',
          padding: '4px 8px',
          fontSize: 9.5,
          letterSpacing: '0.08em',
          cursor: 'pointer',
        }}
      >
        DATA SOURCES
      </button>

      <button
        type="button"
        onClick={toggleDebug}
        className="num shrink-0 hidden md:block"
        title="Frame rate, draw calls, neuron and edge counts"
        style={{
          background: debug ? 'rgba(125,211,252,0.15)' : 'transparent',
          border: `1px solid ${debug ? 'var(--focus)' : 'var(--hairline)'}`,
          color: debug ? 'var(--focus)' : 'var(--ink-faint)',
          padding: '4px 8px',
          fontSize: 9.5,
          letterSpacing: '0.08em',
          cursor: 'pointer',
        }}
      >
        DEBUG
      </button>

      <div
        className="hidden md:flex items-center gap-2 shrink-0 pl-3 hair-l"
        style={{ height: 24 }}
        title={serviceError ?? backend?.detail}
      >
        <span
          aria-hidden
          style={{
            width: 5,
            height: 5,
            borderRadius: 99,
            background: serviceError
              ? 'var(--inhibitory)'
              : backend?.available
                ? 'var(--measured)'
                : 'var(--simulated)',
          }}
        />
        <div className="leading-tight">
          <div className="num" style={{ fontSize: 10 }}>
            {serviceError ? 'Service offline' : `${backend?.label ?? '--'} ${backend?.device ?? ''}`}
          </div>
          <div className="num" style={{ fontSize: 8.5, color: 'var(--ink-faint)' }}>
            {serviceError ? 'simulation unavailable' : (backend?.status ?? '')}
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * Global search.
 *
 * Accepts a neuron index, a full or partial FlyWire ID, or a SEZ cell-type
 * name. Selecting a result focuses the camera on that neuron and opens the
 * inspector, which is the whole point of searching for one.
 */
function SearchBox() {
  const query = useStore((s) => s.searchQuery);
  const setQuery = useStore((s) => s.setSearchQuery);
  const runSearch = useStore((s) => s.runSearch);
  const results = useStore((s) => s.searchResults);
  const searching = useStore((s) => s.searching);
  const selectNeuron = useStore((s) => s.selectNeuron);
  const setViewMode = useStore((s) => s.setViewMode);

  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // debounce: a FlyWire ID is 18 characters and we do not want 18 requests
  useEffect(() => {
    const handle = setTimeout(() => void runSearch(query), 220);
    return () => clearTimeout(handle);
  }, [query, runSearch]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // "/" focuses search, the convention in every tool with a search box
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const choose = async (index: number) => {
    setOpen(false);
    await selectNeuron(index, true);
    if (useStore.getState().viewMode === 'anatomy') setViewMode('xray');
  };

  return (
    <div ref={boxRef} className="relative shrink-0" style={{ width: 'min(280px, 32vw)' }}>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search FlyWire ID, index, cell type"
        aria-label="Search neurons"
        className="num w-full"
        style={{
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid var(--hairline)',
          padding: '5px 8px',
          fontSize: 11,
          color: 'var(--ink)',
          outline: 'none',
        }}
      />
      {!query && (
        <kbd
          className="num absolute pointer-events-none"
          style={{ right: 7, top: 6, fontSize: 9, color: 'var(--ink-faint)' }}
        >
          /
        </kbd>
      )}

      {open && query.trim().length > 0 && (
        <div
          className="panel absolute left-0 right-0 z-50 mt-1 overflow-auto"
          style={{ maxHeight: 320 }}
        >
          {searching && results.length === 0 && (
            <div className="px-3 py-2" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
              Searching&hellip;
            </div>
          )}
          {!searching && results.length === 0 && (
            <div className="px-3 py-2" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
              No neuron matches &ldquo;{query}&rdquo;. Try a neuron index (0&ndash;138,638),
              a FlyWire ID, or a SEZ cell-type name such as <span className="num">aSG7</span>.
            </div>
          )}
          {results.map((hit) => (
            <button
              key={`${hit.kind}-${hit.neuronIndex}-${hit.label}`}
              type="button"
              onClick={() => void choose(hit.neuronIndex)}
              className="w-full text-left px-3 py-2 hair-b"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="num" style={{ fontSize: 11.5, color: 'var(--ink)' }}>
                  {hit.kind === 'cellType' ? hit.label : `Neuron #${hit.neuronIndex}`}
                </span>
                <ProvenanceBadge kind={hit.provenance} compact />
              </div>
              <div className="num" style={{ fontSize: 9.5, color: 'var(--ink-faint)' }}>
                {hit.kind === 'cellType'
                  ? `${hit.neuronCount} neurons · SEZ cell type`
                  : `${fmtFlywire(hit.flywireId)} · ${hit.match ?? ''}`}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
