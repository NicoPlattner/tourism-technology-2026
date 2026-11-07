import { TRAVEL_PERIODS, type TravelPeriod } from "../types";
export default function TravelPeriodSelector({
  value,
  onChange,
}: {
  value: TravelPeriod;
  onChange: (period: TravelPeriod) => void;
}) {
  return (
    <label className="cp-period-label">
      Target travel period
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as TravelPeriod)}
        aria-describedby="cp-period-help"
      >
        {TRAVEL_PERIODS.map((period) => (
          <option key={period.id} value={period.id}>
            {period.label} · {period.range}
          </option>
        ))}
      </select>
      <span id="cp-period-help">
        When guests visit, not when you advertise.
      </span>
    </label>
  );
}
