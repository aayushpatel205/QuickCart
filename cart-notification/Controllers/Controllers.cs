using CartNotificationService.Models;
using CartNotificationService.Services;
using Microsoft.AspNetCore.Mvc;

namespace CartNotificationService.Controllers;

[ApiController]
[Route("cart")]
public class CartController : ControllerBase
{
    private readonly ICartService _cart;
    private readonly ILogger<CartController> _logger;

    public CartController(ICartService cart, ILogger<CartController> logger)
    {
        _cart = cart;
        _logger = logger;
    }

    // POST /cart/{userId}/items
    [HttpPost("{userId}/items")]
    public async Task<IActionResult> AddItem(string userId, [FromBody] AddCartItemRequest req)
    {
        _logger.LogInformation("Adding item {ItemId} to cart for user {UserId}", req.ItemId, userId);
        await _cart.AddItemAsync(userId, req);
        return Ok(new { message = "Item added to cart" });
    }

    // GET /cart/{userId}
    [HttpGet("{userId}")]
    public async Task<IActionResult> GetCart(string userId)
    {
        var cart = await _cart.GetCartAsync(userId);
        return Ok(cart);
    }

    // DELETE /cart/{userId}/items/{itemId}
    [HttpDelete("{userId}/items/{itemId}")]
    public async Task<IActionResult> RemoveItem(string userId, string itemId)
    {
        await _cart.RemoveItemAsync(userId, itemId);
        return Ok(new { message = "Item removed from cart" });
    }

    // POST /cart/{userId}/checkout
    [HttpPost("{userId}/checkout")]
    public async Task<IActionResult> Checkout(string userId, [FromBody] CheckoutRequest req)
    {
        var result = await _cart.CheckoutAsync(userId, req.Address);
        if (!result.Success)
            return StatusCode(503, result);
        return Ok(result);
    }
}

[ApiController]
[Route("orders")]
public class TrackingController : ControllerBase
{
    private readonly ITrackingService _tracking;

    public TrackingController(ITrackingService tracking) => _tracking = tracking;

    // GET /orders/{orderId}/tracking
    [HttpGet("{orderId}/tracking")]
    public async Task<IActionResult> GetTracking(string orderId)
    {
        var view = await _tracking.GetOrderViewAsync(orderId);
        if (view is null)
            return NotFound(new { message = "Order not found in tracking view" });
        return Ok(view);
    }
}

[ApiController]
[Route("notifications")]
public class NotificationController : ControllerBase
{
    private readonly INotificationService _notifications;

    public NotificationController(INotificationService notifications) => _notifications = notifications;

    // GET /notifications/{userId}
    [HttpGet("{userId}")]
    public async Task<IActionResult> GetNotifications(string userId)
    {
        var list = await _notifications.GetNotificationsAsync(userId);
        return Ok(list);
    }
}
