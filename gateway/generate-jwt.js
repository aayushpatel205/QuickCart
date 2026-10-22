const http = require('http');
const url = require('url');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'quickcart-super-secret-jwt-key-2026';
const PORT = process.env.AUTH_HELPER_PORT || 8086;

function createToken(role = 'CUSTOMER', userId = null) {
  const normalizedRole = role.toUpperCase();
  const sub = userId || (normalizedRole === 'ADMIN' ? 'admin-001' : 'customer-001');

  const payload = {
    sub,
    role: normalizedRole,
    name: normalizedRole === 'ADMIN' ? 'System Administrator' : 'QuickCart Customer',
    email: `${sub}@quickcart.local`,
    iss: 'quickcart-auth'
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
  return { token, payload };
}

// If run directly with node gateway/generate-jwt.js --server, start HTTP helper
const isServerMode = process.argv.includes('--server');

if (isServerMode) {
  const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    res.setHeader('Content-Type', 'application/json');

    if (parsedUrl.pathname === '/token' || parsedUrl.pathname === '/login') {
      const role = (parsedUrl.query.role || 'CUSTOMER').toUpperCase();
      const userId = parsedUrl.query.userId || null;
      const { token, payload } = createToken(role, userId);

      res.writeHead(200);
      return res.end(
        JSON.stringify(
          {
            message: `Generated test JWT for role ${role}`,
            role,
            userId: payload.sub,
            token,
            curlExample: `curl -H "Authorization: Bearer ${token}" -H "X-User-Id: ${payload.sub}" -H "X-User-Role: ${role}" http://localhost:8080/restaurants`
          },
          null,
          2
        )
      );
    }

    if (parsedUrl.pathname === '/health') {
      res.writeHead(200);
      return res.end(JSON.stringify({ status: 'UP', service: 'jwt-helper' }));
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'NotFound', usage: 'GET /token?role=ADMIN or GET /token?role=CUSTOMER' }));
  });

  server.listen(PORT, () => {
    console.log(`[QuickCart Auth Helper] Listening on http://localhost:${PORT}`);
    console.log(`  -> Get Customer Token: http://localhost:${PORT}/token?role=CUSTOMER`);
    console.log(`  -> Get Admin Token:    http://localhost:${PORT}/token?role=ADMIN`);
  });
} else {
  // CLI Mode
  console.log('\n===============================================================');
  console.log('   QuickCart Team JWT Login Helper');
  console.log('===============================================================');
  console.log('Secret:', JWT_SECRET);

  const customer = createToken('CUSTOMER', 'customer-sarah-101');
  const admin = createToken('ADMIN', 'admin-alex-001');

  console.log('\n[1] CUSTOMER Token (sub: customer-sarah-101):');
  console.log('Token: ' + customer.token);
  console.log('\ncURL command to view restaurants through Kong Gateway:');
  console.log(
    `curl -i -X GET http://localhost:8080/restaurants \\\n` +
      `  -H "Authorization: Bearer ${customer.token}" \\\n` +
      `  -H "X-User-Id: ${customer.payload.sub}" \\\n` +
      `  -H "X-User-Role: CUSTOMER"`
  );

  console.log('\n---------------------------------------------------------------');
  console.log('[2] ADMIN Token (sub: admin-alex-001):');
  console.log('Token: ' + admin.token);
  console.log('\ncURL command to add a new restaurant through Kong Gateway:');
  console.log(
    `curl -i -X POST http://localhost:8080/restaurants \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -H "Authorization: Bearer ${admin.token}" \\\n` +
      `  -H "X-User-Id: ${admin.payload.sub}" \\\n` +
      `  -H "X-User-Role: ADMIN" \\\n` +
      `  -d '{"name":"Kyoto Sushi Bar","cuisine":"Japanese","address":"456 Pine St","items":[{"itemId":"item-901","name":"Salmon Sashimi","price":18.0,"available":true}]}'`
  );
  console.log('===============================================================\n');
}

module.exports = { createToken };
