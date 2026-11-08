import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("https://naechtigungen.pol.joanneum.at/**", route => route.fulfill({contentType:"application/json",body:'{"forecast_data":[]}'}));
  await page.route("https://api.open-meteo.com/**", route => route.fulfill({contentType:"application/json",body:'{"daily":{"time":[]}}'}));
});
async function selectAge(page: import("@playwright/test").Page, value: string) {
  await page.getByRole("button",{name:/Target audience age/}).click();
  await page.getByRole("option",{name:value.replace("-","–"),exact:true}).click();
}
const captionText = (text: string, min = 40) => text.length >= min ? text : (text + " Lass dich von einer neuen Alpenidee inspirieren. ".repeat(8)).slice(0,min);
const answer = (caption: string, language = "de", min = 40) => ({caption: captionText(caption,min), hashtags:["#Ischgl","#Alpen"], language, source:"ai"});
test("all markets and periods are ready without AI calls", async ({page}) => {
  let calls=0;
  await page.route("**/api/marketing/generate-caption", route => {calls++; return route.abort();});
  await page.goto("./");
  await expect(page.locator(".cp-caption-source")).toHaveText("Pre-generated AI caption");
  await expect(page.locator(".cp-caption-spinner")).toHaveCount(0);
  for(const period of ["q1-2027","q2-2027","q3-2027","q4-2027","winter-2026-27"]) {
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
  await expect(page.locator(".cp-caption-text")).toHaveText(captionText("Eine neue Alpenidee."));
  expect(calls).toBe(1);
  await expect(page.locator(".cp-caption-source")).toHaveText("AI generated");
  await expect(page.locator(".cp-plan-action")).not.toContainText("Approved locally");
  await page.getByRole("button",{name:"Copy caption"}).click();
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(captionText("Eine neue Alpenidee.")+"\n\n#Ischgl #Alpen");
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
  await expect(page.locator(".cp-caption-text")).toHaveText(captionText("Deutsche Winteridee."));
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
  await expect(page.locator(".cp-caption-text")).toHaveText(captionText("Eine gute Alpenidee."));
  await page.getByRole("button",{name:"Regenerate",exact:true}).click();
  await expect(page.locator(".cp-caption-error")).toBeVisible();
  await expect(page.locator(".cp-caption-text")).toHaveText(captionText("Eine gute Alpenidee."));
  await expect(page.locator(".cp-caption-source")).toHaveText("AI generated");
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
  await expect(page.locator(".cp-caption-text")).toHaveText(captionText("Winteridee."));
  await page.getByRole("combobox",{name:"Target travel period"}).selectOption("q2-2027");
  await expect(page.locator(".cp-caption-source")).toHaveText("Pre-generated AI caption");
  await page.getByRole("button",{name:"Regenerate",exact:true}).click();
  await expect(page.locator(".cp-caption-text")).toHaveText(captionText("Frühlingsidee."));
  await page.getByRole("combobox",{name:"Target travel period"}).selectOption("q1-2027");
  await expect(page.locator(".cp-caption-text")).toHaveText(captionText("Winteridee."));
  expect(requests).toHaveLength(2);expect(requests[1].season).toBe("spring");
});
test("age choices update targeting immediately, use generic preview and reach regeneration payload", async ({page}) => {
  const payloads: Record<string,unknown>[] = [];
  await page.route("**/api/marketing/generate-caption",route=>{
    const m=route.request().postDataJSON();payloads.push(m);
    return route.fulfill({contentType:"application/json",body:JSON.stringify(answer(`Alpenidee für ${m.ageMin}–${m.ageMax}.`, "de", m.targetCaptionLength.min))});
  });
  await page.goto("./");
  const select=page.getByRole("button",{name:/Target audience age/});
  await expect(select).toContainText("18–24");
  await select.click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveText(["18–24","25–34","35–44","45–60"]);
  await page.keyboard.press("Escape");
  const image = await page.locator(".cp-social-image").getAttribute("src");
  await selectAge(page,"45-60");
  expect(await page.locator(".cp-social-image").getAttribute("src")).not.toBe(image);
  await expect(page.locator(".cp-summary")).toContainText("Selected target audience");
  await expect(page.locator(".cp-summary")).toContainText("45–60 years");
  await expect(page.locator(".cp-reasoning")).toContainText("45–60");
  await expect(page.locator(".cp-caption-source")).toHaveText("Demo preview");
  await expect(page.getByText("Demo voice for ages 45–60 · Facebook. Regenerate for AI personalization.")).toBeVisible();
  expect(payloads).toHaveLength(0);
  await page.getByRole("button",{name:"Regenerate",exact:true}).click();
  await expect(page.locator(".cp-caption-text")).toHaveText(captionText("Alpenidee für 45–60.",180));
  expect(payloads[0].ageMin).toBe(45);expect(payloads[0].ageMax).toBe(60);
  expect(payloads[0].visualDescription).toContain("snow");
  await selectAge(page,"25-34");
  await expect(page.locator(".cp-caption-source")).toHaveText("Demo preview");
  await page.getByRole("button",{name:"Regenerate",exact:true}).click();
  await expect(page.locator(".cp-caption-text")).toHaveText(captionText("Alpenidee für 25–34.",80));
  await selectAge(page,"45-60");
  await expect(page.locator(".cp-caption-text")).toHaveText(captionText("Alpenidee für 45–60.",180));
  await selectAge(page,"18-24");
  await expect(page.locator(".cp-caption-source")).toHaveText("Pre-generated AI caption");
  expect(payloads).toHaveLength(2);
});
test("age switching during regeneration keeps each result with its exact audience", async ({page}) => {
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  await page.route("**/api/marketing/generate-caption",async route=>{
    expect(route.request().postDataJSON().ageMin).toBe(45);
    await gate;await route.fulfill({contentType:"application/json",body:JSON.stringify(answer("Eine einladende Alpenidee.","de",180))});
  });
  await page.goto("./");
  await selectAge(page,"45-60");
  await page.getByRole("button",{name:"Regenerate",exact:true}).click();
  await selectAge(page,"18-24");
  const initial=await page.locator(".cp-caption-text").innerText();release();
  await expect(page.locator(".cp-caption-text")).toHaveText(initial);
  await expect(page.locator(".cp-caption-source")).toHaveText("Pre-generated AI caption");
  await selectAge(page,"45-60");
  await expect(page.locator(".cp-caption-text")).toHaveText(captionText("Eine einladende Alpenidee.",180));
  await expect(page.locator(".cp-caption-source")).toHaveText("AI generated");
});
test("age instantly adapts platform icons, demo voice and length without making model calls", async ({page}) => {
  let calls=0;
  await page.route("**/api/marketing/generate-caption",route=>{calls++;return route.abort();});
  await page.goto("./");
  const seen=new Set<string>();
  for(const [age,platform,min,max] of [["18-24","TikTok",40,100],["25-34","Instagram",80,160],["35-44","Instagram",120,220],["45-60","Facebook",180,350]] as const) {
    await selectAge(page,age);
    await expect(page.locator(".cp-platform")).toContainText(platform);
    await expect(page.locator(`.cp-social-header [data-platform-icon="${platform}"]`)).toHaveCount(1);
    await expect(page.getByRole("region",{name:`Germany ${platform} post preview`,exact:true})).toBeVisible();
    const caption=await page.locator(".cp-caption-text").innerText();
    expect(Array.from(caption).length).toBeGreaterThanOrEqual(min);
    expect(Array.from(caption).length).toBeLessThanOrEqual(max);
    seen.add(caption);
  }
  expect(seen.size).toBe(4);expect(calls).toBe(0);
});
test("age dropdown opens below its trigger and supports keyboard selection and dismissal", async ({page}) => {
  await page.goto("./");
  const trigger=page.getByRole("button",{name:/Target audience age/});
  await trigger.focus();await page.keyboard.press("ArrowDown");
  const menu=page.getByRole("listbox",{name:"Target audience age"});
  await expect(menu).toBeVisible();
  const anchor=await trigger.boundingBox(), popup=await menu.boundingBox();
  expect(popup!.y).toBeGreaterThanOrEqual(anchor!.y+anchor!.height);
  expect(popup!.width).toBeCloseTo(anchor!.width,0);
  await page.keyboard.press("End");await page.keyboard.press("Enter");
  await expect(trigger).toContainText("45–60");await expect(menu).toHaveCount(0);
  await trigger.click();await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();await expect(menu).toHaveCount(0);
  await trigger.click();await page.getByRole("heading",{name:"Campaign overview",exact:true}).click();
  await expect(menu).toHaveCount(0);
});
test("all sixteen visual combinations load instantly, country preserves them and regeneration uses actual summer visual",async({page})=>{
  let requests:Record<string,unknown>[]=[];
  await page.route("**/api/marketing/generate-caption",route=>{
    const m=route.request().postDataJSON();requests.push(m);
    return route.fulfill({contentType:"application/json",body:JSON.stringify(answer("Eine Sommeridee am See.",m.language,m.targetCaptionLength.min))});
  });
  await page.goto("./");const images=new Set<string>();
  for(const period of ["q1-2027","q2-2027","q3-2027","q4-2027"]) {
    await page.getByRole("combobox",{name:"Target travel period"}).selectOption(period);
    for(const age of ["18-24","25-34","35-44","45-60"]) {
      await selectAge(page,age);
      const img=page.locator(".cp-social-image");
      await expect.poll(()=>img.evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      images.add((await img.getAttribute("src"))!);
      await expect(img).toHaveAttribute("alt",/AI-generated/);
    }
  }
  expect(images.size).toBe(16);expect(requests).toHaveLength(0);
  await page.getByRole("combobox",{name:"Target travel period"}).selectOption("q3-2027");
  await selectAge(page,"18-24");
  const source=await page.locator(".cp-social-image").getAttribute("src");
  await page.getByRole("button",{name:"Select Netherlands",exact:true}).click();
  await expect(page.locator(".cp-social-image")).toHaveAttribute("src",source!);
  await page.getByRole("button",{name:"Regenerate",exact:true}).click();
  await expect(page.locator(".cp-caption-source")).toHaveText("AI generated");
  expect(requests[0].assetId).toBe("summer-18-24");expect(requests[0].season).toBe("summer");
  expect(requests[0].activity).toBe("summer lake hiking");
  expect(requests[0].visualDescription).toContain("turquoise Alpine lake");
  await expect(page.locator(".cp-social-image")).toHaveAttribute("src",source!);
});
