// The quotation schema now lives in @aura/shared so the API can enforce the same
// rules server-side (assertFormValid). Re-exported to keep existing imports intact.
export { quotationFormSchema } from '@aura/shared';
