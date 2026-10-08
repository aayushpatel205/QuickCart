using CartNotificationService.Models;
using CartNotificationService.Services;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using System.Text;
using System.Text.Json;

namespace CartNotificationService.Consumers;

/// <summary>
/// RabbitMQ consumer hosted service.
/// Consumes: notification.queue (exchange: quickcart.notifications, type: direct)
/// Dead-letter queue: notification.dlq (after 3 failed attempts)
/// On success: stores notification in Redis and prints simulated email/SMS log.
/// </summary>
public class RabbitMqConsumerService : BackgroundService
{
    private readonly INotificationService _notifications;
    private readonly IRedisService _redis;
    private readonly ILogger<RabbitMqConsumerService> _logger;
    private readonly IConfiguration _config;

    private const string Exchange = "quickcart.notifications";
    private const string Queue = "notification.queue";
    private const string DlxExchange = "quickcart.notifications.dlx";
    private const string DlqQueue = "notification.dlq";
    private const string RoutingKey = "notification";
    private const int MaxRetries = 3;

    public RabbitMqConsumerService(
        INotificationService notifications, IRedisService redis,
        ILogger<RabbitMqConsumerService> logger, IConfiguration config)
    {
        _notifications = notifications;
        _redis = redis;
        _logger = logger;
        _config = config;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Wait a bit for RabbitMQ to be ready (startup race)
        await Task.Delay(5000, stoppingToken);

        var factory = new ConnectionFactory
        {
            HostName = _config["RabbitMQ:Host"] ?? "localhost",
            Port = int.Parse(_config["RabbitMQ:Port"] ?? "5672"),
            UserName = _config["RabbitMQ:Username"] ?? "guest",
            Password = _config["RabbitMQ:Password"] ?? "guest"
        };

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var connection = await factory.CreateConnectionAsync(stoppingToken);
                using var channel = await connection.CreateChannelAsync(cancellationToken: stoppingToken);

                // ── Declare DLX + DLQ ────────────────────────────────────────
                await channel.ExchangeDeclareAsync(DlxExchange, ExchangeType.Direct, durable: true, cancellationToken: stoppingToken);
                await channel.QueueDeclareAsync(DlqQueue, durable: true, exclusive: false, autoDelete: false, cancellationToken: stoppingToken);
                await channel.QueueBindAsync(DlqQueue, DlxExchange, RoutingKey, cancellationToken: stoppingToken);

                // ── Declare main exchange + queue ────────────────────────────
                await channel.ExchangeDeclareAsync(Exchange, ExchangeType.Direct, durable: true, cancellationToken: stoppingToken);
                var queueArgs = new Dictionary<string, object?>
                {
                    ["x-dead-letter-exchange"] = DlxExchange,
                    ["x-dead-letter-routing-key"] = RoutingKey
                };
                await channel.QueueDeclareAsync(Queue, durable: true, exclusive: false, autoDelete: false, arguments: queueArgs, cancellationToken: stoppingToken);
                await channel.QueueBindAsync(Queue, Exchange, RoutingKey, cancellationToken: stoppingToken);

                await channel.BasicQosAsync(0, 1, false, stoppingToken);

                _logger.LogInformation("RabbitMQ consumer connected to queue {Queue}", Queue);

                var consumer = new AsyncEventingBasicConsumer(channel);
                consumer.ReceivedAsync += async (_, ea) =>
                {
                    var body = Encoding.UTF8.GetString(ea.Body.ToArray());
                    var retryCount = GetRetryCount(ea.BasicProperties);

                    try
                    {
                        var msg = JsonSerializer.Deserialize<NotificationMessage>(body, JsonOpts.Default);
                        if (msg is null) throw new InvalidOperationException("Could not deserialize message");

                        // Idempotency
                        var eventId = $"rmq-{ea.DeliveryTag}";
                        if (await _redis.IsEventProcessedAsync(eventId))
                        {
                            _logger.LogDebug("Duplicate RMQ message skipped: {EventId}", eventId);
                            await channel.BasicAckAsync(ea.DeliveryTag, false);
                            return;
                        }

                        await _notifications.StoreNotificationAsync(msg);
                        await _redis.MarkEventProcessedAsync(eventId);

                        // Simulate email/SMS
                        _logger.LogInformation("[EMAIL] To user {UserId}: [{Type}] {Msg} (orderId={OrderId})",
                            msg.UserId, msg.Type, msg.Message, msg.OrderId);
                        _logger.LogInformation("[SMS]   To user {UserId}: [{Type}] {Msg} (orderId={OrderId})",
                            msg.UserId, msg.Type, msg.Message, msg.OrderId);

                        await channel.BasicAckAsync(ea.DeliveryTag, false);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error processing RabbitMQ message (retry {Retry}/{Max})", retryCount, MaxRetries);

                        if (retryCount >= MaxRetries)
                        {
                            // Reject to DLQ
                            _logger.LogWarning("Message sent to DLQ after {Max} retries", MaxRetries);
                            await channel.BasicRejectAsync(ea.DeliveryTag, requeue: false);
                        }
                        else
                        {
                            // Requeue for retry
                            await channel.BasicNackAsync(ea.DeliveryTag, multiple: false, requeue: true);
                        }
                    }
                };

                await channel.BasicConsumeAsync(Queue, autoAck: false, consumer: consumer, cancellationToken: stoppingToken);

                // Keep alive until cancellation
                await Task.Delay(Timeout.Infinite, stoppingToken);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "RabbitMQ connection error. Reconnecting in 5s...");
                await Task.Delay(5000, stoppingToken);
            }
        }
    }

    private static int GetRetryCount(IReadOnlyBasicProperties props)
    {
        if (props.Headers != null &&
            props.Headers.TryGetValue("x-death", out var death) &&
            death is List<object> list && list.Count > 0)
        {
            return (int)(long)((IDictionary<string, object>)list[0])["count"];
        }
        return 0;
    }
}
