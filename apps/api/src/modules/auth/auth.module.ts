import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../database/database.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './services/otp.service';
import { TokenService } from './services/token.service';
import { AuthRateLimiterService } from './services/rate-limiter.service';
import {
  SMS_PROVIDER_TOKEN,
  DevelopmentSmsProvider,
  ProductionSmsProvider,
  TwilioVerifyProvider,
} from './services/sms.provider';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { getApiConfig } from '../../config/env.config';

@Global()
@Module({
  imports: [
    DatabaseModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const config = getApiConfig();
        return {
          secret: config.JWT_ACCESS_SECRET,
          signOptions: {
            expiresIn: config.JWT_ACCESS_EXPIRES_IN,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    TokenService,
    AuthRateLimiterService,
    JwtAuthGuard,
    RolesGuard,
    {
      provide: SMS_PROVIDER_TOKEN,
      useFactory: () => {
        const config = getApiConfig();
        if (config.SMS_PROVIDER === 'twilio') {
          return new TwilioVerifyProvider();
        }
        if (config.NODE_ENV === 'production') {
          return new ProductionSmsProvider();
        }
        if (config.SMS_PROVIDER === 'development' || config.SMS_PROVIDER === 'mock') {
          return new DevelopmentSmsProvider();
        }
        return new ProductionSmsProvider();
      },
    },
  ],
  exports: [
    AuthService,
    TokenService,
    AuthRateLimiterService,
    JwtAuthGuard,
    RolesGuard,
    SMS_PROVIDER_TOKEN,
  ],
})
export class AuthModule {}
