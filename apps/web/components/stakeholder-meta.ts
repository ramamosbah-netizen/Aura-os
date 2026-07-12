// Shared labels/colors/options for the stakeholder dimensions — kept in one place
// so the Contacts register, Contact 360, and the Account 360 stakeholder map read
// identically. Mirrors StakeholderRole / RelationshipStrength in @aura/crm.

export const STAKEHOLDER_ROLE_LABEL: Record<string, string> = {
  decision_maker: 'Decision Maker',
  influencer: 'Influencer',
  technical: 'Technical',
  commercial: 'Commercial',
  finance: 'Finance',
  executive_sponsor: 'Executive Sponsor',
  user: 'User',
};

export const STAKEHOLDER_ROLE_OPTIONS = Object.entries(STAKEHOLDER_ROLE_LABEL).map(([value, label]) => ({ value, label }));

export const STRENGTH_LABEL: Record<string, string> = {
  champion: 'Champion',
  strong: 'Strong',
  neutral: 'Neutral',
  weak: 'Weak',
  detractor: 'Detractor',
};

export const STRENGTH_COLOR: Record<string, string> = {
  champion: 'var(--good)',
  strong: 'var(--good)',
  neutral: 'var(--muted)',
  weak: 'var(--warn, #d97706)',
  detractor: 'var(--bad)',
};

export const STRENGTH_OPTIONS = Object.entries(STRENGTH_LABEL).map(([value, label]) => ({ value, label }));
