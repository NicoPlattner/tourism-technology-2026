# Real AI caption assistant

Branch: `feature/ai-caption-assistant`. The existing dashboard, mock tourism data, map, images and other pages stay in place. Only captions are generated at runtime by an external model; seasonal AI-generated image files are bundled locally. There is no hardcoded server-side caption selector.

## Configure n8n (optional provider)

1. Import `n8n-caption-workflow.json` into your n8n instance.
2. In **Authenticated caption webhook**, select/create a **Header Auth** credential. Set its name to `X-Caption-Key` and its value to a dedicated webhook secret. This secret belongs in the caption server's `CAPTION_API_KEY` (or `N8N_WEBHOOK_KEY`). Do not put it in frontend code.
3. In **One OpenAI caption request**, select your n8n OpenAI credential. The OpenAI API key remains in n8n. The HTTP node makes one short Chat Completions request, without an agent, browsing, tools or retries.
4. Activate the workflow and copy its **production** webhook URL, not the temporary test URL.
5. Set the caption server variables:

```dotenv
CAPTION_PROVIDER=n8n
CAPTION_N8N_WEBHOOK_URL=https://your-n8n.example/webhook/tourism-caption
CAPTION_N8N_AUTH_HEADER=X-Caption-Key
CAPTION_API_KEY=your-webhook-header-secret
CAPTION_MODEL=gpt-4.1-mini
CAPTION_TIMEOUT_MS=8000
```

An n8n **management/public API key** does not automatically authenticate webhooks and is not an OpenAI API key. Use a configured Header Auth credential for this workflow. If your existing workflow uses another header name, set `CAPTION_N8N_AUTH_HEADER` accordingly. For an Authorization/Bearer webhook, use `CAPTION_N8N_AUTH_HEADER=Authorization` and `CAPTION_N8N_AUTH_PREFIX=Bearer`.

The supplied workflow is an integration template: choose credentials, activate it and verify node compatibility with your n8n installation. It was not executed against a live n8n instance in this session because credentials and a webhook URL are to be configured later.

The server posts `{ metadata, model, messages, responseSchema, maxOutputTokens }` to n8n. The workflow must return a plain JSON object with **only** `caption`, `hashtags`, `language`. The server checks the output and adds `source: "ai"` only after successful validation. Do not return an array of n8n items or markdown. Workflow errors retain the demo caption. Keep the workflow's OpenAI request timeout below the server's 8-second budget.

If your n8n service is instead an OpenAI-compatible gateway exposing `/chat/completions`, use the `openai-compatible` configuration below with that gateway's documented base URL and key.

## Direct OpenAI / compatible endpoint

No AI provider was configured on the original dashboard. The default lightweight adapter uses OpenAI's Chat Completions API:

```dotenv
CAPTION_PROVIDER=openai
OPENAI_API_KEY=your-server-side-openai-key
CAPTION_MODEL=gpt-4.1-mini
CAPTION_BASE_URL=https://api.openai.com/v1
```

`CAPTION_API_KEY` can be used instead of `OPENAI_API_KEY`. For an explicitly configured compatible endpoint, set `CAPTION_PROVIDER=openai-compatible` and `OPENAI_BASE_URL` (or the overriding `CAPTION_BASE_URL`) to its HTTPS API base (without `/chat/completions`). Choose a compatible model and `CAPTION_JSON_MODE=json_schema` or `json_object`. The endpoint must support the Chat Completions request and `max_completion_tokens` used by this adapter. A valid response uses one request. A complete but invalid OpenAI-compatible response gets at most one correction request with explicit length feedback, within the original timeout. Authentication, rate-limit and refusal errors are not retried. There is no external research.

## Local setup

Node **24.5+** (latest Node 24 LTS recommended) is required for the built-in environment-file and environment-proxy flags. From `dashboard/`:

```sh
npm ci
cp .env.example .env
# Edit .env with the provider configuration; .env is ignored by Git.
npm run dev -- --host 0.0.0.0 --port 5174
```

One command starts Vite and the private caption API on port 8787. Vite proxies `/api/marketing/*` to that API. Keys are loaded only by the server child; Vite exposes no key. Restart the API after changing its environment. Existing managed-session proxy and CA settings are inherited; TLS verification remains enabled.

`npm run build` type-checks the web app and server, builds the existing static dashboard, and bundles the API into `helm/tourism-technology/caption-server.cjs`. `npm run start:api` runs that bundle. `npm run preview` remains frontend-only; saved captions still display immediately, while regeneration requires a reverse proxy supplying the API endpoint.

## Environment variables

| Variable | Default / role |
| --- | --- |
| `CAPTION_PROVIDER` | `openai`; also `openai-compatible`, `n8n` |
| `CAPTION_API_KEY` | Server-only provider key or webhook auth secret |
| `OPENAI_API_KEY` | Direct OpenAI key fallback; never forwarded to n8n |
| `N8N_WEBHOOK_KEY` | n8n-only alternative to `CAPTION_API_KEY` |
| `CAPTION_MODEL` | `gpt-4.1-mini`; forwarded to the supplied n8n workflow |
| `OPENAI_BASE_URL` | Compatible API base; overridden by `CAPTION_BASE_URL` |
| `CAPTION_BASE_URL` | `https://api.openai.com/v1`; compatible API base |
| `CAPTION_N8N_WEBHOOK_URL` | Required HTTPS production webhook URL for n8n |
| `CAPTION_N8N_AUTH_HEADER` | `X-Caption-Key` |
| `CAPTION_N8N_AUTH_PREFIX` | Empty; optionally `Bearer` for Authorization auth |
| `CAPTION_JSON_MODE` | `json_schema`; compatible providers can use `json_object` |
| `CAPTION_TIMEOUT_MS` | `8000`, range 100–30000; keep at 8000 for the demo |
| `CAPTION_MAX_OUTPUT_TOKENS` | `350`, range 100–800 |
| `CAPTION_PORT` | `8787` |
| `CAPTION_RATE_LIMIT` | 30 generations/minute across the demo API instance |
| `CAPTION_ALLOWED_ORIGINS` | Development UI origins only; launcher sets localhost ports |

The browser has a separate 10-second network timeout to allow the server's 8-second provider timeout to return its friendly error. Keys, provider URLs and model credentials are never sent by the browser. Never name a credential `VITE_*`.

## Deployment

The existing nginx frontend stays in place. A small Node 24 sidecar runs the stateless API. Nginx routes both `/api/marketing/generate-caption` and `/<branch>/api/marketing/generate-caption` to the same internal service. No database or persistent volume is needed.

For n8n, set these GitHub Actions repository **variables**:

- `CAPTION_PROVIDER=n8n`
- `CAPTION_N8N_WEBHOOK_URL=<production webhook URL>`
- `CAPTION_N8N_AUTH_HEADER=X-Caption-Key` (or your configured header)
- optionally `CAPTION_MODEL` and `CAPTION_N8N_AUTH_PREFIX`

Set the webhook auth secret as an Actions **secret** named `CAPTION_API_KEY` or `N8N_WEBHOOK_KEY`. For direct OpenAI, use `CAPTION_PROVIDER=openai` and the `OPENAI_API_KEY` secret. The workflow copies only the selected provider's credential into a branch-specific Kubernetes Secret; the value is never supplied to Helm or bundled into the site.

Alternatively, use an existing Kubernetes Secret: set Actions variable `CAPTION_EXISTING_SECRET` to its name and `CAPTION_SECRET_KEY` to the entry name (default `api-key`). In this mode, CI does not overwrite that secret. The workflow also accepts the provider, model, base URL, n8n URL/header/prefix, JSON mode and timeout as Actions variables. Port, output-token and rate-limit settings are server runtime defaults in the supplied deployment. Every deployment refreshes the pod environment. With no configured key, deployment remains healthy and returns an explicit `NOT_CONFIGURED` response; it does not pretend the demo copy came from AI.

The API is a shared hackathon endpoint, not an authenticated publishing system. It limits body size, rejects cross-origin browser mutations, bounds provider time and output tokens, and caps request frequency. No real social account is connected.

## Metadata, UI and caching

`CaptionMetadata` is defined in `src/campaigns/captions/contracts.ts`. The selected `MockCampaignDataProvider` supplies it using existing country, language, adult age range, season, creative theme and visual description. The AI service has no country-to-caption table and does not duplicate market metadata.

All 20 default-audience mock campaign/period entries include stored captions in `src/campaigns/captions/preGenerated.json`, generated through the real configured provider during development. Matching country/season/visual combinations share validated outputs across identical winter periods. Each entry includes the metadata key, language, `source: "pre_generated"` and generation timestamp. If metadata no longer matches, the provider uses the original `demo_fallback` copy rather than mislabelling it as AI. The local mock provider has a synchronous path so the default German campaign and country/period switches render complete immediately.

No model request occurs on mount, rerender or country/period switching. Only the subtle Regenerate action calls the existing endpoint with cache bypass. Its spinner stays inside the button; the rest of the planner and previous caption remain available. Requests are guarded against duplicate clicks. Success becomes `live_ai`, while failure preserves the current saved/live caption and shows a small retry message. Caption state/cache is keyed by campaign identity (including period) and normalized metadata; late responses update their own campaign without changing another country's display. Copy and review use the currently displayed caption and hashtags.

To deliberately recreate the saved dataset, configure the server-only `.env`, then run `npm run captions:pregenerate` from `dashboard/`. This makes paid provider requests; it is never run by the application, tests, build or deployment. It reuses the existing configured provider, prompt and output validation, preserves validated entries and leaves failed entries as explicit demo previews, and records provenance only for actual LLM outputs. Review the resulting copy before committing it. No key or endpoint is stored in the caption dataset. The current dataset mainly uses the environment-configured `mistral/mistral-medium` model; see `seasonal-assets.md` for the development-only compatible-model overrides. The model remains configurable through `CAPTION_MODEL`.

Review uses the displayed caption. If AI generation changes the text or hashtags after an earlier local approval, that approval no longer applies and review is required again. No generation or approval schedules or publishes anything.

## API

`POST /api/marketing/generate-caption`, with `Content-Type: application/json`. A branch prefix is supported by nginx.

```json
{"country":"Germany","language":"de","ageMin":18,"ageMax":26,"season":"winter","activity":"skiing","destination":"Paznaun-Ischgl","creativeTheme":"playful spinning cat illustration","objective":"inspire_travel","visualDescription":"Original white cat on skis"}
```

Success: `{ "caption": "...", "hashtags": ["#Ischgl", "#Alpen"], "language": "de", "source": "ai" }`.

The caption shown here is deliberately omitted: actual text comes from the configured model. Errors use `{ "error": { "code": "...", "message": "..." } }` with 422 for invalid metadata, 503 for unconfigured service, 504 for provider timeout and 502 for invalid/provider responses. The server rejects minors, unknown fields, unsupported formats, incomplete captions, wrong language codes, more than 220 caption code points, and invalid/duplicate hashtag lists. Human review remains necessary for actual wording, language quality and factual accuracy.

## Validation

```sh
npm run typecheck
npm run test:unit
npm test
npm run build
```

Unit/API tests cover metadata, prompts, both provider adapters, output validation, failures/timeouts, caching and forced regeneration. Browser tests cover immediate stored-caption display with zero generation requests across all markets/periods, explicit regeneration, keeping the previous caption while pending, stale country responses, copying, cache hits, failures, review invalidation and the original dashboard flows. Provider responses in automated tests are explicit test doubles; they do not constitute a live model verification. There is no existing lint script in this project.

To verify real generation after configuration, run the complete app and POST the metadata above to the API. Check `source: "ai"`, then select another country and regenerate. If credentials are missing or invalid, keep the Demo label; never claim live generation succeeded.

Provider/model/base URL/JSON mode configuration can be stored as Actions repository variables (preferred) or same-named repository secrets. Variables take precedence. GitHub Environment-scoped settings require a deployment job targeting that environment; this workflow does not select a GitHub Environment.

## User-selected adult targeting

Overview defaults to Germany, Q1 2027 and ages 18–24. The compact **Target audience age** selector supports 18–24, 25–34, 35–44 and 45–60. `marketingPreferences.targetAudience` records an explicit marketing decision, independent of tourism forecasts and illustrative market booking assumptions. Planner/review context and reasoning update immediately. Images, booking lead times and travel dates stay tied to the market/period, rather than age.

Saved captions were generated again for the default 18–24 audience. Other age bands show a localized **Generic preview** with an explicit not-personalized note until Regenerate succeeds. No selector change makes an LLM call. The request uses the current age minimum/maximum and actual displayed image description; the shared prompt provides flexible age-tone guidance without demographic stereotypes. Live success is labelled **AI generated**. Cache/state and local approvals include the campaign identity, period and selected age range, with normalized metadata also covering language, season, activity, destination and visual theme. Switching back restores the matching generated caption; late responses remain attached to their own selection.

## Age-adaptive platforms and voice

`src/campaigns/socialProfile.ts` is the shared demo policy: 18–24 uses TikTok / 40–100 characters / punchy meme-friendly voice; 25–34 uses Instagram / 80–160 / relatable playful voice; 35–44 uses Instagram / 120–220 / informative experience-focused voice; 45–60 uses Facebook / 180–350 / descriptive inviting voice. These are demo heuristics, not measured age preferences. Voice specifies vocabulary, humor, sentence structure, emoji usage and invitation style; natural localization and the actual illustration still apply.

Platform name/icons and caption examples update instantly. Saved default captions were generated again with the TikTok policy. Other audiences get clearly labelled, localized **Demo preview** examples with visibly different voice and length until a matching live result exists. Selector changes make no AI calls. The existing endpoint accepts `platform`, `targetCaptionLength: {min,max}` and `tone` together; these are normalized into the cache key with the age and existing metadata. Both server adapters and the browser validate the requested length (Unicode characters excluding hashtags); the prompt and structured-output schema receive the same bounds. Old API clients that omit all three fields retain the previous 1–220 character contract. Invalid or out-of-range AI results preserve the prior caption, with no automatic retry. No publishing or image generation was added.

See `seasonal-assets.md` for the 16-image age/season library, actual visual descriptions, added Q3/Q4 periods, research references and image-specific caption cache keys.
