$BaseUrl = "http://localhost:8085/cart"
$UserId = "user-123"

Write-Host "1. Adding item to cart..."
Invoke-RestMethod -Uri "$BaseUrl/$UserId/items" -Method Post -ContentType "application/json" -Body '{ "RestaurantId": "rest-1", "ItemId": "item-10", "Name": "Cheeseburger", "Price": 12.99, "Qty": 2 }' | ConvertTo-Json

Write-Host "`n----------------------------------------"
Write-Host "2. Viewing cart..."
Invoke-RestMethod -Uri "$BaseUrl/$UserId" -Method Get | ConvertTo-Json

Write-Host "`n----------------------------------------"
Write-Host "3. Checkout..."
$checkoutResult = Invoke-RestMethod -Uri "$BaseUrl/$UserId/checkout" -Method Post -ContentType "application/json" -Body '{ "Address": "123 Main St" }'
$checkoutResult | ConvertTo-Json
$OrderId = $checkoutResult.orderId

Write-Host "`n----------------------------------------"
Write-Host "4. Simulating time passing for order flow..."
Start-Sleep -Seconds 3

Write-Host "`n5. Checking order tracking (CQRS View)..."
If ($OrderId) {
    Try {
        Invoke-RestMethod -Uri "http://localhost:8085/orders/$OrderId/tracking" -Method Get | ConvertTo-Json
    } Catch {
        Write-Host "Tracking not available yet or error: $_"
    }
} Else {
    Write-Host "No OrderId received from checkout step!"
}

Write-Host "`n----------------------------------------"
Write-Host "6. Checking notifications..."
Invoke-RestMethod -Uri "http://localhost:8085/notifications/$UserId" -Method Get | ConvertTo-Json
Write-Host "`n----------------------------------------"
