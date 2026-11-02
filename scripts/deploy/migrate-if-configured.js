const { execSync } = require('child_process');

const url = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;

if (url && !url.includes('localhost') && !url.includes('127.0.0.1')) {
  console.log('==> Remote database detected. Applying Prisma migrations...');
  try {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('==> Migrations applied successfully.');
  } catch (error) {
    console.warn('==> Warning: Prisma migration could not be completed at build time:', error.message);
  }
} else {
  console.log('==> No remote database configured or URL points to localhost. Skipping migration step.');
}
