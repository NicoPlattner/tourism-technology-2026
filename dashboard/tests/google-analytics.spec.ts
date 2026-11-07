import { expect, test, type Page } from "@playwright/test";

const PROPS = [
  { id: "111", name: "Ischgl Web", account: "TVB Paznaun-Ischgl" },
  { id: "333", name: "Galtür Web", account: "TVB Paznaun-Ischgl" },
  { id: "222", name: "Personal Blog", account: "Private" },
];

// Stubs Google sign-in and the Analytics APIs so the connect flow runs offline.
// Returns counters for logins (popups), revoked tokens and report requests.
async function mockGoogle(page: Page, properties = PROPS) {
  const calls = { logins: [] as string[], revoked: 0, reports: [] as string[] };
  await page.exposeFunction("__login", (prompt: string) => { calls.logins.push(prompt); });
  await page.exposeFunction("__revoke", () => { calls.revoked++; });
  await page.addInitScript(() => {
    const w = window as any;
    w.google = {
      accounts: {
        oauth2: {
          initTokenClient: (c: any) => ({
            requestAccessToken: (o: any) => { w.__login(o?.prompt ?? ""); setTimeout(() => c.callback({ access_token: "token-" + Math.random(), expires_in: 3600 }), 0); },
          }),
          hasGrantedAllScopes: () => true,
          revoke: () => w.__revoke(),
        },
      },
    };
  });
  const byAccount = new Map<string, typeof properties>();
  for (const p of properties) byAccount.set(p.account, [...(byAccount.get(p.account) ?? []), p]);
  await page.route("https://analyticsadmin.googleapis.com/**", (r) =>
    r.fulfill({ json: { accountSummaries: [...byAccount].map(([account, ps]) => ({ displayName: account, propertySummaries: ps.map((p) => ({ property: `properties/${p.id}`, displayName: p.name })) })) } }));
  await page.route("https://analyticsdata.googleapis.com/**", (r) => {
    const url = r.request().url();
    calls.reports.push(url);
    const dim = r.request().postDataJSON().dimensions?.[0]?.name;
    if (!dim) return r.fulfill({ json: { rows: [{ metricValues: [{ value: "3" }] }] } });
    const names = dim === "country" ? ["Netherlands", "Austria"] : ["Home", "Ski pass"];
    return r.fulfill({ json: { rows: names.map((n, i) => ({ dimensionValues: [{ value: n }], metricValues: [{ value: String(2 - i) }] })) } });
  });
  return calls;
}

const ids = (urls: string[]) => new Set(urls.map((u) => u.split("/properties/")[1].split(":")[0]));

test("one login adds several properties; picking is explicit; properties can be removed", async ({ page }) => {
  const calls = await mockGoogle(page);
  await page.goto("./#data");
  const connected = page.getByRole("list", { name: "Connected properties" });
  const picker = page.getByRole("group", { name: "Add properties" });

  await page.getByRole("button", { name: "Connect Google Analytics" }).click();
  await expect(picker.getByLabel("Ischgl Web")).toBeVisible();
  await expect(connected).toHaveCount(0);
  await expect(picker.getByRole("button", { name: "Add selected" })).toBeDisabled();
  expect(calls.reports).toHaveLength(0);

  await picker.getByLabel("Ischgl Web").check();
  await picker.getByLabel("Galtür Web").check();
  await picker.getByRole("button", { name: "Add selected (2)" }).click();
  await expect(connected.locator(":scope > li")).toHaveCount(2);
  await expect(page.getByText("Personal Blog")).toHaveCount(0);
  await expect(page.locator(".ga-data .ga-big")).toHaveText("3 active users");
  expect(ids(calls.reports)).toEqual(new Set(["111"]));
  expect(calls.reports.every((u) => u.endsWith(":runRealtimeReport"))).toBe(true);

  // Adding more reuses the login: no second popup, only unconnected properties offered.
  await page.getByRole("button", { name: "Add property" }).click();
  await expect(picker.getByLabel("Personal Blog")).toBeVisible();
  await expect(picker.getByLabel("Ischgl Web")).toHaveCount(0);
  await picker.getByLabel("Personal Blog").check();
  await picker.getByRole("button", { name: "Add selected (1)" }).click();
  await expect(connected.locator(":scope > li")).toHaveCount(3);
  expect(calls.logins).toEqual([""]);

  await page.getByRole("button", { name: "Remove Ischgl Web" }).click();
  await expect(connected.locator(":scope > li")).toHaveCount(2);
  await expect(connected.getByText("Ischgl Web")).toHaveCount(0);
  expect(calls.revoked).toBe(0); // the login is still used by the other properties

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(connected).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect Google Analytics" })).toBeVisible();
  expect(calls.revoked).toBe(1);
});

test("a single property still has to be picked; cancel and another Google account", async ({ page }) => {
  const calls = await mockGoogle(page, PROPS.slice(0, 1));
  await page.goto("./#data");
  const picker = page.getByRole("group", { name: "Add properties" });
  await page.getByRole("button", { name: "Connect Google Analytics" }).click();
  await expect(picker.getByLabel("Ischgl Web")).not.toBeChecked();
  await expect(page.getByRole("list", { name: "Connected properties" })).toHaveCount(0);
  await picker.getByRole("button", { name: "Use another Google account" }).click();
  await expect(picker.getByLabel("Ischgl Web")).toBeVisible();
  expect(calls.logins).toEqual(["", "select_account"]);
  await picker.getByRole("button", { name: "Cancel" }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Connected properties" })).toHaveCount(0);
});

test("the website data panel shows live users, countries and pages only", async ({ page }) => {
  await mockGoogle(page, PROPS.slice(0, 1));
  await page.goto("./#data");
  await expect(page.getByText("Connect a Google Analytics property to see its live data here.")).toBeVisible();
  await page.getByRole("button", { name: "Connect Google Analytics" }).click();
  await page.getByLabel("Ischgl Web").check();
  await page.getByRole("button", { name: "Add selected (1)" }).click();
  const data = page.locator(".ga-data");
  await expect(data.locator(".ga-big")).toHaveText("3 active users");
  await expect(data.getByText("Netherlands")).toBeVisible();
  await expect(data.getByText("Ski pass")).toBeVisible();
  await expect(data.getByText(/28 days|Sessions/)).toHaveCount(0);
});
