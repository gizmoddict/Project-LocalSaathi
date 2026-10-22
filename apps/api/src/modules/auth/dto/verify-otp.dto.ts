import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({
    description: '10-digit Indian mobile number',
    example: '9876543210',
  })
  phone!: string;

  @ApiProperty({
    description: '6-digit numeric OTP challenge code',
    example: '839201',
  })
  otp!: string;

  @ApiProperty({
    description: 'Requested account role if new user registration occurs (WORKER or EMPLOYER only)',
    enum: ['WORKER', 'EMPLOYER'],
    default: 'WORKER',
    required: false,
  })
  role?: 'WORKER' | 'EMPLOYER';

  @ApiProperty({
    description: 'Client device description or identifier (optional)',
    example: 'Chrome 122 on Android 14',
    required: false,
  })
  deviceInfo?: string;
}
