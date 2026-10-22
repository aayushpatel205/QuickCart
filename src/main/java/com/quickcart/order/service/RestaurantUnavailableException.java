package com.quickcart.order.service;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
public class RestaurantUnavailableException extends RuntimeException {
    public RestaurantUnavailableException(String message) {
        super(message);
    }
}
