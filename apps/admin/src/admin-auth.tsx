import { useEffect, useRef, useState } from 'react';
import type { Schemas } from '@trissea/contracts';
import {AssignedVerificationPanel} from './verification';
import {FareManagement} from './fares';

type Session = Schemas['AdminSession'];
const endpoint = '/v1/admin/auth';
async function fetchSession(signal: AbortSignal): Promise<Session | null> {
  const response = await fetch(endpoint + '/session', { credentials: 'same-origin', cache: 'no-store', signal });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error();
  return response.json() as Promise<Session>;
}

export function AdminAuthPanel({fareManagement=false}:{fareManagement?:boolean}) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState('Checking administrator session…');
  const [busy, setBusy] = useState(true);
  const [todaId, setTodaId] = useState('');
  const [logoutPending, setLogoutPending] = useState(false);
  const pending = useRef(false);
  const loginAttempt = useRef<{ key: string; proof: string } | null>(null);
  const logoutAttempt = useRef<{ key: string; session: Session } | null>(null);
  async function checkSession(signal?: AbortSignal) {
    if (logoutAttempt.current) { await signOut(); return; }
    if (pending.current) return;
    pending.current = true;
    try {
      const current = await fetchSession(signal ?? AbortSignal.timeout(10000));
      setSession(current); setStatus(current ? 'Administrator session active · TOTP verified' : 'Sign in with your approved administrator identity and TOTP.');
    } catch { if (!signal?.aborted) { setSession(null); setStatus('Identity service unavailable. Retry when the local services are running.'); } }
    finally { pending.current = false; if (!signal?.aborted) setBusy(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    fetchSession(controller.signal).then(current => {
      if (!controller.signal.aborted) { setSession(current); setStatus(current ? 'Administrator session active · TOTP verified' : 'Sign in with your approved administrator identity and TOTP.'); }
    }).catch(() => { if (!controller.signal.aborted) setStatus('Identity service unavailable. Retry when the local services are running.'); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, []);
  async function signIn() {
    if (pending.current || logoutAttempt.current) return;
    pending.current = true; setBusy(true); setStatus('Opening secure administrator sign-in…');
    try {
      if (!loginAttempt.current) {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        loginAttempt.current = { key: crypto.randomUUID(), proof: btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '') };
      }
      const response = await fetch(endpoint + '/login', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json', 'Idempotency-Key': loginAttempt.current.key }, body: JSON.stringify({ clientProof: loginAttempt.current.proof }) });
      if (!response.ok) { loginAttempt.current = null; throw new Error(); }
      const body = await response.json() as { authorizationUrl: string };
      window.location.assign(body.authorizationUrl);
    } catch { setStatus('Sign-in could not start. Retry when the local identity service is available.'); setBusy(false); }
    finally { pending.current = false; }
  }
  async function signOut() {
    if (pending.current || (!session && !logoutAttempt.current)) return;
    if (!logoutAttempt.current) logoutAttempt.current = { key: crypto.randomUUID(), session: session! };
    const attempt = logoutAttempt.current;
    // A lost response may already have revoked the cookie. Hide all review data
    // immediately and keep retries bound to this sign-out, never session restore.
    setSession(null);
    setLogoutPending(true);
    pending.current = true; setBusy(true);
    try {
      const response = await fetch(endpoint + '/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attempt.key, 'X-CSRF-Token': attempt.session.csrfToken }, body: '{}' });
      if (!response.ok && response.status !== 401) throw new Error();
      logoutAttempt.current = null;
      setLogoutPending(false);
      setStatus(response.ok ? 'Signed out. Your application session has been revoked.' : 'Session is not active. Sign in with TOTP.');
    } catch { setStatus('Sign-out was not confirmed. Check session or retry.'); }
    finally { pending.current = false; setBusy(false); }
  }
  async function checkScope() {
    if (pending.current) return;
    if (!/^[0-9a-f-]{36}$/.test(todaId)) { setStatus('Enter a valid synthetic TODA identifier.'); return; }
    pending.current = true; setBusy(true);
    try {
      const response = await fetch('/v1/admin/access/todas/' + encodeURIComponent(todaId), { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000) });
      setStatus(response.ok ? 'Authorized for this TODA · Read-only access check · Operations disabled' : response.status === 401 || response.status === 403 ? 'Access denied. Current identity, MFA and scoped grant are required.' : 'Access check unavailable. Retry.');
    } catch { setStatus('Access check unavailable. Retry.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section aria-labelledby="admin-identity" className="admin-identity">
    <h2 id="admin-identity">Administrator identity</h2>
    <p>Local synthetic acceptance only. Keycloak verifies credentials and TOTP; TRISSEA checks current application permissions.</p>
    <p role="status" aria-live="polite">{status}</p>
    <div className="actions">
      <button onClick={() => { setBusy(true); void checkSession(); }} disabled={busy}>Check session / Retry</button>
      <button className="primary" onClick={() => void signIn()} disabled={busy || logoutPending}>{session ? 'Reauthenticate with TOTP' : 'Sign in with Keycloak'}</button>
      {session || logoutPending ? <button onClick={() => void signOut()} disabled={busy}>{logoutPending ? 'Retry sign-out' : 'Sign out'}</button> : null}
    </div>
    {session ? <div>
      <p>Application session: <code>{session.sessionId}</code></p>
      <label htmlFor="toda-access">Synthetic TODA identifier</label>
      <input id="toda-access" value={todaId} onChange={event => setTodaId(event.target.value)} autoComplete="off" spellCheck={false} />
      <button onClick={() => void checkScope()} disabled={busy}>Check scoped access</button>
    </div> : null}
    <p className="subtle">No public registration, account recovery, role delegation or live operations.</p>
    {session?(fareManagement?<FareManagement key={session.sessionId} csrfToken={session.csrfToken}/>:<AssignedVerificationPanel key={session.sessionId} csrfToken={session.csrfToken}/>):null}
  </section>;
}
