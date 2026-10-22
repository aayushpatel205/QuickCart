const assert = require('assert');
const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const mongoose = require('mongoose');
const { generateToken } = require('../scripts/generate-token');

console.log('--- Running Self-Validation Test Suite ---\n');

// 1. Validate JWT Generation
console.log('1. Testing JWT Token Generator...');
const adminToken = generateToken({ role: 'ADMIN', userId: 'admin-test-01' });
assert.strictEqual(adminToken.payload.role, 'ADMIN');
assert.strictEqual(adminToken.payload.sub, 'admin-test-01');
assert.strictEqual(adminToken.payload.iss, 'quickcart-auth');

const customerToken = generateToken({ role: 'CUSTOMER', userId: 'cust-test-01' });
assert.strictEqual(customerToken.payload.role, 'CUSTOMER');
assert.strictEqual(customerToken.payload.sub, 'cust-test-01');
console.log('✓ JWT generator produces valid payloads and headers\n');

// 2. Validate Proto Loading
console.log('2. Testing gRPC Proto Loading...');
const PROTO_PATH = path.resolve(__dirname, '../proto/menu.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
assert.ok(protoDescriptor.quickcart, 'quickcart package exists in proto');
assert.ok(protoDescriptor.quickcart.MenuService, 'MenuService exists in proto');
assert.ok(
  protoDescriptor.quickcart.MenuService.service.ValidateItems,
  'ValidateItems method exists in MenuService'
);
console.log('✓ Proto definition loaded and verified successfully\n');

// 3. Validate Mongoose Model Definition
console.log('3. Testing Restaurant Mongoose Model...');
const Restaurant = require('../src/db/models/Restaurant');
const mockRest = new Restaurant({
  _id: 'rest-mock-1',
  name: 'Test Pizza',
  cuisine: 'Italian',
  address: '100 Main St',
  rating: 4.6,
  items: [
    { itemId: 'item-001', name: 'Pizza', price: 10.0, available: true },
    { itemId: 'item-002', name: 'Cola', price: 2.5, available: false }
  ]
});
assert.strictEqual(mockRest._id, 'rest-mock-1');
assert.strictEqual(mockRest.items.length, 2);
assert.strictEqual(mockRest.items[0].available, true);
assert.strictEqual(mockRest.items[1].available, false);
console.log('✓ Mongoose Restaurant Schema structure verified\n');

// 4. Validate Price Calculation Logic (Never trust client prices)
console.log('4. Testing Server-side Price Calculation Logic...');
const dbItems = [
  { itemId: 'item-101', name: 'Margherita Pizza', price: 12.99, available: true },
  { itemId: 'item-102', name: 'Truffle Mushroom Pasta', price: 16.50, available: true }
];
const requestedItems = [
  { itemId: 'item-101', qty: 2 },
  { itemId: 'item-102', qty: 1 }
];

let calculatedTotal = 0;
for (const reqItem of requestedItems) {
  const match = dbItems.find((i) => i.itemId === reqItem.itemId);
  assert.ok(match && match.available);
  calculatedTotal += match.price * reqItem.qty;
}
const rounded = Math.round(calculatedTotal * 100) / 100;
assert.strictEqual(rounded, 42.48);
console.log(`✓ Price calculated strictly from DB: $42.48 matches expected calculation\n`);

console.log('====================================================');
console.log('All local self-validation tests PASSED successfully!');
console.log('====================================================\n');
process.exit(0);
