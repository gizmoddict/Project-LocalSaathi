import { UpdateJobInput } from '@localsaathi/validation';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { JobSkillDto, JobLocationDto } from './create-job.dto';

export class UpdateJobDto implements UpdateJobInput {
  @ApiPropertyOptional({ description: 'Job title', example: 'Updated Job Title' })
  title?: string;

  @ApiPropertyOptional({ description: 'Detailed description of the job' })
  description?: string;

  @ApiPropertyOptional({ description: 'Job category' })
  category?: string;

  @ApiPropertyOptional({
    description: 'Payment structure',
    enum: ['HOURLY', 'DAILY', 'FIXED', 'PIECE_RATE'],
  })
  wageType?: 'HOURLY' | 'DAILY' | 'FIXED' | 'PIECE_RATE';

  @ApiPropertyOptional({ description: 'Wage amount in INR' })
  wageAmount?: number;

  @ApiPropertyOptional({ description: 'Number of workers required' })
  workerCount?: number;

  @ApiPropertyOptional({ description: 'Duration of work in days' })
  durationDays?: number;

  @ApiPropertyOptional({ description: 'Work start date (YYYY-MM-DD)' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'Work start time (HH:mm)' })
  startTime?: string;

  @ApiPropertyOptional({
    description: 'Urgency tier',
    enum: ['IMMEDIATE', 'STANDARD', 'FLEXIBLE'],
  })
  urgency?: 'IMMEDIATE' | 'STANDARD' | 'FLEXIBLE';

  @ApiPropertyOptional({
    description: 'Specific worker requirements / conditions',
    type: [String],
  })
  requirements?: string[];

  @ApiPropertyOptional({
    description: 'Language proficiencies preferred',
    type: [String],
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
