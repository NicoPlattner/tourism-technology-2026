import { expect, test, type Page } from "@playwright/test";

type Prop = { id: string; name: string; account: string };
const ACCOUNTS: Record<string, { email: string; props: Prop[] }> = {
  "user-1": {
    email: "nico@example.com",
    props: [
      { id: "111", name: "Ischgl Web", account: "TVB Paznaun-Ischgl" },
      { id: "333", name: "Galtür Web", account: "TVB Paznaun-Ischgl" },
    ],
  },
  "user-2": { email: "private@example.com", props: [{ id: "222", name: "Personal Blog", account: "Private" }] },
};

// A fake Demand Radar API (same contract as server/server.mjs) plus a stub of
// Google's code-flow popup. Each sign-in returns a code for `nextUser`.
async function mockServer(page: Page, opts: { configured?: boolean; accounts?: Record<string, { email: string; props: Prop[] }> } = {}) {
  const accounts = opts.accounts ?? ACCOUNTS;
  const state = { configured: opts.configured ?? true, accounts: [] as { id: string; email: string; error?: string }[], connections: [] as { property: Prop; accountId: string }[] };
  const calls = { signIns: [] as { select_account?: boolean; login_hint?: string }[], realtime: [] as string[], nextUser: "user-1" };
  await page.exposeFunction("__signIn", (o: { select_account?: boolean; login_hint?: string }) => { calls.signIns.push(o); return `code-${calls.nextUser}`; });
  await page.addInitScript(() => {
    const w = window as any;
    w.google = { accounts: { oauth2: { initCodeClient: (c: any) => ({ requestCode: async () => c.callback({ code: await w.__signIn({ select_account: c.select_account, login_hint: c.login_hint }) }) }) } } };
  });
  await page.route(/\/api\/ga/, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^.*\/api/, "");
    const method = req.method();
    const ok = (json: unknown) => route.fulfill({ json });
    let m: RegExpMatchArray | null;
    if (method === "GET" && path === "/ga") return ok(state);
    if (method === "POST" && path === "/ga/accounts") {
      const id = req.postDataJSON().code.replace("code-", "");
      const existing = state.accounts.find((a) => a.id === id);
      if (existing) delete existing.error;
      else state.accounts.push({ id, email: accounts[id].email });
      return ok({ account: { id, email: accounts[id].email }, properties: accounts[id].props });
    }
    if (method === "GET" && (m = path.match(/^\/ga\/accounts\/([^/]+)\/properties$/))) return ok(accounts[m[1]].props);
    if (method === "POST" && path === "/ga/connections") {
      const { accountId, propertyIds } = req.postDataJSON();
      for (const p of accounts[accountId].props) if (propertyIds.includes(p.id)) state.connections.push({ property: p, accountId });
      return ok(state);
    }
    if (method === "DELETE" && (m = path.match(/^\/ga\/connections\/(.+)$/))) {
      state.connections = state.connections.filter((c) => c.property.id !== m![1]);
      return ok(state);
    }
    if (method === "DELETE" && (m = path.match(/^\/ga\/accounts\/(.+)$/))) {
      state.accounts = state.accounts.filter((a) => a.id !== m![1]);
      state.connections = state.connections.filter((c) => c.accountId !== m![1]);
      return ok(state);
    }
    if (method === "GET" && (m = path.match(/^\/ga\/realtime\/(.+)$/))) {
      calls.realtime.push(m[1]);
      return ok({ activeUsers: 3, countries: [{ name: "Netherlands", value: 2 }, { name: "Austria", value: 1 }], pages: [{ name: "Ski pass", value: 3 }], updated: new Date().toISOString() });
    }
    return route.fulfill({ status: 404, json: { error: "Not found." } });
  });
  return { state, calls };
}

test("connect once, pick explicitly, stays connected across reloads, remove and disconnect", async ({ page }) => {
  const { calls } = await mockServer(page);
  await page.goto("./#integrations");
  const picker = page.getByRole("group", { name: "Add properties" });
  const connected = page.getByRole("list", { name: "Connected properties" });

  await page.getByRole("button", { name: "Connect Google Analytics" }).click();
  await expect(picker.getByLabel("Ischgl Web")).toBeVisible();
  await expect(connected).toHaveCount(0);
  await expect(picker.getByRole("button", { name: "Add selected" })).toBeDisabled();
  await picker.getByLabel("Ischgl Web").check();
  await picker.getByLabel("Galtür Web").check();
  await picker.getByRole("button", { name: "Add selected (2)" }).click();
  await expect(connected.locator(":scope > li")).toHaveCount(2);
  await expect(page.getByText("nico@example.com")).toBeVisible();
  await expect(page.locator(".ga-data .ga-big")).toHaveText("3 active users");
  expect(calls.realtime[0]).toBe("111");

  // The connection is kept by the server: a reload is still connected.
  await page.reload();
  await expect(connected.locator(":scope > li")).toHaveCount(2);
  await expect(page.locator(".ga-data .ga-big")).toHaveText("3 active users");

  // Adding more needs no new Google sign-in, and only offers what is left.
  await page.getByRole("button", { name: "Remove Galtür Web" }).click();
  await expect(connected.locator(":scope > li")).toHaveCount(1);
  await page.getByRole("button", { name: "Add property" }).click();
  await expect(picker.getByLabel("Galtür Web")).toBeVisible();
  await expect(picker.getByLabel("Ischgl Web")).toHaveCount(0);
  await picker.getByRole("button", { name: "Cancel" }).click();
  expect(calls.signIns).toHaveLength(1);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(connected).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect Google Analytics" })).toBeVisible();
});

test("a single property still has to be picked; another Google account adds its properties", async ({ page }) => {
  const { calls } = await mockServer(page, { accounts: { "user-1": { ...ACCOUNTS["user-1"], props: ACCOUNTS["user-1"].props.slice(0, 1) }, "user-2": ACCOUNTS["user-2"] } });
  await page.goto("./#integrations");
  const picker = page.getByRole("group", { name: "Add properties" });
  await page.getByRole("button", { name: "Connect Google Analytics" }).click();
  await expect(picker.getByLabel("Ischgl Web")).not.toBeChecked();
  await expect(page.getByRole("list", { name: "Connected properties" })).toHaveCount(0);

  calls.nextUser = "user-2";
  await picker.getByRole("button", { name: "Connect another Google account" }).click();
  await expect(picker.getByLabel("Personal Blog")).toBeVisible();
  await expect(picker.getByLabel("Ischgl Web")).toBeVisible();
  expect(calls.signIns.map((s) => !!s.select_account)).toEqual([false, true]);
  await picker.getByLabel("Personal Blog").check();
  await picker.getByRole("button", { name: "Add selected (1)" }).click();
  await expect(page.getByRole("region", { name: "Google account private@example.com" }).getByText("Personal Blog")).toBeVisible();
  await expect(page.getByRole("region", { name: "Google account nico@example.com" }).getByText("No properties added from this account.")).toBeVisible();
});

test("revoked access shows Reconnect for that account", async ({ page }) => {
  const { state, calls } = await mockServer(page);
  state.accounts.push({ id: "user-1", email: "nico@example.com", error: "Google access was revoked or has expired — reconnect this account." });
  state.connections.push({ property: ACCOUNTS["user-1"].props[0], accountId: "user-1" });
  await page.goto("./#integrations");
  await expect(page.getByText("Paused")).toBeVisible();
  await expect(page.getByText(/revoked or has expired/)).toBeVisible();
  await page.getByRole("button", { name: "Reconnect" }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Add properties" })).toHaveCount(0);
  expect(calls.signIns).toEqual([{ select_account: undefined, login_hint: "nico@example.com" }]);
  await expect(page.locator(".ga-data .ga-big")).toHaveText("3 active users");
});

test("a server without permanent storage says the connection is temporary", async ({ page }) => {
  const { state } = await mockServer(page);
  Object.assign(state, { persistent: false });
  state.accounts.push({ id: "user-1", email: "nico@example.com" });
  await page.goto("./#integrations");
  await expect(page.getByText(/no permanent storage yet/)).toBeVisible();
});

test("Data now opens the combined analytics page and Integrations remains separate", async ({page}) => {
  await mockServer(page);
  await page.goto("./#data");
  await expect(page.getByRole("heading",{name:"Data",exact:true})).toBeVisible();
  await page.getByRole("link",{name:"Integrations",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Google Analytics",exact:true})).toBeVisible();
});

test("without a server-side client secret the button is disabled and says why", async ({ page }) => {
  await mockServer(page, { configured: false });
  await page.goto("./#integrations");
  await expect(page.getByRole("button", { name: "Connect Google Analytics" })).toBeDisabled();
  await expect(page.getByText(/GOOGLE_CLIENT_SECRET/)).toBeVisible();
});
