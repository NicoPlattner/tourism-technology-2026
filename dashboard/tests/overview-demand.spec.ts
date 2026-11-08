import { test, expect } from '@playwright/test';
import { demandFixture, mockDemand } from './helpers/demand';
import { selectPeriod } from './helpers/travel';
test.beforeEach(async ({page})=>{
  await mockDemand(page);
  await page.route('https://naechtigungen.pol.joanneum.at/**',r=>r.fulfill({json:{forecast_data:[]}}));
  await page.route('https://api.open-meteo.com/**',r=>r.fulfill({json:{daily:{time:[]}}}));
});
test('date and country filters synchronize heatmap, stay, lead time and actual LLM request', async ({page})=>{
  const requests: any[]=[];
  await page.route('**/c04-api/query?**',route=>{
    const p=new URL(route.request().url()).searchParams; const summer=p.get('start')!.includes('-07-');
    return route.fulfill({json:demandFixture(p.get('origin')!,p.get('start')!,p.get('end')!,summer?{nights:850,stay:2.1,lead:19,holiday:'Summer holidays'}:{lead:135,stay:5.83,holiday:'Winter holidays'})});
  });
  await page.route('**/api/marketing/generate-caption',route=>{
    const m=route.request().postDataJSON(); requests.push(m);
    const summer=m.tourismContext.averageStayNights < 3;
    return route.fulfill({json:{source:'ai',assetId:m.candidateAssets[0].id,platform:m.platform.toLowerCase(),language:m.language,hashtags:['#Ischgl','#Paznaun'],
      caption:summer?'Kleine Auszeit, große Bergliebe. Komm mit nach Paznaun-Ischgl! 🐱':'Die Alpen rufen nach einer längeren Auszeit. Bereit für Paznaun-Ischgl? 🐱',
      creativeReason:'Das Bild passt zur ausgewählten Reisezeit.',campaignReasoning:summer?'For the July window, the estimated 2.1-night average suggests short-break inspiration. The 19-day lead-time proxy places promotion closer to arrival. Holiday overlap is a calendar association, not proof of demand.':'For the February window, an estimated 5.83-night average supports a longer-stay invitation. The 135-day lead-time proxy suggests earlier promotion. Winter holiday overlap is an association, not a proven cause.'}});
  });
  await page.goto('./');
  await expect(page.locator('.cp-summary')).toContainText('135 days');
  await expect(page.locator('.cp-summary')).toContainText('5.8 nights');
  await expect(page.locator('.cp-summary')).toContainText('3 Oct 2026');
  const de=page.getByRole('button',{name:'Select Germany',exact:true});
  await expect(de).toHaveAttribute('data-nights','61143');
  const winter=await de.evaluate(el=>getComputedStyle(el).fill);
  await page.getByRole('button',{name:'Select Netherlands',exact:true}).click();
  await expect(page.locator('.cp-summary')).toContainText('41,208');
  await page.getByRole('button',{name:'Select Germany',exact:true}).click();
  await page.getByRole('button',{name:'Regenerate',exact:true}).click();
  await expect(page.locator('.cp-reason-source')).toHaveText('AI reasoning');
  await expect(page.locator('.cp-reasoning > p:not(.cp-window-reason)')).toContainText('135-day');
  await expect(page.locator('.cp-caption-text')).toContainText('längeren Auszeit');
  await selectPeriod(page,'q3-2027');
  await expect(page.locator('.cp-summary')).toContainText('19 days');
  await expect(page.locator('.cp-summary')).toContainText('2.1 nights');
  await expect(de).toHaveAttribute('data-nights','850');
  expect(await de.evaluate(el=>getComputedStyle(el).fill)).not.toBe(winter);
  await expect(page.locator('.cp-reason-source')).toHaveText('Data summary');
  await page.getByRole('button',{name:'Regenerate',exact:true}).click();
  await expect(page.locator('.cp-caption-text')).toContainText('Kleine Auszeit');
  await expect(page.locator('.cp-reasoning > p:not(.cp-window-reason)')).toContainText('19-day');
  expect(requests).toHaveLength(2);
  expect(requests[1].tourismContext).toMatchObject({origin:'DE',start:'2027-07-12',leadTimeDays:19,averageStayNights:2.1,guestNights:850});
  expect(requests[1].tourismContext.reasons.join(' ')).toContain('Summer holidays');
  await page.screenshot({path:'test-results/overview-api-heatmap.png',fullPage:true});
});
test('loading and API failure expose no mock metrics; retry, empty and partial missing countries work',async({page})=>{
  let failing=true;
  await page.route('**/c04-api/query?**',async route=>{
    const p=new URL(route.request().url()).searchParams;
    if(failing)return route.fulfill({status:503,json:{detail:'unavailable'}});
    if(p.get('origin')==='62')return route.fulfill({status:404,json:{detail:'no data'}});
    return route.fulfill({json:demandFixture(p.get('origin')!,p.get('start')!,p.get('end')!,p.get('origin')==='AT'?{nights:0,stay:null}:{})});
  });
  await page.goto('./');
  await expect(page.getByRole('button',{name:'Retry demand data'})).toBeVisible();
  await expect(page.locator('.cp-summary')).not.toContainText('60 days');
  await expect(page.getByRole('button',{name:'Regenerate',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Review & Schedule'})).toBeDisabled();
  failing=false;
  await page.getByRole('button',{name:'Retry demand data'}).click();
  await expect(page.locator('.cp-summary')).toContainText('60 days');
  await page.getByRole('button',{name:'Select Belgium',exact:true}).click();
  await expect(page.locator('.cp-summary')).not.toContainText('60 days');
  await expect(page.getByRole('button',{name:'Regenerate',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Select Austria',exact:true}).click();
  await expect(page.locator('.cp-reasoning')).toContainText('No guest nights');
  await expect(page.getByRole('button',{name:'Select Austria',exact:true})).toHaveAttribute('data-nights','0');
});
test('late prior-period demand cannot overwrite a newer filter, and delayed AI stays with its request context',async({page})=>{
  let releaseAI!:()=>void; const aiGate=new Promise<void>(resolve=>releaseAI=resolve);
  await page.route('**/api/marketing/generate-caption',async route=>{
    const m=route.request().postDataJSON(); await aiGate;
    await route.fulfill({json:{source:'ai',assetId:m.candidateAssets[0].id,platform:'tiktok',language:'de',hashtags:['#Ischgl','#Paznaun'],caption:'Julipläne? Diese Katze ist bereit für Paznaun. Komm mit! 🐱',creativeReason:'Passende sommerliche Bildidee.',campaignReasoning:'Germany July evidence supports this specific campaign. The arrival-period lead-time proxy is 19 days, while the estimated average stay guides a few days of travel inspiration. These aggregate figures are not age-specific facts.'}});
  });
  let release!:()=>void; const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('**/c04-api/query?**',async route=>{
    const p=new URL(route.request().url()).searchParams;
    if(p.get('start')==='2027-04-12')await gate;
    await route.fulfill({json:demandFixture(p.get('origin')!,p.get('start')!,p.get('end')!,{lead:p.get('start')!.includes('-07-')?19:135})});
  });
  await page.goto('./'); await expect(page.locator('.cp-summary')).toContainText('135 days');
  await selectPeriod(page,'q2-2027');
  await expect(page.locator('.cp-summary')).not.toContainText('135 days');
  await expect(page.getByRole('button',{name:'Regenerate',exact:true})).toBeDisabled();
  await selectPeriod(page,'q3-2027');
  await expect(page.locator('.cp-summary')).toContainText('19 days'); release();
  await expect(page.locator('.cp-summary')).toContainText('19 days');
  await expect(page.locator('.cp-summary')).not.toContainText('Apr 2027');
  await page.getByRole('button',{name:'Regenerate',exact:true}).click();
  await expect(page.getByRole('button',{name:'Regenerating caption'})).toBeDisabled();
  await page.getByRole('button',{name:'Select Netherlands',exact:true}).click();
  await expect(page.locator('.cp-reason-source')).toHaveText('Data summary');
  const completed=page.waitForResponse(r=>r.url().includes('/api/marketing/generate-caption'));
  releaseAI(); await completed;
  await expect(page.locator('.cp-reason-source')).toHaveText('Data summary');
  await expect(page.locator('.cp-reasoning > p:not(.cp-window-reason)')).not.toContainText('Germany July evidence');
  await page.getByRole('button',{name:'Select Germany',exact:true}).click();
  await expect(page.locator('.cp-reasoning > p:not(.cp-window-reason)')).toContainText('Germany July evidence');
});
