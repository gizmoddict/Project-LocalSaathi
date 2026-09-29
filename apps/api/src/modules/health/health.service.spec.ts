import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthService],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return valid health summary', () => {
    const summary = service.getHealthSummary();
    expect(summary.status).toBe('ok');
    expect(summary.service).toBe('localsaathi-api');
    expect(summary.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(summary.timestamp).toBeDefined();
  });

  it('should return liveness status', () => {
    const liveness = service.getLiveness();
    expect(liveness.status).toBe('alive');
    expect(liveness.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('should return readiness report without throwing', async () => {
    const { response } = await service.getReadiness();
    expect(response).toBeDefined();
    expect(response.dependencies).toHaveProperty('database');
    expect(response.dependencies).toHaveProperty('redis');
    expect(response.dependencies).toHaveProperty('opensearch');
  });
});
