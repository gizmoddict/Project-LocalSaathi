const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function profile() {
  console.log('============================================================');
  console.log('LOCALSAATHI POSTGRESQL QUERY PLAN & LATENCY PROFILER');
  console.log('============================================================\n');

  try {
    // 1. Check an existing worker location
    const sampleWorkerLoc = await prisma.workerLocation.findFirst({
      where: { isActive: true },
    });
    const lon = sampleWorkerLoc ? sampleWorkerLoc.longitude : 77.209;
    const lat = sampleWorkerLoc ? sampleWorkerLoc.latitude : 28.6139;
    const radiusMeters = 15000;

    console.log(`[PROFILE 1] PostGIS ST_DWithin Job Discovery Query (lon=${lon}, lat=${lat}, radius=${radiusMeters}m)`);
    const q1Explain = await prisma.$queryRawUnsafe(`
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
    console.log(q1Explain.map((r) => r['QUERY PLAN']).join('\n'));
    console.log('\n------------------------------------------------------------\n');

    // 2. Measure actual execution latency across 50 iterations
    console.log('[PROFILE 1b] PostGIS Query Latency (50 iterations benchmark)');
    const latencies = [];
    for (let i = 0; i < 50; i++) {
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
      latencies.push(Number(end - start) / 1e6); // ms
    }
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    console.log(`Latency stats (ms): avg=${avg.toFixed(2)}, p50=${p50.toFixed(2)}, p95=${p95.toFixed(2)}, p99=${p99.toFixed(2)}\n`);

    // 3. Applications list query plan
    console.log('[PROFILE 2] Applications by Job (EXPLAIN ANALYZE)');
    const q2Explain = await prisma.$queryRawUnsafe(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT ja.id, ja.status, ja.created_at, u.phone, wp.experience_years
      FROM job_applications ja
      JOIN worker_profiles wp ON wp.id = ja.worker_profile_id
      JOIN users u ON u.id = wp.user_id
      WHERE ja.job_post_id IN (SELECT id FROM job_posts LIMIT 5)
      ORDER BY ja.created_at DESC
      LIMIT 20;
    `);
    console.log(q2Explain.map((r) => r['QUERY PLAN']).join('\n'));
    console.log('\n------------------------------------------------------------\n');

    // 4. Messages in conversation query plan
    console.log('[PROFILE 3] Messages in Conversation (EXPLAIN ANALYZE)');
    const sampleConv = await prisma.conversation.findFirst();
    const convId = sampleConv ? sampleConv.id : '00000000-0000-0000-0000-000000000000';
    const q3Explain = await prisma.$queryRawUnsafe(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT m.id, m.body, m.sender_id, m.created_at
      FROM messages m
      WHERE m.conversation_id = '${convId}'::uuid
      ORDER BY m.created_at DESC
      LIMIT 50;
    `);
    console.log(q3Explain.map((r) => r['QUERY PLAN']).join('\n'));
    console.log('\n------------------------------------------------------------\n');

    // 5. Admin Analytics query plan
    console.log('[PROFILE 4] Admin Metrics Aggregation (EXPLAIN ANALYZE)');
    const q4Explain = await prisma.$queryRawUnsafe(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT 
        DATE_TRUNC('day', created_at) AS day,
        COUNT(*) AS count
      FROM job_posts
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY day ASC;
    `);
    console.log(q4Explain.map((r) => r['QUERY PLAN']).join('\n'));
    console.log('\n------------------------------------------------------------\n');

    // 6. Check existing indexes on key tables
    console.log('[PROFILE 5] Existing Indexes on Key Tables');
    const indexes = await prisma.$queryRawUnsafe(`
      SELECT 
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('job_posts', 'job_locations', 'worker_profiles', 'worker_locations', 'job_applications', 'messages', 'audit_logs', 'notifications', 'payments')
      ORDER BY tablename, indexname;
    `);
    console.log(`Found ${indexes.length} indexes across key tables:`);
    for (const idx of indexes) {
      console.log(`- [${idx.tablename}] ${idx.indexname}: ${idx.indexdef}`);
    }
  } catch (err) {
    console.error('Profiling error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

profile();
