const express = require('express');
const Restaurant = require('../db/models/Restaurant');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /restaurants
 * List all restaurants, with optional ?cuisine= filter
 */
router.get('/', async (req, res) => {
  try {
    const { cuisine } = req.query;
    const query = {};

    if (cuisine) {
      query.cuisine = { $regex: new RegExp(`^${cuisine}$`, 'i') };
    }

    const restaurants = await Restaurant.find(query).lean();

    req.log.info(
      { count: restaurants.length, filter: cuisine || 'all' },
      'Fetched restaurants list'
    );

    return res.status(200).json({
      success: true,
      count: restaurants.length,
      data: restaurants
    });
  } catch (error) {
    req.log.error({ error: error.message }, 'Failed to fetch restaurants');
    return res.status(500).json({
      success: false,
      error: 'InternalServerError',
      message: error.message
    });
  }
});

/**
 * GET /restaurants/:id/menu
 * Get menu items for a specific restaurant
 */
router.get('/:id/menu', async (req, res) => {
  try {
    const { id } = req.params;
    const restaurant = await Restaurant.findById(id).lean();

    if (!restaurant) {
      req.log.warn({ restaurantId: id }, 'Restaurant not found for menu request');
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: `Restaurant with ID '${id}' not found`
      });
    }

    req.log.info(
      { restaurantId: id, itemCount: restaurant.items?.length || 0 },
      'Fetched restaurant menu'
    );

    return res.status(200).json({
      success: true,
      restaurantId: restaurant._id,
      restaurantName: restaurant.name,
      cuisine: restaurant.cuisine,
      menu: restaurant.items || []
    });
  } catch (error) {
    req.log.error({ error: error.message, restaurantId: req.params.id }, 'Failed to fetch menu');
    return res.status(500).json({
      success: false,
      error: 'InternalServerError',
      message: error.message
    });
  }
});

/**
 * POST /restaurants
 * (ADMIN only) Add a restaurant with menu items
 */
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { _id, name, cuisine, address, rating, items } = req.body;

    if (!name || !cuisine || !address) {
      return res.status(400).json({
        success: false,
        error: 'BadRequest',
        message: 'Fields name, cuisine, and address are required'
      });
    }

    // Process and validate items if provided
    const formattedItems = Array.isArray(items)
      ? items.map((it, idx) => ({
          itemId: it.itemId || `item-${Date.now()}-${idx}`,
          name: it.name,
          price: Number(it.price) || 0,
          available: it.available !== undefined ? Boolean(it.available) : true
        }))
      : [];

    const newRestaurant = new Restaurant({
      _id: _id || undefined,
      name,
      cuisine,
      address,
      rating: rating !== undefined ? Number(rating) : 4.5,
      items: formattedItems
    });

    const saved = await newRestaurant.save();

    req.log.info(
      { restaurantId: saved._id, name: saved.name, adminUser: req.user.id },
      'New restaurant created by admin'
    );

    return res.status(201).json({
      success: true,
      message: 'Restaurant created successfully',
      data: saved
    });
  } catch (error) {
    req.log.error({ error: error.message }, 'Failed to create restaurant');
    return res.status(500).json({
      success: false,
      error: 'InternalServerError',
      message: error.message
    });
  }
});

/**
 * PUT /restaurants/:id/items/:itemId/availability
 * Toggle or set availability of a menu item
 */
router.put('/:id/items/:itemId/availability', async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { available } = req.body; // optional explicit boolean

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: `Restaurant with ID '${id}' not found`
      });
    }

    const item = restaurant.items.find((i) => i.itemId === itemId);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: `Item with ID '${itemId}' not found in restaurant '${id}'`
      });
    }

    // If explicit boolean provided in request body, use it; otherwise toggle
    const newAvailability = available !== undefined ? Boolean(available) : !item.available;
    item.available = newAvailability;

    await restaurant.save();

    req.log.info(
      {
        restaurantId: id,
        itemId,
        previousState: !newAvailability,
        newState: newAvailability
      },
      'Updated menu item availability'
    );

    return res.status(200).json({
      success: true,
      message: `Item '${item.name}' (${itemId}) availability set to ${newAvailability}`,
      restaurantId: id,
      item: {
        itemId: item.itemId,
        name: item.name,
        price: item.price,
        available: item.available
      }
    });
  } catch (error) {
    req.log.error(
      { error: error.message, restaurantId: req.params.id, itemId: req.params.itemId },
      'Failed to update item availability'
    );
    return res.status(500).json({
      success: false,
      error: 'InternalServerError',
      message: error.message
    });
  }
});

module.exports = router;
