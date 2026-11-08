import ArrowIcon from "./ArrowIcon";
import { useState } from "react";
import geography from "../data/europe.json";
import { MARKETS, type SourceMarket } from "../types";
const SUPPORTED = new Set(MARKETS.map((m) => m.code));
const coordinate = (lon: number, lat: number) => {
  const scale = 700 / ((41 * Math.PI) / 180);
  return [
    (((lon + 13) * Math.PI) / 180) * scale,
    (Math.log(Math.tan(Math.PI / 4 + (61 * Math.PI) / 360)) -
      Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) *
      scale,
  ];
};
const CENTRES: Record<SourceMarket, [number, number]> = {
  DE: [10.5, 51.1],
  NL: [5.4, 52.2],
  BE: [4.6, 50.65],
  AT: [14.1, 47.6],
};
export default function SourceMarketMap({
  selected,
  onSelect,
}: {
  selected: SourceMarket;
  onSelect: (market: SourceMarket) => void;
}) {
  const [hover, setHover] = useState<SourceMarket | null>(null);
  const [x, y] = coordinate(...CENTRES[selected]);
  const [targetX, targetY] = coordinate(10.2917, 47.0127);
  return (
    <section className="card cp-map-card" aria-labelledby="cp-market-heading">
      <div className="card-head">
        <div>
          <p className="eyebrow">01 / Choose your audience</p>
          <h2 id="cp-market-heading">Where will the next story travel?</h2>
        </div>
        <span className="status sample">4 markets</span>
      </div>
      <div className="cp-map-surface">
        <div className="cp-map-caption">
          <span>EUROPE / SOURCE MARKETS</span>
          <span aria-live="polite">
            {MARKETS.find((m) => m.code === (hover || selected))?.name}
          </span>
        </div>
        <svg
          className="cp-europe-map"
          viewBox={`0 0 ${geography.width} ${geography.height}`}
          aria-label="Europe source market map. Select Germany, Netherlands, Belgium or Austria."
        >
          <rect
            width={geography.width}
            height={geography.height}
            fill="var(--bg)"
          />
          <g>
            {geography.countries
              .filter((country) => !SUPPORTED.has(country.id as SourceMarket))
              .map((country) => (
                <path
                  key={country.id + country.name}
                  d={country.path}
                  className="cp-country-muted"
                >
                  <title>{country.name}</title>
                </path>
              ))}
          </g>
          <g>
            {geography.countries
              .filter((country) => SUPPORTED.has(country.id as SourceMarket))
              .map((country) => (
                <path
                  key={country.id}
                  d={country.path}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${MARKETS.find((m) => m.code === country.id)?.name}`}
                  aria-pressed={selected === country.id}
                  className={`cp-country ${selected === country.id ? "selected" : ""}`}
                  onClick={() => onSelect(country.id as SourceMarket)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(country.id as SourceMarket);
                    }
                  }}
                  onMouseEnter={() => setHover(country.id as SourceMarket)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(country.id as SourceMarket)}
                  onBlur={() => setHover(null)}
                >
                  <title>
                    {MARKETS.find((m) => m.code === country.id)?.name} · select
                    source market
                  </title>
                </path>
              ))}
          </g>
          <g className="cp-map-labels" aria-hidden="true">
            {[
              [2, 46.8, "FRANCE"],
              [19.2, 52.1, "POLAND"],
              [18.2, 49.7, "CZECHIA"],
              [8.5, 45.0, "ITALY"],
              [-3.4, 53.3, "UNITED KINGDOM"],
              [17, 58.2, "SWEDEN"],
            ].map(([lon, lat, text]) => {
              const [px, py] = coordinate(lon as number, lat as number);
              return (
                <text key={text} x={px} y={py}>
                  {text}
                </text>
              );
            })}
          </g>
          <path
            className="cp-map-connection"
            d={`M${x},${y}Q${(x + targetX) / 2 + 65},${(y + targetY) / 2} ${targetX},${targetY}`}
            aria-hidden="true"
          />
          <g className="cp-market-labels" aria-hidden="true">
            {MARKETS.map((market) => {
              const [px, py] = coordinate(...CENTRES[market.code]);
              return (
                <text
                  key={market.code}
                  x={px}
                  y={py}
                  className={selected === market.code ? "selected" : ""}
                >
                  {market.code}
                </text>
              );
            })}
          </g>
          <g
            className="cp-destination"
            transform={`translate(${targetX},${targetY})`}
            aria-hidden="true"
          >
            <circle r="13" className="cp-destination-halo" />
            <circle r="5" />
            <path d="m-2 0 2-3 2 3" />
            <rect x="-69" y="17" width="138" height="26" />
            <text x="0" y="34">
              ISCHGL · DESTINATION
            </text>
          </g>
        </svg>
        <div className="cp-map-key">
          <span>
            <i /> Selected source market
          </span>
          <span>
            <i /> Available market
          </span>
          <span>Click a country to explore</span>
        </div>
      </div>
      <div
        className="cp-country-chips"
        role="group"
        aria-label="Source market shortcuts"
      >
        {MARKETS.map((market) => (
          <button
            key={market.code}
            className={market.code === selected ? "on" : ""}
            onClick={() => onSelect(market.code)}
            aria-pressed={market.code === selected}
          >
            <b>{market.code}</b>
            <span>{market.name}</span>
            <span aria-hidden="true">
              {market.code === selected ? "✓" : <ArrowIcon />}
            </span>
          </button>
        ))}
      </div>
      <p className="cp-map-attribution">
        Boundaries:{" "}
        <a href={geography.sourceUrl} target="_blank" rel="noreferrer">
          Natural Earth · public domain
        </a>
        . Campaign recommendations use fictional data.
      </p>
    </section>
  );
}
