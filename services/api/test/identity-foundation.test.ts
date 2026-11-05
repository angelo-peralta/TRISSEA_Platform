import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { IdentityCrypto } from '../src/database/identity-crypto';
import { readIdentityPolicy } from '../src/database/identity-policy';

test('identity encryption is randomized, purpose-bound, authenticated and uses separate lookup keys', () => {
  const crypto = new IdentityCrypto('local-test', randomBytes(32), randomBytes(32));
  const contact = '+639000000001'; // synthetic only, never sent
  const a = crypto.encrypt(contact, 'phone');
  const b = crypto.encrypt(contact, 'phone');
  assert.notEqual(a, b);
  assert.ok(!a.includes(contact));
  assert.equal(crypto.decrypt(a, 'phone'), contact);
  assert.equal(crypto.lookup(contact, 'phone'), crypto.lookup(contact, 'phone'));
  assert.notEqual(crypto.lookup(contact, 'phone'), crypto.lookup(contact, 'admin-subject'));
  assert.throws(() => crypto.decrypt(a, 'admin-subject'), /Invalid encrypted identity/);
  const parts = a.split('.');
  parts[3] = Buffer.alloc(16).toString('base64url');
  assert.throws(() => crypto.decrypt(parts.join('.'), 'phone'), /Invalid encrypted identity/);
  assert.throws(() => new IdentityCrypto('bad', Buffer.alloc(32), Buffer.alloc(32)));
  assert.throws(() => new IdentityCrypto('bad.key', randomBytes(32), randomBytes(32)));
  assert.throws(() => crypto.decrypt('private-malformed-input', 'phone'), { message: 'Invalid encrypted identity' });
});

test('development policy has bounded owner-approved initial settings; capability gates fail closed', () => {
  const policy = readIdentityPolicy({ NODE_ENV: 'test' });
  assert.deepEqual(policy, {
    otpDigits: 6, otpTtlSeconds: 300, otpMaxAttempts: 5, otpResendSeconds: 60,
    otpHourlyLimit: 5, otpDailyLimit: 10, mobileJwtSeconds: 600,
    adminIdleSeconds: 900, adminReauthSeconds: 300, smsProvider: 'mock',
    liveSmsEnabled: false, recoveryEnabled: false, realDocumentsEnabled: false,
    operationsEnabled: false,
  });
  for (const extra of [
    { NODE_ENV: 'production' }, { OTP_DIGITS: '7' }, { OTP_MAX_ATTEMPTS: '0' }, { OTP_MAX_ATTEMPTS: '6' },
    { OTP_TTL_SECONDS: 'NaN' }, { OTP_RESEND_SECONDS: '59' },
    { OTP_DAILY_LIMIT: '11' }, { MOBILE_JWT_SECONDS: '601' },
    { ADMIN_IDLE_SECONDS: '901' }, { ADMIN_REAUTH_SECONDS: '301' },
    { SMS_PROVIDER: 'philsms' }, { SMS_LIVE_ENABLED: 'true' },
    { RECOVERY_ENABLED: 'true' }, { REAL_DOCUMENTS_ENABLED: 'true' },
    { OPERATIONAL_SERVICES_ENABLED: 'true' }, { SMS_LIVE_ENABLED: 'yes' },
  ]) assert.throws(() => readIdentityPolicy({ NODE_ENV: 'test', ...extra }), /Invalid or unapproved identity configuration/);
  assert.equal(readIdentityPolicy({ NODE_ENV: 'development', OTP_MAX_ATTEMPTS: '3' }).otpMaxAttempts, 3);
});
