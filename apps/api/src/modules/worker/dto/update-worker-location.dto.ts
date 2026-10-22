import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWorkerLocationDto {
  @ApiProperty({
    description: 'Latitude coordinate in decimal degrees',
    example: 26.85,
    minimum: -90,
    maximum: 90,
  })
  latitude!: number;

  @ApiProperty({
    description: 'Longitude coordinate in decimal degrees',
    example: 80.948,
    minimum: -180,
    maximum: 180,
  })
  longitude!: number;

  @ApiPropertyOptional({
    description: 'GPS accuracy radius in meters',
    example: 10,
  })
  accuracyMeters?: number | null;

  @ApiPropertyOptional({
    description: 'Address line or landmark (optional)',
    example: 'Shop 4, Near Hazratganj Metro Station',
  })
  addressLine?: string | null;

  @ApiPropertyOptional({
    description: 'Hyperlocal locality or neighborhood',
    example: 'Hazratganj',
  })
  locality?: string | null;

  @ApiPropertyOptional({
    description: 'City or district',
    example: 'Lucknow',
  })
  city?: string | null;

  @ApiPropertyOptional({
    description: 'State or union territory',
    example: 'Uttar Pradesh',
  })
  state?: string | null;

  @ApiPropertyOptional({
    description: '6-digit Indian Postal PIN Code',
    example: '226001',
  })
  pinCode?: string | null;

  @ApiPropertyOptional({
    description: 'Preferred search radius in kilometers (1 - 100)',
    example: 10,
    minimum: 1,
    maximum: 100,
  })
  preferredRadiusKm?: number;
}
