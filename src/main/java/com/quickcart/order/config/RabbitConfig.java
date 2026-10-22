package com.quickcart.order.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Map;

@Configuration
public class RabbitConfig {
    @Bean
    DirectExchange notificationExchange(@Value("${quickcart.rabbit.exchange}") String exchange) {
        return new DirectExchange(exchange, true, false);
    }

    @Bean
    Queue notificationQueue(@Value("${quickcart.rabbit.queue}") String queue,
                            @Value("${quickcart.rabbit.dlq}") String dlq) {
        return new Queue(queue, true, false, false, Map.of("x-dead-letter-routing-key", dlq, "x-dead-letter-exchange", ""));
    }

    @Bean
    Queue notificationDlq(@Value("${quickcart.rabbit.dlq}") String dlq) {
        return new Queue(dlq, true);
    }

    @Bean
    Binding notificationBinding(Queue notificationQueue, DirectExchange notificationExchange,
                                @Value("${quickcart.rabbit.routing-key}") String routingKey) {
        return BindingBuilder.bind(notificationQueue).to(notificationExchange).with(routingKey);
    }

    @Bean
    Jackson2JsonMessageConverter jackson2JsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    @Bean
    RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory, Jackson2JsonMessageConverter converter) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(converter);
        return template;
    }

    @Bean
    SimpleRabbitListenerContainerFactory rabbitListenerContainerFactory(
            ConnectionFactory connectionFactory,
            Jackson2JsonMessageConverter converter) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setMessageConverter(converter);
        return factory;
    }
}
