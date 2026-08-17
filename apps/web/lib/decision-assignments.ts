export type DecisionActionRequired =
  | 'REVIEW'
  | 'APPROVAL'
  | 'ACKNOWLEDGEMENT'
  | 'SIGN_OFF'
  | 'COMMENT'
  | 'DECISION';

export type DecisionQueueState = 'PENDING' | 'AVAILABLE' | 'RETURNED' | 'WAITING' | 'COMPLETED';

export interface ApiDecisionItem {
  id: string;
  module: string;
  kind: string;
  title: string;
  detail: string;
  action: string;
  href: string;
  value: number | null;
  createdAt: string | null;
  actionRequired?: DecisionActionRequired;
  state?: 'PENDING';
  dueAt?: string | null;
  assignment?: 'ACCESSIBLE_NOT_ASSIGNED';
  authority?: 'SOURCE_DOMAIN';
  source?: 'DERIVED_DOMAIN_STATE';
  record?: { domain: string; type: string; id: string; href: string };
  workflowLookup?: 'NOT_CHECKED' | 'VERIFIED_LINK' | 'CONNECTED_NOT_LINKED' | 'DEFINITION_MISSING' | 'UNAVAILABLE';
  workflow?: WorkflowDecisionEvidence | null;
}

export interface WorkflowDecisionEvidence {
  instanceId: string;
  definitionKey: string;
  definitionName: string;
  aggregateType: string;
  currentState: string;
  status: 'open' | 'completed' | 'cancelled';
  updatedAt: string;
  linkage: 'VERIFIED_TYPE_AND_ID';
  historyCount: number;
  latestHistory: { action: string; at: string } | null;
  availableDecisions: Array<{
    action: string;
    to: string;
    permission: string;
    eligible: boolean | null;
    authorityCheck: 'PERMISSION_ONLY' | 'PERMISSION_AND_AMOUNT' | 'ACTOR_NOT_VERIFIED';
  }>;
}

export interface SharedDecisionDocument {
  document: {
    id: string;
    title: string;
    kind: string;
    aggregateType: string;
    aggregateId: string;
    currentVersion: number;
    createdAt?: string;
  };
  permissions: Array<{ permission: 'VIEW' | 'DOWNLOAD' | 'COMMENT' | 'EDIT' | 'SHARE' | 'APPROVE' }>;
  currentVersionFile?: {
    version: number;
    fileName: string;
    contentType: string;
    sizeBytes: number;
  };
}

export interface DecisionAssignment {
  key: string;
  id: string;
  domain: string;
  kind: string;
  title: string;
  detail: string;
  displayAction: string;
  actionRequired: DecisionActionRequired;
  href: string;
  value: number | null;
  createdAt: string | null;
  dueAt: string | null;
  state: DecisionQueueState;
  assignmentLabel: string;
  authorityLabel: string;
  source: 'DERIVED_DOMAIN_STATE' | 'DMS_PERMISSION';
  isFormalAssignment: boolean;
  workflowLookup: ApiDecisionItem['workflowLookup'];
  workflow: WorkflowDecisionEvidence | null;
  workflowLabel: string | null;
  tabKey?: string;
}

export function classifyAction(action: string): DecisionActionRequired {
  switch (action.toLowerCase()) {
    case 'review': return 'REVIEW';
    case 'approve':
    case 'pay': return 'APPROVAL';
    case 'activate':
    case 'certify': return 'SIGN_OFF';
    case 'acknowledge': return 'ACKNOWLEDGEMENT';
    case 'comment': return 'COMMENT';
    default: return 'DECISION';
  }
}

export function normalizeApiDecision(item: ApiDecisionItem): DecisionAssignment {
  const verifiedAction = item.workflow?.availableDecisions.find((action) => action.eligible === true);
  const deniedActions = item.workflow?.availableDecisions.filter((action) => action.eligible === false).length ?? 0;
  const workflowLabel = item.workflow
    ? verifiedAction
      ? `Workflow · ${item.workflow.currentState} · ${verifiedAction.authorityCheck === 'PERMISSION_AND_AMOUNT' ? 'permission + amount verified' : 'permission verified'}`
      : deniedActions > 0
        ? `Workflow · ${item.workflow.currentState} · current authority not verified`
        : `Workflow · ${item.workflow.currentState} · no formal action available`
    : null;
  return {
    key: `domain:${item.module}:${item.kind}:${item.id}`,
    id: item.id,
    domain: item.record?.domain ?? item.module,
    kind: item.record?.type ?? item.kind,
    title: item.title,
    detail: item.detail,
    displayAction: item.action,
    actionRequired: item.actionRequired ?? classifyAction(item.action),
    href: item.record?.href ?? item.href,
    value: item.value,
    createdAt: item.createdAt,
    dueAt: item.dueAt ?? null,
    state: item.state ?? 'PENDING',
    assignmentLabel: item.workflow ? 'Exact workflow link · personal assignment not verified' : 'Accessible queue · personal assignment not verified',
    authorityLabel: verifiedAction ? 'Current workflow authority verified' : 'Validated by source record when opened',
    source: 'DERIVED_DOMAIN_STATE',
    isFormalAssignment: true,
    workflowLookup: item.workflowLookup,
    workflow: item.workflow ?? null,
    workflowLabel,
    tabKey: undefined,
  };
}

export function normalizeSharedDocument(entry: SharedDecisionDocument): DecisionAssignment | null {
  const permissions = new Set(entry.permissions.map(({ permission }) => permission));
  const actionRequired = permissions.has('APPROVE') ? 'APPROVAL' : permissions.has('EDIT') ? 'REVIEW' : null;
  if (!actionRequired) return null;

  const { document } = entry;
  // Content bytes require DOWNLOAD. APPROVE deliberately implies VIEW only in the DMS policy,
  // so an approval grant must never silently become PDF/file access in this projection.
  const canDownload = permissions.has('DOWNLOAD') || permissions.has('EDIT');
  const isPdf = canDownload && entry.currentVersionFile?.contentType.split(';', 1)[0]?.trim().toLowerCase() === 'application/pdf';
  return {
    key: `document:${document.id}`,
    id: document.id,
    domain: 'Documents',
    kind: document.kind,
    title: document.title,
    detail: `${document.aggregateType} · Version ${document.currentVersion}`,
    displayAction: actionRequired === 'APPROVAL' ? 'Approval access' : 'Edit / review access',
    actionRequired,
    href: isPdf
      ? `/documents/${encodeURIComponent(document.id)}/pdf?version=${entry.currentVersionFile?.version ?? document.currentVersion}`
      : `/documents?record=${encodeURIComponent(document.id)}`,
    value: null,
    createdAt: document.createdAt ?? null,
    dueAt: null,
    state: 'AVAILABLE',
    assignmentLabel: 'Shared with me · workflow assignment not verified',
    authorityLabel: `${actionRequired === 'APPROVAL' ? 'APPROVE' : 'EDIT'} permission available in DMS`,
    source: 'DMS_PERMISSION',
    isFormalAssignment: false,
    workflowLookup: 'CONNECTED_NOT_LINKED',
    workflow: null,
    workflowLabel: null,
    tabKey: isPdf ? `document-pdf:${document.id}` : undefined,
  };
}

export function composeDecisionQueue(apiItems: ApiDecisionItem[] | null, documents: SharedDecisionDocument[] | null): DecisionAssignment[] {
  const decisions = (apiItems ?? []).map(normalizeApiDecision);
  const documentAccess = (documents ?? []).map(normalizeSharedDocument).filter((item): item is DecisionAssignment => item !== null);
  return [...decisions, ...documentAccess].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}
