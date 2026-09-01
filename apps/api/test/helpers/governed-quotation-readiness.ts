import type request from 'supertest';

/**
 * Establish the persisted quotation-readiness evidence through the public, governed API.
 *
 * This is deliberately test infrastructure, not a production bypass: governed quotations must
 * carry a seeded evidence checklist and each required item must have recorded evidence before the
 * approval command is allowed to proceed.
 */
export async function establishGovernedQuotationReadiness(
  http: ReturnType<typeof request>,
  quotationId: string,
  referencePrefix: string,
): Promise<void> {
  await http.post('/api/v1/document-requirements/seed')
    .send({ entityType: 'crm.quotation', entityId: quotationId })
    .expect(201);

  const listed = (await http
    .get(`/api/v1/document-requirements?entityType=crm.quotation&entityId=${quotationId}`)
    .expect(200)).body as {
      requirements: Array<{ id: string; type: string; requiredCount: number }>;
    };

  for (const requirement of listed.requirements) {
    for (let index = 0; index < requirement.requiredCount; index += 1) {
      await http.post(`/api/v1/document-requirements/${requirement.id}/evidence`)
        .send({
          type: requirement.type === 'VENDOR_QUOTE' ? 'EXTERNAL_REFERENCE' : 'DOCUMENT_ID',
          reference: `${referencePrefix}-${requirement.type}-${index + 1}`,
        })
        .expect(201);
    }
  }
}
