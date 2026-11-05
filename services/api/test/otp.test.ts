import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DevelopmentOtp } from '../src/auth/development-otp';

test('OTP simulator requires NODE_ENV=development and consumes each challenge once', () => {
  const previous = process.env.NODE_ENV;
  try {
    for (const env of ['production', 'staging', 'test', '']) {
      process.env.NODE_ENV = env;
      assert.throws(() => new DevelopmentOtp());
    }
    process.env.NODE_ENV = 'development';
    let now = 0;
    const otp = new DevelopmentOtp(() => now);
    const first = otp.issue();
    assert.equal(otp.verify(first.challengeId, first.code), true);
    assert.equal(otp.verify(first.challengeId, first.code), false);
    const expired = otp.issue();
    now = 60_000;
    assert.equal(otp.verify(expired.challengeId, expired.code), false);
    const wrong = otp.issue();
    assert.equal(otp.verify(wrong.challengeId, '111111'), false);
    assert.equal(otp.verify(wrong.challengeId, wrong.code), false);
    process.env.NODE_ENV = 'production';
    assert.throws(() => otp.issue());
    assert.throws(() => otp.verify('anything', '000000'));
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
