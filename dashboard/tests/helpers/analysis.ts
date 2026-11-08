import type { Page } from "@playwright/test";
import { mockDemand } from "./demand";
export const historyFixture = {
  monthly: [
    {
      month: "2025-12",
      actual: 100000,
      forecast_tvb: 110000,
      tracking_signal: 5,
    },
    {
      month: "2026-01",
      actual: 200000,
      forecast_tvb: 190000,
      tracking_signal: -2,
    },
  ],
  drivers: [
    {
      driver: "German school holidays",
      stays_total: 12000,
      ci80_low: 3000,
      ci80_high: 18000,
      kind: "push",
      grade: "A",
    },
    {
      driver: "Weekend nights",
      stays_total: -5000,
      ci80_low: -7000,
      ci80_high: -2000,
      kind: "pull",
      grade: "B",
    },
  ],
  summary: {
    method: "Historical model associations, not proven causal effects.",
  },
};
export async function mockAnalysis(page: Page) {
  await mockDemand(page);
  await page.route("**/c04-api/deviations?**", (route) =>
    route.fulfill({ json: historyFixture }),
  );
  const { demandFixture } = await import("./demand");
  await page.route("**/c04-api/query?**", (route) => {
    const q = new URL(route.request().url()).searchParams;
    const data = demandFixture(
      q.get("origin")!,
      q.get("start")!,
      q.get("end")!,
    );
    Object.assign(data.booking_lead_time.value, {
      share_by_days_ahead: {
        "0d": 0.1,
        "8d": 0.2,
        "31d": 0.3,
        "61d": 0.1,
        "90d": 0.2,
        "180d": 0.1,
      },
    });
    return route.fulfill({
      json: {
        ...data,
        age_profile: {
          value: { "age_25-34": 0.2, "age_35-44": 0.4, "age_45-54": 0.4 },
          grade: "C",
          method: "Comparable-region proxy",
          is_estimate: true,
        },
      },
    });
  });
  await page.route("**/c04-api/forecast?**", (route) => {
    const q = new URL(route.request().url()).searchParams,
      start = q.get("start")!,
      end = q.get("end")!;
    const daily = [];
    for (
      let date = start;
      date <= end;
      date = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10)
    ) {
      if (date < "2026-11-01" || date > "2027-04-30") continue;
      daily.push({
        date,
        forecast_ours: 500,
        capacity_est: 1000,
        p10: 400,
        p90: 700,
        forecast_official_tr53: 550,
        grade: "B",
      });
    }
    return route.fulfill({
      json: {
        meta: {
          destination: "Paznaun-Ischgl",
          capacity: "Same weekday last year",
          sources: ["TVB (TTF licence)"],
        },
        daily,
      },
    });
  });
}
