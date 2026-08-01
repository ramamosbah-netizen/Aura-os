'use client';

import { type CSSProperties, useEffect, useRef, useState } from 'react';

// The item picker on a pricing-sheet line. Type what you're pricing and it searches two real
// sources and offers them, each labelled with where it came from:
//
//   • CATALOGUE (Market Intelligence) — a benchmarked item. Picking it prefills the cost AND the
//     margin that reaches its benchmark sell, so a fair line is one click.
//   • PAST QUOTES — what this shop actually quoted this thing for before, with the spread. No cost
//     to prefill (history is a sell price, not a cost), so it fills the description and shows the
//     last price as a target to price toward.
//
// Provenance is shown on purpose: "catalogue, Hikvision offer" and "quoted 6× , last 780" are
// trustworthy in different ways, and hiding which is which is how a stale number gets reused.

export interface PickedItem {
  description: string;
  unitCost?: number;
  marginPercent?: number;
  /** Productivity from the Crew Library — install + commissioning hours per unit, and the crew. */
  hoursPerUnit?: number;
  crewSize?: number;
  /** A short provenance line to show under the row after a pick. */
  note?: string;
}

interface CatalogHit {
  id: string; name: string; brand: string | null; category: string;
  benchmarkCost: number; benchmarkSell: number; installHours: number; source: string | null; asOf: string;
  crewSize: number | null; commissioningHours: number | null;
}
interface HistoricHit { description: string; count: number; lastPrice: number; minPrice: number; maxPrice: number }

const money = (n: number): string => n.toLocaleString('en-AE', { maximumFractionDigits: 2 });
const marginOf = (cost: number, sell: number): number =>
  sell > 0 ? Math.round(((sell - cost) / sell) * 10) / 10 : 0;

export default function MarketItemPicker({ value, placeholder, onType, onPick, style }: {
  value: string;
  placeholder?: string;
  onType: (v: string) => void;
  onPick: (p: PickedItem) => void;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<CatalogHit[]>([]);
  const [historic, setHistoric] = useState<HistoricHit[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced dual search. A short query is not worth a round trip.
  useEffect(() => {
    const q = value.trim();
    if (timer.current) clearTimeout(timer.current);
    if (q.length < 2) { setCatalog([]); setHistoric([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        // ONE read — Product Knowledge is the single source (products + history together).
        const k = await fetch(`/api/crm/product-knowledge?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
          .then((r) => r.json()).catch(() => ({ products: [], history: [] }));
        setCatalog(Array.isArray(k.products) ? k.products.slice(0, 6) : []);
        setHistoric(Array.isArray(k.history) ? k.history.slice(0, 4) : []);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value]);

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent): void => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const hasHits = catalog.length > 0 || historic.length > 0;

  function pickCatalog(c: CatalogHit): void {
    // The Crew Library at work: labour is seeded with install + commissioning (making it WORK is
    // the half estimates forget) and the typical crew, alongside the benchmark cost + margin.
    const hours = c.installHours + (c.commissioningHours ?? 0);
    onPick({
      description: c.name,
      unitCost: c.benchmarkCost,
      marginPercent: marginOf(c.benchmarkCost, c.benchmarkSell),
      ...(hours > 0 ? { hoursPerUnit: hours } : {}),
      ...(c.crewSize ? { crewSize: c.crewSize } : {}),
      note: `Catalogue${c.brand ? ` · ${c.brand}` : ''} · sells ~${money(c.benchmarkSell)} · ${c.installHours}h install${c.commissioningHours ? ` + ${c.commissioningHours}h comm.` : ''}${c.crewSize ? ` · crew ${c.crewSize}` : ''}`,
    });
    setOpen(false);
  }
  function pickHistoric(h: HistoricHit): void {
    onPick({
      description: h.description,
      note: `Quoted ${h.count}×${h.count > 1 ? ` · ${money(h.minPrice)}–${money(h.maxPrice)}` : ''} · last ${money(h.lastPrice)}`,
    });
    setOpen(false);
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', ...style }}>
      <input
        value={value}
        onChange={(e) => { onType(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? 'Search the library or type an item…'}
        style={st.input}
        aria-label="item"
      />
      {open && (value.trim().length >= 2) && (hasHits || loading) && (
        <div style={st.menu}>
          {loading && !hasHits && <div style={st.empty}>Searching…</div>}
          {catalog.length > 0 && <div style={st.group}>Catalogue</div>}
          {catalog.map((c) => (
            <button key={c.id} type="button" style={st.opt} onClick={() => pickCatalog(c)}>
              <span style={st.optName}>{c.name}{c.brand ? <span style={st.brand}> · {c.brand}</span> : null}</span>
              <span style={st.optMeta}>cost {money(c.benchmarkCost)} · sell {money(c.benchmarkSell)} · {marginOf(c.benchmarkCost, c.benchmarkSell)}%</span>
            </button>
          ))}
          {historic.length > 0 && <div style={st.group}>Past quotes</div>}
          {historic.map((h) => (
            <button key={h.description} type="button" style={st.opt} onClick={() => pickHistoric(h)}>
              <span style={st.optName}>{h.description}</span>
              <span style={st.optMeta}>quoted {h.count}× · last {money(h.lastPrice)}{h.count > 1 ? ` · ${money(h.minPrice)}–${money(h.maxPrice)}` : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const st = {
  input: { background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border-strong, var(--border))', borderRadius: 7, color: 'var(--text, var(--fg))', padding: '7px 9px', fontSize: 13, width: '100%', boxSizing: 'border-box' } as CSSProperties,
  menu: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, background: 'var(--panel)', border: '1px solid var(--border-strong, var(--border))', borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.35)', overflow: 'hidden', maxHeight: 320, overflowY: 'auto' } as CSSProperties,
  group: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', padding: '7px 10px 3px' } as CSSProperties,
  opt: { display: 'flex', flexDirection: 'column', gap: 1, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderTop: '1px solid var(--border)', color: 'var(--text, var(--fg))', padding: '7px 10px', cursor: 'pointer' } as CSSProperties,
  optName: { fontSize: 12.5 } as CSSProperties,
  brand: { color: 'var(--muted)' } as CSSProperties,
  optMeta: { fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  empty: { padding: '10px', fontSize: 12, color: 'var(--muted)' } as CSSProperties,
};
