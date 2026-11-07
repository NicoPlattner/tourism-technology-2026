# Interactive campaign Overview

This module replaces only `src/views/Overview.tsx`. The dashboard shell, navigation, global design system, Data, Actions and all other views remain unchanged. It is a browser-only fictional campaign demo; there is no backend, LLM, Instagram connection or real publishing.

## Run and verify

From `dashboard/`:

```sh
npm ci
npm run dev
npm run typecheck
npm run test:unit
npm test
npm run build
```

The project had no existing lint or test scripts; TypeScript checking remains part of its original production build. New tests use Node's built-in test runner through `tsx`, plus Playwright. Browser tests use `/usr/bin/chromium` by default; set `CHROMIUM_PATH` for another installation. `TEST_URL` can point to a production preview with its branch prefix and trailing slash. Test results are ignored by Git.

## Provider contract

`CampaignDataProvider.getRecommendation(market, period)` returns a promise of a typed `CampaignRecommendation`. The Overview accepts an optional provider prop and defaults to the singleton `MockCampaignDataProvider`. Replace this adapter (or inject another one) to use a future campaign service; the map, selector, reasoning, preview and review components consume the same recommendation model. Keep stable recommendation IDs per market/period/version so approvals are associated with the correct creative.

The model contains the assigned adult audience, source market, target travel dates, assumed booking lead, separately calculated promotion dates, proposed content slots, localized caption/hashtags, reasoning, assumptions and asset provenance. Asset references are plain URL strings, so future AI-generated or uploaded images do not require replacing the preview. Their source must be identified and reviewed. Belgium initially uses French; the language model also supports Dutch.

All four Q1 scenarios are predefined. Germany uses a February arrival and a 60-day assumed lead; the Netherlands a late-March arrival and 14 days; Belgium February and 35 days; Austria January and 21 days. The promotion starts at arrival minus lead time and lasts eight calendar days. Three illustrative publishing slots occur at 18:00 Europe/Vienna on days 0, 3 and 6. Winter selects the same winter personas with an explicit winter context; Q2 selects April/May variants with new dates, spring captions and spring artwork. None of these fictional audiences, holidays, event opportunities or booking patterns is inferred from the dashboard's live/open/uploaded data.

The Overview ignores obsolete async responses after a selection changes and includes loading, failure and retry states. Approval is local React state, keyed by recommendation ID, retained while switching countries and periods within the current Overview session. Navigating away or reloading resets it. The native review dialog supports Escape, keyboard focus containment and return to the trigger. Approval records a snapshot of the proposed caption and posting dates; it never publishes or contacts a scheduling API.

## Map and artwork

`data/europe.json` bundles genuine Natural Earth 1:110m Admin 0 country boundaries, preprojected into Web Mercator and cropped by the SVG viewBox. The map is fully local, with no tiles, geocoding or map API. Germany, Netherlands, Belgium and Austria are both mouse- and keyboard-selectable; ordinary buttons provide an alternative selector. Other countries stay muted.

Source: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson

Natural Earth terms: https://www.naturalearthdata.com/about/terms-of-use/ (public domain).

The eight SVG assets are original, project-authored meme-inspired illustrations: a spinning ski cat, an unimpressed snowboard cat, an absurdist nugget on a sledge and a playful Alpine marmot, plus spring variants. No third-party meme photographs are fetched or embedded. Images do not represent verified resort conditions, snow cover, lift operation or availability.

All new CSS is scoped to `cp-*` Overview/review components and uses existing `--red`, `--slate`, `--surface`, typography, card, status and button patterns. No global styles or other page components were modified.
