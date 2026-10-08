using CartNotificationService.Models;
using System.Net.Http.Json;

namespace CartNotificationService.Services;

public interface IOrderServiceClient
{
    Task<CheckoutResponse> PlaceOrderAsync(string userId, List<CartItem> items, string address);
}

/// <summary>
/// HTTP client for the order-service. Protected by Polly retry + circuit breaker
/// (defined in PollyPolicies and registered in Program.cs).
/// Fallback on failure: keep the cart and return a friendly error.
/// </summary>
public class OrderServiceClient : IOrderServiceClient
{
    private readonly HttpClient _http;
    private readonly ILogger<OrderServiceClient> _logger;

    public OrderServiceClient(HttpClient http, ILogger<OrderServiceClient> logger)
    {
        _http = http;
        _logger = logger;
    }

    public async Task<CheckoutResponse> PlaceOrderAsync(string userId, List<CartItem> items, string address)
    {
        var payload = new
        {
            userId,
            address,
            items = items.Select(i => new
            {
                itemId = i.ItemId,
                restaurantId = i.RestaurantId,
                name = i.Name,
                price = i.Price,
                qty = i.Qty
            })
        };

        try
        {
            var response = await _http.PostAsJsonAsync("/orders", payload);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync();
                _logger.LogWarning("order-service returned {Status}: {Body}", response.StatusCode, body);
                return new CheckoutResponse { Success = false, Message = $"Order service error: {response.StatusCode}" };
            }

            var result = await response.Content.ReadFromJsonAsync<dynamic>();
            string orderId = result?.GetProperty("orderId").GetString() ?? Guid.NewGuid().ToString();
            return new CheckoutResponse { Success = true, OrderId = orderId, Message = "Order placed successfully" };
        }
        catch (Exception ex)
        {
            // Polly fallback: circuit breaker is open or all retries exhausted
            _logger.LogError(ex, "Failed to call order-service. Cart is preserved.");
            return new CheckoutResponse
            {
                Success = false,
                Message = "Unable to reach order service. Please try again later. Your cart has been saved."
            };
        }
    }
}
