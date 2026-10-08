namespace CartNotificationService.Models;

public class CartItem
{
    public string ItemId { get; set; } = "";
    public string RestaurantId { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal Price { get; set; }
    public int Qty { get; set; }
}

public class AddCartItemRequest
{
    public string RestaurantId { get; set; } = "";
    public string ItemId { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal Price { get; set; }
    public int Qty { get; set; }
}

public class CartResponse
{
    public string UserId { get; set; } = "";
    public List<CartItem> Items { get; set; } = new();
    public decimal Total => Items.Sum(i => i.Price * i.Qty);
}

public class NotificationMessage
{
    public string OrderId { get; set; } = "";
    public string UserId { get; set; } = "";
    public string Type { get; set; } = "";   // ORDER_PLACED | PAYMENT_FAILED | ORDER_CONFIRMED | DRIVER_ASSIGNED
    public string Message { get; set; } = "";
    public string Timestamp { get; set; } = DateTime.UtcNow.ToString("O");
}

public class OrderView
{
    public string OrderId { get; set; } = "";
    public string Status { get; set; } = "";
    public string? DriverName { get; set; }
    public string LastUpdate { get; set; } = "";
}

// ── Kafka event payloads ─────────────────────────────────────────────────────

public class OrderCreatedEvent
{
    public string OrderId { get; set; } = "";
    public string UserId { get; set; } = "";
    public decimal Amount { get; set; }
    public string Timestamp { get; set; } = "";
}

public class PaymentCompletedEvent
{
    public string OrderId { get; set; } = "";
    public string PaymentId { get; set; } = "";
    public decimal Amount { get; set; }
    public string Timestamp { get; set; } = "";
}

public class PaymentFailedEvent
{
    public string OrderId { get; set; } = "";
    public string Reason { get; set; } = "";
    public string Timestamp { get; set; } = "";
}

public class OrderConfirmedEvent
{
    public string OrderId { get; set; } = "";
    public string UserId { get; set; } = "";
    public string Address { get; set; } = "";
    public string Timestamp { get; set; } = "";
}

public class OrderCancelledEvent
{
    public string OrderId { get; set; } = "";
    public string Reason { get; set; } = "";
    public string Timestamp { get; set; } = "";
}

public class DeliveryAssignedEvent
{
    public string OrderId { get; set; } = "";
    public string DriverId { get; set; } = "";
    public string DriverName { get; set; } = "";
    public string Timestamp { get; set; } = "";
}

// ── Checkout ─────────────────────────────────────────────────────────────────
public class CheckoutRequest
{
    public string Address { get; set; } = "";
}

public class CheckoutResponse
{
    public bool Success { get; set; }
    public string? OrderId { get; set; }
    public string Message { get; set; } = "";
}
