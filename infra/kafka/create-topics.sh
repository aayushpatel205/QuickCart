#!/usr/bin/env sh
set -eu

BOOTSTRAP="${KAFKA_BOOTSTRAP_SERVERS:-localhost:9092}"
TOPICS="order.created payment.completed payment.failed order.confirmed order.cancelled delivery.assigned"

for topic in $TOPICS; do
  kafka-topics.sh --bootstrap-server "$BOOTSTRAP" --create --if-not-exists \
    --topic "$topic" --partitions 1 --replication-factor 1
done
