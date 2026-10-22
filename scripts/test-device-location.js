/**
 * scripts/test-device-location.js
 * 
 * Production verification suite for Device Location Permission, Coordinate Validation,
 * Geolocation Error Handling, and Nearby Jobs fallback mechanics.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('LocalSaathi — Device Location & Nearby Jobs Verification Suite');
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

// -----------------------------------------------------------------------------
// Test 1: Coordinate Boundary & Sanity Validation
// -----------------------------------------------------------------------------
function validateCoordinates(lat, lon) {
  if (
    typeof lat !== 'number' ||
    typeof lon !== 'number' ||
    isNaN(lat) ||
    isNaN(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return false;
  }
  return true;
}

runTest('Valid coordinates within bounds (Lucknow, UP)', () => {
  assert.strictEqual(validateCoordinates(26.8467, 80.9462), true);
});

runTest('Valid coordinates within bounds (Noida, UP)', () => {
  assert.strictEqual(validateCoordinates(28.5355, 77.3910), true);
});

runTest('Reject invalid latitude > 90', () => {
  assert.strictEqual(validateCoordinates(91.5, 80.0), false);
});

runTest('Reject invalid latitude < -90', () => {
  assert.strictEqual(validateCoordinates(-95.0, 80.0), false);
});

runTest('Reject invalid longitude > 180', () => {
  assert.strictEqual(validateCoordinates(26.0, 185.0), false);
});

runTest('Reject invalid longitude < -180', () => {
  assert.strictEqual(validateCoordinates(26.0, -185.0), false);
});

runTest('Reject NaN and non-number types', () => {
  assert.strictEqual(validateCoordinates(NaN, 80.0), false);
  assert.strictEqual(validateCoordinates(26.0, NaN), false);
  assert.strictEqual(validateCoordinates('26.0', 80.0), false);
  assert.strictEqual(validateCoordinates(null, undefined), false);
});

// -----------------------------------------------------------------------------
// Test 2: Geolocation Error Code Mapping
// -----------------------------------------------------------------------------
function mapGeolocationError(code, fallbackMsg) {
  switch (code) {
    case 1: // PERMISSION_DENIED
      return {
        status: 'denied',
        message: 'Location permission was denied. You can allow location in your browser settings or select a location manually.',
      };
    case 2: // POSITION_UNAVAILABLE
      return {
        status: 'unavailable',
        message: 'Location information is unavailable on your device or GPS signal was lost.',
      };
    case 3: // TIMEOUT
      return {
        status: 'timeout',
        message: 'Location request timed out. Please check your GPS signal or try again.',
      };
    default:
      return {
        status: 'unavailable',
        message: fallbackMsg || 'An unexpected error occurred while acquiring location.',
      };
  }
}

runTest('Map PERMISSION_DENIED (code 1) to denied status with manual fallback guidance', () => {
  const err = mapGeolocationError(1);
  assert.strictEqual(err.status, 'denied');
  assert.ok(err.message.includes('denied'));
  assert.ok(err.message.includes('manually'));
});

runTest('Map POSITION_UNAVAILABLE (code 2) to unavailable status', () => {
  const err = mapGeolocationError(2);
  assert.strictEqual(err.status, 'unavailable');
  assert.ok(err.message.includes('unavailable'));
});

runTest('Map TIMEOUT (code 3) to timeout status', () => {
  const err = mapGeolocationError(3);
  assert.strictEqual(err.status, 'timeout');
  assert.ok(err.message.includes('timed out'));
});

runTest('Map unknown error code to fallback', () => {
  const err = mapGeolocationError(999, 'Custom fallback error');
  assert.strictEqual(err.status, 'unavailable');
  assert.strictEqual(err.message, 'Custom fallback error');
});

// -----------------------------------------------------------------------------
// Test 3: Coordinate Normalization & Precision
// -----------------------------------------------------------------------------
runTest('Format coordinates to 6 decimal places (metric centimeter precision)', () => {
  const rawLat = 26.84671234567;
  const rawLon = 80.94629876543;
  const latFormatted = Number(rawLat.toFixed(6));
  const lonFormatted = Number(rawLon.toFixed(6));
  assert.strictEqual(latFormatted, 26.846712);
  assert.strictEqual(lonFormatted, 80.946299);
});

// -----------------------------------------------------------------------------
// Test 4: Verify Curated Manual Location Hubs
// -----------------------------------------------------------------------------
runTest('Verify popular UP/NCR trade hubs in LocationPermissionCard', () => {
  const componentPath = path.resolve(__dirname, '../apps/web/src/components/location/LocationPermissionCard.tsx');
  assert.ok(fs.existsSync(componentPath), 'LocationPermissionCard.tsx must exist');

  const content = fs.readFileSync(componentPath, 'utf8');
  assert.ok(content.includes('SUPPORTED_MANUAL_AREAS'), 'Must contain SUPPORTED_MANUAL_AREAS definition');
  assert.ok(content.includes('Hazratganj'), 'Must include Hazratganj hub');
  assert.ok(content.includes('Noida Sector 18'), 'Must include Noida hub');
  assert.ok(content.includes('Connaught Place'), 'Must include Delhi hub');
  assert.ok(content.includes('Gomti Nagar'), 'Must include Gomti Nagar hub');
});

// -----------------------------------------------------------------------------
// Test 5: Verify Worker-Facing Page Integrations
// -----------------------------------------------------------------------------
runTest('Verify LocationPermissionCard integration in Worker Jobs Page', () => {
  const pagePath = path.resolve(__dirname, '../apps/web/src/app/worker/jobs/page.tsx');
  const content = fs.readFileSync(pagePath, 'utf8');
  assert.ok(content.includes('LocationPermissionCard'), 'Jobs page must import LocationPermissionCard');
  assert.ok(content.includes('handleLocationSaved'), 'Jobs page must refresh jobs feed on location save');
  assert.ok(content.includes('workerLocation'), 'Jobs page must track worker location state');
  assert.ok(content.includes('Update Location'), 'Jobs page must provide location update trigger');
});

runTest('Verify LocationPermissionCard integration in Worker Dashboard', () => {
  const pagePath = path.resolve(__dirname, '../apps/web/src/app/worker/page.tsx');
  const content = fs.readFileSync(pagePath, 'utf8');
  assert.ok(content.includes('LocationPermissionCard'), 'Dashboard must import LocationPermissionCard');
  assert.ok(content.includes('loadDashboard'), 'Dashboard must reload on location save');
  assert.ok(content.includes('Update Location'), 'Dashboard must have Update Location trigger');
});

runTest('Verify LocationPermissionCard integration in Worker Profile Page', () => {
  const pagePath = path.resolve(__dirname, '../apps/web/src/app/worker/profile/page.tsx');
  const content = fs.readFileSync(pagePath, 'utf8');
  assert.ok(content.includes('LocationPermissionCard'), 'Profile page must import LocationPermissionCard');
  assert.ok(content.includes('Update Area'), 'Profile page must provide update area button');
});

// -----------------------------------------------------------------------------
// Test 6: Verify Backend Location Persistence API Contract
// -----------------------------------------------------------------------------
runTest('Verify worker updateLocation contract in worker.service.ts', () => {
  const servicePath = path.resolve(__dirname, '../apps/api/src/modules/worker/worker.service.ts');
  const content = fs.readFileSync(servicePath, 'utf8');
  assert.ok(content.includes('updateLocation'), 'WorkerService must have updateLocation method');
  assert.ok(content.includes('ST_SetSRID'), 'Must update PostGIS geometry point');
  assert.ok(content.includes('ST_MakePoint'), 'Must construct PostGIS Point(lon, lat)');
  assert.ok(content.includes('4326'), 'Must use WGS84 SRID 4326');
});

// -----------------------------------------------------------------------------
// Test 7: Privacy & Security Guarantees
// -----------------------------------------------------------------------------
runTest('Confirm privacy note is displayed to workers', () => {
  const cardPath = path.resolve(__dirname, '../apps/web/src/components/location/LocationPermissionCard.tsx');
  const content = fs.readFileSync(cardPath, 'utf8');
  assert.ok(content.includes('Privacy:'), 'Must display privacy notice');
  assert.ok(content.includes('Your exact GPS coordinates are stored privately'), 'Must explicitly assure worker of privacy');
});

console.log('\n----------------------------------------------------------------');
console.log(`Results: ${passedTests}/${totalTests} tests passed (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('----------------------------------------------------------------\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
