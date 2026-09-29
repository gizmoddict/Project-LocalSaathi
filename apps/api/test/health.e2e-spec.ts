import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { GlobalHttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/health (GET)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.service).toBe('localsaathi-api');
    expect(res.body.data.status).toBe('ok');
    expect(res.body.requestId).toBeDefined();
  });

  it('/api/v1/health/live (GET)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('alive');
    expect(res.body.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('/api/v1/health/ready (GET)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready');
    // Can be 200 or 503 depending on whether local Postgres/Redis are running
    expect([200, 503]).toContain(res.status);
    expect(res.body.data.dependencies).toBeDefined();
    expect(res.body.data.dependencies).toHaveProperty('database');
  });
});
