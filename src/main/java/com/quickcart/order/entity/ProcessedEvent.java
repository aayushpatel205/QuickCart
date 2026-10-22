package com.quickcart.order.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;

@Entity
@Table(name = "processed_events")
public class ProcessedEvent {
    @Id
    @Column(name = "event_id")
    private String eventId;
    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public ProcessedEvent() {
    }

    public ProcessedEvent(String eventId, OffsetDateTime createdAt) {
        this.eventId = eventId;
        this.createdAt = createdAt;
    }

    public String getEventId() { return eventId; }
    public void setEventId(String eventId) { this.eventId = eventId; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
}
