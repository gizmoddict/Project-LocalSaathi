const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testIndex() {
  console.log('Testing Index Optimization on job_posts...');
  const lon = 80.948;
  const lat = 26.85;
  const radiusMeters = 15000;

  console.log('\n--- BEFORE NEW INDEX ---');
  const planBefore = await prisma.$queryRawUnsafe(`
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
  console.log(planBefore.map((r) => r['QUERY PLAN']).join('\n'));

  // Create partial index on active published jobs
  console.log('\nCreating index: idx_job_posts_active_published...');
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "idx_job_posts_active_published" 
    ON "job_posts" ("id", "status") 
    WHERE ("status" = 'PUBLISHED' AND "deleted_at" IS NULL);
  `);

  console.log('\n--- AFTER NEW INDEX ---');
  const planAfter = await prisma.$queryRawUnsafe(`
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
  console.log(planAfter.map((r) => r['QUERY PLAN']).join('\n'));

  await prisma.$disconnect();
}

testIndex().catch(console.error);
