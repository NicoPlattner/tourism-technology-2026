import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  CaptionError,
  normalizeMetadata,
} from "../src/campaigns/captions/contracts";
import type { CaptionProvider } from "./provider";
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
async function readJson(req: IncomingMessage) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 16384)
      throw new CaptionError(
        "Campaign metadata is too large.",
        "INVALID_METADATA",
        413,
      );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new CaptionError(
      "Send campaign metadata as JSON.",
      "INVALID_METADATA",
      400,
    );
  }
}
export function createCaptionServer(
  getProvider: () => CaptionProvider,
  options: { allowedOrigins?: string[]; requestsPerMinute?: number } = {},
) {
  let count = 0;
  let windowEnd = Date.now() + 60000;
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url || "/", "http://localhost").pathname;
      if (pathname === "/healthz") {
        json(res, 200, { ok: true, service: "caption-assistant" });
        return;
      }
      if (pathname !== "/api/marketing/generate-caption") {
        json(res, 404, {
          error: { code: "NOT_FOUND", message: "Endpoint not found." },
        });
        return;
      }
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        json(res, 405, {
          error: {
            code: "METHOD_NOT_ALLOWED",
            message: "Use POST for caption generation.",
          },
        });
        return;
      }
      if (!req.headers["content-type"]?.startsWith("application/json"))
        throw new CaptionError(
          "Content-Type must be application/json.",
          "INVALID_METADATA",
          415,
        );
      if (
        req.headers["sec-fetch-site"] === "cross-site" ||
        (req.headers.origin &&
          new URL(req.headers.origin).host !== req.headers.host &&
          !options.allowedOrigins?.includes(req.headers.origin))
      )
        throw new CaptionError(
          "Cross-origin caption requests are not accepted.",
          "ORIGIN_REJECTED",
          403,
        );
      const metadata = normalizeMetadata(await readJson(req));
      if (Date.now() > windowEnd) {
        count = 0;
        windowEnd = Date.now() + 60000;
      }
      if (count >= (options.requestsPerMinute ?? 30)) {
        res.setHeader("Retry-After", "60");
        throw new CaptionError(
          "Too many caption requests. Please retry in a minute.",
          "RATE_LIMIT",
          429,
        );
      }
      const provider = getProvider();
      count++;
      const result = await provider.generate(metadata);
      json(res, 200, result);
    } catch (error) {
      const problem =
        error instanceof CaptionError
          ? error
          : new CaptionError(
              "Caption generation is temporarily unavailable. Please retry.",
              "INTERNAL_ERROR",
              500,
            );
      json(res, problem.status, {
        error: { code: problem.code, message: problem.message },
      });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
