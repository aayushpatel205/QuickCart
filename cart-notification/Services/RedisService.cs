using CartNotificationService.Models;
using StackExchange.Redis;
using System.Text.Json;

namespace CartNotificationService.Services;

public interface IRedisService
{
    // Cart
    Task AddCartItemAsync(string userId, CartItem item);
    Task<List<CartItem>> GetCartItemsAsync(string userId);
    Task RemoveCartItemAsync(string userId, string itemId);
    Task ClearCartAsync(string userId);

    // Notifications
    Task PushNotificationAsync(string userId, NotificationMessage msg);
    Task<List<NotificationMessage>> GetNotificationsAsync(string userId);

    // Order tracking (CQRS read model)
    Task UpdateOrderViewAsync(string orderId, string status, string? driverName = null);
    Task<OrderView?> GetOrderViewAsync(string orderId);

    // Idempotency
    Task<bool> IsEventProcessedAsync(string eventId);
    Task MarkEventProcessedAsync(string eventId);
}

public class RedisService : IRedisService
{
    private readonly IDatabase _db;
    private readonly ILogger<RedisService> _logger;

    private static string CartKey(string userId) => $"cart:{userId}";
    private static string NotifKey(string userId) => $"notifications:{userId}";
    private static string OrderViewKey(string orderId) => $"orderview:{orderId}";
    private static string ProcessedKey(string eventId) => $"processed:{eventId}";

    private static readonly TimeSpan CartTtl = TimeSpan.FromHours(24);
    private static readonly TimeSpan ProcessedTtl = TimeSpan.FromHours(48);
    private const int MaxNotifications = 20;

    public RedisService(IConnectionMultiplexer redis, ILogger<RedisService> logger)
    {
        _db = redis.GetDatabase();
        _logger = logger;
    }

    // ── Cart (Redis hash: cart:{userId}) ─────────────────────────────────────

    public async Task AddCartItemAsync(string userId, CartItem item)
    {
        var key = CartKey(userId);
        var json = JsonSerializer.Serialize(item);
        await _db.HashSetAsync(key, item.ItemId, json);
        await _db.KeyExpireAsync(key, CartTtl);
        _logger.LogInformation("Cart item {ItemId} added for user {UserId}", item.ItemId, userId);
    }

    public async Task<List<CartItem>> GetCartItemsAsync(string userId)
    {
        var entries = await _db.HashGetAllAsync(CartKey(userId));
        return entries
            .Select(e => JsonSerializer.Deserialize<CartItem>(e.Value!)!)
            .ToList();
    }

    public async Task RemoveCartItemAsync(string userId, string itemId)
    {
        await _db.HashDeleteAsync(CartKey(userId), itemId);
        _logger.LogInformation("Cart item {ItemId} removed for user {UserId}", itemId, userId);
    }

    public async Task ClearCartAsync(string userId)
    {
        await _db.KeyDeleteAsync(CartKey(userId));
        _logger.LogInformation("Cart cleared for user {UserId}", userId);
    }

    // ── Notifications (Redis list: notifications:{userId}) ───────────────────

    public async Task PushNotificationAsync(string userId, NotificationMessage msg)
    {
        var key = NotifKey(userId);
        var json = JsonSerializer.Serialize(msg);
        await _db.ListLeftPushAsync(key, json);
        await _db.ListTrimAsync(key, 0, MaxNotifications - 1); // keep last 20
        await _db.KeyExpireAsync(key, TimeSpan.FromDays(7));
    }

    public async Task<List<NotificationMessage>> GetNotificationsAsync(string userId)
    {
        var items = await _db.ListRangeAsync(NotifKey(userId), 0, -1);
        return items
            .Select(v => JsonSerializer.Deserialize<NotificationMessage>(v!)!)
            .ToList();
    }

    // ── Order tracking / CQRS read model (Redis hash: orderview:{orderId}) ───

    public async Task UpdateOrderViewAsync(string orderId, string status, string? driverName = null)
    {
        var key = OrderViewKey(orderId);
        var entries = new HashEntry[]
        {
            new("orderId",    orderId),
            new("status",     status),
            new("driverName", driverName ?? ""),
            new("lastUpdate", DateTime.UtcNow.ToString("O"))
        };
        await _db.HashSetAsync(key, entries);
        await _db.KeyExpireAsync(key, TimeSpan.FromDays(7));
        _logger.LogInformation("OrderView updated: orderId={OrderId} status={Status}", orderId, status);
    }

    public async Task<OrderView?> GetOrderViewAsync(string orderId)
    {
        var entries = await _db.HashGetAllAsync(OrderViewKey(orderId));
        if (entries.Length == 0) return null;

        var dict = entries.ToDictionary(e => e.Name.ToString(), e => e.Value.ToString());
        return new OrderView
        {
            OrderId    = dict.GetValueOrDefault("orderId", orderId),
            Status     = dict.GetValueOrDefault("status", ""),
            DriverName = dict.GetValueOrDefault("driverName"),
            LastUpdate = dict.GetValueOrDefault("lastUpdate", "")
        };
    }

    // ── Idempotency (processed:{eventId} with TTL) ───────────────────────────

    public async Task<bool> IsEventProcessedAsync(string eventId)
    {
        return await _db.KeyExistsAsync(ProcessedKey(eventId));
    }

    public async Task MarkEventProcessedAsync(string eventId)
    {
        await _db.StringSetAsync(ProcessedKey(eventId), "1", ProcessedTtl);
    }
}
