const jwt = require('jsonwebtoken');
const config = require('../src/config');

/**
 * Generates test JWT tokens for QuickCart microservices testing.
 * Claims include:
 * - sub (userId)
 * - role (CUSTOMER | ADMIN)
 * - name, email
 * - iss: quickcart-auth
 */
function generateToken({ userId, role = 'CUSTOMER', name = 'Test User', expiresIn = '7d' }) {
  const secret = config.jwtSecret;
  const payload = {
    sub: userId || (role === 'ADMIN' ? 'admin-user-001' : 'customer-user-101'),
    role: role.toUpperCase(),
    name: name,
    email: `${(userId || role).toLowerCase()}@quickcart.local`,
    iss: 'quickcart-auth'
  };

  const token = jwt.sign(payload, secret, { expiresIn });
  return { token, payload };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let role = 'CUSTOMER';
  let userId = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--role' && args[i + 1]) {
      role = args[i + 1];
    }
    if (args[i] === '--user' && args[i + 1]) {
      userId = args[i + 1];
    }
  }

  const { token, payload } = generateToken({ userId, role });

  console.log('\n======================================================');
  console.log(` QuickCart Test JWT Generator [Role: ${payload.role}]`);
  console.log('======================================================');
  console.log('Secret used: ', config.jwtSecret);
  console.log('Token Payload:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('\nGenerated JWT Token:');
  console.log(token);
  console.log('\nReady-to-use cURL Authorization Header:');
  console.log(`-H "Authorization: Bearer ${token}"`);
  console.log('======================================================\n');
}

module.exports = { generateToken };
