// The employee schema now lives in @aura/shared so the API can enforce the same
// rules server-side (assertFormValid). Re-exported here to keep existing imports
// and the registerFormSchema('hr.employee', …) wiring in form-plugins.tsx intact.
export { employeeFormSchema } from '@aura/shared';
