using CartNotificationService.Models;

namespace CartNotificationService.Services;

public interface ICartService
{
    Task AddItemAsync(string userId, AddCartItemRequest req);
    Task<CartResponse> GetCartAsync(string userId);
    Task RemoveItemAsync(string userId, string itemId);
    Task<CheckoutResponse> CheckoutAsync(string userId, string address);
}

public class CartService : ICartService
{
    private readonly IRedisService _redis;
    private readonly IOrderServiceClient _orderClient;
    private readonly ILogger<CartService> _logger;

    public CartService(IRedisService redis, IOrderServiceClient orderClient, ILogger<CartService> logger)
    {
        _redis = redis;
        _orderClient = orderClient;
        _logger = logger;
    }

    public async Task AddItemAsync(string userId, AddCartItemRequest req)
    {
        var item = new CartItem
        {
            ItemId = req.ItemId,
            RestaurantId = req.RestaurantId,
            Name = req.Name,
            Price = req.Price,
            Qty = req.Qty
        };
        await _redis.AddCartItemAsync(userId, item);
    }

    public async Task<CartResponse> GetCartAsync(string userId)
    {
        var items = await _redis.GetCartItemsAsync(userId);
        return new CartResponse { UserId = userId, Items = items };
    }

    public async Task RemoveItemAsync(string userId, string itemId) =>
        await _redis.RemoveCartItemAsync(userId, itemId);

    public async Task<CheckoutResponse> CheckoutAsync(string userId, string address)
    {
        var items = await _redis.GetCartItemsAsync(userId);
        if (items.Count == 0)
            return new CheckoutResponse { Success = false, Message = "Cart is empty" };

        _logger.LogInformation("Checking out cart for user {UserId} with {ItemCount} items", userId, items.Count);

        var result = await _orderClient.PlaceOrderAsync(userId, items, address);

        if (result.Success)
        {
            await _redis.ClearCartAsync(userId);
            _logger.LogInformation("Checkout successful for user {UserId}, orderId={OrderId}", userId, result.OrderId);
        }
        else
        {
            // Polly fallback: cart is kept
            _logger.LogWarning("Checkout failed for user {UserId}: {Message}", userId, result.Message);
        }

        return result;
    }
}

public interface INotificationService
{
    Task<List<NotificationMessage>> GetNotificationsAsync(string userId);
    Task StoreNotificationAsync(NotificationMessage msg);
}

public class NotificationService : INotificationService
{
    private readonly IRedisService _redis;

    public NotificationService(IRedisService redis) => _redis = redis;

    public Task<List<NotificationMessage>> GetNotificationsAsync(string userId) =>
        _redis.GetNotificationsAsync(userId);

    public Task StoreNotificationAsync(NotificationMessage msg) =>
        _redis.PushNotificationAsync(msg.UserId, msg);
}

public interface ITrackingService
{
    Task<OrderView?> GetOrderViewAsync(string orderId);
}

public class TrackingService : ITrackingService
{
    private readonly IRedisService _redis;

    public TrackingService(IRedisService redis) => _redis = redis;

    public Task<OrderView?> GetOrderViewAsync(string orderId) =>
        _redis.GetOrderViewAsync(orderId);
}
