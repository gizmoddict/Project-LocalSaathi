const http = require('http');

http.get('http://localhost:4000/api/docs-json', (res) => {
  let buf = '';
  res.on('data', (c) => (buf += c));
  res.on('end', () => {
    try {
      const doc = JSON.parse(buf);
      const paths = Object.keys(doc.paths);

      console.log('===============================================================');
      console.log('  LOCALSAATHI PHASE 12 NOTIFICATION ROUTES VERIFICATION');
      console.log('===============================================================');

      // Check for any duplicate /api/v1/api/v1 prefix
      const badPaths = paths.filter((p) => p.includes('/api/v1/api/v1'));
      if (badPaths.length > 0) {
        console.error('FAIL: Duplicate prefix found:', badPaths);
        process.exit(1);
      }
      console.log('PASS: Zero duplicate /api/v1/api/v1 prefixes found in Swagger.\n');

      const expectedPhase12Routes = [
        { method: 'get', path: '/api/v1/notifications' },
        { method: 'get', path: '/api/v1/notifications/unread-count' },
        { method: 'get', path: '/api/v1/notifications/preferences' },
        { method: 'patch', path: '/api/v1/notifications/preferences' },
        { method: 'get', path: '/api/v1/notifications/{notificationId}' },
        { method: 'patch', path: '/api/v1/notifications/{notificationId}/read' },
        { method: 'post', path: '/api/v1/notifications/{notificationId}/read' },
        { method: 'post', path: '/api/v1/notifications/read-all' },
        { method: 'delete', path: '/api/v1/notifications/{notificationId}' },
        { method: 'post', path: '/api/v1/notifications/cleanup-expired' },
      ];

      console.log('Verifying Expected Phase 12 Notification Endpoints:');
      let allFound = true;
      for (const exp of expectedPhase12Routes) {
        const pathObj = doc.paths[exp.path];
        if (pathObj && pathObj[exp.method]) {
          console.log(`  ✓ FOUND: ${exp.method.toUpperCase()} -> ${exp.path}`);
        } else {
          console.error(`  ✗ MISSING: ${exp.method.toUpperCase()} -> ${exp.path}`);
          allFound = false;
        }
      }

      if (!allFound) {
        console.error('\nFAIL: Some Phase 12 endpoints are missing in Swagger!');
        process.exit(1);
      }

      console.log('\nPASS: All Phase 12 notification endpoints registered cleanly and verified!\n');
    } catch (err) {
      console.error('Failed to parse Swagger JSON:', err);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  console.error('HTTP Request error (ensure API is running on :4000):', err.message);
  process.exit(1);
});
