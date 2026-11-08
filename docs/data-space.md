# Data products on the TTF Data Space

The data API is published on the TTF Data Space (nexyo, <https://space.ttf.nexyo.io>) as two API products
of team "WeMissYouFlo<3", so other teams can contract and call it through the Data Space.

| Product | Catalogue ID | Access | Licence | Operations |
|---|---|---|---|---|
| Tirol & Austria Demand by Origin (live API) | `686b6ee9-b02a-425f-bc82-b46edcd0718d` | members (contract) | `odbl-1.0` (team licence) | query-demand, get-meta, list-tables, get-table, get-health |
| Paznaun-Ischgl Demand Outlook & Actions (live API) | `b22c8ce1-bd62-431e-bcd0-03a0fa90a1dc` | members (contract) | `c04-tvb-derived-nc-v1` (team licence: attribution TVB Paznaun-Ischgl with feratel, non-commercial) | get-actions, get-forecast, get-deviations, get-warnings, get-table, get-health |

Both are connected to the API source "Tirol & Austria Demand by Origin (live APIs)"
(`700ffe3d-82e3-4606-8ab8-ec223ea7f650`), imported in the TTF Space interface from
`https://hackathon.daria-and-nico.com/c04-api/openapi.json` (base URL `https://hackathon.daria-and-nico.com`,
no authentication).

## Publishing

[`c04/dataspace/publish.py`](../c04/dataspace/publish.py) talks to the Data Space MCP endpoint
(`https://space.ttf.nexyo.io/api/v1/mcp`) and needs a team key with `products:write`. Request keys are
derived from the request content, so re-runs repeat instead of duplicating.

```bash
python3 c04/dataspace/publish.py draft      # team licences, drafts, description, sources, contact, coverage
python3 c04/dataspace/publish.py publish    # connect the API source, set access, publish, list in the catalogue
python3 c04/dataspace/publish.py update     # catalogue texts of the published products (c04/dataspace/texts.py)
python3 c04/dataspace/publish.py status     # products, checklists, API sources
```

Catalogue texts, sources, field schemas and coverage are kept in
[`c04/dataspace/texts.py`](../c04/dataspace/texts.py).

## What we learned

- **API sources are created in the interface.** The MCP tools create products, but an API source (the
  imported OpenAPI document) is made in TTF Space. Required parameters without defaults become "fixed values",
  set by the provider: every parameter of our API therefore has a default.
- **Connected APIs are never open.** Access is members or one challenge; "everyone" exists only for hosted
  files.
- **Restricted sources cannot be formal sources** of a product under another licence ("restricted sources
  must retain their licence"). The TVB and Salzburger Sportwelt products are named as linked sources.
- **Licences cannot change on a published product.** Product 1 is under ODbL but also returns aggregates
  derived from TVB and Sportwelt data (non-commercial licences); a republish under a non-commercial licence
  would align it.
- **Write keys** are separate from read keys (`products:write` scope); the Data Space exposes its
  publishing tools only to such keys.
