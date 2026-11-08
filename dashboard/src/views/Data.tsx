import type { ViewProps } from '../App';
import Season from './Season';
import Why from './Why';
import Capacity from './Capacity';
import './data-overview.css';

export default function Data(props: ViewProps) {
  return (
    <div className="view dr-data">
      <div className="view-head">
        <p className="eyebrow">Destination intelligence</p>
        <h1>Data</h1>
        <p className="lead">Seasonal trends, forecast deviations and bed capacity in one place.</p>
      </div>
      <nav className="dr-data-links" aria-label="Data sections">
        <a className="btn ghost" href="#season">Season</a>
        <a className="btn ghost" href="#why">Deviations</a>
        <a className="btn ghost" href="#capacity">Beds</a>
      </nav>
      <section id="season" className="dr-data-section" aria-labelledby="data-season-heading">
        <h2 id="data-season-heading">Season</h2>
        <Season {...props} />
      </section>
      <section id="why" className="dr-data-section" aria-labelledby="data-deviations-heading">
        <h2 id="data-deviations-heading">Deviations</h2>
        <Why {...props} />
      </section>
      <section id="capacity" className="dr-data-section" aria-labelledby="data-beds-heading">
        <h2 id="data-beds-heading">Beds</h2>
        <Capacity {...props} />
      </section>
    </div>
  );
}
