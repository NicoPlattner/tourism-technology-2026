import {
  CaptionError,
  metadataKey,
  normalizeMetadata,
  validateAiCaption,
  type AiCaption,
  type CaptionMetadata,
} from "./contracts";
export class CaptionClient {
  private cache = new Map<string, AiCaption>();
  private inFlight = new Map<string, Promise<AiCaption>>();
  private versions = new Map<string, number>();
  constructor(
    private readonly endpoint: string,
    private readonly request: typeof fetch = fetch.bind(globalThis),
    private readonly timeoutMs = 10000,
  ) {}
  getCached(metadata: CaptionMetadata, identity = "") {
    const value = this.cache.get(identity + metadataKey(metadata));
    return value ? structuredClone(value) : undefined;
  }
  async generate(input: CaptionMetadata, force = false, identity = ""): Promise<AiCaption> {
    const metadata = normalizeMetadata(input);
    const key = identity + metadataKey(metadata);
    if (!force) {
      const cached = this.getCached(metadata, identity);
      if (cached) return cached;
      const pending = this.inFlight.get(key);
      if (pending) return structuredClone(await pending);
    }
    const version = (this.versions.get(key) || 0) + 1;
    this.versions.set(key, version);
    const operation = this.load(metadata).then((result) => {
      if (this.versions.get(key) === version)
        this.cache.set(key, structuredClone(result));
      return result;
    });
    this.inFlight.set(key, operation);
    try {
      return structuredClone(await operation);
    } finally {
      if (this.inFlight.get(key) === operation) this.inFlight.delete(key);
    }
  }
  private async load(metadata: CaptionMetadata): Promise<AiCaption> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.request(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata),
        signal: controller.signal,
      });
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new CaptionError(
          "The AI caption service is unavailable. Please retry.",
          "SERVICE_UNAVAILABLE",
          503,
        );
      const value = await response.json();
      if (!response.ok) {
        const code =
          typeof value?.error?.code === "string"
            ? value.error.code
            : "SERVICE_ERROR";
        const message =
          typeof value?.error?.message === "string"
            ? value.error.message
            : "AI caption generation failed. Please retry.";
        throw new CaptionError(message, code, response.status);
      }
      return validateAiCaption(value, metadata.language, metadata.targetCaptionLength);
    } catch (error) {
      if (controller.signal.aborted)
        throw new CaptionError(
          "AI generation timed out. Please retry.",
          "REQUEST_TIMEOUT",
          504,
        );
      if (error instanceof CaptionError) throw error;
      throw new CaptionError(
        "The AI caption service is unavailable. Please retry.",
        "SERVICE_UNAVAILABLE",
        503,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
