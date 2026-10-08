using Polly;
using Polly.Extensions.Http;
using Serilog;

namespace CartNotificationService;

/// <summary>
/// Polly policies used by the HttpClient calling order-service.
/// - Retry: 3 attempts with exponential back-off (2s, 4s, 8s)
/// - Circuit Breaker: opens after 5 consecutive failures for 30 s
/// </summary>
public static class PollyPolicies
{
    public static IAsyncPolicy<HttpResponseMessage> GetRetryPolicy() =>
        HttpPolicyExtensions
            .HandleTransientHttpError()
            .WaitAndRetryAsync(
                retryCount: 3,
                sleepDurationProvider: attempt => TimeSpan.FromSeconds(Math.Pow(2, attempt)),
                onRetry: (outcome, timespan, attempt, _) =>
                    Log.Warning("Retry {Attempt} after {Delay}s due to {Reason}",
                        attempt, timespan.TotalSeconds, outcome.Exception?.Message ?? outcome.Result?.StatusCode.ToString()));

    public static IAsyncPolicy<HttpResponseMessage> GetCircuitBreakerPolicy() =>
        HttpPolicyExtensions
            .HandleTransientHttpError()
            .CircuitBreakerAsync(
                handledEventsAllowedBeforeBreaking: 5,
                durationOfBreak: TimeSpan.FromSeconds(30),
                onBreak: (_, duration) =>
                    Log.Warning("Circuit breaker opened for {Duration}s", duration.TotalSeconds),
                onReset: () =>
                    Log.Information("Circuit breaker reset"));
}
