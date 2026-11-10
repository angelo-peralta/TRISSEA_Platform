import { useRef, useState } from 'react';
import { createHealthClient } from '@trissea/contracts';
import { themes } from '@trissea/design-tokens';
import { AdminAuthPanel } from './admin-auth';

const client = createHealthClient('/v1');
const navigation = ['Overview', 'Live Rides', 'Drivers & Vehicles', 'TODAs & Zones', 'Fare Management', 'Service Availability', 'Incidents', 'Audit', 'Settings'];

export function AdminShell() {
  const [section, setSection] = useState('Overview');
  const [health, setHealth] = useState('Connection not checked');
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  async function checkConnection() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setHealth('Checking connection…');
    try { await client.getHealth(AbortSignal.timeout(5000)); setHealth('API connected · Ride services remain disabled'); }
    catch { setHealth('API unavailable. Start the local API, then retry.'); }
    finally { inFlight.current = false; setPending(false); }
  }
  return <div className="app" style={{ color: themes.light.textPrimary, background: themes.light.surface }}>
    <a className="skip" href="#main">Skip to content</a>
    <aside>
      <p className="brand">TRISSEA</p><p>Tuguegarao City</p>
      <nav aria-label="Preview navigation">{navigation.map(item => <button key={item} aria-current={section === item ? 'page' : undefined} onClick={() => setSection(item)}>{item}</button>)}</nav>
      <p className="subtle">Local preview. Operational services remain disabled.</p>
    </aside>
    <main id="main">
      <p className="notice">M1 development preview · No live operations</p>
      <h1>{section}</h1>
      {section === 'Fare Management' ? <AdminAuthPanel fareManagement/> : section === 'Overview' ? <section aria-labelledby="foundation">
        <h2 id="foundation">Local foundation</h2><p>Passenger, driver and admin shells are available for development. Identity integration is available on the isolated M2 server; operations remain disabled.</p>
        <p role="status" aria-live="polite">{health}</p><button className="primary" disabled={pending} onClick={() => void checkConnection()}>{pending ? 'Checking…' : 'Check API connection'}</button>
      </section> : <section><h2>Not available in M1</h2><p>This is a navigation preview. No operational records, identity documents or precise locations are loaded.</p></section>}
      {section === 'Overview' ? <AdminAuthPanel /> : null}
      <footer>Regular comes first · Shared OFF · Special OFF · Reservation deferred</footer>
    </main>
  </div>;
}
