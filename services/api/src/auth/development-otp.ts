/** In-memory test/development simulator. No phone numbers, SMS, HTTP routes or logs.
 * This is not a production identity provider and does not mint access tokens. */
export class DevelopmentOtp {
  private readonly challenges = new Map<string, number>();
  constructor(private readonly now = Date.now) {
    if (process.env.NODE_ENV !== 'development') throw new Error('Development OTP is disabled');
  }
  issue(): { challengeId: string; code: string } {
    if (process.env.NODE_ENV !== 'development') throw new Error('Development OTP is disabled');
    const challengeId = crypto.randomUUID();
    this.challenges.set(challengeId, this.now() + 60_000);
    return { challengeId, code: '000000' };
  }
  verify(challengeId: string, code: string): boolean {
    if (process.env.NODE_ENV !== 'development') throw new Error('Development OTP is disabled');
    const expiry = this.challenges.get(challengeId);
    this.challenges.delete(challengeId);
    return expiry !== undefined && expiry > this.now() && code === '000000';
  }
}
