using CartNotificationService.Models;
using CartNotificationService.Services;
using Confluent.Kafka;
using System.Text.Json;

namespace CartNotificationService.Consumers;

/// <summary>
/// Kafka consumer hosted service.
/// Subscribes to: order.created, order.confirmed, order.cancelled,
///                payment.failed, delivery.assigned
/// Updates the Redis CQRS read model (orderview:{orderId}) for each event.
/// Handles duplicate events via processed:{eventId} idempotency key.
/// </summary>
public class KafkaConsumerService : BackgroundService
{
    private readonly IRedisService _redis;
    private readonly ILogger<KafkaConsumerService> _logger;
    private readonly IConfiguration _config;

    private static readonly string[] Topics = new[]
    {
        "order.created", "order.confirmed", "order.cancelled",
        "payment.failed", "delivery.assigned"
    };

    public KafkaConsumerService(IRedisService redis, ILogger<KafkaConsumerService> logger, IConfiguration config)
    {
        _redis = redis;
        _logger = logger;
        _config = config;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var conf = new ConsumerConfig
        {
            BootstrapServers = _config["Kafka:BootstrapServers"] ?? "localhost:9092",
            GroupId = "cart-notification-service",
            AutoOffsetReset = AutoOffsetReset.Earliest,
            EnableAutoCommit = false
        };

        using var consumer = new ConsumerBuilder<string, string>(conf).Build();
        consumer.Subscribe(Topics);
        _logger.LogInformation("Kafka consumer subscribed to topics: {Topics}", string.Join(", ", Topics));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var result = consumer.Consume(TimeSpan.FromMilliseconds(200));
                if (result is null)
                {
                    await Task.Yield();
                    continue;
                }

                var topic = result.Topic;
                var value = result.Message.Value;
                var eventId = $"{topic}-{result.Partition.Value}-{result.Offset.Value}";

                // Idempotency check
                if (await _redis.IsEventProcessedAsync(eventId))
                {
                    _logger.LogDebug("Duplicate Kafka event skipped: {EventId}", eventId);
                    consumer.Commit(result);
                    continue;
                }

                _logger.LogInformation("Kafka event received: topic={Topic} eventId={EventId}", topic, eventId);

                await (topic switch
                {
                    "order.created"    => HandleOrderCreated(value),
                    "order.confirmed"  => HandleOrderConfirmed(value),
                    "order.cancelled"  => HandleOrderCancelled(value),
                    "payment.failed"   => HandlePaymentFailed(value),
                    "delivery.assigned" => HandleDeliveryAssigned(value),
                    _ => Task.CompletedTask
                });

                await _redis.MarkEventProcessedAsync(eventId);
                consumer.Commit(result);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing Kafka message");
                await Task.Delay(1000, stoppingToken);
            }
        }

        consumer.Close();
    }

    private async Task HandleOrderCreated(string json)
    {
        var ev = JsonSerializer.Deserialize<OrderCreatedEvent>(json, JsonOpts.Default);
        if (ev is null) return;
        await _redis.UpdateOrderViewAsync(ev.OrderId, "PENDING");
    }

    private async Task HandleOrderConfirmed(string json)
    {
        var ev = JsonSerializer.Deserialize<OrderConfirmedEvent>(json, JsonOpts.Default);
        if (ev is null) return;
        await _redis.UpdateOrderViewAsync(ev.OrderId, "CONFIRMED");
    }

    private async Task HandleOrderCancelled(string json)
    {
        var ev = JsonSerializer.Deserialize<OrderCancelledEvent>(json, JsonOpts.Default);
        if (ev is null) return;
        await _redis.UpdateOrderViewAsync(ev.OrderId, "CANCELLED");
    }

    private async Task HandlePaymentFailed(string json)
    {
        var ev = JsonSerializer.Deserialize<PaymentFailedEvent>(json, JsonOpts.Default);
        if (ev is null) return;
        await _redis.UpdateOrderViewAsync(ev.OrderId, "PAYMENT_FAILED");
    }

    private async Task HandleDeliveryAssigned(string json)
    {
        var ev = JsonSerializer.Deserialize<DeliveryAssignedEvent>(json, JsonOpts.Default);
        if (ev is null) return;
        await _redis.UpdateOrderViewAsync(ev.OrderId, "DRIVER_ASSIGNED", ev.DriverName);
    }
}

internal static class JsonOpts
{
    public static readonly JsonSerializerOptions Default = new()
    {
        PropertyNameCaseInsensitive = true
    };
}
