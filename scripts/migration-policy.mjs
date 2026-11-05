export function assertLocalDatabase(databaseUrl, environment) {
  let url;
  try { url = new URL(databaseUrl); }
  catch { throw new Error('Invalid local database configuration'); }
  if (environment !== 'development' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('M1 database tooling permits development loopback databases only');
  }
}
