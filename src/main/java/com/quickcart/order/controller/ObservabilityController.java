package com.quickcart.order.controller;

import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import org.springframework.boot.actuate.health.HealthEndpoint;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ObservabilityController {
    private final HealthEndpoint healthEndpoint;
    private final PrometheusMeterRegistry prometheusMeterRegistry;

    public ObservabilityController(HealthEndpoint healthEndpoint, PrometheusMeterRegistry prometheusMeterRegistry) {
        this.healthEndpoint = healthEndpoint;
        this.prometheusMeterRegistry = prometheusMeterRegistry;
    }

    @GetMapping("/health")
    public Object health() {
        return healthEndpoint.health();
    }

    @GetMapping(value = "/metrics", produces = MediaType.TEXT_PLAIN_VALUE)
    public String metrics() {
        return prometheusMeterRegistry.scrape();
    }
}
