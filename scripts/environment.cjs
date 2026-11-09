// One dotenv boundary for first-party tools. Credentials never belong in output.
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { parseEnv } = require('node:util');
const { fields, bounds } = require('./environment-schema.cjs');

const root = resolve(__dirname, '..');
const localFile = resolve(root, '.env.local');
const closedFlags = ['SMS_LIVE_ENABLED', 'RECOVERY_ENABLED', 'REAL_DOCUMENTS_ENABLED', 'OPERATIONAL_SERVICES_ENABLED', 'TRISSEA_PRODUCTION_ENABLED'];
const profiles = ['foundation', 'test', 'passenger', 'driver', 'admin'];

function invalid(key) { return new Error(`Invalid configuration: ${key}`); }
function parseFile(file, optional = false) {
  try { return parseEnv(readFileSync(file, 'utf8')); }
  catch (error) {
    if (optional && error.code === 'ENOENT') return {};
    throw invalid('environment file');
  }
}
function validate(values, production = false) {
  if (!['development', 'test', 'production'].includes(values.NODE_ENV)) throw invalid('NODE_ENV');
  if (production !== (values.NODE_ENV === 'production')) throw invalid('NODE_ENV');
  for (const key of closedFlags) if (values[key] !== undefined && values[key] !== 'false') throw invalid(key);
  if (production ? values.SMS_PROVIDER === 'mock' : values.SMS_PROVIDER !== undefined && values.SMS_PROVIDER !== 'mock') throw invalid('SMS_PROVIDER');
  for (const [key, value] of Object.entries(values)) {
    if (/(?:_ENABLED|_DISPOSABLE_DATABASE)$/.test(key) && value !== undefined && !['true', 'false'].includes(value)) throw invalid(key);
    if (/_PORT$/.test(key) && value !== undefined && value !== '' && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)) throw invalid(key);
  }
  for (const [key, [, minimum, maximum]] of Object.entries(bounds)) {
    const value = values[key];
    if (value !== undefined && (!/^\d+$/.test(value) || Number(value) < minimum || Number(value) > maximum)) throw invalid(key);
  }
  if (Number(values.OTP_DAILY_LIMIT) < Number(values.OTP_HOURLY_LIMIT)) throw invalid('OTP_DAILY_LIMIT');
  const databaseKeys = ['M1_DATABASE_URL', 'M2_TEST_CONTROL_URL', 'ADMIN_DATABASE_URL', 'PASSENGER_LOCAL_DATABASE_URL', 'DRIVER_LOCAL_DATABASE_URL'];
  const databases = new Map();
  for (const key of databaseKeys) if (values[key]) {
    let url;
    try { url = new URL(values[key]); } catch { throw invalid(key); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.search || url.hash) throw invalid(key);
    if (!production && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw invalid(key);
    if (key !== 'M1_DATABASE_URL' && !production && (url.port !== (values.M2_TEST_POSTGRES_PORT ?? '15433') || (key === 'M2_TEST_CONTROL_URL' ? url.pathname !== '/m2_control' : !/^\/trissea_m2_test_[a-f0-9]{12}$/.test(url.pathname)))) throw invalid(key);
    databases.set(key, url);
  }
  const m1 = databases.get('M1_DATABASE_URL');
  if (m1 && m1.port === (values.M2_TEST_POSTGRES_PORT ?? '15433')) throw invalid('M1/M2 database isolation');
  const fixtureLogins = ['ADMIN_DATABASE_URL', 'PASSENGER_LOCAL_DATABASE_URL', 'DRIVER_LOCAL_DATABASE_URL'].map(k => databases.get(k)).filter(Boolean);
  if (new Set(fixtureLogins.map(u => u.username)).size !== fixtureLogins.length) throw invalid('fixture role separation');
  return values;
}
function loadLocal({ environment = process.env, file = localFile, optional = false } = {}) {
  // Check process mode BEFORE touching a local file. No production fallback.
  if (environment.NODE_ENV === 'production') throw invalid('local file prohibited in production');
  const values = { ...Object.fromEntries(Object.entries(fields).map(([key, [value]]) => [key, value])), ...parseFile(file, optional), ...environment };
  values.NODE_ENV ??= 'development';
  return validate(values);
}
function loadProduction({ environment = process.env, file } = {}) {
  if (environment.NODE_ENV !== 'production') throw invalid('NODE_ENV');
  if (file !== undefined && resolve(file) !== resolve(root, '.env.production')) throw invalid('production file');
  return validate({ ...(file ? parseFile(file) : {}), ...environment }, true);
}
function environmentFor(profile, options = {}) {
  if (!profiles.includes(profile)) throw invalid('profile');
  const injected = options.environment ?? process.env;
  const values = loadLocal(options);
  const result = { ...values, TRISSEA_CONFIG_PROFILE: profile };
  const assign = (target, source, fallback = '') => { result[target] = injected[target] ?? values[source] ?? fallback; };
  // Slice fixtures are distinct databases and roles, not a deployment topology.
  result.M2_PASSENGER_AUTH_ENABLED = 'false';
  result.M2_DRIVER_AUTH_ENABLED = 'false';
  result.M2_ADMIN_AUTH_ENABLED = 'false';
  result.M2_VERIFICATION_ENABLED = 'false';
  result.M2_DISPOSABLE_DATABASE = 'false';
  if (profile === 'foundation') {
    for (const key of ['DATABASE_URL', 'REDIS_URL', 'API_PORT']) assign(key, 'M1_' + key);
    if (!result.DATABASE_URL || !result.REDIS_URL) throw invalid('foundation connections');
  } else if (profile === 'test') {
    result.NODE_ENV = 'development'; // Existing migration tooling requires this AND a disposable manifest.
    result.M2_DISPOSABLE_DATABASE = values.M2_TEST_DISPOSABLE_DATABASE ?? 'false';
    if (result.M2_DISPOSABLE_DATABASE !== 'true' || !result.M2_TEST_CONTROL_URL) throw invalid('disposable test configuration');
  } else if (profile === 'admin') {
    assign('API_PORT', 'ADMIN_API_PORT', '4102');
    result.M2_ADMIN_AUTH_ENABLED = injected.M2_ADMIN_AUTH_ENABLED ?? values.ADMIN_LOCAL_AUTH_ENABLED ?? 'false';
  } else {
    const prefix = profile.toUpperCase() + '_LOCAL_';
    assign('API_PORT', prefix + 'API_PORT', profile === 'driver' ? '4101' : '4100');
    for (const key of ['DATABASE_URL', 'KEYS_FILE', 'REDIS_URL', 'REDIS_NAMESPACE']) assign('M2_PASSENGER_' + key, prefix + key);
    for (const key of ['ISSUER', 'AUDIENCE']) assign('PASSENGER_JWT_' + key, prefix + 'JWT_' + key);
    assign('DRIVER_JWT_AUDIENCE', prefix + 'DRIVER_JWT_AUDIENCE', 'trissea-driver-local');
    result.M2_AUTH_MODE = 'local-synthetic';
    result.M2_PASSENGER_AUTH_ENABLED = injected.M2_PASSENGER_AUTH_ENABLED ?? values[prefix + 'AUTH_ENABLED'] ?? 'false';
    if (profile === 'driver') result.M2_DRIVER_AUTH_ENABLED = injected.M2_DRIVER_AUTH_ENABLED ?? values[prefix + 'AUTH_ENABLED'] ?? 'false';
  }
  return validate(result);
}
function updateLocal(additions) {
  if (process.env.NODE_ENV === 'production') throw invalid('production configuration write');
  const before = existsSync(localFile) ? readFileSync(localFile, 'utf8') : 'NODE_ENV=development\n';
  const existing = parseEnv(before);
  if (existing.NODE_ENV === 'production') throw invalid('production configuration write');
  for (const [key, value] of Object.entries(additions)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || typeof value !== 'string' || /[\r\n]/.test(value)) throw invalid('update');
    // Preparation may fill an empty placeholder, never rotate a configured value.
    if (existing[key] && existing[key] !== value) throw invalid(key + ' already configured');
  }
  let after = before;
  for (const [key, value] of Object.entries(additions)) {
    if (value.includes('"') && value.includes("'")) throw invalid(key + ' quoting');
    const quote = value.includes('"') ? "'" : '"';
    const line = key + '=' + quote + value + quote + '\n';
    const pattern = new RegExp('^' + key + '=.*\\r?\\n?', 'm');
    after = pattern.test(after) ? after.replace(pattern, () => line) : after + (after.endsWith('\n') ? '' : '\n') + line;
  }
  const parsed = parseEnv(after);
  for (const [key, value] of Object.entries({ ...existing, ...additions })) if (parsed[key] !== value) throw invalid(key + ' preservation');
  validate({ ...parsed, NODE_ENV: 'development' });
  writeFileSync(localFile, after, { mode: 0o600 });
}

module.exports = { root, localFile, profiles, closedFlags, loadLocal, loadProduction, environmentFor, updateLocal };
