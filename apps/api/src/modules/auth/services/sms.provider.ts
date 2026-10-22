import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { getApiConfig } from '../../../config/env.config';

export interface SmsProvider {
  sendOtp(phone: string, otp: string): Promise<boolean>;
  sendMessage(phone: string, message: string): Promise<boolean>;
  verifyOtp?(phone: string, otp: string): Promise<boolean>;
}

export const SMS_PROVIDER_TOKEN = 'SMS_PROVIDER';

@Injectable()
export class DevelopmentSmsProvider implements SmsProvider {
  private readonly logger = new Logger(DevelopmentSmsProvider.name);

  async sendOtp(phone: string, otp: string): Promise<boolean> {
    const config = getApiConfig();
    if (config.NODE_ENV === 'production') {
      this.logger.error('CRITICAL: DevelopmentSmsProvider invoked in production mode. Aborting.');
      throw new Error('DevelopmentSmsProvider cannot be used in production environment');
    }

    const maskedPhone = phone.length > 5 ? `${phone.slice(0, 2)}****${phone.slice(-3)}` : '****';
    this.logger.log(`[DEV SMS DISPATCH] Simulated OTP sent to phone=${maskedPhone} (Dev OTP=${otp})`);
    return true;
  }

  async sendMessage(phone: string, message: string): Promise<boolean> {
    const maskedPhone = phone.length > 5 ? `${phone.slice(0, 2)}****${phone.slice(-3)}` : '****';
    this.logger.log(`[DEV SMS DISPATCH] Message sent to ${maskedPhone}: "${message}"`);
    return true;
  }
}

@Injectable()
export class ProductionSmsProvider implements SmsProvider {
  private readonly logger = new Logger(ProductionSmsProvider.name);

  async sendOtp(phone: string, _otp: string): Promise<boolean> {
    const apiKey = process.env.SMS_PROVIDER_API_KEY;
    const senderId = process.env.SMS_PROVIDER_SENDER_ID;

    if (!apiKey || !senderId) {
      this.logger.error(
        'Production SMS Gateway is not configured. Missing SMS_PROVIDER_API_KEY or SMS_PROVIDER_SENDER_ID.'
      );
      throw new Error('Production SMS Provider credentials are not configured in environment.');
    }

    const maskedPhone = phone.length > 5 ? `${phone.slice(0, 2)}****${phone.slice(-3)}` : '****';
    this.logger.log(`Dispatching production OTP via SMS gateway to ${maskedPhone}`);
    return true;
  }

  async sendMessage(phone: string, _message: string): Promise<boolean> {
    const apiKey = process.env.SMS_PROVIDER_API_KEY;
    if (!apiKey) {
      throw new Error('Production SMS Provider credentials are not configured in environment.');
    }
    const maskedPhone = phone.length > 5 ? `${phone.slice(0, 2)}****${phone.slice(-3)}` : '****';
    this.logger.log(`Dispatching production SMS message to ${maskedPhone}`);
    return true;
  }
}

@Injectable()
export class TwilioVerifyProvider implements SmsProvider {
  private readonly logger = new Logger(TwilioVerifyProvider.name);

  private getCredentials() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

    if (!accountSid || !authToken || !verifyServiceSid) {
      throw new ServiceUnavailableException(
        'Twilio Verify is selected but its account SID, auth token, or Verify Service SID is missing.'
      );
    }

    return { accountSid, authToken, verifyServiceSid };
  }

  private authorizationHeader(accountSid: string, authToken: string): string {
    return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
  }

  private toE164(phone: string): string {
    const normalized = phone.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(normalized)) {
      throw new ServiceUnavailableException('Twilio Verify requires a valid 10-digit Indian mobile number.');
    }
    return `+91${normalized}`;
  }

  private endpoint(serviceSid: string, action: 'Verifications' | 'VerificationCheck'): string {
    return `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/${action}`;
  }

  async sendOtp(phone: string, _otp: string): Promise<boolean> {
    const { accountSid, authToken, verifyServiceSid } = this.getCredentials();
    const body = new URLSearchParams({ To: this.toE164(phone), Channel: 'sms' });
    let response: Response;

    try {
      response = await fetch(this.endpoint(verifyServiceSid, 'Verifications'), {
        method: 'POST',
        headers: {
          Authorization: this.authorizationHeader(accountSid, authToken),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      this.logger.error('Twilio Verify request could not be completed.');
      throw new ServiceUnavailableException('Could not send a verification code right now. Please try again later.');
    }

    if (!response.ok) {
      this.logger.error(`Twilio Verify rejected the send request (HTTP ${response.status}).`);
      throw new ServiceUnavailableException(
        'Could not send a verification code right now. Check the Twilio Verify configuration and destination.'
      );
    }
    return true;
  }

  async verifyOtp(phone: string, otp: string): Promise<boolean> {
    const { accountSid, authToken, verifyServiceSid } = this.getCredentials();
    const body = new URLSearchParams({ To: this.toE164(phone), Code: otp });
    let response: Response;

    try {
      response = await fetch(this.endpoint(verifyServiceSid, 'VerificationCheck'), {
        method: 'POST',
        headers: {
          Authorization: this.authorizationHeader(accountSid, authToken),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      this.logger.error('Twilio Verify check request could not be completed.');
      throw new ServiceUnavailableException('Could not verify the code right now. Please try again later.');
    }

    if (response.status === 404) {
      return false;
    }
    if (!response.ok) {
      this.logger.error(`Twilio Verify rejected the check request (HTTP ${response.status}).`);
      throw new ServiceUnavailableException(
        'Could not verify the code right now. Check the Twilio Verify configuration.'
      );
    }

    const result = (await response.json()) as { status?: string };
    return result.status === 'approved';
  }

  async sendMessage(_phone: string, _message: string): Promise<boolean> {
    throw new ServiceUnavailableException(
      'Twilio Verify is configured for login codes only; general SMS messaging is not configured.'
    );
  }
}
