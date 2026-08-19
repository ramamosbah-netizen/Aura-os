import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DataStateNotice, { DataDegradedNotice, DataState } from './data-state';

describe('shared data-state contract', () => {
  it('keeps a failed read distinct from a genuinely empty register', () => {
    const failed = renderToStaticMarkup(
      <DataStateNotice error={{ kind: 'forbidden', status: 403 }} subject="projects" />,
    );
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('data-error-kind="forbidden"');

    const empty = renderToStaticMarkup(
      <DataState empty subject="projects"><span>content</span></DataState>,
    );
    expect(empty).toContain('data-data-state="no-records"');
    expect(empty).toContain('No projects yet');
  });

  it('labels filtered-empty and degraded states explicitly', () => {
    const filtered = renderToStaticMarkup(
      <DataState empty emptyKind="no-results" subject="projects"><span>content</span></DataState>,
    );
    expect(filtered).toContain('data-data-state="no-results"');
    expect(filtered).toContain('No matching projects');

    const degraded = renderToStaticMarkup(<DataDegradedNotice message="One source is unavailable." />);
    expect(degraded).toContain('data-data-state="degraded"');
    expect(degraded).toContain('role="status"');
  });

  it('gives loading precedence over error and empty', () => {
    const html = renderToStaticMarkup(
      <DataState loading empty error={{ kind: 'server', status: 500 }} subject="projects"><span>content</span></DataState>,
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('data-error-kind');
  });
});
