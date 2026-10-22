import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Cryptographic refresh token (optional in JSON body if transferred via HttpOnly cookie)',
    example: 'd41d8cd98f00b204e9800998ecf8427e...',
    required: false,
  })
  refreshToken?: string;
}
