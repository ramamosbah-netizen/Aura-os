import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const WEB_APP = join(ROOT, 'apps', 'web', 'app');
const WEB_COMPONENTS = join(ROOT, 'apps', 'web', 'components');
const OUTPUT_JSON = join(ROOT, 'docs', 'reports', '2026-08-16-ui-reconstruction-inventory.json');
const OUTPUT_CSV = join(ROOT, 'docs', 'reports', '2026-08-16-page-migration-matrix.csv');

const IGNORED_DIRS = new Set(['.git', '.next', 'dist', 'node_modules', 'coverage', 'test-results', 'playwright-report']);

function walk(root, predicate = () => true) {
  const files = [];
  if (!existsSync(root)) return files;
  for (const entry of readdirSync(root)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(path, predicate));
    else if (predicate(path)) files.push(path);
  }
  return files;
}

const text = (path) => readFileSync(path, 'utf8');
const slash = (path) => path.split(sep).join('/');
const countMatches = (source, regex) => [...source.matchAll(regex)].length;
const title = (value) => value
  .replace(/^\[|\]$/g, '')
  .replace(/[-_]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

function routeFromPage(path) {
  const rel = slash(relative(WEB_APP, path)).replace(/(?:^|\/)page\.tsx$/, '');
  return rel ? `/${rel}` : '/';
}

function targetSuiteFor(route) {
  if (route === '/' || route.startsWith('/crm/my-day')) return 'AURA Home';
  if (/^\/(workspace|views|inbox|notifications|documents|events)(\/|$)/.test(route)) return 'Workplace & Collaboration';
  if (/^\/(crm|tendering)(\/|$)/.test(route) && route !== '/crm/commercial') return 'Sales & Pre-Award';
  if (route === '/crm/commercial' || /^\/(contracts|subcontracts)(\/|$)/.test(route)) return 'Commercial & Contracts';
  if (/^\/(project|projects|engineering|site|quality|hse|commissioning|handover|compliance|doccontrol)(\/|$)/.test(route)) return 'Project Delivery';
  if (/^\/(procurement|inventory)(\/|$)/.test(route)) return 'Supply Chain';
  if (/^\/finance(\/|$)/.test(route)) return 'Finance';
  if (/^\/(amc|assets|fleet)(\/|$)/.test(route)) return 'Assets & Service';
  if (/^\/hr(\/|$)/.test(route)) return 'People & Organization';
  if (/^\/(intelligence|ai)(\/|$)/.test(route)) return 'Intelligence & Reporting';
  if (/^\/admin(\/|$)/.test(route)) return 'Administration & Governance';
  if (route === '/search') return 'Universal Work Layer';
  if (route === '/operations/overview') return 'Project Delivery';
  if (route === '/login') return 'System';
  return 'Cross-suite / review';
}

function currentAreaFor(route) {
  if (route === '/') return 'root';
  return route.split('/').filter(Boolean)[0]?.replace(/^\[|\]$/g, '') ?? 'root';
}

function pageKind(route) {
  if (route.includes('/print')) return 'print';
  if (/\/\[[^/]+\](?:\/[^/]+)?$/.test(route)) return 'record-detail';
  if (/\/(dashboard|overview|control)$/.test(route) || route === '/') return 'home-or-command-center';
  if (route.startsWith('/admin/')) return 'configuration';
  if (route === '/login') return 'authentication';
  return 'register-or-workspace';
}

function purposeFor(route, kind) {
  if (route === '/') return 'Personal work and attention entry point';
  if (route === '/project/[projectId]') return 'Project delivery command center in a stable project context';
  if (route === '/project/[projectId]/controls') return 'Canonical commercial and project-control view inside Project 360';
  if (route === '/projects/projects/[id]') return 'Compatibility redirect to canonical Project 360 controls';
  if (route === '/project/[projectId]/[area]') return 'Project-scoped delivery area register';
  if (route === '/operations/overview') return 'Cross-project delivery operations and supply-risk command center';
  const parts = route.split('/').filter(Boolean).filter((part) => !part.startsWith('[') && part !== 'print');
  const leaf = parts.at(-1) ?? 'home';
  if (kind === 'record-detail') return `${title(parts.at(-2) ?? leaf)} record detail and governed actions`;
  if (kind === 'print') return `${title(parts.at(-2) ?? leaf)} print output`;
  if (kind === 'configuration') return `${title(leaf)} administration and governance`;
  if (kind === 'home-or-command-center') return `${title(leaf)} status, attention and navigation`; 
  return `${title(leaf)} operational work surface`;
}

const USERS = {
  'AURA Home': 'All authorized users',
  'Workplace & Collaboration': 'All authorized users; managers; document controllers',
  'Sales & Pre-Award': 'Sales; estimators; sales managers; bid and tender teams',
  'Commercial & Contracts': 'Commercial; contracts; quantity surveyors; project managers; finance',
  'Project Delivery': 'Project managers; engineers; site; QA/QC; HSE; commissioning; document control',
  'Supply Chain': 'Procurement; store/warehouse; project managers; finance',
  Finance: 'Finance; commercial; approvers; executives',
  'Assets & Service': 'AMC/service; technicians; asset custodians; fleet',
  'People & Organization': 'HR; managers; employees; payroll',
  'Intelligence & Reporting': 'Executives; managers; governed AI operators',
  'Administration & Governance': 'Administrators; security; auditors; platform owners',
  'Universal Work Layer': 'All authorized users',
  System: 'Unauthenticated and authenticated users',
  'Cross-suite / review': 'NOT VERIFIED',
};

function contextFor(route) {
  if (route.startsWith('/project/')) return 'tenant + organization + project (URL-addressable)';
  if (/^\/(engineering|site|quality|hse|commissioning|handover|doccontrol|projects)(\/|$)/.test(route)) return 'tenant + organization; project filter varies by page';
  if (route === '/login') return 'none';
  return 'tenant + organization';
}

function nearestStateFile(page, filename) {
  let dir = dirname(page);
  while (dir.startsWith(WEB_APP)) {
    if (existsSync(join(dir, filename))) return slash(relative(ROOT, join(dir, filename)));
    if (dir === WEB_APP) break;
    dir = dirname(dir);
  }
  return null;
}

function resolveImportedFiles(page, source) {
  const files = [];
  const importRegex = /from\s+['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(importRegex)) {
    const spec = match[1];
    let base = null;
    if (spec.startsWith('@/')) base = join(ROOT, 'apps', 'web', spec.slice(2));
    else if (spec.startsWith('.')) base = resolve(dirname(page), spec);
    if (!base) continue;
    for (const candidate of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
      if (existsSync(candidate) && !files.includes(candidate)) files.push(candidate);
    }
  }
  return files;
}

function combinedSource(page) {
  const pageSource = text(page);
  const imports = resolveImportedFiles(page, pageSource);
  const sourceFiles = [page, ...imports];
  const sources = sourceFiles.map(text);
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const owner = sourceFiles[index];
    for (const match of source.matchAll(/from\s+['"]([^'"]+\.module\.css)['"]/g)) {
      const css = match[1].startsWith('.') ? resolve(dirname(owner), match[1]) : null;
      if (css && existsSync(css)) sources.push(text(css));
    }
  }
  return { pageSource, imports, source: sources.join('\n') };
}

function apiDependencies(source) {
  const values = source.match(/\/api\/[A-Za-z0-9_?=&/.[\]${}-]+/g) ?? [];
  return [...new Set(values.map((value) => value.replace(/[?&]$/, '')))].sort();
}

function componentNames(imports) {
  return imports
    .filter((path) => path.startsWith(WEB_COMPONENTS))
    .map((path) => slash(relative(WEB_COMPONENTS, path)).replace(/\.(tsx|ts)$/, ''))
    .sort();
}

function decisionFor(route, kind) {
  if (kind === 'print') return 'KEEP_AND_STANDARDIZE_PRINT';
  if (route === '/login') return 'KEEP_AND_REFINE';
  if (route === '/project/[projectId]') return 'RETAIN_REFERENCE_SLICE';
  if (route === '/project/[projectId]/controls') return 'RETAIN_CANONICAL_PROJECT_360_CONTROL_VIEW';
  if (route === '/operations/overview') return 'RETAIN_REFERENCE_SLICE_REVIEW_PLACEMENT';
  if (route === '/projects/projects/[id]') return 'COMPATIBILITY_REDIRECT_TO_PROJECT_360';
  if (route === '/projects/dashboard') return 'REBUILD_AS_PROJECT_SUITE_HOME';
  if (route === '/project/[projectId]/[area]') return 'REBUILD_WITH_SHARED_REGISTER';
  if (route === '/') return 'REBUILD_AS_AURA_HOME';
  if (route.startsWith('/admin/') && !route.includes('[id]')) return 'CONSOLIDATE_IN_ADMIN_SUITE';
  if (kind === 'record-detail') return 'REFACTOR_TO_RECORD_360_STANDARD';
  if (kind === 'home-or-command-center') return 'REBUILD_AS_SUITE_OR_FUNCTION_HOME';
  return 'REFACTOR_INCREMENTALLY';
}

function migrationWave(route, suite, decision) {
  if (route === '/' || route === '/workspace' || route === '/search' || route === '/notifications') return '3_GLOBAL_SHELL_AND_HOME';
  if (route === '/project/[projectId]' || route === '/project/[projectId]/controls' || route === '/projects/projects/[id]' || route === '/operations/overview') return '2_REFERENCE_PRIMITIVES';
  if (suite === 'Project Delivery') return '6_PROJECT_DELIVERY';
  if (['Sales & Pre-Award', 'Commercial & Contracts', 'Supply Chain', 'Finance'].includes(suite)) return '7_MAJOR_OFFICE_WORKFLOWS';
  if (['Assets & Service', 'People & Organization', 'Intelligence & Reporting', 'Administration & Governance', 'Workplace & Collaboration'].includes(suite)) return '8_REMAINING_SUITES';
  if (decision.includes('PRINT')) return '9_FULL_ROUTE_SWEEP';
  return '9_FULL_ROUTE_SWEEP';
}

function uxClass(signals, kind) {
  if (kind === 'print') return 'A_RETAIN';
  const weak = !signals.explicitStates || signals.responsive === 'NONE' || !signals.find || !signals.related;
  return weak ? 'B_EXISTS_UX_WEAK' : 'A_RETAIN_AND_INTEGRATE';
}

const pageFiles = walk(WEB_APP, (path) => path.endsWith(`${sep}page.tsx`)).sort();
const pages = pageFiles.map((page) => {
  const route = routeFromPage(page);
  const suite = targetSuiteFor(route);
  const kind = pageKind(route);
  const { pageSource, imports, source } = combinedSource(page);
  const loading = nearestStateFile(page, 'loading.tsx');
  const error = nearestStateFile(page, 'error.tsx');
  const signals = {
    loading: Boolean(loading),
    empty: /EmptyState|DataState|length\s*===?\s*0|No\s+[A-Za-z]/i.test(source),
    error: Boolean(error) || /DataStateNotice|ErrorState|\bcatch\b|\berror\b/i.test(source),
    forbidden: /forbidden|unauthori[sz]ed|\b403\b|DataStateNotice/i.test(source),
    search: /searchParams|\bsearch\b|table-query/i.test(source),
    filter: /\bfilter\b|filters|searchParams/i.test(source),
    sort: /\.sort\(|sortBy|sortDirection|table-query/i.test(source),
    pagination: /pagination|pageSize|\/paged|offset|AuraDataTable/i.test(source),
    savedViews: /SaveView|saved view|\/views/i.test(source),
    related: /RelatedRecords|related record|relationship|href=|<Link/i.test(source),
    recordShell: /RecordShell|RecordChrome|record-shell|ui\/record/i.test(source),
    accessibility: /aria-|role=|<main|<nav|<label|<table/i.test(source),
    responsive: /@media|useIsMobile|useMediaQuery/i.test(source) ? 'BREAKPOINT' : /clamp\(|minmax\(|auto-fit|auto-fill/i.test(source) ? 'FLUID_ONLY' : 'NONE',
  };
  signals.explicitStates = signals.loading && signals.empty && signals.error;
  signals.find = signals.search && signals.filter && (signals.sort || signals.pagination);

  const decision = decisionFor(route, kind);
  return {
    route,
    sourceFile: slash(relative(ROOT, page)),
    currentArea: currentAreaFor(route),
    targetSuite: suite,
    function: title(route.split('/').filter(Boolean).filter((part) => !part.startsWith('[')).at(-1) ?? 'Home'),
    purpose: purposeFor(route, kind),
    primaryUsers: USERS[suite] ?? 'NOT VERIFIED',
    permissions: route === '/login' ? 'Public authentication surface' : 'API guard-derived permissions; page-level visibility NOT VERIFIED',
    scope: contextFor(route),
    kind,
    apiDependencies: apiDependencies(source),
    workflowDependencies: /approve|reject|submit|transition|status|complete|close|issue|award/i.test(source) ? 'Detected in UI source; verify against domain state machine' : 'None detected / NOT VERIFIED',
    sharedComponents: componentNames(imports),
    loadingState: loading ?? 'MISSING',
    emptyState: signals.empty ? 'PRESENT_SIGNAL_NOT_VERIFIED' : 'MISSING',
    errorState: error ?? (signals.error ? 'INLINE_SIGNAL_NOT_VERIFIED' : 'MISSING'),
    forbiddenState: signals.forbidden ? 'PRESENT_SIGNAL_NOT_VERIFIED' : 'NOT_VERIFIED',
    search: signals.search ? 'PRESENT_SIGNAL_NOT_VERIFIED' : 'MISSING_OR_NA',
    filtering: signals.filter ? 'PRESENT_SIGNAL_NOT_VERIFIED' : 'MISSING_OR_NA',
    sorting: signals.sort ? 'PRESENT_SIGNAL_NOT_VERIFIED' : 'MISSING_OR_NA',
    pagination: signals.pagination ? 'PRESENT_SIGNAL_NOT_VERIFIED' : 'MISSING_OR_NA',
    savedViews: signals.savedViews ? 'PRESENT_SIGNAL_NOT_VERIFIED' : 'MISSING_OR_NA',
    responsive: signals.responsive,
    accessibility: signals.accessibility ? 'SEMANTIC_SIGNAL_NOT_VERIFIED' : 'NOT_VERIFIED',
    relatedRecords: signals.related ? 'LINK_SIGNAL_NOT_VERIFIED' : 'MISSING_OR_NA',
    record360: kind === 'record-detail' ? (signals.recordShell ? 'STANDARD_SIGNAL_PRESENT' : 'REQUIRED') : 'N/A_OR_REVIEW',
    mobileRequirement: suite === 'Project Delivery' || suite === 'Assets & Service' || suite === 'Supply Chain' ? 'HIGH_FOR_FIELD_ROUTES' : 'STANDARD',
    implementationState: 'IMPLEMENTED_PAGE_SURFACE',
    verificationState: 'NOT_VERIFIED_TO_PAGE_DOD',
    uxClass: uxClass(signals, kind),
    decision,
    migrationWave: migrationWave(route, suite, decision),
    directSourceLines: pageSource.split(/\r?\n/).length,
  };
});

const rootsForTs = ['apps', 'modules', 'core', 'shared', 'intelligence', 'packages'].map((part) => join(ROOT, part));
const sourceFiles = rootsForTs.flatMap((root) => walk(root, (path) => /\.(ts|tsx)$/.test(path)));
const controllerFiles = walk(join(ROOT, 'apps', 'api', 'src'), (path) => path.endsWith('.controller.ts'));
const controllerSource = controllerFiles.map(text).join('\n');
const migrationFiles = walk(join(ROOT, 'infrastructure', 'migrations'), (path) => path.endsWith('.sql'));
const sql = migrationFiles.map(text).join('\n');
const testFiles = sourceFiles.filter((path) => /\.(test|spec|e2e-spec)\.(ts|tsx)$/.test(path));
const packageFiles = ['apps', 'modules', 'core', 'shared', 'intelligence', 'packages']
  .flatMap((part) => walk(join(ROOT, part), (path) => path.endsWith(`${sep}package.json`)));
const modules = existsSync(join(ROOT, 'modules'))
  ? readdirSync(join(ROOT, 'modules')).filter((name) => statSync(join(ROOT, 'modules', name)).isDirectory())
  : [];
const adrs = walk(join(ROOT, 'docs'), (path) => /(?:^|[/\\])adr[^/\\]*\.md$/i.test(path) || /[/\\]adr[/\\].*\.md$/i.test(path));

const metrics = {
  measuredAt: new Date().toISOString(),
  gitCommit: process.env.GIT_COMMIT ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
  workspacePackages: packageFiles.length,
  businessModules: modules.length,
  tsTsxFiles: sourceFiles.length,
  apiControllers: controllerFiles.length,
  httpHandlerDecorators: countMatches(controllerSource, /@(Get|Post|Put|Patch|Delete|Options|Head)\s*\(/g),
  nextPages: pages.length,
  webTsxFiles: walk(join(ROOT, 'apps', 'web'), (path) => path.endsWith('.tsx')).length,
  sharedComponentTsxFiles: walk(WEB_COMPONENTS, (path) => path.endsWith('.tsx')).length,
  sqlMigrations: migrationFiles.length,
  createTableStatements: countMatches(sql, /\bCREATE\s+TABLE\b/gi),
  distinctCreatedTables: new Set([...sql.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([A-Za-z0-9_]+)/gi)].map((match) => match[1].toLowerCase())).size,
  indexDeclarations: countMatches(sql, /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/gi),
  foreignKeySignals: countMatches(sql, /\bREFERENCES\s+(?:public\.)?[A-Za-z0-9_]+/gi),
  rlsPolicies: countMatches(sql, /\bCREATE\s+POLICY\b/gi),
  testSpecFiles: testFiles.length,
  apiE2eFiles: walk(join(ROOT, 'apps', 'api', 'test'), (path) => path.endsWith('.e2e-spec.ts')).length,
  browserE2eFiles: walk(join(ROOT, 'apps', 'web', 'e2e'), (path) => path.endsWith('.spec.ts')).length,
  adrDocuments: adrs.length,
};

const suiteCounts = Object.fromEntries([...new Set(pages.map((page) => page.targetSuite))].sort().map((suite) => [suite, pages.filter((page) => page.targetSuite === suite).length]));
const decisionCounts = Object.fromEntries([...new Set(pages.map((page) => page.decision))].sort().map((decision) => [decision, pages.filter((page) => page.decision === decision).length]));

const inventory = {
  schemaVersion: 1,
  generatedBy: 'scripts/ui-reconstruction-inventory.mjs',
  methodology: 'Static current-tree inventory. Presence signals do not establish end-user completion; every page remains NOT_VERIFIED_TO_PAGE_DOD until its required verification chain passes.',
  metrics,
  suiteCounts,
  decisionCounts,
  pages,
};

const columns = [
  'route', 'sourceFile', 'currentArea', 'targetSuite', 'function', 'purpose', 'primaryUsers', 'permissions', 'scope', 'kind',
  'apiDependencies', 'workflowDependencies', 'sharedComponents', 'loadingState', 'emptyState', 'errorState',
  'forbiddenState', 'search', 'filtering', 'sorting', 'pagination', 'savedViews', 'responsive', 'accessibility',
  'relatedRecords', 'record360', 'mobileRequirement', 'implementationState', 'verificationState', 'uxClass', 'decision',
  'migrationWave', 'directSourceLines',
];
const csvCell = (value) => `"${String(Array.isArray(value) ? value.join(' | ') : value ?? '').replaceAll('"', '""')}"`;
const csv = [columns.join(','), ...pages.map((page) => columns.map((column) => csvCell(page[column])).join(','))].join('\n') + '\n';

writeFileSync(OUTPUT_JSON, JSON.stringify(inventory, null, 2) + '\n');
writeFileSync(OUTPUT_CSV, csv);

console.log(JSON.stringify({ metrics, suiteCounts, decisionCounts, outputs: [slash(relative(ROOT, OUTPUT_JSON)), slash(relative(ROOT, OUTPUT_CSV))] }, null, 2));
