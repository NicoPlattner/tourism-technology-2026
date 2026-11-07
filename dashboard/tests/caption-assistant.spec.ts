import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("https://naechtigungen.pol.joanneum.at/**", route => route.fulfill({contentType:"application/json",body:'{"forecast_data":[]}'}));
  await page.route("https://api.open-meteo.com/**", route => route.fulfill({contentType:"application/json",body:'{"daily":{"time":[]}}'}));
});
const answer = (caption: string, language = "de") => ({caption, hashtags:["#Ischgl","#Alpen"], language, source:"ai"});
test("all markets and periods are ready without AI calls", async ({page}) => {
  let calls=0;
  await page.route("**/api/marketing/generate-caption", route => {calls++; return route.abort();});
  await page.goto("./");
  await expect(page.locator(".cp-caption-source")).toHaveText("Pre-generated AI caption");
  await expect(page.locator(".cp-caption-spinner")).toHaveCount(0);
  for(const period of ["q1-2027","q2-2027","winter-2026-27"]) {
    await page.getByRole("combobox",{name:"Target travel period"}).selectOption(period);
    for(const country of ["Germany","Netherlands","Belgium","Austria"]) {
      await page.getByRole("button",{name:`Select ${country}`,exact:true}).click();
      await expect(page.locator(".cp-caption-text")).not.toBeEmpty();
      await expect(page.locator(".cp-caption-source")).toHaveText("Pre-generated AI caption");
    }
  }
  expect(calls).toBe(0);
});
test("explicit regeneration preserves caption while pending, prevents duplicate requests, copies and invalidates approval", async ({page,context}) => {
  await context.grantPermissions(["clipboard-read","clipboard-write"]);
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>release=resolve);
  let calls=0;
  await page.route("**/api/marketing/generate-caption",async route=>{
    calls++; const m=route.request().postDataJSON();
    expect(m.country).toBe("Germany"); expect(m.language).toBe("de"); expect(m.ageMin).toBe(18);
    await gate;
    await route.fulfill({contentType:"application/json",body:JSON.stringify(answer("Eine neue Alpenidee."))});
  });
  await page.goto("./");
  const previous=await page.locator(".cp-caption-text").innerText();
  await page.getByRole("button",{name:"Review & Schedule"}).click();
  await page.getByRole("button",{name:"Approve mock campaign",exact:true}).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".cp-plan-action")).toContainText("Approved locally");
  await page.getByRole("button",{name:"Regenerate",exact:true}).click();
  await expect(page.getByRole("button",{name:"Regenerating caption"})).toBeDisabled();
  await expect(page.locator(".cp-caption-text")).toHaveText(previous);
  await expect(page.getByRole("button",{name:"Review & Schedule"})).toBeEnabled();
  release();
  await expect(page.locator(".cp-caption-text")).toHaveText("Eine neue Alpenidee.");
  expect(calls).toBe(1);
  await expect(page.locator(".cp-caption-source")).toHaveText("Live AI caption");
  await expect(page.locator(".cp-plan-action")).not.toContainText("Approved locally");
  await page.getByRole("button",{name:"Copy caption"}).click();
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe("Eine neue Alpenidee.\n\n#Ischgl #Alpen");
});
test("late response stays with its country and switching back restores it without requests",async({page})=>{
  let release!:()=>void; const gate=new Promise<void>(resolve=>release=resolve); let calls=0;
  await page.route("**/api/marketing/generate-caption",async route=>{calls++;await gate;await route.fulfill({contentType:"application/json",body:JSON.stringify(answer("Deutsche Winteridee."))});});
  await page.goto("./");
  await page.getByRole("button",{name:"Regenerate",exact:true}).click();
  await page.getByRole("button",{name:"Select Netherlands",exact:true}).click();
  const dutch=await page.locator(".cp-caption-text").innerText(); release();
  await expect(page.locator(".cp-caption-text")).toHaveText(dutch);
  await page.getByRole("button",{name:"Select Germany",exact:true}).click();
  await expect(page.locator(".cp-caption-text")).toHaveText("Deutsche Winteridee.");
  expect(calls).toBe(1);
});
test("failure preserves saved and live captions and allows retry",async({page})=>{
  let calls=0;
  await page.route("**/api/marketing/generate-caption",route=>{
    calls++; return route.fulfill(calls===2 ? {contentType:"application/json",body:JSON.stringify(answer("Eine gute Alpenidee."))} : {status:504,contentType:"application/json",body:JSON.stringify({error:{code:"PROVIDER_TIMEOUT",message:"AI generation timed out."}})});
  });
  await page.goto("./"); const original=await page.locator(".cp-caption-text").innerText();
  await page.getByRole("button",{name:"Regenerate",exact:true}).click();
  await expect(page.locator(".cp-caption-error")).toContainText("previous caption is unchanged");
  await expect(page.locator(".cp-caption-text")).toHaveText(original);
  await expect(page.locator(".cp-caption-source")).toHaveText("Pre-generated AI caption");
  await page.getByRole("button",{name:"Retry",exact:true}).click();
  await expect(page.locator(".cp-caption-text")).toHaveText("Eine gute Alpenidee.");
  await page.getByRole("button",{name:"Regenerate",exact:true}).click();
  await expect(page.locator(".cp-caption-error")).toBeVisible();
  await expect(page.locator(".cp-caption-text")).toHaveText("Eine gute Alpenidee.");
  await expect(page.locator(".cp-caption-source")).toHaveText("Live AI caption");
});
test("travel period isolates regenerated captions and sends current metadata without credentials",async({page})=>{
  const requests:Record<string,unknown>[]=[];
  await page.route("**/api/marketing/generate-caption",route=>{
    const m=route.request().postDataJSON();requests.push(m);
    expect(Object.keys(m).some(key=>/key|token|secret/i.test(key))).toBe(false);
    return route.fulfill({contentType:"application/json",body:JSON.stringify(answer(m.season==="spring"?"Frühlingsidee.":"Winteridee."))});
  });
  await page.goto("./");
  await page.getByRole("button",{name:"Regenerate",exact:true}).click();
  await expect(page.locator(".cp-caption-text")).toHaveText("Winteridee.");
  await page.getByRole("combobox",{name:"Target travel period"}).selectOption("q2-2027");
  await expect(page.locator(".cp-caption-source")).toHaveText("Pre-generated AI caption");
  await page.getByRole("button",{name:"Regenerate",exact:true}).click();
  await expect(page.locator(".cp-caption-text")).toHaveText("Frühlingsidee.");
  await page.getByRole("combobox",{name:"Target travel period"}).selectOption("q1-2027");
  await expect(page.locator(".cp-caption-text")).toHaveText("Winteridee.");
  expect(requests).toHaveLength(2);expect(requests[1].season).toBe("spring");
});
