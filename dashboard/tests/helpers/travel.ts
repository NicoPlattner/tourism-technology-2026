import type { Page } from "@playwright/test";
export async function selectPeriod(page: Page, period: string) {
  const dates:Record<string,[string,string]> = {
    "q1-2027":["2027-02-15","2027-02-21"],"winter-2026-27":["2027-02-15","2027-02-21"],
    "q2-2027":["2027-04-12","2027-04-18"],"q3-2027":["2027-07-12","2027-07-18"],"q4-2027":["2027-10-11","2027-10-17"],
  };
  await page.getByLabel("Travel start date",{exact:true}).fill(dates[period][0]);
  await page.getByLabel("Travel end date",{exact:true}).fill(dates[period][1]);
}
