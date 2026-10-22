package com.quickcart.order.config;

import com.quickcart.restaurant.grpc.MenuServiceGrpc;
import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class GrpcClientConfig {
    @Bean
    ManagedChannel restaurantChannel(
            @Value("${grpc.restaurant.host}") String host,
            @Value("${grpc.restaurant.port}") int port) {
        return ManagedChannelBuilder.forAddress(host, port)
                .usePlaintext()
                .build();
    }

    @Bean
    MenuServiceGrpc.MenuServiceBlockingStub menuServiceBlockingStub(ManagedChannel restaurantChannel) {
        return MenuServiceGrpc.newBlockingStub(restaurantChannel);
    }
}
