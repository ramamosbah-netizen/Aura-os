// Employee form schema — pure metadata (zero React), the single source of truth
// shared by the web renderer and the API's server-side enforcement (assertFormValid).
// Moved here from apps/web so the API can validate the same rules on submit.

import type { FormSchema } from '../schema';

export const employeeFormSchema: FormSchema = {
  id: 'hr.employee',
  entity: 'Employee',
  endpoint: '/api/hr/employees',
  subtitle: 'Register an employee profile with UAE visa, work permit, and labor camp details.',
  version: 1,
  fields: [
    { name: 'firstName', label: 'First name', kind: 'text', required: true, placeholder: 'John' },
    { name: 'lastName', label: 'Last name', kind: 'text', required: true, placeholder: 'Doe' },
    { name: 'role', label: 'Job title / role', kind: 'text', required: true, placeholder: 'e.g. Pipefitter, Site Engineer' },
    { name: 'department', label: 'Department', kind: 'text', required: true, placeholder: 'e.g. Operations, Corporate' },
    { name: 'joinedDate', label: 'Joined date', kind: 'date', required: true, defaultValue: '=TODAY()' },
    { name: 'visaExpiry', label: 'UAE visa expiry', kind: 'date' },
    { name: 'permitExpiry', label: 'Work permit expiry', kind: 'date' },
    { name: 'laborCamp', label: 'Labor camp designation', kind: 'text', placeholder: 'e.g. Sonapur Block C, Al Quoz 2', span: 2 },
    {
      name: 'email',
      label: 'Email address',
      kind: 'text',
      placeholder: 'john.doe@aura.com',
      validation: [{ type: 'custom', validator: 'email' }],
    },
    {
      name: 'phone',
      label: 'Phone number',
      kind: 'text',
      placeholder: '+971 50...',
      validation: [{ type: 'custom', validator: 'phone' }],
    },
  ],
  layout: [
    {
      type: 'tabs',
      id: 'employee-tabs',
      tabs: [
        {
          id: 'profile',
          label: 'Profile',
          children: [
            { type: 'field', name: 'firstName' },
            { type: 'field', name: 'lastName' },
            { type: 'field', name: 'role' },
            { type: 'field', name: 'department' },
            { type: 'field', name: 'joinedDate' },
          ],
        },
        {
          id: 'compliance',
          label: 'Compliance (UAE)',
          children: [
            { type: 'field', name: 'visaExpiry' },
            { type: 'field', name: 'permitExpiry' },
            { type: 'field', name: 'laborCamp' },
          ],
        },
        {
          id: 'contact',
          label: 'Contact',
          children: [
            { type: 'field', name: 'email' },
            { type: 'field', name: 'phone' },
          ],
        },
      ],
    },
  ],
  rules: [
    {
      id: 'permit-follows-visa',
      description: 'A visa without a permit expiry is usually a data-entry gap.',
      when: { all: [{ field: 'visaExpiry', op: 'notEmpty' }, { field: 'permitExpiry', op: 'empty' }] },
      actions: [{ type: 'warn', message: 'Visa expiry recorded without a work permit expiry — the permit usually expires with the visa.' }],
    },
    {
      id: 'camp-needs-visa-tracking',
      description: 'Camp-housed workers must be visa-tracked for compliance scans.',
      when: { all: [{ field: 'laborCamp', op: 'notEmpty' }, { field: 'visaExpiry', op: 'empty' }] },
      actions: [{ type: 'require', field: 'visaExpiry' }],
    },
  ],
};
