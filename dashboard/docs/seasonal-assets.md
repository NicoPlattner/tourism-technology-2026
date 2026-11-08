# Seasonal AI campaign visuals

Sixteen original campaign images were generated in this session with the available image-generation tool, in four seasonal batches starting with winter. Each batch was visually inspected before the next was generated. Files are optimized, local portrait WebPs under `src/campaigns/assets/seasonal/` (approximately 960 × 1200, 4:5; about 3.9 MB total). Raw PNG outputs remain in `/workspace/generated_images` for this execution workspace.

| Audience | Winter | Spring | Summer | Autumn |
| --- | --- | --- | --- | --- |
| 18–24 | Happy stretched cat on skis | Big-nosed cute cat hiking among flowers | Round-faced cat hiking beside a lake | Surprised round-bodied cat among golden larches |
| 25–34 | Harmless beginner ski fall | Awkward large trail step | Harmless cycling wobble | Flapping rain poncho |
| 35–44 | Friends at a snowy hut terrace | Friends sharing a mountain view | Friends beside an alpine lake | Friends at a cozy autumn hut |
| 45–60 | Snow-covered panorama | Flowering valley and stream | Green panoramic hiking trail | Golden larches and mountain ridges |

The four user-supplied cat references were adapted in their supplied order across the seasons. Recognizable faces and deliberately imperfect meme textures were preserved. The other twelve images use original photographic concepts with natural colors and candid framing. No text, logos or watermarks were intentionally embedded. These are AI-generated concepts, not photographs of actual visitors, confirmed facilities, named landmarks or current conditions in Paznaun-Ischgl. Human review remains necessary before real marketing use.

## References and limitations

Official tourism pages consulted for activity, terrain, atmosphere and photography direction:

- https://www.ischgl.com/en/winter
- https://www.ischgl.com/en/summer — also inspected its mountain-biking hero photograph for realistic terrain and outdoor context; it is not copied into the app.
- https://www.tyrol.com/activities/sport/hiking

https://www.austria.info/en-gb/activities/hiking/ returned HTTP 403 and could not be consulted. No dedicated web-search tool was available; official pages were fetched directly. Generated landscapes are geographically plausible alpine concepts, not location-accurate representations of identified viewpoints. The cat composites intentionally have a low-polish meme appearance.

## Integration

`src/campaigns/seasonalAssets.ts` contains each asset's ID, local path, age group, season, activity, creative theme, inspected visual description and `ai_generated` provenance. Q1 and Winter 2026/27 map to winter; Q2 to spring; the added Q3 and Q4 choices map to summer and autumn. July and October travel dates are illustrative mock windows; booking lead times remain market-specific. Selection is deterministic by age and season, independent of country. Rendering uses `object-fit: contain` to preserve full subjects.

The caption request receives the actual asset ID, activity, creative theme and visual description. Asset identity joins the existing age/platform/tone/period metadata in cache keys. Changing an image does not call an LLM or image service. All image files are static and bundled with the existing app; no runtime image-generation backend exists.

Previously saved captions with obsolete visual metadata are never presented as matching AI captions. The explicit development caption-generation script reuses matching saved outputs and stores only validated real model responses. Rejected responses leave labelled demo previews, and a later explicit invocation can fill missing entries without regenerating valid ones. Existing age/platform/tone/length rules and live Regenerate behavior remain in place.

The current saved caption collection contains 20 matching default-audience entries across all markets and period choices. Most were generated with `mistral/mistral-medium`; the German winter and summer copy (three period entries, with the winter output shared) used a one-time development override to `gpt-4.1-mini` after the medium model repeatedly returned text below the minimum length. The deployed live model remains environment-configured and was not changed. All stored entries passed the same language, output-schema and requested-length validation.

Deployment publishes each built WebP as a separate content-addressed, branch-labelled binary ConfigMap via server-side apply. Helm excludes WebPs from its chart payload to avoid Kubernetes ConfigMap and Helm release Secret size limits, and projects those asset ConfigMaps alongside the original text site files. Full optimized image quality is preserved. Superseded content-addressed asset ConfigMaps are retained so an older rollout can still serve its hashed image URLs; no other branch's assets are overwritten.

## Image loading and caching

Campaign images are precomputed, but downloading/decoding their WebP bytes and resolving a date-dependent travel window are separate waits. Public samples measured about 0.3 seconds per 120–150 KB image; previously all static assets had `Cache-Control: no-cache`, requiring revalidation on revisits.

`CampaignImage` mounts a new hidden image for each audience/analysis/asset context and shows a stable spinner placeholder until the current image is decoded and travel-window selection is resolved. Old images cannot remain painted during a source swap; late load/decode callbacks cannot reveal a previous context. Image failures show a retry control. The requested image loads eagerly with high fetch priority while data resolves. Reduced-motion preferences are respected.

Only content-hashed WebP URLs receive `public, max-age=31536000, immutable`; HTML, JavaScript and other mutable routes keep their existing cache policy. An actual nginx/browser check transferred 154,444 bytes for the first image fetch and zero bytes for the second. Regression tests cover a slow age-group image, rapid switching, delayed period data and error/retry recovery. No image artwork was changed or generated.
