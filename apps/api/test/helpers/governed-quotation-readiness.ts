import type request from 'supertest';

/**
 * Establish the persisted quotation-readiness evidence through the public, governed API.
 *
 * This is deliberately test infrastructure, not a production bypass: governed quotations must
 * carry a seeded evidence checklist and each required item must have recorded evidence before the
 * approval command is allowed to proceed.
 *
 * VENDOR_QUOTE IS NOT TYPED IN. On an offer raised from a tender it is COMPUTED from the tender's
 * governed supplier quotations, and hand-attached evidence is refused (409): "an unmet requirement is
 * excused only by a reasoned waiver from the person who answers for the decision". The tenders these
 * fixtures build are never put to suppliers — the supplier path is proved in
 * apps/web/e2e/tender-real-supply-path.spec.ts — so it takes that governed exception: a reasoned
 * waiver by `waiverActor`, who must not be the offer's preparer (the waiver refuses the preparer too).
 * The same shape as satisfyOfferChecklist in governed-tender.fixture.ts.
 */
export async function establishGovernedQuotationReadiness(
  http: ReturnType<typeof request>,
  quotationId: string,
  referencePrefix: string,
  /** Who answers for the decision — NOT the preparer. Sent as the x-e2e-actor of the waiver. */
  waiverActor: string,
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
    if (requirement.type === 'VENDOR_QUOTE') {
      const waived = await http.post(`/api/v1/document-requirements/${requirement.id}/waive`)
        .set('x-e2e-actor', waiverActor)
        .send({ reason: 'e2e fixture: this tender was not put to suppliers; the supplier path is proved elsewhere' });
      if (waived.status !== 201) {
        throw new Error(`waiving VENDOR_QUOTE as ${waiverActor} → ${waived.status} ${JSON.stringify(waived.body)}`);
      }
      continue;
    }
    for (let index = 0; index < requirement.requiredCount; index += 1) {
      const res = await http.post(`/api/v1/document-requirements/${requirement.id}/evidence`)
        .send({ type: 'DOCUMENT_ID', reference: `${referencePrefix}-${requirement.type}-${index + 1}` });
      // Say WHICH requirement refused and why: a bare "expected 201, got 409" hid the rule.
      if (res.status !== 201) {
        throw new Error(`evidence for ${requirement.type} → ${res.status} ${JSON.stringify(res.body)}`);
      }
    }
  }
}
