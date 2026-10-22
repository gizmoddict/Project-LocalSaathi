import { ApiPropertyOptional } from '@nestjs/swagger';
import { WageType } from '@localsaathi/types';

export class UpdateWorkerProfileDto {
  @ApiPropertyOptional({
    description: 'Worker public display name',
    example: 'Ramesh Kumar',
  })
  displayName?: string;

  @ApiPropertyOptional({
    description: 'Brief bio describing trades, specialties, and experience',
    example: 'Experienced residential plumber with 7+ years expertise in pipe fitting and leak repair.',
  })
  bio?: string | null;

  @ApiPropertyOptional({
    description: 'Total cumulative years of professional trade experience',
    example: 7,
    minimum: 0,
    maximum: 60,
  })
  experienceYears?: number;

  @ApiPropertyOptional({
    description: 'Expected base wage in INR',
    example: 800,
    minimum: 0,
  })
  expectedWage?: number | null;

  @ApiPropertyOptional({
    description: 'Wage basis calculation structure',
    enum: WageType,
    example: WageType.DAILY,
  })
  wageType?: WageType;

  @ApiPropertyOptional({
    description: 'Preferred job travel radius in kilometers',
    example: 15,
    minimum: 1,
    maximum: 100,
  })
  preferredRadiusKm?: number;

  @ApiPropertyOptional({
    description: 'Languages spoken fluently by the worker',
    example: ['hi', 'en'],
    type: [String],
  })
  languages?: string[];

  @ApiPropertyOptional({
    description: 'Toggle current operational work availability',
    example: true,
  })
  isAvailable?: boolean;
}
