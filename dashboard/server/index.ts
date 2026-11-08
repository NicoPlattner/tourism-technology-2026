import { createCaptionServer } from "./http";
import { configuredCaptionProvider } from "./provider";
const server = createCaptionServer(() => configuredCaptionProvider(), {
  allowedOrigins:
    process.env.CAPTION_ALLOWED_ORIGINS?.split(",").filter(Boolean),
  requestsPerMinute: Number(process.env.CAPTION_RATE_LIMIT || 30),
});
server.listen(Number(process.env.CAPTION_PORT || 8787), "0.0.0.0", () =>
  console.log("Caption API ready. Credentials remain server-side."),
);
