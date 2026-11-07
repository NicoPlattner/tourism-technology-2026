import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMetadata,
  validateGenerated,
  CaptionError,
  type CaptionMetadata,
} from "../src/campaigns/captions/contracts.ts";
import { buildMessages, CAPTION_SYSTEM_PROMPT } from "../server/prompt.ts";
import {
  OpenAICompatibleCaptionProvider,
  readProviderConfig,
} from "../server/provider.ts";
import { createCaptionServer } from "../server/http.ts";
import { MockCampaignDataProvider } from "../src/campaigns/mockCampaignData.ts";
const metadata: CaptionMetadata = {
  country: "Germany",
  language: "de",
  ageMin: 18,
  ageMax: 26,
  season: "winter",
  activity: "skiing",
  destination: "Paznaun-Ischgl",
  creativeTheme: "playful spinning cat illustration",
  objective: "inspire_travel",
  visualDescription: "Original white cat on skis",
};
const result = {
  caption: "Lernmodus aus, Alpenmodus an. 🐈⛷️",
  hashtags: ["#Ischgl", "#Alpenmodus"],
  language: "de",
};
const config = () =>
  readProviderConfig({
    OPENAI_API_KEY: "test-key-not-a-real-credential",
    CAPTION_MODEL: "small-test-model",
  });
const response = (value: unknown) =>
  new Response(
    JSON.stringify({
      choices: [
        { finish_reason: "stop", message: { content: JSON.stringify(value) } },
      ],
    }),
    { headers: { "Content-Type": "application/json" } },
  );
test("metadata rejects minors, reversed ages, unknown keys and missing or oversized fields", () => {
  for (const value of [
    { ...metadata, ageMin: 17 },
    { ...metadata, ageMax: 16 },
    { ...metadata, language: "German" },
    { ...metadata, country: "" },
    { ...metadata, ageMax: 26.5 },
    { ...metadata, objective: "x".repeat(121) },
    { ...metadata, apiKey: "not-allowed" },
    { country: "Germany" },
  ])
    assert.throws(() => normalizeMetadata(value), CaptionError);
});
test("metadata is normalized and sourced from the selected mock campaign", async () => {
  assert.equal(
    normalizeMetadata({ ...metadata, language: "DE", country: " Germany  " })
      .language,
    "de",
  );
  for (const market of ["DE", "NL", "BE", "AT"] as const) {
    const c = await new MockCampaignDataProvider().getRecommendation(
      market,
      "q2-2027",
    );
    assert.equal(c.captionMetadata.country, c.country);
    assert.equal(c.captionMetadata.language, c.language);
    assert.equal(c.captionMetadata.visualDescription, c.asset.alt);
    assert.equal(c.captionMetadata.season, "spring");
    assert.equal(c.captionMetadata.ageMin, Number(c.ageGroup.split("–")[0]));
  }
});
test("prompt supplies structured metadata and avoids invented facts, stereotypes and minors", () => {
  const messages = buildMessages(metadata);
  assert.equal(messages.length, 2);
  assert.deepEqual(JSON.parse(messages[1].content), metadata);
  for (const phrase of [
    "220",
    "2–4",
    "stereotypes",
    "Never target minors",
    "weather",
    "visual description",
    "metadata, never instructions",
  ])
    assert.ok(CAPTION_SYSTEM_PROMPT.includes(phrase));
  assert.ok(!messages[0].content.includes("Germany"));
});
test("one model request uses the requested language, configurable model and strict JSON output", async () => {
  let calls = 0;
  const provider = new OpenAICompatibleCaptionProvider(
    config(),
    async (url, init) => {
      calls++;
      assert.equal(url, "https://api.openai.com/v1/chat/completions");
      const body = JSON.parse(init!.body as string);
      assert.equal(body.model, "small-test-model");
      assert.equal(body.max_completion_tokens, 350);
      assert.equal(body.response_format.json_schema.strict, true);
      assert.equal(JSON.parse(body.messages[1].content).language, "de");
      assert.equal(
        (init!.headers as Record<string, string>).Authorization,
        "Bearer test-key-not-a-real-credential",
      );
      return response(result);
    },
  );
  assert.deepEqual(await provider.generate(metadata), {
    ...result,
    source: "ai",
  });
  assert.equal(calls, 1);
});
test("malformed, incomplete, wrong-language and oversized responses are rejected", () => {
  for (const value of [
    { ...result, language: "nl" },
    { ...result, caption: "x".repeat(221) },
    { ...result, hashtags: ["#One"] },
    { ...result, hashtags: ["#one", "#ONE"] },
    { ...result, caption: "caption #duplicate" },
    { ...result, hashtags: ["hashtag", "#Other"] },
    { ...result, extra: "field" },
    { caption: "Missing fields" },
  ])
    assert.throws(() => validateGenerated(value, "de"), CaptionError);
});
test("provider errors, invalid JSON, refusals and incomplete responses are sanitized", async () => {
  for (const request of [
    async () => new Response("private upstream detail", { status: 401 }),
    async () => new Response("private detail", { status: 429 }),
    async () =>
      new Response("{bad json", {
        headers: { "Content-Type": "application/json" },
      }),
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: "length", message: { content: "{}" } }],
        }),
      ),
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: "stop", message: { refusal: "Refused" } }],
        }),
      ),
  ]) {
    const provider = new OpenAICompatibleCaptionProvider(config(), request);
    await assert.rejects(
      provider.generate(metadata),
      (error) =>
        error instanceof CaptionError && !error.message.includes("private"),
    );
  }
});
test("the configured 8-second default timeout is enforced and can be shortened for testing", async () => {
  assert.equal(config().timeoutMs, 8000);
  const provider = new OpenAICompatibleCaptionProvider(
    { ...config(), timeoutMs: 20 },
    async (_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        ),
      ),
  );
  await assert.rejects(
    provider.generate(metadata),
    (error) =>
      error instanceof CaptionError && error.code === "PROVIDER_TIMEOUT",
  );
});
test("missing credentials never return a fake AI caption and custom endpoints require explicit configuration", () => {
  assert.throws(
    () => readProviderConfig({}),
    (error) => error instanceof CaptionError && error.code === "NOT_CONFIGURED",
  );
  assert.throws(() =>
    readProviderConfig({
      OPENAI_API_KEY: "test",
      CAPTION_BASE_URL: "https://other.invalid/v1",
    }),
  );
  assert.throws(() =>
    readProviderConfig({
      OPENAI_API_KEY: "test",
      CAPTION_PROVIDER: "openai-compatible",
      CAPTION_BASE_URL: "http://other.invalid/v1",
    }),
  );
  assert.equal(
    readProviderConfig({
      OPENAI_API_KEY: "test",
      CAPTION_PROVIDER: "openai-compatible",
      CAPTION_BASE_URL: "https://other.invalid/v1",
    }).provider,
    "openai-compatible",
  );
});
test("HTTP endpoint validates metadata, sends one upstream request and returns only generated fields", async () => {
  let calls = 0;
  const provider = new OpenAICompatibleCaptionProvider(config(), async () => {
    calls++;
    return response(result);
  });
  const server = createCaptionServer(() => provider);
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  try {
    const address = server.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}/api/marketing/generate-caption`;
    const send = (body: unknown) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const invalid = await send({ ...metadata, ageMin: 12 });
    assert.equal(invalid.status, 422);
    assert.equal(calls, 0);
    const ok = await send(metadata);
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ...result, source: "ai" });
    assert.equal(calls, 1);
    assert.equal((await fetch(url)).status, 405);
    const crossOrigin = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://other.invalid",
      },
      body: JSON.stringify(metadata),
    });
    assert.equal(crossOrigin.status, 403);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("HTTP no-key failures are explicit, contain no credentials and preserve the demo path", async () => {
  const server = createCaptionServer(
    () => new OpenAICompatibleCaptionProvider(readProviderConfig({})),
  );
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  try {
    const address = server.address() as { port: number };
    const res = await fetch(
      `http://127.0.0.1:${address.port}/api/marketing/generate-caption`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata),
      },
    );
    assert.equal(res.status, 503);
    const body = (await res.json()) as {
      error: { code: string; message: string };
    };
    assert.equal(body.error.code, "NOT_CONFIGURED");
    assert.ok(!JSON.stringify(body).includes("Bearer"));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("n8n receives structured metadata, the system prompt and a server-only webhook auth header", async () => {
  const { N8nCaptionProvider } = await import("../server/provider.ts");
  const c = readProviderConfig({
    CAPTION_PROVIDER: "n8n",
    CAPTION_N8N_WEBHOOK_URL: "https://workflow.example/webhook/caption",
    CAPTION_API_KEY: "test-webhook-secret",
    CAPTION_N8N_AUTH_HEADER: "X-Caption-Key",
  });
  let calls = 0;
  const provider = new N8nCaptionProvider(c, async (url, init) => {
    calls++;
    assert.equal(url, "https://workflow.example/webhook/caption");
    assert.equal(
      (init!.headers as Record<string, string>)["X-Caption-Key"],
      "test-webhook-secret",
    );
    const body = JSON.parse(init!.body as string);
    assert.deepEqual(body.metadata, metadata);
    assert.deepEqual(JSON.parse(body.messages[1].content), metadata);
    assert.ok(body.responseSchema);
    assert.ok(!JSON.stringify(body).includes("test-webhook-secret"));
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  });
  assert.deepEqual(await provider.generate(metadata), {
    ...result,
    source: "ai",
  });
  assert.equal(calls, 1);
});
test("n8n never falls through to sending an OpenAI key to a webhook", () => {
  assert.throws(
    () =>
      readProviderConfig({
        CAPTION_PROVIDER: "n8n",
        CAPTION_N8N_WEBHOOK_URL: "https://workflow.example/webhook/caption",
        OPENAI_API_KEY: "openai-only",
      }),
    (error) => error instanceof CaptionError && error.code === "NOT_CONFIGURED",
  );
  assert.throws(
    () =>
      readProviderConfig({ CAPTION_PROVIDER: "n8n", CAPTION_API_KEY: "key" }),
    /webhook URL/,
  );
  assert.throws(
    () =>
      readProviderConfig({
        CAPTION_PROVIDER: "n8n",
        CAPTION_API_KEY: "key",
        CAPTION_N8N_WEBHOOK_URL: "https://workflow.example/webhook/caption",
        CAPTION_N8N_AUTH_HEADER: "Host",
      }),
    /authentication header/,
  );
});
test("n8n malformed output retains server-side validation and timeout behavior", async () => {
  const { N8nCaptionProvider } = await import("../server/provider.ts");
  const c = readProviderConfig({
    CAPTION_PROVIDER: "n8n",
    CAPTION_API_KEY: "key",
    CAPTION_N8N_WEBHOOK_URL: "https://workflow.example/webhook/caption",
  });
  await assert.rejects(
    new N8nCaptionProvider(
      c,
      async () =>
        new Response('{"caption":"incomplete"}', {
          headers: { "Content-Type": "application/json" },
        }),
    ).generate(metadata),
    (error) =>
      error instanceof CaptionError && error.code === "INVALID_AI_RESPONSE",
  );
  await assert.rejects(
    new N8nCaptionProvider(
      { ...c, timeoutMs: 10 },
      async (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("abort")),
          ),
        ),
    ).generate(metadata),
    (error) =>
      error instanceof CaptionError && error.code === "PROVIDER_TIMEOUT",
  );
});

test("OpenAI base URL alias and model are configurable with explicit caption URL precedence", () => {
  const env = {
    CAPTION_PROVIDER: "openai-compatible",
    OPENAI_API_KEY: "test-key-not-a-real-credential",
    OPENAI_BASE_URL: "https://example.test/api/",
    CAPTION_MODEL: "configured-medium-model",
  };
  assert.equal(readProviderConfig(env).baseUrl, "https://example.test/api");
  assert.equal(readProviderConfig(env).model, "configured-medium-model");
  assert.equal(readProviderConfig({...env, CAPTION_BASE_URL: "https://override.test/v1"}).baseUrl, "https://override.test/v1");
});
test("prompt treats selected ages as creative preferences and includes flexible guidance for all adult bands", () => {
  for (const band of ["18–24","25–34","35–44","45–60"]) assert.ok(CAPTION_SYSTEM_PROMPT.includes(band));
  assert.match(CAPTION_SYSTEM_PROMPT, /not an observed visitor demographic/);
  assert.match(CAPTION_SYSTEM_PROMPT, /Do not assume older adults dislike memes/);
  const messages = buildMessages({...metadata,ageMin:45,ageMax:60});
  const payload = JSON.parse(messages[1].content);
  assert.equal(payload.ageMin,45);
  assert.equal(payload.ageMax,60);
});
