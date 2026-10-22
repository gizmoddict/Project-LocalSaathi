import { TwilioVerifyProvider } from '../services/sms.provider';
import { OtpService } from '../services/otp.service';

describe('TwilioVerifyProvider', () => {
  const provider = new TwilioVerifyProvider();
  const originalEnv = {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    serviceSid: process.env.TWILIO_VERIFY_SERVICE_SID,
  };

  beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = 'ACtest';
    process.env.TWILIO_AUTH_TOKEN = 'test-token';
    process.env.TWILIO_VERIFY_SERVICE_SID = 'VAtest';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalEnv.accountSid === undefined) delete process.env.TWILIO_ACCOUNT_SID;
    else process.env.TWILIO_ACCOUNT_SID = originalEnv.accountSid;
    if (originalEnv.authToken === undefined) delete process.env.TWILIO_AUTH_TOKEN;
    else process.env.TWILIO_AUTH_TOKEN = originalEnv.authToken;
    if (originalEnv.serviceSid === undefined) delete process.env.TWILIO_VERIFY_SERVICE_SID;
    else process.env.TWILIO_VERIFY_SERVICE_SID = originalEnv.serviceSid;
  });

  it('starts SMS verification with an E.164 Indian destination', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ status: 'pending' }),
    } as Response);

    await expect(provider.sendOtp('9876501234', '123456')).resolves.toBe(true);

    const firstCall = fetchMock.mock.calls[0];
    if (!firstCall) {
      throw new Error('Twilio Verify did not issue a request.');
    }
    const [url, init] = firstCall;
    expect(url).toBe('https://verify.twilio.com/v2/Services/VAtest/Verifications');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from('ACtest:test-token').toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    expect(String(init?.body)).toContain('To=%2B91');
    expect(String(init?.body)).toContain('Channel=sms');
  });

  it('accepts only Twilio checks approved by the Verify service', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'approved' }),
    } as Response);

    await expect(provider.verifyOtp('9876501234', '123456')).resolves.toBe(true);
    const firstCall = fetchMock.mock.calls[0];
    if (!firstCall) {
      throw new Error('Twilio Verify did not issue a verification request.');
    }
    expect(String(firstCall[1]?.body)).toContain('Code=123456');

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'pending' }),
    } as Response);
    await expect(provider.verifyOtp('9876501234', '000000')).resolves.toBe(false);
  });

  it('uses provider approval while still consuming the local OTP challenge', async () => {
    const update = jest.fn().mockResolvedValue({});
    const verifyExternally = jest.fn().mockResolvedValue(true);
    const otpService = new OtpService({
      otpChallenge: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'challenge-1',
          phone: '9876501234',
          otpHash: 'unused-local-hash',
          expiresAt: new Date(Date.now() + 60_000),
          attempts: 0,
          maxAttempts: 3,
          consumedAt: null,
        }),
        update,
      },
    } as never);

    await expect(
      otpService.verifyChallenge('9876501234', '123456', verifyExternally)
    ).resolves.toBe(true);

    expect(verifyExternally).toHaveBeenCalledWith('9876501234', '123456');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
      data: { consumedAt: expect.any(Date) },
    });
  });
});
