import {
  CaptionError,
  normalizeMetadata,
  validateGenerated,
  type AiCaption,
  type CaptionMetadata,
} from "../src/campaigns/captions/contracts";
import { buildMessages, captionJsonSchema } from "./prompt";
export interface CaptionProvider {
  generate(metadata: CaptionMetadata): Promise<AiCaption>;
}
export interface ProviderConfig {
  provider: "openai" | "openai-compatible" | "n8n";
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  jsonMode: "json_schema" | "json_object";
  n8nAuthHeader: string;
  n8nAuthPrefix: string;
}
export function readProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProviderConfig {
  const provider = env.CAPTION_PROVIDER || "openai";
  if (!["openai", "openai-compatible", "n8n"].includes(provider))
    throw new CaptionError(
      "The caption provider is not configured correctly.",
      "NOT_CONFIGURED",
      503,
    );
  const apiKey =
    env.CAPTION_API_KEY ||
    (provider === "n8n" ? env.N8N_WEBHOOK_KEY : env.OPENAI_API_KEY);
  if (!apiKey)
    throw new CaptionError(
      "AI captions are not configured yet. The demo caption is still available.",
      "NOT_CONFIGURED",
      503,
    );
  if (provider === "n8n" && !env.CAPTION_N8N_WEBHOOK_URL)
    throw new CaptionError(
      "Configure the authenticated n8n caption webhook URL.",
      "NOT_CONFIGURED",
      503,
    );
  const baseUrl = (
    provider === "n8n"
      ? env.CAPTION_N8N_WEBHOOK_URL!
      : env.CAPTION_BASE_URL || env.OPENAI_BASE_URL || "https://api.openai.com/v1"
  ).replace(/\/+$/, "");
  let endpoint: URL;
  try {
    endpoint = new URL(baseUrl);
  } catch {
    throw new CaptionError(
      "The caption provider URL is invalid.",
      "NOT_CONFIGURED",
      503,
    );
  }
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    (endpoint.protocol !== "https:" &&
      !(
        endpoint.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname) &&
        env.NODE_ENV !== "production"
      ))
  )
    throw new CaptionError(
      "The caption provider requires a valid HTTPS base URL.",
      "NOT_CONFIGURED",
      503,
    );
  if (provider === "openai" && endpoint.origin !== "https://api.openai.com")
    throw new CaptionError(
      "Use openai-compatible for a custom provider endpoint.",
      "NOT_CONFIGURED",
      503,
    );
  const timeoutMs = Number(env.CAPTION_TIMEOUT_MS || 8000);
  const maxOutputTokens = Number(env.CAPTION_MAX_OUTPUT_TOKENS || 350);
  const jsonMode = env.CAPTION_JSON_MODE || "json_schema";
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 30000 ||
    !Number.isInteger(maxOutputTokens) ||
    maxOutputTokens < 100 ||
    maxOutputTokens > 800 ||
    !["json_schema", "json_object"].includes(jsonMode)
  )
    throw new CaptionError(
      "The caption provider limits are not configured correctly.",
      "NOT_CONFIGURED",
      503,
    );
  const n8nAuthHeader = env.CAPTION_N8N_AUTH_HEADER || "X-Caption-Key";
  const n8nAuthPrefix = env.CAPTION_N8N_AUTH_PREFIX || "";
  if (
    !/^[A-Za-z][A-Za-z0-9-]{0,79}$/.test(n8nAuthHeader) ||
    [
      "host",
      "content-type",
      "content-length",
      "connection",
      "transfer-encoding",
      "origin",
    ].includes(n8nAuthHeader.toLowerCase()) ||
    (n8nAuthPrefix && !/^[A-Za-z][A-Za-z0-9-]{0,30}$/.test(n8nAuthPrefix))
  )
    throw new CaptionError(
      "Invalid n8n authentication header configuration.",
      "NOT_CONFIGURED",
      503,
    );
  return {
    n8nAuthHeader,
    n8nAuthPrefix,
    provider: provider as ProviderConfig["provider"],
    apiKey,
    baseUrl,
    model: env.CAPTION_MODEL || "gpt-4.1-mini",
    timeoutMs,
    maxOutputTokens,
    jsonMode: jsonMode as ProviderConfig["jsonMode"],
  };
}
export class OpenAICompatibleCaptionProvider implements CaptionProvider {
  constructor(
    private readonly config: ProviderConfig,
    private readonly request: typeof fetch = fetch,
  ) {}
  async generate(input: CaptionMetadata): Promise<AiCaption> {
    const metadata = normalizeMetadata(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.request(
        `${this.config.baseUrl}/chat/completions`,
        {
          method: "POST",
          redirect: "error",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: this.config.model,
            messages: buildMessages(metadata),
            max_completion_tokens: this.config.maxOutputTokens,
            response_format:
              this.config.jsonMode === "json_schema"
                ? {
                    type: "json_schema",
                    json_schema: {
                      name: "social_caption",
                      strict: true,
                      schema: captionJsonSchema(metadata),
                    },
                  }
                : { type: "json_object" },
          }),
        },
      );
      if (!response.ok) {
        if (response.status === 429)
          throw new CaptionError(
            "The AI provider is busy or has reached its limit. Please retry shortly.",
            "PROVIDER_RATE_LIMIT",
            429,
          );
        if (response.status === 401 || response.status === 403)
          throw new CaptionError(
            "The AI provider credentials need attention. The demo caption is still available.",
            "PROVIDER_AUTH",
            503,
          );
        throw new CaptionError(
          "The AI provider could not generate a caption. Please retry.",
          "PROVIDER_ERROR",
          502,
        );
      }
      const data = (await response.json()) as {
        choices?: {
          finish_reason?: string;
          message?: { content?: string | null; refusal?: string };
        }[];
      };
      const choice = data.choices?.[0];
      if (
        choice?.finish_reason !== "stop" ||
        choice.message?.refusal ||
        typeof choice.message?.content !== "string"
      )
        throw new CaptionError(
          "The AI could not return a complete caption. Please retry.",
          "INVALID_AI_RESPONSE",
          502,
        );
      let result: unknown;
      try {
        result = JSON.parse(choice.message.content);
      } catch {
        throw new CaptionError(
          "The AI returned an invalid caption format. Please retry.",
          "INVALID_AI_RESPONSE",
          502,
        );
      }
      return { ...validateGenerated(result, metadata.language, metadata.targetCaptionLength), source: "ai" };
    } catch (error) {
      if (controller.signal.aborted)
        throw new CaptionError(
          "AI generation timed out. The demo caption is still available; you can retry.",
          "PROVIDER_TIMEOUT",
          504,
        );
      if (error instanceof CaptionError) throw error;
      throw new CaptionError(
        "The AI service could not be reached. The demo caption is still available.",
        "PROVIDER_ERROR",
        502,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class N8nCaptionProvider implements CaptionProvider {
  constructor(
    private readonly config: ProviderConfig,
    private readonly request: typeof fetch = fetch,
  ) {}
  async generate(input: CaptionMetadata): Promise<AiCaption> {
    const metadata = normalizeMetadata(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.request(this.config.baseUrl, {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          [this.config.n8nAuthHeader]:
            `${this.config.n8nAuthPrefix ? this.config.n8nAuthPrefix + " " : ""}${this.config.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          metadata,
          model: this.config.model,
          messages: buildMessages(metadata),
          responseSchema: captionJsonSchema(metadata),
          maxOutputTokens: this.config.maxOutputTokens,
        }),
      });
      if (!response.ok)
        throw new CaptionError(
          "The n8n caption workflow is unavailable or rejected the request. Please retry.",
          "PROVIDER_ERROR",
          502,
        );
      const result = await response.json();
      return { ...validateGenerated(result, metadata.language, metadata.targetCaptionLength), source: "ai" };
    } catch (error) {
      if (controller.signal.aborted)
        throw new CaptionError(
          "AI generation timed out. The demo caption is still available; you can retry.",
          "PROVIDER_TIMEOUT",
          504,
        );
      if (error instanceof CaptionError) throw error;
      throw new CaptionError(
        "The n8n caption workflow could not return a valid caption. Please retry.",
        "PROVIDER_ERROR",
        502,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
export function configuredCaptionProvider(
  env: NodeJS.ProcessEnv = process.env,
): CaptionProvider {
  const config = readProviderConfig(env);
  return config.provider === "n8n"
    ? new N8nCaptionProvider(config)
    : new OpenAICompatibleCaptionProvider(config);
}
