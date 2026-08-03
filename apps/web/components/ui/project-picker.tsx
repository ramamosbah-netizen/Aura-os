'use client';

/**
 * ProjectPicker — the replacement for the raw "Project ID (uuid)" text inputs that made ~14
 * operational forms (Site / Quality / HSE / Engineering) unusable for a junior or field user,
 * who has no way to know a UUID. Fetches the real project list once and presents a native
 * picker keyed by project title; the caller receives the project id. Built on the shared kit
 * so it themes correctly. Pass `projects` to skip the fetch (e.g. from a server component).
 */

import { useEffect, useState } from 'react';
import { Select } from './kit';

export interface PickerProject {
  id: string;
  title: string;
  reference?: string | null;
  accountName?: string | null;
  status?: string | null;
}

export default function ProjectPicker({
  value,
  onChange,
  projects: preloaded,
  placeholder = 'Select a project…',
  disabled,
  style,
}: {
  value: string;
  onChange: (projectId: string) => void;
  projects?: PickerProject[];
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const [projects, setProjects] = useState<PickerProject[]>(preloaded ?? []);
  const [loading, setLoading] = useState(!preloaded);
  const [error, setError] = useState('');

  useEffect(() => {
    if (preloaded) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/projects/projects');
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Failed to load projects');
        const list: PickerProject[] = Array.isArray(data) ? data : (data.items ?? []);
        if (alive) setProjects(list);
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

  const label = (p: PickerProject) => (p.accountName ? `${p.title} — ${p.accountName}` : p.title);

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
      style={{ minWidth: 220, ...style }}
    >
      <option value="">{loading ? 'Loading projects…' : placeholder}</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {label(p)}
          {p.status ? ` (${p.status})` : ''}
        </option>
      ))}
    </Select>
  );
}
