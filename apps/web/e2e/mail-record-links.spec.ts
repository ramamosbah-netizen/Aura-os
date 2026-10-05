// AURA OS — MAIL-03…MAIL-07: a message is composed FROM a business record, carries the link, and is
// found again from both Communication and the record — and the link widens nothing. Auth ON, PostgreSQL.
//
// Communication could compose, send and thread mail and none of it could say what it was about: a
// message to a customer about a tender lived in somebody's mailbox and nowhere else. Proved here:
//
//   compose    from a customer, a contact, an enquiry, an opportunity, a tender, a supplier and a
//              project, each by the record's own "Email about this" — the composer says what the
//              message is about, and the sent message carries the link with the record's name
//   both ways  each record lists the message; the message shows the record it is about and opens it
//   recipient  the colleague it was sent to sees it on the record too
//   widens     a reader of the record who is NOT on the message sees nothing there
//   refused    someone who may not read a kind of record cannot link a message to one
import { expect, test, type Browser, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { memberPassword, signInAs } from './project-member-harness';
import { provisionedActorsUnavailable } from './provisioned-actors';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const RECIPIENT = 'u-e2e-salesmgr';

async function seat(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `${username} could not sign in`).toBe(true);
  return page;
}

interface SentMail { id: string; subject: string; state: string; links?: Array<{ recordType: string; recordId: string; recordLabel: string | null }> }

test('a message composed from each kind of record is linked to it, found from both sides, and seen only by those on it', async ({ browser, baseURL, page, request }) => {
  test.setTimeout(480_000);
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  test.skip(!memberPassword(), 'needs a password to sign the colleagues in');
  const unavailable = await provisionedActorsUnavailable(request);
  test.skip(unavailable !== null, unavailable ?? '');
  const run = Date.now().toString().slice(-6);
  const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
  const post = async <T>(path: string, data: unknown): Promise<T> => {
    const res = await request.post(`${API}${path}`, { headers, data });
    expect(res.ok(), `${path} — ${await res.text()}`).toBe(true);
    return res.json() as Promise<T>;
  };

  const account = await post<{ id: string; name: string }>('/crm/accounts', { name: `Marina Holdings ${run}` });
  const contact = await post<{ id: string; name: string }>('/crm/contacts', { name: `Hessa Al Marri ${run}`, accountId: account.id, accountName: account.name });
  const lead = await post<{ id: string; name: string }>('/crm/leads', { name: `CCTV enquiry ${run}` });
  const opportunity = await post<{ id: string; title: string }>('/crm/opportunities', { title: `Marina CCTV ${run}`, value: 120_000, executionType: 'direct_sale' });
  const tender = await post<{ id: string; title: string }>('/tendering/tenders', { title: `Marina access control ${run}`, value: 0 });
  const supplier = await post<{ id: string; name: string }>('/procurement/suppliers', { code: `SUP-${run}`, name: `Gulf Security ${run}`, category: 'materials' });
  const project = await post<{ id: string; title: string }>('/projects/projects', { title: `Marina delivery ${run}` });

  const records = [
    { type: 'crm.account', id: account.id, label: account.name, url: `/crm/accounts/${account.id}` },
    { type: 'crm.contact', id: contact.id, label: contact.name, url: `/crm/contacts/${contact.id}` },
    { type: 'crm.lead', id: lead.id, label: lead.name, url: `/crm/leads/${lead.id}` },
    { type: 'crm.opportunity', id: opportunity.id, label: opportunity.title, url: `/crm/opportunities/${opportunity.id}` },
    { type: 'tendering.tender', id: tender.id, label: tender.title, url: `/tendering/tenders/${tender.id}` },
    { type: 'procurement.supplier', id: supplier.id, label: supplier.name, url: '/procurement/suppliers' },
    { type: 'projects.project', id: project.id, label: project.title, url: `/project/${project.id}` },
  ] as const;

  /** The record's correspondence panel — a supplier's opens on its register row. */
  const openPanel = async (p: Page, record: (typeof records)[number]) => {
    await p.goto(record.url, { waitUntil: 'domcontentloaded' });
    if (record.type === 'procurement.supplier') {
      await expect(async () => {
        await p.getByTestId(`supplier-correspondence-${record.id}`).click();
        await expect(p.getByTestId('record-correspondence')).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 60_000 });
    }
    const panel = p.getByTestId('record-correspondence');
    await expect(panel).toBeVisible({ timeout: 60_000 });
    return panel;
  };

  const subjectOf = (type: string) => `About ${type} ${run}`;
  const sentFolder = async () => (await (await request.get(`${API}/comms/mailbox/folder/sent`, { headers: apiAuthHeaders() })).json()) as SentMail[];

  // ── COMPOSED FROM EACH RECORD, ON SCREEN ──────────────────────────────────────────────────────────
  for (const record of records) {
    const panel = await openPanel(page, record);
    await expect(panel.getByTestId('correspondence-empty')).toBeVisible({ timeout: 30_000 });
    await panel.getByTestId('correspondence-compose').click();
    await expect(page.getByTestId('mail-composer')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('mail-about'), `${record.type}: the composer says what it is about`).toContainText(record.label);
    const colleague = page.getByTestId('mail-colleague-select');
    await expect(colleague.locator(`option[value="${RECIPIENT}"]`)).toHaveCount(1, { timeout: 30_000 });
    await colleague.selectOption(RECIPIENT);
    await page.getByTestId('mail-subject').fill(subjectOf(record.type));
    await page.getByTestId('mail-body').fill(`Following up on ${record.label}.`);
    await page.getByTestId('mail-send-now').click();
    await expect(page.getByRole('status')).toContainText('Queued to send', { timeout: 30_000 });
  }

  // ── SENT, EACH CARRYING ITS LINK ──────────────────────────────────────────────────────────────────
  await expect.poll(async () => (await sentFolder()).filter((m) => m.subject.endsWith(run) && m.state === 'sent').length, { timeout: 90_000 }).toBe(records.length);
  const sent = (await sentFolder()).filter((m) => m.subject.endsWith(run));
  for (const record of records) {
    const mail = sent.find((m) => m.subject === subjectOf(record.type))!;
    expect(mail.links, record.type).toEqual([expect.objectContaining({ recordType: record.type, recordId: record.id, recordLabel: record.label })]);
  }

  // ── FOUND FROM THE RECORD, AND THE RECORD FROM THE MESSAGE ────────────────────────────────────────
  for (const record of records) {
    const panel = await openPanel(page, record);
    await expect(panel, `${record.type}: the record lists its message`).toContainText(subjectOf(record.type), { timeout: 30_000 });
  }
  const tenderMail = sent.find((m) => m.subject === subjectOf('tendering.tender'))!;
  await page.goto(`/my-work/communication?mail=${tenderMail.id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('mail-links')).toContainText(`Tender — ${tender.title}`, { timeout: 60_000 });
  await page.getByTestId('mail-link-tendering.tender').click();
  await expect(page).toHaveURL(new RegExp(`/tendering/tenders/${tender.id}`), { timeout: 60_000 });

  // ── THE RECIPIENT SEES IT ON THE RECORD; A READER WHO IS NOT ON IT DOES NOT ───────────────────────
  const recipient = await seat(browser, baseURL!, RECIPIENT);
  const outsider = await seat(browser, baseURL!, 'u-e2e-exec');
  try {
    const tenderRecord = records.find((r) => r.type === 'tendering.tender')!;
    await expect(await openPanel(recipient, tenderRecord), 'the colleague it was sent to').toContainText(subjectOf('tendering.tender'), { timeout: 30_000 });
    const accountRecord = records.find((r) => r.type === 'crm.account')!;
    const outsiderPanel = await openPanel(outsider, accountRecord);
    await expect(outsiderPanel.getByTestId('correspondence-empty'), 'a reader of the customer who is not on the message').toBeVisible({ timeout: 30_000 });
    await expect(outsiderPanel).not.toContainText(subjectOf('crm.account'));
  } finally {
    await recipient.context().close();
    await outsider.context().close();
  }

  // ── A KIND OF RECORD ONE MAY NOT READ CANNOT BE LINKED ────────────────────────────────────────────
  const salesLogin = await request.post(`${API}/auth/login`, { data: { username: 'u-e2e-sales', password: memberPassword() } });
  const salesToken = ((await salesLogin.json()) as { token: string }).token;
  const refused = await request.post(`${API}/comms/mailbox/drafts`, {
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${salesToken}` },
    data: { subject: `Probe ${run}`, relatedTo: [{ recordType: 'procurement.supplier', recordId: supplier.id }] },
  });
  expect(refused.status(), 'a Sales rep may not read suppliers, so cannot link to one').toBe(404);
});
