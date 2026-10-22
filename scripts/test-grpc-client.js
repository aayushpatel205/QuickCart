const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const PROTO_PATH = path.resolve(__dirname, '../proto/menu.proto');
const GRPC_TARGET = process.env.GRPC_TARGET || 'localhost:50051';

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const quickcartProto = protoDescriptor.quickcart;

const client = new quickcartProto.MenuService(
  GRPC_TARGET,
  grpc.credentials.createInsecure()
);

function validateItemsRpc(requestPayload) {
  return new Promise((resolve, reject) => {
    const metadata = new grpc.Metadata();
    metadata.set('x-correlation-id', `test-grpc-corr-${Date.now()}`);
    metadata.set('x-order-id', 'test-order-999');

    client.validateItems(requestPayload, metadata, (err, response) => {
      if (err) return reject(err);
      return resolve(response);
    });
  });
}

async function runTests() {
  console.log(`\nTesting gRPC MenuService on ${GRPC_TARGET}...\n`);

  // Test Case 1: Valid items on rest-1 (Bella Italia: Margherita Pizza $12.99 * 2 + Pasta $16.50 * 1 = $42.48)
  try {
    console.log('--- Test Case 1: Valid Items Validation ---');
    const req1 = {
      restaurantId: 'rest-1',
      items: [
        { itemId: 'item-101', qty: 2 },
        { itemId: 'item-102', qty: 1 }
      ]
    };
    console.log('Request:', JSON.stringify(req1));
    const res1 = await validateItemsRpc(req1);
    console.log('Response:', JSON.stringify(res1, null, 2));
    console.log('Expected: valid = true, totalPrice = 42.48\n');
  } catch (err) {
    console.error('Test 1 Failed:', err.message);
  }

  // Test Case 2: Unavailable item on rest-1 (item-105 Tiramisu is unavailable in seed)
  try {
    console.log('--- Test Case 2: Unavailable Item Check ---');
    const req2 = {
      restaurantId: 'rest-1',
      items: [
        { itemId: 'item-105', qty: 1 }
      ]
    };
    console.log('Request:', JSON.stringify(req2));
    const res2 = await validateItemsRpc(req2);
    console.log('Response:', JSON.stringify(res2, null, 2));
    console.log('Expected: valid = false, item marked unavailable\n');
  } catch (err) {
    console.error('Test 2 Failed:', err.message);
  }

  // Test Case 3: Non-existent item
  try {
    console.log('--- Test Case 3: Non-existent Item Check ---');
    const req3 = {
      restaurantId: 'rest-1',
      items: [
        { itemId: 'item-non-existent-999', qty: 1 }
      ]
    };
    console.log('Request:', JSON.stringify(req3));
    const res3 = await validateItemsRpc(req3);
    console.log('Response:', JSON.stringify(res3, null, 2));
    console.log('Expected: valid = false, item does not exist\n');
  } catch (err) {
    console.error('Test 3 Failed:', err.message);
  }

  // Test Case 4: Non-existent restaurant
  try {
    console.log('--- Test Case 4: Non-existent Restaurant Check ---');
    const req4 = {
      restaurantId: 'rest-unknown',
      items: [
        { itemId: 'item-101', qty: 1 }
      ]
    };
    console.log('Request:', JSON.stringify(req4));
    const res4 = await validateItemsRpc(req4);
    console.log('Response:', JSON.stringify(res4, null, 2));
    console.log('Expected: valid = false, restaurant does not exist\n');
  } catch (err) {
    console.error('Test 4 Failed:', err.message);
  }

  console.log('All gRPC client test scenarios executed.\n');
}

if (require.main === module) {
  runTests();
}
