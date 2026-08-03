'use client';

/**
 * EmployeePicker — the people-equivalent of ProjectPicker. Replaces raw "Employee ID (uuid)"
 * inputs on HR/field forms (attendance, appraisal, timesheet) that no junior/field user could
 * fill. Fetches the real employee list once and returns the employee id. Pass `employees` to
 * skip the fetch.
 */

import { useEffect, useState } from 'react';
import { Select } from './kit';

export interface PickerEmployee {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
}

export default function EmployeePicker({
  value,
  onChange,
  employees: preloaded,
  placeholder = 'Select an employee…',
  disabled,
  style,
}: {
  value: string;
  onChange: (employeeId: string) => void;
  employees?: PickerEmployee[];
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const [employees, setEmployees] = useState<PickerEmployee[]>(preloaded ?? []);
  const [loading, setLoading] = useState(!preloaded);
  const [error, setError] = useState('');

  useEffect(() => {
    if (preloaded) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/hr/employees');
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Failed to load employees');
        const list: PickerEmployee[] = Array.isArray(data) ? data : (data.items ?? []);
        if (alive) setEmployees(list);
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

  const label = (e: PickerEmployee) => {
    const name = [e.firstName, e.lastName].filter(Boolean).join(' ').trim();
    return name || e.id;
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
      <option value="">{loading ? 'Loading employees…' : placeholder}</option>
      {employees.map((e) => (
        <option key={e.id} value={e.id}>
          {label(e)}
          {e.role ? ` · ${e.role}` : ''}
        </option>
      ))}
    </Select>
  );
}
