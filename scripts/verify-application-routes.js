const http = require('http');

http.get('http://localhost:4000/api/docs-json', (res) => {
  let buf = '';
  res.on('data', (c) => (buf += c));
  res.on('end', () => {
    try {
      const doc = JSON.parse(buf);
      const paths = Object.keys(doc.paths);

      console.log('===============================================================');
      console.log('  LOCALSAATHI PHASE 7 APPLICATION ROUTES VERIFICATION');
      console.log('===============================================================');

      // Check for any duplicate /api/v1/api/v1 prefix
      const badPaths = paths.filter((p) => p.includes('/api/v1/api/v1'));
      if (badPaths.length > 0) {
        console.error('FAIL: Duplicate prefix found:', badPaths);
        process.exit(1);
      }
      console.log('PASS: Zero duplicate /api/v1/api/v1 prefixes found in Swagger.\n');

      const expectedPhase7Routes = [
        { method: 'post', path: '/api/v1/workers/me/jobs/{jobId}/applications' },
        { method: 'get', path: '/api/v1/workers/me/applications' },
        { method: 'get', path: '/api/v1/workers/me/jobs/{jobId}/application' },
        { method: 'get', path: '/api/v1/workers/me/applications/{applicationId}' },
        { method: 'post', path: '/api/v1/workers/me/applications/{applicationId}/withdraw' },
        { method: 'get', path: '/api/v1/employers/me/jobs/{jobId}/applications' },
        { method: 'get', path: '/api/v1/employers/me/applications/{applicationId}' },
        { method: 'post', path: '/api/v1/employers/me/applications/{applicationId}/shortlist' },
        { method: 'post', path: '/api/v1/employers/me/applications/{applicationId}/reject' },
        { method: 'post', path: '/api/v1/employers/me/applications/{applicationId}/accept' },
      ];

      console.log('Verifying Expected Phase 7 Endpoints:');
      let allFound = true;
      for (const exp of expectedPhase7Routes) {
        const pathObj = doc.paths[exp.path];
        if (pathObj && pathObj[exp.method]) {
          console.log(`  ✓ FOUND: ${exp.method.toUpperCase()} -> ${exp.path}`);
        } else {
          console.error(`  ✗ MISSING: ${exp.method.toUpperCase()} -> ${exp.path}`);
          allFound = false;
        }
      }

      if (!allFound) {
        console.error('\nFAIL: Some Phase 7 endpoints are missing in Swagger!');
        process.exit(1);
      }

      console.log('\nPASS: All 10 Phase 7 endpoints registered cleanly and verified!\n');
    } catch (err) {
      console.error('Failed to parse Swagger JSON:', err);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  console.error('HTTP Request error:', err);
  process.exit(1);
});
