import {
  CreateJobInput,
  JobSkillInput,
  JobLocationInput,
} from '@localsaathi/validation';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class JobSkillDto implements JobSkillInput {
  @ApiPropertyOptional({ description: 'Catalog skill ID (UUID)' })
  skillId?: string;

  @ApiPropertyOptional({ description: 'Custom skill name if not in catalog' })
  name?: string;

  @ApiPropertyOptional({ description: 'Whether this skill is mandatory', default: true })
  isRequired?: boolean;

  @ApiPropertyOptional({ description: 'Minimum years of experience required', default: 0 })
  minExperienceYears?: number;
}

export class JobLocationDto implements JobLocationInput {
  @ApiProperty({ description: 'WGS84 Latitude', example: 12.9716 })
  latitude!: number;

  @ApiProperty({ description: 'WGS84 Longitude', example: 77.5946 })
  longitude!: number;

  @ApiPropertyOptional({ description: 'Street address line', example: '123 MG Road' })
  addressLine?: string | null;

  @ApiProperty({ description: 'Locality or neighborhood', example: 'Indiranagar' })
  locality!: string;

  @ApiProperty({ description: 'City name', example: 'Bengaluru' })
  city!: string;

  @ApiProperty({ description: 'State name', example: 'Karnataka' })
  state!: string;

  @ApiProperty({ description: '6-digit postal PIN code', example: '560038' })
  pinCode!: string;
}

export class CreateJobDto implements CreateJobInput {
  @ApiProperty({ description: 'Job title', example: 'Master Carpenter Needed for Furniture Fitting' })
  title!: string;

  @ApiProperty({
    description: 'Detailed description of the job and responsibilities',
    example: 'Looking for an experienced carpenter to assemble and install modular kitchen cabinets.',
  })
  description!: string;

  @ApiProperty({ description: 'Job category', example: 'Carpentry' })
  category!: string;

  @ApiProperty({
    description: 'Payment structure',
    enum: ['HOURLY', 'DAILY', 'FIXED', 'PIECE_RATE'],
    example: 'DAILY',
  })
  wageType!: 'HOURLY' | 'DAILY' | 'FIXED' | 'PIECE_RATE';

  @ApiProperty({ description: 'Wage amount in INR', example: 1200 })
  wageAmount!: number;

  @ApiPropertyOptional({ description: 'Number of workers required', default: 1, example: 2 })
  workerCount?: number;

  @ApiPropertyOptional({ description: 'Duration of work in days', default: 1, example: 3 })
  durationDays?: number;

  @ApiProperty({ description: 'Work start date (YYYY-MM-DD)', example: '2026-10-15' })
  startDate!: string;

  @ApiPropertyOptional({ description: 'Work start time (HH:mm)', example: '09:00' })
  startTime?: string;

  @ApiPropertyOptional({
    description: 'Urgency tier',
    enum: ['IMMEDIATE', 'STANDARD', 'FLEXIBLE'],
    default: 'STANDARD',
  })
  urgency?: 'IMMEDIATE' | 'STANDARD' | 'FLEXIBLE';

  @ApiPropertyOptional({
    description: 'Specific worker requirements / conditions',
    type: [String],
    example: ['Must bring own toolkit', 'Safety boots required'],
  })
  requirements?: string[];

  @ApiPropertyOptional({
    description: 'Language proficiencies preferred',
    type: [String],
    example: ['hi', 'kn'],
  })
  languageRequirements?: string[];

  @ApiPropertyOptional({
    description: 'Required skills list',
    type: [JobSkillDto],
  })
  skills?: JobSkillDto[];

  @ApiPropertyOptional({
    description: 'Job work location and spatial coordinates',
    type: JobLocationDto,
  })
  location?: JobLocationDto;
}
