import { expect, test } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { scenario, signInAs, MEMBER, V1 } from './project-member-harness';
import { provisionedActorsUnavailable } from './provisioned-actors';

test('project member performs previously blocked drawing, document and handover actions in the browser', async ({browser,request,baseURL}) => {
  test.setTimeout(360_000);
  test.skip(
    (await provisionedActorsUnavailable(request)) !== null,
    (await provisionedActorsUnavailable(request)) ?? '',
  );
  const admin=apiAuthHeaders().Authorization;
  expect(admin,'Auth ON is mandatory for closure').toBeTruthy();
  const headers={Authorization:admin!};
  const overview=await request.get(`${V1}/admin/access`,{headers});
  expect(overview.ok()).toBe(true);
  const {roles,grants}=await overview.json();
  // The disposable database may retain a legacy org grant from an earlier browser run. Remove
  // every such grant before seeding the project-only fixture so the proof cannot pass through it.
  const staleOrgGrants=grants.filter((g:{userId:string;roleId:string;scope:{kind:string}})=>g.userId===MEMBER&&g.scope.kind==='org');
  for (const grant of staleOrgGrants) {
    const removed=await request.delete(`${V1}/admin/access/grants?userId=${encodeURIComponent(MEMBER)}&roleId=${encodeURIComponent(grant.roleId)}`,{headers});
    expect(removed.ok(),await removed.text()).toBe(true);
  }
  const cleanOverview=await request.get(`${V1}/admin/access`,{headers});
  const cleanGrants=(await cleanOverview.json()).grants as Array<{userId:string;scope:{kind:string}}>;
  expect(cleanGrants.filter((g)=>g.userId===MEMBER&&g.scope.kind==='org')).toEqual([]);
  const role=roles.find((r:{id:string})=>r.id==='r-site-engineer');
  // Explicit functional authority in this disposable fixture, still granted only on one project.
  // Restore the role afterwards; the standard delivery-role catalog has no engineering writer.
  const configured=await request.post(`${V1}/admin/access/roles`,{headers,data:{...role,permissions:[...role.permissions,'engineering.*','doccontrol.*']}});
  expect(configured.ok()).toBe(true);
  const context=await browser.newContext();
  const page=await context.newPage();
  try {
    const s=await scenario(request,admin!,['r-site-engineer','r-qa-qc','r-handover-fm'],'Closure');
    const drawing=await s.post<{id:string}>('/engineering/drawings',{projectId:s.mine.id,code:`CL-D-${s.run}`,title:'Scoped drawing'});
    const document=await s.post<{id:string}>('/doccontrol/register',{projectId:s.mine.id,documentNumber:`CL-DC-${s.run}`,title:'Scoped controlled document'});
    const code=`CL-CX-${s.run}`;
    const system=await s.post<{id:string}>('/commissioning/records',{projectId:s.mine.id,code,title:'Scoped CCTV',system:'cctv'});
    expect(await signInAs(page,baseURL!,MEMBER)).toBe(true);
    await page.goto(`/project/${s.mine.id}/drawings/${drawing.id}`);
    await expect(page.getByTestId('drawing-status')).toHaveText('Draft');
    await page.getByTestId('btn-submit').click();
    await expect(page.getByTestId('drawing-status')).toHaveText('Submitted');
    await page.getByTestId('btn-start-review').click();
    await expect(page.getByTestId('drawing-status')).toHaveText('Under Review');

    await page.goto(`/doccontrol/register/${document.id}`);
    await expect(page.getByTestId('active-status')).toHaveText('Draft');
    await page.getByTestId('btn-submit').click();
    await expect(page.getByTestId('active-status')).toHaveText('Submitted');

    await page.goto(`/handover?project=${s.mine.id}&section=om`);
    await page.getByTestId(`om-open-${code}`).click();
    await page.getByTestId(`om-seed-${code}`).click();
    await expect(page.getByTestId(`om-item-${code}-om_manual`)).toBeVisible();
    await expect(page.getByTestId('om-error')).toHaveCount(0);
    await page.getByTestId(`spares-open-${code}`).click();
    await page.getByTestId(`spare-description-${code}`).fill('Scoped spare camera');
    await page.getByTestId(`spare-quantity-${code}`).fill('1');
    await page.getByTestId(`spare-add-${code}`).click();
    await expect(page.getByTestId(`spares-system-${code}`)).toContainText('Scoped spare camera');
    await expect(page.getByTestId('spares-error')).toHaveCount(0);

    await page.goto(`/handover?project=${s.mine.id}&section=training`);
    await page.getByTestId('training-title').fill('Scoped client training');
    await page.getByTestId('training-system').selectOption(system.id);
    await page.getByTestId('training-plan').click();
    await expect(page.getByTestId('training-sessions')).toContainText('Scoped client training');
    await expect(page.getByTestId('training-error')).toHaveCount(0);
  } finally {
    await context.close();
    const restored=await request.post(`${V1}/admin/access/roles`,{headers,data:role});
    expect(restored.ok()).toBe(true);
  }
});
