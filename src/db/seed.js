const { connectDB, disconnectDB } = require('./connection');
const Restaurant = require('./models/Restaurant');
const { logger } = require('../utils/logger');

const seedRestaurants = [
  {
    _id: 'rest-1',
    name: 'Bella Italia Trattoria',
    cuisine: 'Italian',
    address: '124 Olive Grove St, Central City',
    rating: 4.8,
    items: [
      { itemId: 'item-101', name: 'Margherita Pizza', price: 12.99, available: true },
      { itemId: 'item-102', name: 'Truffle Mushroom Pasta', price: 16.50, available: true },
      { itemId: 'item-103', name: 'Classic Lasagna Bolognese', price: 15.00, available: true },
      { itemId: 'item-104', name: 'Crispy Bruschetta', price: 8.50, available: true },
      { itemId: 'item-105', name: 'Tiramisu Tradizionale', price: 7.00, available: false } // item unavailable for testing
    ]
  },
  {
    _id: 'rest-2',
    name: 'Spice Symphony',
    cuisine: 'Indian',
    address: '45 Lotus Avenue, Midtown',
    rating: 4.7,
    items: [
      { itemId: 'item-201', name: 'Butter Chicken', price: 14.50, available: true },
      { itemId: 'item-202', name: 'Paneer Tikka Masala', price: 13.00, available: true },
      { itemId: 'item-203', name: 'Garlic Butter Naan', price: 3.50, available: true },
      { itemId: 'item-204', name: 'Hyderabadi Dum Biryani', price: 15.50, available: true },
      { itemId: 'item-205', name: 'Gulab Jamun (2 pcs)', price: 4.50, available: true }
    ]
  },
  {
    _id: 'rest-3',
    name: 'Tokyo Ramen & Sushi Bar',
    cuisine: 'Japanese',
    address: '88 Sakura Boulevard, East Bay',
    rating: 4.9,
    items: [
      { itemId: 'item-301', name: 'Tonkotsu Ramen Special', price: 14.00, available: true },
      { itemId: 'item-302', name: 'Spicy Miso Ramen', price: 13.50, available: true },
      { itemId: 'item-303', name: 'Salmon Nigiri (4 pcs)', price: 11.00, available: true },
      { itemId: 'item-304', name: 'Crispy Pork Gyoza', price: 7.50, available: true },
      { itemId: 'item-305', name: 'Matcha Green Tea Ice Cream', price: 5.00, available: true }
    ]
  }
];

async function seed() {
  try {
    await connectDB();
    logger.info('Purging existing restaurants collection...');
    await Restaurant.deleteMany({});

    logger.info(`Inserting ${seedRestaurants.length} restaurants with menu items...`);
    const inserted = await Restaurant.insertMany(seedRestaurants);

    logger.info(
      { count: inserted.length, ids: inserted.map((r) => r._id) },
      'Database seeded successfully!'
    );

    await disconnectDB();
    process.exit(0);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to seed database');
    process.exit(1);
  }
}

if (require.main === module) {
  seed();
}

module.exports = { seed, seedRestaurants };
