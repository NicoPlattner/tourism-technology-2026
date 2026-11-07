import { test } from "node:test";
import assert from "node:assert/strict";
import { CaptionClient } from "../src/campaigns/captions/client.ts";
import type { CaptionMetadata } from "../src/campaigns/captions/contracts.ts";
const metadata: CaptionMetadata = {
  country: "Germany",
  language: "de",
  ageMin: 18,
  ageMax: 26,
  season: "winter",
  activity: "skiing",
  destination: "Paznaun-Ischgl",
  creativeTheme: "cat meme",
  objective: "inspire_travel",
};
const result = (caption = "Alpenmodus an. 🐈") => ({
  caption,
  hashtags: ["#Ischgl", "#Alpenmodus"],
  language: "de",
  source: "ai",
});
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
test("normalized metadata cache hits and concurrent calls use one request", async () => {
  let calls = 0;
  const client = new CaptionClient("/api", async () => {
    calls++;
    return json(result());
  });
  const [a, b] = await Promise.all([
    client.generate(metadata),
    client.generate({ ...metadata, country: " Germany " }),
  ]);
  assert.deepEqual(a, b);
  await client.generate(metadata);
  assert.equal(calls, 1);
  assert.ok(client.getCached(metadata));
});
test("regeneration bypasses cache and failed regeneration preserves the previous result", async () => {
  let calls = 0;
  const client = new CaptionClient("/api", async () => {
    calls++;
    return calls === 3
      ? json({ error: { code: "FAILED", message: "Try again" } }, 502)
      : json(result(calls === 1 ? "Erste Alpenidee." : "Neue Alpenidee."));
  });
  await client.generate(metadata);
  await client.generate(metadata, true);
  assert.equal(client.getCached(metadata)?.caption, "Neue Alpenidee.");
  await assert.rejects(client.generate(metadata, true));
  assert.equal(client.getCached(metadata)?.caption, "Neue Alpenidee.");
  assert.equal(calls, 3);
});
test("late earlier requests cannot overwrite the cache after forced regeneration", async () => {
  const resolvers: ((value: Response) => void)[] = [];
  const client = new CaptionClient(
    "/api",
    async () => new Promise((resolve) => resolvers.push(resolve)),
  );
  const first = client.generate(metadata);
  const fresh = client.generate(metadata, true);
  resolvers[1](json(result("Neu und freigegeben.")));
  await fresh;
  resolvers[0](json(result("Alte Antwort.")));
  await first;
  assert.equal(client.getCached(metadata)?.caption, "Neu und freigegeben.");
});
test("different country and language metadata remain isolated", async () => {
  let calls = 0;
  const client = new CaptionClient("/api", async (_url, init) => {
    calls++;
    const m = JSON.parse(init!.body as string);
    return json({
      ...result(
        m.country === "Germany" ? "Alpenmodus an." : "Even naar de bergen.",
      ),
      language: m.language,
    });
  });
  await client.generate(metadata);
  const nl = { ...metadata, country: "Netherlands", language: "nl" };
  const dutch = await client.generate(nl);
  assert.equal(dutch.language, "nl");
  assert.notEqual(client.getCached(metadata)?.caption, dutch.caption);
  assert.equal(calls, 2);
});
test("request timeout and invalid service content return errors without caching fallbacks", async () => {
  const client = new CaptionClient(
    "/api",
    async (_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("timeout")),
        ),
      ),
    10,
  );
  await assert.rejects(client.generate(metadata), /timed out/);
  assert.equal(client.getCached(metadata), undefined);
  const html = new CaptionClient(
    "/api",
    async () => new Response("<html>not an API</html>"),
  );
  await assert.rejects(html.generate(metadata), /unavailable/);
});
test("campaign identity isolates periods even when caption metadata is identical", async () => {
  let calls = 0;
  const client = new CaptionClient("/api", async () => json(result(`Caption ${++calls}.`)));
  await client.generate(metadata, true, "campaign-DE-q1-2027-v1");
  assert.equal(client.getCached(metadata, "campaign-DE-winter-2026-27-v1"), undefined);
  await client.generate(metadata, true, "campaign-DE-winter-2026-27-v1");
  assert.equal(client.getCached(metadata, "campaign-DE-q1-2027-v1")?.caption, "Caption 1.");
  assert.equal(client.getCached(metadata, "campaign-DE-winter-2026-27-v1")?.caption, "Caption 2.");
  assert.equal(calls, 2);
});
