import { randomUUID } from 'node:crypto';

export interface Employee {
  id: string;
  tenantId: string;
  companyId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: string;
  department: string;
  /** Reporting line — the employee's manager (self-referential); null = top of the org tree. */
  managerId: string | null;
  status: 'active' | 'suspended' | 'terminated';
  joinedDate: string; // YYYY-MM-DD
  visaExpiry: string | null; // YYYY-MM-DD
  permitExpiry: string | null; // YYYY-MM-DD
  laborCamp: string | null;
  // WPS (UAE Wage Protection System) payout details:
  iban: string | null;            // employee salary IBAN
  molEmployeeId: string | null;   // MoHRE/labour-card person id
  bankRoutingCode: string | null; // routing code of the employee's bank/exchange agent
  createdAt: string;
  updatedAt: string;
}

export interface NewEmployee {
  tenantId: string;
  companyId?: string | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  department: string;
  managerId?: string | null;
  status?: Employee['status'];
  joinedDate: string;
  visaExpiry?: string | null;
  permitExpiry?: string | null;
  laborCamp?: string | null;
  iban?: string | null;
  molEmployeeId?: string | null;
  bankRoutingCode?: string | null;
}

export function makeEmployee(input: NewEmployee): Employee {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: input.email ? input.email.trim().toLowerCase() : null,
    phone: input.phone ? input.phone.trim() : null,
    role: input.role.trim(),
    department: input.department.trim(),
    managerId: input.managerId ?? null,
    status: input.status ?? 'active',
    joinedDate: input.joinedDate,
    visaExpiry: input.visaExpiry ?? null,
    permitExpiry: input.permitExpiry ?? null,
    laborCamp: input.laborCamp ? input.laborCamp.trim() : null,
    iban: input.iban ? input.iban.trim().toUpperCase().replace(/\s+/g, '') : null,
    molEmployeeId: input.molEmployeeId ? input.molEmployeeId.trim() : null,
    bankRoutingCode: input.bankRoutingCode ? input.bankRoutingCode.trim() : null,
    createdAt: now,
    updatedAt: now,
  };
}
