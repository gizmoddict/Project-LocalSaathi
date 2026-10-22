const { PrismaClient } = require('@prisma/client');
const Redis = require('ioredis');
const os = require('os');

async function main() {
  console.log('--- SYSTEM ENVIRONMENT ---');
  console.log('OS:', os.platform(), os.arch(), os.release());
  console.log('CPU:', os.cpus()[0]?.model, `(${os.cpus().length} cores)`);
  console.log('Total RAM:', (os.totalmem() / 1024 ** 3).toFixed(2), 'GB');
  console.log('Node.js:', process.version);

  const prisma = new PrismaClient();
  try {
    const pgVersion = await prisma.$queryRawUnsafe('SELECT version();');
    console.log('PostgreSQL:', pgVersion[0]?.version);

    const postgisVersion = await prisma.$queryRawUnsafe('SELECT PostGIS_Version();');
    console.log('PostGIS:', postgisVersion[0]?.postgis_version);

    const userCount = await prisma.user.count();
    const jobCount = await prisma.jobPost.count();
    const applicationCount = await prisma.jobApplication.count();
    const bookingCount = await prisma.booking.count();
    const messageCount = await prisma.message.count();
    const auditCount = await prisma.auditLog.count();
    const analyticsCount = await prisma.analyticsEvent.count();

    console.log('--- DATASET SIZE ---');
    console.log({
      users: userCount,
      jobs: jobCount,
      applications: applicationCount,
      bookings: bookingCount,
      messages: messageCount,
      auditLogs: auditCount,
      analyticsEvents: analyticsCount,
    });
  } catch (err) {
    console.error('Database query error:', err.message);
  } finally {
    await prisma.$disconnect();
  }

  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  try {
    const info = await redis.info();
    const redisVerLine = info.split('\n').find((l) => l.startsWith('redis_version:'));
    console.log('Redis:', redisVerLine?.trim());
    const dbsize = await redis.dbsize();
    console.log('Redis keys count:', dbsize);
  } catch (err) {
    console.error('Redis query error:', err.message);
  } finally {
    await redis.quit();
  }
}

main();
