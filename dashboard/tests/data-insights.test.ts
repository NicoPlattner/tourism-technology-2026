import test from "node:test";
import assert from "node:assert/strict";
import {
  historicalSummary,
  parseForecast,
  parseHistory,
  parseMarket,
  summarizeForecast,
  validPeriod,
} from "../src/analytics/data";
import { demandFixture } from "./helpers/demand";
const dates = { start: "2027-01-01", end: "2027-01-03" };
const forecast = (rows: unknown[]) => ({
  meta: { capacity: "last year", sources: ["TVB"] },
  daily: rows,
});

test("utilisation uses matched capacity-weighted days; missing capacity never implies spare beds", () => {
  const data = parseForecast(
    forecast([
      {
        date: dates.start,
        forecast_ours: 90,
        capacity_est: 100,
        p10: 70,
        p90: 120,
      },
      { date: "2027-01-02", forecast_ours: 400, capacity_est: 1000 },
      { date: dates.end, forecast_ours: 10000, capacity_est: null },
    ]),
    dates,
  );
  const summary = summarizeForecast(data.daily, dates);
  assert.equal(summary.occupancy, 490 / 1100);
  assert.equal(summary.spare, 610);
  assert.equal(summary.nights, 10490);
  assert.equal(summary.capacityDays, 2);
  assert.equal(summary.spareDays, 1);
  assert.equal(summary.coverage, 3);
  assert.equal(summary.expectedDays, 3);
});
test("missing and zero capacity remain unknown; excess demand does not cancel spare days", () => {
  const data = parseForecast(
    forecast([
      { date: dates.start, forecast_ours: 200, capacity_est: 100 },
      { date: dates.end, forecast_ours: 50, capacity_est: 100 },
    ]),
    dates,
  );
  assert.equal(summarizeForecast(data.daily, dates).spare, 50);
  assert.equal(summarizeForecast(data.daily, dates).tightDays, 1);
  const missing = parseForecast(
    forecast([{ date: dates.start, forecast_ours: 20, capacity_est: 0 }]),
    dates,
  );
  assert.equal(summarizeForecast(missing.daily, dates).occupancy, null);
  assert.equal(summarizeForecast(missing.daily, dates).spare, null);
  assert.equal(summarizeForecast([], dates).coverage, 0);
});
test("forecast filters inclusively, sorts dates, and rejects duplicates or invalid values", () => {
  const row = { date: dates.start, forecast_ours: 100 };
  assert.deepEqual(
    parseForecast(
      forecast([
        { ...row, date: "2027-01-04" },
        { ...row, date: dates.end },
        row,
      ]),
      dates,
    ).daily.map((r) => r.date),
    [dates.start, dates.end],
  );
  assert.throws(() => parseForecast(forecast([row, row]), dates), /duplicate/);
  assert.throws(() =>
    parseForecast(forecast([{ ...row, forecast_ours: -1 }]), dates),
  );
  assert.throws(() =>
    parseForecast(forecast([{ ...row, date: "2027-02-30" }]), dates),
  );
  assert.equal(
    parseForecast(forecast([{ ...row, p10: 200, p90: 50 }]), dates).daily[0]
      .low,
    null,
  );
});
test("date filters reject reversed, invalid and out-of-coverage ranges", () => {
  assert.ok(validPeriod(dates));
  assert.ok(validPeriod({ start: dates.start, end: dates.start }));
  assert.ok(!validPeriod({ start: dates.end, end: dates.start }));
  assert.ok(!validPeriod({ start: "2027-02-30", end: "2027-03-01" }));
  assert.ok(!validPeriod({ start: "2023-12-31", end: dates.end }));
  assert.ok(!validPeriod({ start: dates.start, end: "2028-01-01" }));
});
test("historical bias and error use actual-night weights, not an average of monthly percentages", () => {
  const rows = [
    { month: "2026-01", actual: 100, forecast: 200, tracking: null },
    { month: "2026-02", actual: 900, forecast: 810, tracking: 5 },
  ];
  assert.deepEqual(historicalSummary(rows), {
    actual: 1000,
    forecast: 1010,
    bias: 0.01,
    weightedError: 0.19,
  });
  assert.equal(historicalSummary([]).bias, null);
  assert.throws(() =>
    parseHistory({ monthly: [{ actual: null }], drivers: [] }),
  );
  const history = parseHistory({
    monthly: [{ month: "2026-01", actual: 100, forecast_tvb: 90 }],
    drivers: [
      { driver: "A", stays_total: 10 },
      { driver: "B", stays_total: -30 },
    ],
  });
  assert.equal(history.drivers[0].name, "B");
});
test("market analysis enforces origin and period and retains only valid numerical profile shares", () => {
  const raw = {
    ...demandFixture("DE", dates.start, dates.end),
    age_profile: {
      value: { "age_25-34": 0.3, median_age_band: "35-44", age_bad: -1 },
      method: "proxy",
      grade: "C",
      is_estimate: true,
    },
  };
  const parsed = parseMarket(raw, "DE", dates);
  assert.deepEqual(parsed.age?.value, { "age_25-34": 0.3 });
  assert.equal(parsed.distribution, undefined);
  assert.throws(() => parseMarket(raw, "NL", dates));
  assert.throws(() => parseMarket(raw, "DE", { ...dates, end: "2027-01-04" }));
});
