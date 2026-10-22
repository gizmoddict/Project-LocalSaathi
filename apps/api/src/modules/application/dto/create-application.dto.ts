import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApplicationDto {
  @ApiPropertyOptional({
    description: 'Optional introductory note or qualification highlights for the employer',
    example: 'I have 6 years of experience in high-voltage industrial wiring and commercial substations.',
    maxLength: 1000,
  })
  message?: string;
}
