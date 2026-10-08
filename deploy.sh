#!/bin/bash
set -e

# ensure Minikube Ingress addon is enabled
minikube addons enable ingress

# 1. Create Namespace & Quota
kubectl apply -f k8s/namespace.yaml

# 2. Setup ConfigMaps & Secrets First
kubectl apply -f k8s/cart-notification/configmap.yaml
kubectl apply -f k8s/cart-notification/secret.yaml
kubectl apply -f k8s/rabbitmq-statefulset.yaml # Create rabbitmq-secret via this manifest

# 3. Create Network Policies
kubectl apply -f k8s/network-policies.yaml

# 4. Deploy Databases & Messaging
kubectl apply -f k8s/redis-statefulset.yaml
kubectl apply -f k8s/rabbitmq-statefulset.yaml

echo "Waiting for Redis to be ready..."
kubectl wait --for=condition=ready pod -l app=redis -n quickcart --timeout=120s

echo "Waiting for RabbitMQ to be ready..."
kubectl wait --for=condition=ready pod -l app=rabbitmq -n quickcart --timeout=120s

# 5. Deploy Services
kubectl apply -f k8s/cart-notification/deployment.yaml

echo "Waiting for Cart/Notification to be ready..."
kubectl wait --for=condition=ready pod -l app=cart-notification -n quickcart --timeout=120s

# 6. Apply HPA
kubectl apply -f k8s/hpa-order-service.yaml

# 7. Expose via Ingress
kubectl apply -f k8s/ingress.yaml

echo "Deployment complete!"
echo "Add '127.0.0.1 quickcart.local' to your /etc/hosts to route requests to the ingress."
