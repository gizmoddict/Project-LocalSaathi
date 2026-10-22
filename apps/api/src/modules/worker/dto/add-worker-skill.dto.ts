import { ApiPropertyOptional } from '@nestjs/swagger';
import { SkillProficiency } from '@localsaathi/types';

export class AddWorkerSkillDto {
  @ApiPropertyOptional({
    description: 'Catalog UUID of existing skill (if selected from standard catalog)',
    example: '11111111-1111-1111-1111-111111111111',
  })
  skillId?: string;

  @ApiPropertyOptional({
    description: 'Name of the skill (auto-resolved or added to catalog)',
    example: 'Plumbing',
  })
  name?: string;

  @ApiPropertyOptional({
    description: 'Proficiency level in this specific skill',
    enum: SkillProficiency,
    default: SkillProficiency.INTERMEDIATE,
  })
  proficiency?: SkillProficiency;

  @ApiPropertyOptional({
    description: 'Years of direct hands-on experience in this skill',
    example: 4,
    default: 1,
    minimum: 0,
    maximum: 60,
  })
  experienceYears?: number;
}
