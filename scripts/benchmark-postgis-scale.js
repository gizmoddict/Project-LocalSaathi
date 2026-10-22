const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runPostGisScaleBenchmark() {
  console.log('================================================================');
  console.log('SECTION 9: POSTGIS PERFORMANCE & SCALABILITY PROFILING');
  console.log('Benchmarking ST_DWithin and ST_Distance at 100, 1k, 10k, 100k Jobs');
  console.log('================================================================\n');

  const lon = 80.948;
  const lat = 26.85;
  const radiusMeters = 15000;

  // Find or create a benchmark employer profile to attach synthetic jobs
  const employer = await prisma.employerProfile.findFirst();
  if (!employer) {
    throw new Error('No employer profile found to anchor benchmark jobs.');
  }
  const employerId = employer.id;

  async function benchmarkQuery(label, tierSize) {
    const explainResult = await prisma.$queryRawUnsafe(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT 
        jp.id AS "jobPostId",
        ST_Distance(
          jl.location,
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography
        ) AS "distanceMeters"
      FROM job_locations jl
      JOIN job_posts jp ON jp.id = jl.job_post_id
      WHERE jp.status = 'PUBLISHED'
        AND jp.deleted_at IS NULL
        AND ST_DWithin(
          jl.location,
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )
      ORDER BY "distanceMeters" ASC
      LIMIT 200;
    `);

    // Run 30 repetitions for statistics
    const latencies = [];
    for (let i = 0; i < 30; i++) {
      const start = process.hrtime.bigint();
      await prisma.$queryRawUnsafe(`
        SELECT 
          jp.id AS "jobPostId",
          ST_Distance(
            jl.location,
            ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography
          ) AS "distanceMeters"
        FROM job_locations jl
        JOIN job_posts jp ON jp.id = jl.job_post_id
        WHERE jp.status = 'PUBLISHED'
          AND jp.deleted_at IS NULL
          AND ST_DWithin(
            jl.location,
            ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
            ${radiusMeters}
          )
        ORDER BY "distanceMeters" ASC
        LIMIT 200;
      `);
      const end = process.hrtime.bigint();
      latencies.push(Number(end - start) / 1e6);
    }
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    console.log(`\n--- TIER: ${label} (${tierSize} total jobs in DB) ---`);
    console.log(`Query Latency (ms): avg=${avg.toFixed(2)}, p50=${p50.toFixed(2)}, p95=${p95.toFixed(2)}, p99=${p99.toFixed(2)}`);
    console.log('Query Plan Snapshot:');
    const planText = explainResult.map((r) => r['QUERY PLAN']).join('\n');
    console.log(planText.split('\n').slice(0, 10).join('\n'));

    return { label, tierSize, avg, p50, p95, p99, plan: planText };
  }

  const results = [];

  try {
    // Current baseline (~128 jobs)
    const baseCount = await prisma.jobPost.count();
    results.push(await benchmarkQuery('Baseline (~100 jobs)', baseCount));

    // Scale to 1,000 jobs (add ~900)
    console.log('\n[Generating synthetic jobs for 1,000 tier...]');
    await prisma.$executeRawUnsafe(`
      WITH inserted_jobs AS (
        INSERT INTO job_posts (id, employer_profile_id, title, description, category, wage_amount, wage_type, status, start_date, created_at, updated_at)
        SELECT 
          gen_random_uuid(),
          '${employerId}'::uuid,
          'SYNTHETIC_BENCHMARK_1K_' || s,
          'Performance benchmark job',
          'GENERAL_LABOR',
          500 + (s % 500),
          'DAILY'::"WageType",
          'PUBLISHED'::"JobStatus",
          CURRENT_DATE,
          NOW(),
          NOW()
        FROM generate_series(1, 900) s
        RETURNING id
      )
      INSERT INTO job_locations (id, job_post_id, address_line, locality, city, state, pin_code, location, latitude, longitude, created_at, updated_at)
      SELECT 
        gen_random_uuid(),
        id,
        'Benchmark St',
        'Hazratganj',
        'Lucknow',
        'Uttar Pradesh',
        '226001',
        ST_SetSRID(ST_MakePoint(${lon} + (random() - 0.5) * 0.2, ${lat} + (random() - 0.5) * 0.2), 4326)::geography,
        ${lat} + (random() - 0.5) * 0.2,
        ${lon} + (random() - 0.5) * 0.2,
        NOW(),
        NOW()
      FROM inserted_jobs;
    `);
    const count1k = await prisma.jobPost.count();
    results.push(await benchmarkQuery('1,000 jobs', count1k));

    // Scale to 10,000 jobs (add ~9,000)
    console.log('\n[Generating synthetic jobs for 10,000 tier...]');
    await prisma.$executeRawUnsafe(`
      WITH inserted_jobs AS (
        INSERT INTO job_posts (id, employer_profile_id, title, description, category, wage_amount, wage_type, status, start_date, created_at, updated_at)
        SELECT 
          gen_random_uuid(),
          '${employerId}'::uuid,
          'SYNTHETIC_BENCHMARK_10K_' || s,
          'Performance benchmark job',
          'GENERAL_LABOR',
          500 + (s % 500),
          'DAILY'::"WageType",
          'PUBLISHED'::"JobStatus",
          CURRENT_DATE,
          NOW(),
          NOW()
        FROM generate_series(1, 9000) s
        RETURNING id
      )
      INSERT INTO job_locations (id, job_post_id, address_line, locality, city, state, pin_code, location, latitude, longitude, created_at, updated_at)
      SELECT 
        gen_random_uuid(),
        id,
        'Benchmark St',
        'Hazratganj',
        'Lucknow',
        'Uttar Pradesh',
        '226001',
        ST_SetSRID(ST_MakePoint(${lon} + (random() - 0.5) * 0.3, ${lat} + (random() - 0.5) * 0.3), 4326)::geography,
        ${lat} + (random() - 0.5) * 0.3,
        ${lon} + (random() - 0.5) * 0.3,
        NOW(),
        NOW()
      FROM inserted_jobs;
    `);
    const count10k = await prisma.jobPost.count();
    results.push(await benchmarkQuery('10,000 jobs', count10k));

    // Scale to 100,000 jobs (add 90,000)
    console.log('\n[Generating synthetic jobs for 100,000 tier...]');
    await prisma.$executeRawUnsafe(`
      WITH inserted_jobs AS (
        INSERT INTO job_posts (id, employer_profile_id, title, description, category, wage_amount, wage_type, status, start_date, created_at, updated_at)
        SELECT 
          gen_random_uuid(),
          '${employerId}'::uuid,
          'SYNTHETIC_BENCHMARK_100K_' || s,
          'Performance benchmark job',
          'GENERAL_LABOR',
          500 + (s % 500),
          'DAILY'::"WageType",
          'PUBLISHED'::"JobStatus",
          CURRENT_DATE,
          NOW(),
          NOW()
        FROM generate_series(1, 90000) s
        RETURNING id
      )
      INSERT INTO job_locations (id, job_post_id, address_line, locality, city, state, pin_code, location, latitude, longitude, created_at, updated_at)
      SELECT 
        gen_random_uuid(),
        id,
        'Benchmark St',
        'Hazratganj',
        'Lucknow',
        'Uttar Pradesh',
        '226001',
        ST_SetSRID(ST_MakePoint(${lon} + (random() - 0.5) * 0.5, ${lat} + (random() - 0.5) * 0.5), 4326)::geography,
        ${lat} + (random() - 0.5) * 0.5,
        ${lon} + (random() - 0.5) * 0.5,
        NOW(),
        NOW()
      FROM inserted_jobs;
    `);
    const count100k = await prisma.jobPost.count();
    results.push(await benchmarkQuery('100,000 jobs', count100k));

    console.log('\n================================================================');
    console.log('POSTGIS SPATIAL SCALING SUMMARY TABLE');
    console.log('================================================================');
    console.table(
      results.map((r) => ({
        Tier: r.label,
        DatasetSize: r.tierSize,
        'Avg (ms)': r.avg.toFixed(2),
        'p50 (ms)': r.p50.toFixed(2),
        'p95 (ms)': r.p95.toFixed(2),
        'p99 (ms)': r.p99.toFixed(2),
      }))
    );
  } catch (err) {
    console.error('Benchmark error:', err);
  } finally {
    console.log('\n[Cleaning up synthetic benchmark jobs...]');
    await prisma.$executeRawUnsafe(`
      DELETE FROM job_locations WHERE job_post_id IN (
        SELECT id FROM job_posts WHERE title LIKE 'SYNTHETIC_BENCHMARK_%'
      );
    `);
    await prisma.$executeRawUnsafe(`
      DELETE FROM job_posts WHERE title LIKE 'SYNTHETIC_BENCHMARK_%';
    `);
    const finalCount = await prisma.jobPost.count();
    console.log(`Cleaned up. Job count restored to: ${finalCount}`);
    await prisma.$disconnect();
  }
}

runPostGisScaleBenchmark();
