export function assertLocalDatabase(databaseUrl, environment) {
  let url;
  try { url = new URL(databaseUrl); }
  catch { throw new Error('Invalid local database configuration'); }
  if (environment !== 'development' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('M1 database tooling permits development loopback databases only');
  }
}

export function assertDisposableIdentityDatabase(databaseUrl, environment, optIn) {
  assertLocalDatabase(databaseUrl, environment);
  const url = new URL(databaseUrl);
  if (optIn !== 'true' || !/^\/trissea_m2_test_[a-f0-9]{12}$/.test(url.pathname)
    || url.search || url.hash) throw new Error('Identity tooling requires an explicitly disposable test database');
}
