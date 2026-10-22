package com.quickcart.order.repository;

import com.quickcart.order.entity.OutboxEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface OutboxRepository extends JpaRepository<OutboxEvent, UUID> {
}
