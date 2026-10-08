using CartNotificationService.Consumers;
using CartNotificationService.Services;
using Prometheus;
using Serilog;
using Serilog.Formatting.Compact;
using StackExchange.Redis;
using CartNotificationService;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console(new CompactJsonFormatter())
    .Enrich.FromLogContext()
    .CreateBootstrapLogger();

var builder = WebApplication.CreateBuilder(args);

// ── Serilog ──────────────────────────────────────────────────────────────────
builder.Host.UseSerilog((ctx, lc) =>
    lc.WriteTo.Console(new CompactJsonFormatter())
      .Enrich.FromLogContext()
      .ReadFrom.Configuration(ctx.Configuration));

// ── Redis ────────────────────────────────────────────────────────────────────
// abortConnect=false prevents crash if Redis isn't immediately available at startup
var redisConn = (builder.Configuration["Redis:ConnectionString"] ?? "localhost:6379")
    + ",abortConnect=false";
var redis = ConnectionMultiplexer.Connect(redisConn);
builder.Services.AddSingleton<IConnectionMultiplexer>(redis);
builder.Services.AddSingleton<IRedisService, RedisService>();

// ── HTTP Client for Order Service (with Polly) ───────────────────────────────
builder.Services.AddHttpClient<IOrderServiceClient, OrderServiceClient>(c =>
{
    c.BaseAddress = new Uri(builder.Configuration["OrderService:BaseUrl"] ?? "http://order-service:8081");
    c.Timeout = TimeSpan.FromSeconds(10);
})
.AddPolicyHandler(PollyPolicies.GetRetryPolicy())
.AddPolicyHandler(PollyPolicies.GetCircuitBreakerPolicy());

// ── Services ─────────────────────────────────────────────────────────────────
builder.Services.AddSingleton<ICartService, CartService>();
builder.Services.AddSingleton<INotificationService, NotificationService>();
builder.Services.AddSingleton<ITrackingService, TrackingService>();

// ── Kafka consumers (hosted services) ────────────────────────────────────────
builder.Services.AddHostedService<KafkaConsumerService>();

// ── RabbitMQ consumer (hosted service) ───────────────────────────────────────
builder.Services.AddHostedService<RabbitMqConsumerService>();

// ── Health checks ────────────────────────────────────────────────────────────
builder.Services.AddHealthChecks()
    .AddRedis(redisConn, name: "redis");

// ── Swagger ──────────────────────────────────────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// ── Middleware ────────────────────────────────────────────────────────────────
app.UseMiddleware<CorrelationIdMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// ── Endpoints ────────────────────────────────────────────────────────────────
app.MapControllers();
app.MapHealthChecks("/health");
app.MapMetrics("/metrics");   // Prometheus

app.Run();
