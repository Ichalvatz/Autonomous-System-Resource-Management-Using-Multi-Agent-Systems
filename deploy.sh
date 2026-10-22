#!/bin/bash

set -e

echo "deployment starts..."

echo "Creation of cluster..."
kind delete cluster --name aiops-cluster || true
kind create cluster --config 1-infrastructure/kind-config.yaml --name aiops-cluster
# Pinned (2026-10-22; before, the manifest came from the main branch, so a fresh cluster could get another version).
INGRESS_NGINX=controller-v1.15.1
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/${INGRESS_NGINX}/deploy/static/provider/kind/deploy.yaml
# Metrics for the detector and the evaluation (1-infrastructure/ingress-metrics.yaml), with the backend's histogram
# buckets (middleware/metrics.js): the default buckets (0.25, 0.5, ...) would put the 0.35 s SLO inside one bucket.
INGRESS_TIME_BUCKETS=0.025,0.05,0.075,0.1,0.125,0.15,0.2,0.25,0.3,0.35,0.4,0.5,0.75,1,1.5,2,3,5,10
kubectl -n ingress-nginx patch deployment ingress-nginx-controller --type=json -p "[
  {\"op\":\"add\",\"path\":\"/spec/template/spec/containers/0/args/-\",\"value\":\"--enable-metrics=true\"},
  {\"op\":\"add\",\"path\":\"/spec/template/spec/containers/0/args/-\",\"value\":\"--time-buckets=${INGRESS_TIME_BUCKETS}\"}]"

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

# metrics-server: only needed for the HPA baseline (4-load-testing/baselines/hpa.yaml).
# kind's kubelets use self-signed certs, hence --kubelet-insecure-tls.
echo "Installation of metrics-server (HPA baseline)..."
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
helm install metrics-server metrics-server/metrics-server -n kube-system \
  --set 'args={--kubelet-insecure-tls}'

echo "App Deployment..."
kubectl apply -f 2-target-app/backend-deployment.yaml
kubectl apply -f 2-target-app/frontend-deployment.yaml
kubectl apply -f 1-infrastructure/chromadb.yaml

# 5. Setup ServiceMonitor
echo "Enabling metrics..."
kubectl apply -f 1-infrastructure/backend-monitor.yaml
kubectl apply -f 1-infrastructure/ingress-metrics.yaml
kubectl apply -f 1-infrastructure/ingress.yaml
kubectl apply -f 1-infrastructure/ingress-monitoring.yaml
echo "The environment is ready!"
