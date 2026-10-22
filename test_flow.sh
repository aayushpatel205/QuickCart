#!/bin/bash

BASE_URL="http://localhost:8085/cart"
USER_ID="user-123"

echo "1. Adding item to cart..."
curl -X POST "$BASE_URL/$USER_ID/items" \
     -H "Content-Type: application/json" \
     -d '{
       "RestaurantId": "rest-1",
       "ItemId": "item-10",
       "Name": "Cheeseburger",
       "Price": 12.99,
       "Qty": 2
     }'
echo ""
echo "----------------------------------------"
    
echo "2. Viewing cart..."
curl -X GET "$BASE_URL/$USER_ID"
echo ""
echo "----------------------------------------"

echo "3. Checkout..."
curl -X POST "$BASE_URL/$USER_ID/checkout" \
     -H "Content-Type: application/json" \
     -d '{
       "Address": "123 Main St"
     }'
echo ""
echo "----------------------------------------"

echo "4. Simulating time passing for order flow..."
sleep 2

echo "5. Checking order tracking (CQRS View)..."
# Assuming we got an order ID back, normally we'd parse the JSON from step 3. 
# Here we'll just show the endpoint format.
echo "Run: curl http://localhost:8085/orders/{orderId}/tracking"
echo "----------------------------------------"

echo "6. Checking notifications..."
curl -X GET "http://localhost:8085/notifications/$USER_ID"
echo ""
echo "----------------------------------------"
