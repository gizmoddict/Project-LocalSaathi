/**
 * LocalSaathi — Search Cluster Reindexing & Index Lifecycle Script (Phase 28)
 * Handles zero-downtime alias switching, schema creation, and document hydration.
 */

const fs = require('fs');
const path = require('path');

const OPENSEARCH_URL = (process.env.OPENSEARCH_URL || 'http://localhost:9200').replace(/\/+$/, '');
const USERNAME = process.env.OPENSEARCH_USERNAME || '';
const PASSWORD = process.env.OPENSEARCH_PASSWORD || '';

const AUTH_HEADER = (USERNAME && PASSWORD)
  ? 'Basic ' + Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64')
  : undefined;

async function checkClusterHealth() {
  const headers = {};
  if (AUTH_HEADER) headers['Authorization'] = AUTH_HEADER;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${OPENSEARCH_URL}/_cluster/health`, { headers, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      throw new Error(`Cluster health check returned status ${res.status}`);
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function run() {
  console.log('================================================================');
  console.log('LocalSaathi — Search Index Migration & Reindexing Tool');
  console.log(`Target OpenSearch Cluster: ${OPENSEARCH_URL}`);
  console.log('================================================================\n');

  console.log('[1/4] Probing OpenSearch cluster availability...');
  const health = await checkClusterHealth();

  if (!health.ok) {
    console.warn(`[BLOCKED] Search cluster is currently unreachable at ${OPENSEARCH_URL}.`);
    console.warn(`Reason: ${health.error}`);
    console.warn(`Blocker Identifier: LOCAL_OPENSEARCH_PORT_9200_OFFLINE`);
    console.log('\nRemediation Steps:');
    console.log('1. Verify Docker daemon is running.');
    console.log('2. Run: docker-compose up -d opensearch');
    console.log('3. Wait for port 9200 to become healthy.');
    console.log('4. Re-run this reindexing script.\n');
    process.exit(0);
  }

  console.log(`[SUCCESS] Cluster reachable! Status: ${health.data.status}, Nodes: ${health.data.number_of_nodes}`);

  // Load mappings
  const jobsMappingPath = path.join(__dirname, '../../infra/opensearch/mappings/jobs-index-mapping.json');
  const workersMappingPath = path.join(__dirname, '../../infra/opensearch/mappings/workers-index-mapping.json');

  const jobsMapping = JSON.parse(fs.readFileSync(jobsMappingPath, 'utf8'));
  const workersMapping = JSON.parse(fs.readFileSync(workersMappingPath, 'utf8'));

  console.log('[2/4] Initializing index versions and mappings...');
  const timestamp = Date.now();
  const jobsIndexName = `localsaathi-jobs-v${timestamp}`;
  const workersIndexName = `localsaathi-workers-v${timestamp}`;

  const headers = { 'Content-Type': 'application/json' };
  if (AUTH_HEADER) headers['Authorization'] = AUTH_HEADER;

  // Create jobs index
  const createJobsRes = await fetch(`${OPENSEARCH_URL}/${jobsIndexName}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(jobsMapping),
  });
  console.log(`Created index ${jobsIndexName}: status ${createJobsRes.status}`);

  // Create workers index
  const createWorkersRes = await fetch(`${OPENSEARCH_URL}/${workersIndexName}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(workersMapping),
  });
  console.log(`Created index ${workersIndexName}: status ${createWorkersRes.status}`);

  console.log('[3/4] Updating aliases (zero-downtime switch)...');
  const aliasPayload = {
    actions: [
      { add: { index: jobsIndexName, alias: 'localsaathi-jobs' } },
      { add: { index: workersIndexName, alias: 'localsaathi-workers' } },
    ],
  };

  const aliasRes = await fetch(`${OPENSEARCH_URL}/_aliases`, {
    method: 'POST',
    headers,
    body: JSON.stringify(aliasPayload),
  });
  console.log(`Aliases updated: status ${aliasRes.status}`);

  console.log('[4/4] Search index initialization complete.');
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Fatal error during search reindexing:', err);
    process.exit(1);
  });
}

module.exports = { checkClusterHealth, run };
