/** Initial development settings, not a production approval. This slice cannot enable external capabilities. */
export function readIdentityPolicy(env: Readonly<Record<string, string | undefined>>) {
  const invalid = () => new Error('Invalid or unapproved identity configuration');
  if (!['development', 'test'].includes(env.NODE_ENV ?? '')) throw invalid();
  function bounded(name: string, fallback: number, minimum: number, maximum: number): number {
    const text = env[name] ?? String(fallback);
    if (!/^\d+$/.test(text)) throw invalid();
    const value = Number(text);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw invalid();
    return value;
  }
  for (const flag of ['SMS_LIVE_ENABLED', 'RECOVERY_ENABLED', 'REAL_DOCUMENTS_ENABLED', 'OPERATIONAL_SERVICES_ENABLED']) {
    if (env[flag] !== undefined && env[flag] !== 'false') throw invalid();
  }
  if (env.SMS_PROVIDER !== undefined && env.SMS_PROVIDER !== 'mock') throw invalid();
  if (env.OTP_DIGITS !== undefined && env.OTP_DIGITS !== '6') throw invalid();
  const otpHourlyLimit = bounded('OTP_HOURLY_LIMIT', 5, 1, 5);
  const otpDailyLimit = bounded('OTP_DAILY_LIMIT', 10, otpHourlyLimit, 10);
  return Object.freeze({
    otpDigits: 6 as const, otpTtlSeconds: bounded('OTP_TTL_SECONDS', 300, 60, 300),
    otpMaxAttempts: bounded('OTP_MAX_ATTEMPTS', 5, 1, 5), otpResendSeconds: bounded('OTP_RESEND_SECONDS', 60, 60, 3600),
    otpHourlyLimit, otpDailyLimit, mobileJwtSeconds: bounded('MOBILE_JWT_SECONDS', 600, 60, 600),
    adminIdleSeconds: bounded('ADMIN_IDLE_SECONDS', 900, 60, 900), adminReauthSeconds: bounded('ADMIN_REAUTH_SECONDS', 300, 30, 300),
    smsProvider: 'mock' as const, liveSmsEnabled: false as const, recoveryEnabled: false as const,
    realDocumentsEnabled: false as const, operationsEnabled: false as const,
  });
}
