'use client';

/**
 * AssetPicker — the fixed-asset equivalent of ProjectPicker/EmployeePicker. Replaces the last
 * raw "Asset ID (uuid)" input (asset-disposal) so the whole app is free of hand-typed UUIDs.
 * Fetches the real asset register once and returns the asset id, labelled by name + serial so a
 * user can actually recognise the item. Already-disposed assets are hidden by default (nothing
 * to dispose twice); pass `includeDisposed` to show them. Pass `assets` to skip the fetch.
 */

import { useEffect, useState } from 'react';
import { Select } from './kit';

export interface PickerAsset {
  id: string;
  name?: string | null;
  serialNumber?: string | null;
  category?: string | null;
  status?: string | null;
}

export default function AssetPicker({
  value,
  onChange,
  assets: preloaded,
  includeDisposed = false,
  placeholder = 'Select an asset…',
  disabled,
  style,
}: {
  value: string;
  onChange: (assetId: string) => void;
  assets?: PickerAsset[];
  includeDisposed?: boolean;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const [assets, setAssets] = useState<PickerAsset[]>(preloaded ?? []);
  const [loading, setLoading] = useState(!preloaded);
  const [error, setError] = useState('');

  useEffect(() => {
    if (preloaded) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/assets');
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Failed to load assets');
        const list: PickerAsset[] = Array.isArray(data) ? data : (data.items ?? []);
        if (alive) setAssets(list);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [preloaded]);

  const shown = includeDisposed ? assets : assets.filter((a) => a.status !== 'disposed');
  const label = (a: PickerAsset) => {
    const name = a.name?.trim() || a.id;
    return a.serialNumber ? `${name} — ${a.serialNumber}` : name;
  };

  if (error) {
    return (
      <Select value="" onChange={() => {}} disabled style={style}>
        <option>⚠ {error}</option>
      </Select>
    );
  }

  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || loading}
      style={{ minWidth: 200, ...style }}
    >
      <option value="">{loading ? 'Loading assets…' : placeholder}</option>
      {shown.map((a) => (
        <option key={a.id} value={a.id}>
          {label(a)}
          {a.category ? ` · ${a.category}` : ''}
        </option>
      ))}
    </Select>
  );
}
