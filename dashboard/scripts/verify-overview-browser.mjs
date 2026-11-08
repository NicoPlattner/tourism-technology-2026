// Explicit live verification; generates one caption through the configured provider.
// Start the real data API and app first. VERIFY_URL defaults to the local app.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const evidence=[]; const errors=[];
page.on('pageerror',error=>errors.push(error.message));
try {
 await page.goto(process.env.VERIFY_URL || 'http://127.0.0.1:5175/');
 await expect(page.locator('.cp-summary')).toContainText('135 days');
 await expect(page.locator('.cp-summary')).toContainText('61,143');
 evidence.push({context:'Germany February',summary:await page.locator('.cp-summary').innerText()});
 await page.getByRole('button',{name:'Select Netherlands',exact:true}).click();
 await expect(page.locator('.cp-summary')).toContainText('41,208');
 await page.getByLabel('Travel start date',{exact:true}).fill('2027-07-12');
 await page.getByLabel('Travel end date',{exact:true}).fill('2027-07-18');
 await expect(page.locator('.cp-summary')).toContainText('19 days');
 await expect(page.locator('.cp-summary')).toContainText('3,430');
 evidence.push({context:'Netherlands July',summary:await page.locator('.cp-summary').innerText()});
 const generated=page.waitForResponse(r=>r.url().includes('/api/marketing/generate-caption'),{timeout:30000});
 await page.getByRole('button',{name:'Regenerate',exact:true}).click();
 const response=await generated; const result=await response.json();
 expect(response.status(),JSON.stringify(result)).toBe(200);
 await expect(page.locator('.cp-reason-source')).toHaveText('AI reasoning');
 expect(result.campaignReasoning).toContain('19');
 expect(result.caption.toLowerCase()).toContain('juli');
 evidence.push({liveAI:result});
 await page.screenshot({path:'test-results/overview-real-api.png',fullPage:true});
 await page.getByRole('button',{name:'Select Germany',exact:true}).click();
 await expect(page.locator('.cp-reason-source')).toHaveText('Data summary');
 expect(errors).toEqual([]);
 await fs.writeFile('/tmp/live-browser-verification.json',JSON.stringify(evidence,null,2));
 console.log('Actual backend + live LLM browser flow passed (2 origins, 2 periods; no demand/AI mocks).');
} finally { await browser.close(); }
