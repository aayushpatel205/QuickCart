const http = require('http');
const assert = require('assert');
const { app } = require('../src/server');

console.log('--- Testing Express HTTP Routes & Middleware ---\n');

const server = http.createServer(app);

server.listen(0, async () => {
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  function request(path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = `${baseUrl}${path}`;
      const req = http.request(url, options, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        });
      });
      req.on('error', reject);
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  try {
    // 1. Test /health route
    console.log('1. Testing GET /health ...');
    const healthRes = await request('/health');
    // DB is not connected locally so health should report 503 or 200 with JSON payload
    assert.ok(healthRes.statusCode === 503 || healthRes.statusCode === 200);
    const healthJson = JSON.parse(healthRes.body);
    assert.strictEqual(healthJson.service, 'restaurant-service');
    assert.ok(healthRes.headers['x-correlation-id'], 'X-Correlation-Id header present in response');
    console.log('✓ /health returns structured health check with correlation ID\n');

    // 2. Test /metrics Prometheus endpoint
    console.log('2. Testing GET /metrics ...');
    const metricsRes = await request('/metrics');
    assert.strictEqual(metricsRes.statusCode, 200);
    assert.ok(
      metricsRes.body.includes('quickcart_restaurant_'),
      'Prometheus default metrics present'
    );
    assert.ok(
      metricsRes.body.includes('http_requests_total'),
      'HTTP requests counter present'
    );
    console.log('✓ /metrics exports valid Prometheus metric format\n');

    // 3. Test POST /restaurants without ADMIN role -> 403 Forbidden
    console.log('3. Testing POST /restaurants without ADMIN role (Access Control) ...');
    const forbiddenRes = await request('/restaurants', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'customer-001',
        'X-User-Role': 'CUSTOMER'
      },
      body: JSON.stringify({ name: 'Hacker Cafe', cuisine: 'Fast Food', address: 'Nowhere' })
    });
    assert.strictEqual(forbiddenRes.statusCode, 403);
    const forbiddenJson = JSON.parse(forbiddenRes.body);
    assert.strictEqual(forbiddenJson.error, 'Forbidden');
    assert.strictEqual(forbiddenJson.receivedRole, 'CUSTOMER');
    console.log('✓ Non-admin role correctly rejected with 403 Forbidden\n');

    // 4. Test POST /restaurants without any role header -> 403 Forbidden
    console.log('4. Testing POST /restaurants with anonymous request ...');
    const anonRes = await request('/restaurants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hacker Cafe', cuisine: 'Fast Food', address: 'Nowhere' })
    });
    assert.strictEqual(anonRes.statusCode, 403);
    const anonJson = JSON.parse(anonRes.body);
    assert.strictEqual(anonJson.error, 'Forbidden');
    console.log('✓ Anonymous request correctly rejected with 403 Forbidden\n');

    console.log('====================================================');
    console.log('All Express route & security tests PASSED!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('Route test failed:', err);
    process.exit(1);
  } finally {
    server.close();
    process.exit(0);
  }
});
