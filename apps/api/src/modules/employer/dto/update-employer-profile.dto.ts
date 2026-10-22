import { UpdateEmployerProfileInput } from '@localsaathi/validation';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateEmployerProfileDto implements UpdateEmployerProfileInput {
  @ApiPropertyOptional({
    description: 'Registered or trade name of the business/employer',
    example: 'Sharma Construction & Renovation',
  })
  businessName?: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the employer or company',
    example: 'Leading civil construction contractor in Bangalore North.',
  })
  description?: string | null;

  @ApiPropertyOptional({
    description: 'Category or industry of the employer',
    example: 'Construction & Real Estate',
  })
  businessType?: string | null;

  @ApiPropertyOptional({
    description: 'Preferred communication channels for workers',
    example: ['PHONE', 'IN_APP'],
    type: [String],
  })
  contactPreferences?: string[];

  @ApiPropertyOptional({
    description: 'Street address or landmark',
    example: '45, 2nd Cross, Ring Road',
  })
  addressLine?: string | null;

  @ApiPropertyOptional({
    description: 'Locality or neighborhood',
    example: 'Hebbal',
  })
  locality?: string;

  @ApiPropertyOptional({
    description: 'City name',
    example: 'Bengaluru',
  })
  city?: string;

  @ApiPropertyOptional({
    description: 'State name',
    example: 'Karnataka',
  })
  state?: string;

  @ApiPropertyOptional({
    description: '6-digit Indian Postal PIN code',
    example: '560024',
  })
  pinCode?: string;
}
