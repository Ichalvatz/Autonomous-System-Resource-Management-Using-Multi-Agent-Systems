#!/bin/bash

set -e

echo "deployment starts..."

echo "Creation of cluster..."
kind delete cluster --name aiops-cluster || true
kind create cluster --config 1-infrastructure/kind-config.yaml --name aiops-cluster
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

kubectl rollout status deployment/ingress-nginx-controller -n ingress-nginx --timeout=90s

echo "Build κand load images..."
docker build -t aiops-backend:latest 2-target-app/software-backend/
docker build -t aiops-frontend:latest 2-target-app/software-frontend/
kind load docker-image aiops-backend:latest --name aiops-cluster
kind load docker-image aiops-frontend:latest --name aiops-cluster

echo "Installation of Prometheus Stack..."
kubectl create namespace monitoring
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --values 1-infrastructure/prometheus-values.yaml

echo "App Deployment..."
kubectl apply -f 2-target-app/backend-deployment.yaml
kubectl apply -f 2-target-app/frontend-deployment.yaml
kubectl apply -f 1-infrastructure/chromadb.yaml

# 5. Setup ServiceMonitor
echo "Enabling metrics..."
kubectl apply -f 1-infrastructure/backend-monitor.yaml
kubectl apply -f 1-infrastructure/ingress.yaml
kubectl apply -f 1-infrastructure/ingress-monitoring.yaml
echo "The environment is ready!"
