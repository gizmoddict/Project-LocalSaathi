import { ApiPropertyOptional } from '@nestjs/swagger';
import { SkillProficiency } from '@localsaathi/types';

export class UpdateWorkerSkillDto {
  @ApiPropertyOptional({
    description: 'Updated proficiency level',
    enum: SkillProficiency,
  })
  proficiency?: SkillProficiency;

  @ApiPropertyOptional({
    description: 'Updated years of experience',
    example: 5,
    minimum: 0,
    maximum: 60,
  })
  experienceYears?: number;
}
