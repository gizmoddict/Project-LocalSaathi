import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { WorkerService } from './worker.service';
import {
  UpdateWorkerProfileDto,
  AddWorkerSkillDto,
  UpdateWorkerSkillDto,
  UpdateWorkerLocationDto,
  CreateWorkerAvailabilityDto,
  UpdateWorkerAvailabilityDto,
} from './dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  UserRole,
  AuthenticatedUser,
  WorkerProfileResponse,
  WorkerSkillResponse,
  WorkerLocationResponse,
  WorkerAvailabilityResponse,
  WorkerCompletionResponse,
  SkillCatalogItem,
} from '@localsaathi/types';

@ApiTags('Workers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('workers')
export class WorkerController {
  constructor(private readonly workerService: WorkerService) {}

  @Get('me')
  @Roles(UserRole.WORKER)
  @ApiOperation({ summary: 'Retrieve authenticated worker profile and onboarding state' })
  @ApiResponse({ status: 200, description: 'Worker profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden - User is not a WORKER' })
  async getProfile(@CurrentUser() user: AuthenticatedUser): Promise<WorkerProfileResponse> {
    return this.workerService.getProfile(user.userId);
  }

  @Patch('me')
  @Roles(UserRole.WORKER)
  @ApiOperation({ summary: 'Update basic profile fields (name, bio, wage, radius, languages)' })
  @ApiResponse({ status: 200, description: 'Worker profile updated successfully' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateWorkerProfileDto
  ): Promise<WorkerProfileResponse> {
    return this.workerService.updateProfile(user.userId, dto);
  }

  @Get('me/skills')
  @Roles(UserRole.WORKER)
  @ApiOperation({ summary: 'List skills attached to authenticated worker' })
  @ApiResponse({ status: 200, description: 'Worker skills list' })
  async getSkills(@CurrentUser() user: AuthenticatedUser): Promise<WorkerSkillResponse[]> {
    return this.workerService.getSkills(user.userId);
  }

  @Post('me/skills')
  @Roles(UserRole.WORKER)
  @ApiOperation({ summary: 'Add a skill to worker profile (by skillId or custom name)' })
  @ApiResponse({ status: 201, description: 'Skill added to profile successfully' })
  @ApiResponse({ status: 409, description: 'Worker already possesses this skill' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async addSkill(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddWorkerSkillDto
  ): Promise<WorkerSkillResponse> {
    return this.workerService.addSkill(user.userId, dto);
  }

  @Patch('me/skills/:skillId')
  @Roles(UserRole.WORKER)
  @ApiOperation({ summary: 'Update proficiency or experience years for an existing worker skill' })
  @ApiResponse({ status: 200, description: 'Worker skill updated successfully' })
  @ApiResponse({ status: 404, description: 'Skill not found on worker profile' })
  async updateSkill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('skillId') skillId: string,
    @Body() dto: UpdateWorkerSkillDto
  ): Promise<WorkerSkillResponse> {
    return this.workerService.updateSkill(user.userId, skillId, dto);
  }

  @Delete('me/skills/:skillId')
  @Roles(UserRole.WORKER)
  @ApiOperation({ summary: 'Remove a skill from worker profile' })
  @ApiResponse({ status: 200, description: 'Skill removed successfully' })
  @ApiResponse({ status: 404, description: 'Skill not found on worker profile' })
  async removeSkill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('skillId') skillId: string
  ): Promise<{ success: boolean }> {
    return this.workerService.removeSkill(user.userId, skillId);
  }

  @Get('me/location')
  @Roles(UserRole.WORKER)
  @ApiOperation({ summary: 'Retrieve worker current work location and coordinates' })
  @ApiResponse({ status: 200, description: 'Location retrieved successfully' })
  async getLocation(@CurrentUser() user: AuthenticatedUser): Promise<WorkerLocationResponse | null> {
    return this.workerService.getLocation(user.userId);
  }

  @Put('me/location')
  @Roles(UserRole.WORKER)
  @ApiOperation({ summary: 'Set or update worker work location (updates PostGIS geography Point)' })
  @ApiResponse({ status: 200, description: 'Location updated successfully' })
  @ApiResponse({ status: 422, description: 'Invalid coordinates or address' })
  async updateLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateWorkerLocationDto
  ): Promise<WorkerLocationResponse> {
    return this.workerService.updateLocation(user.userId, dto);
  }

  @Get('me/availability')
  @Roles(UserRole.WORKER)
  @ApiOperation({ summary: 'List upcoming availability schedule slots' })
  @ApiResponse({ status: 200, description: 'Availability slots list' })
  async getAvailability(
    @CurrentUser() user: AuthenticatedUser
  ): Promise<WorkerAvailabilityResponse[]> {
    return this.workerService.getAvailability(user.userId);
  }

  @Post('me/availability')
  @Roles(UserRole.WORKER)
  @ApiOperation({ summary: 'Create a new date-specific availability schedule slot' })
  @ApiResponse({ status: 201, description: 'Availability slot created' })
  @ApiResponse({ status: 409, description: 'Availability slot for date already exists' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async createAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkerAvailabilityDto
  ): Promise<WorkerAvailabilityResponse> {
    return this.workerService.createAvailability(user.userId, dto);
  }

  @Patch('me/availability/:id')
  @Roles(UserRole.WORKER)
  @ApiOperation({ summary: 'Update an existing availability slot' })
  @ApiResponse({ status: 200, description: 'Availability slot updated' })
  @ApiResponse({ status: 404, description: 'Slot not found' })
  async updateAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkerAvailabilityDto
  ): Promise<WorkerAvailabilityResponse> {
    return this.workerService.updateAvailability(user.userId, id, dto);
  }

  @Delete('me/availability/:id')
  @Roles(UserRole.WORKER)
  @ApiOperation({ summary: 'Delete an availability slot' })
  @ApiResponse({ status: 200, description: 'Availability slot deleted' })
  @ApiResponse({ status: 404, description: 'Slot not found' })
  async deleteAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string
  ): Promise<{ success: boolean }> {
    return this.workerService.deleteAvailability(user.userId, id);
  }

  @Get('me/completion')
  @Roles(UserRole.WORKER)
  @ApiOperation({ summary: 'Get worker profile completion percentage and remaining steps' })
  @ApiResponse({ status: 200, description: 'Completion status calculated' })
  async getCompletion(@CurrentUser() user: AuthenticatedUser): Promise<WorkerCompletionResponse> {
    return this.workerService.getCompletion(user.userId);
  }

  @Post('me/onboarding/complete')
  @Roles(UserRole.WORKER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finalize worker onboarding (verifies all steps server-side)' })
  @ApiResponse({ status: 200, description: 'Onboarding finalized successfully' })
  @ApiResponse({ status: 422, description: 'Profile incomplete, missing required steps' })
  async completeOnboarding(@CurrentUser() user: AuthenticatedUser): Promise<{
    success: boolean;
    onboardingStatus: string;
    completionPercentage: number;
  }> {
    return this.workerService.completeOnboarding(user.userId);
  }

  @Post('me/photo')
  @Roles(UserRole.WORKER)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload profile photo avatar' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Photo uploaded and reference linked' })
  @ApiResponse({ status: 400, description: 'Invalid file or file missing' })
  async uploadProfilePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File
  ): Promise<{ profilePhotoKey: string; profilePhotoUrl: string }> {
    if (!file || !file.buffer) {
      throw new BadRequestException('A valid image file must be uploaded under the "file" field');
    }
    return this.workerService.uploadProfilePhoto(user.userId, file.buffer, file.originalname);
  }

  @Get('skills')
  @Public()
  @ApiOperation({ summary: 'Retrieve active platform skill catalog for search/selection' })
  @ApiResponse({ status: 200, description: 'Platform skill catalog' })
  async getSkillsCatalog(
    @Query('category') category?: string,
    @Query('query') query?: string
  ): Promise<SkillCatalogItem[]> {
    return this.workerService.getSkillsCatalog(category, query);
  }
}
