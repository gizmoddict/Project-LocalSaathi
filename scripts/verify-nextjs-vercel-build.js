/**
 * scripts/verify-nextjs-vercel-build.js
 * 
 * Verifies that LocalSaathi is 100% structured as a native Next.js application
 * ready for 1-click deployment on Vercel Free tier.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('LocalSaathi — Next.js Vercel Compatibility Verification');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] Test ${totalTests}: ${name}`);
    console.error(`         ${err.message}`);
  }
}

// 1. Root package.json check
runTest('Root package.json has Next.js scripts and dependencies', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  assert.strictEqual(pkg.name, 'localsaathi');
  assert.ok(pkg.scripts.build.includes('next build'), 'build script must call next build');
  assert.ok(pkg.scripts.dev.includes('next dev'), 'dev script must call next dev');
  assert.ok(pkg.scripts.postinstall.includes('prisma generate'), 'postinstall must generate prisma client');
  assert.ok(pkg.dependencies.next, 'Must have next dependency');
  assert.ok(pkg.dependencies.react, 'Must have react dependency');
  assert.ok(pkg.dependencies['lucide-react'], 'Must have lucide-react dependency');
});

// 2. vercel.json check
runTest('vercel.json is configured for Next.js framework', () => {
  const vercelConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../vercel.json'), 'utf8'));
  assert.strictEqual(vercelConfig.framework, 'nextjs');
  assert.ok(vercelConfig.buildCommand.includes('next build'));
});

// 3. tsconfig.json check
runTest('tsconfig.json has internal path aliases for clean resolution', () => {
  const tsconfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../tsconfig.json'), 'utf8'));
  const paths = tsconfig.compilerOptions.paths;
  assert.ok(paths['@/*'], 'Must have @/* alias');
  assert.ok(paths['@localsaathi/types'], 'Must have @localsaathi/types alias');
  assert.ok(paths['@localsaathi/validation'], 'Must have @localsaathi/validation alias');
  assert.ok(paths['@localsaathi/ui'], 'Must have @localsaathi/ui alias');
});

// 4. Serverless API Route Handlers check
runTest('Serverless API Route Handlers exist under src/app/api', () => {
  const slugRoute = path.resolve(__dirname, '../src/app/api/v1/[...slug]/route.ts');
  const healthRoute = path.resolve(__dirname, '../src/app/api/health/route.ts');
  assert.ok(fs.existsSync(slugRoute), 'Must have src/app/api/v1/[...slug]/route.ts');
  assert.ok(fs.existsSync(healthRoute), 'Must have src/app/api/health/route.ts');
});

// 5. Prisma schema check at root
runTest('Prisma schema exists at root prisma/schema.prisma', () => {
  const schemaPath = path.resolve(__dirname, '../prisma/schema.prisma');
  assert.ok(fs.existsSync(schemaPath), 'prisma/schema.prisma must exist at root');
});

// 6. Production build artifact check
runTest('Next.js production build artifacts exist in .next', () => {
  const buildIdPath = path.resolve(__dirname, '../.next/BUILD_ID');
  assert.ok(fs.existsSync(buildIdPath), '.next/BUILD_ID must exist indicating successful next build');
});

console.log('\n----------------------------------------------------------------');
console.log(`Results: ${passedTests}/${totalTests} tests passed (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('----------------------------------------------------------------\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
