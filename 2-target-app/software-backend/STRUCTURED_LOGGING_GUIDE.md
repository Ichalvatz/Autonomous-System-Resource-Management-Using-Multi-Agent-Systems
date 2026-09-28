# Structured Logging Integration Guide
## For AIOps Agent Observability & LLM Parsing

---

## Overview

Your backend now includes **production-grade structured logging** designed specifically for:
- **Autonomous AIOps agents** to diagnose system health
- **LLM parsing** of logs with consistent, machine-readable format
- **Request timing** and performance tracking
- **Slow request detection** with configurable thresholds
- **Error tracing** with full stack traces

---

## What Was Updated

### 1. New Structured Logger Middleware
**File:** `middleware/structuredLogger.js`

Features:
- `structuredLogger` - Main request logger with timing
- `errorLogger` - Explicit error logging with stack traces
- `performanceMonitor` - Adds timing utilities to requests
- `setupAsyncOperationLogger` - Logs async operations within handlers

### 2. Updated Application
**File:** `app.js`

The middleware stack now includes:
```javascript
app.use(structuredLogger);           // Request start/end timing
app.use(performanceMonitor);         // Performance tracking utilities
app.use(setupAsyncOperationLogger);  // Async operation logging
// ... routes ...
app.use(errorLogger);                // Error logging (before handler)
app.use(errorHandler);               // Error handler
```

### 3. Enhanced Controller Example
**File:** `controllers/placeController.enhanced.js`

Shows how to:
- Use `req.logAsyncOperation()` for database queries
- Log operation timing
- Add contextual metadata
- Handle errors with explicit messages

---

## Configuration

### Set Slow Request Threshold

By default, requests taking >**500ms** are flagged as `[WARN]`.

To customize, set the environment variable:

```bash
# In your .env file or deployment manifest
SLOW_REQUEST_THRESHOLD_MS=1000
```

Or for Kubernetes deployment, add to `backend-deployment.yaml`:

```yaml
env:
  - name: SLOW_REQUEST_THRESHOLD_MS
    value: "500"
  - name: NODE_ENV
    value: "production"
```

---

## Log Format Reference

### Request Start Log

```
[2026-07-27T14:30:45.123Z] [INFO] [req-1690000000-a1b2c3d4] GET /places/search - Request started | Duration: 0ms | Status: undefined
```

**Parser Fields:**
- `timestamp`: ISO 8601 datetime
- `level`: INFO / WARN / ERROR
- `requestId`: Unique request identifier
- `endpoint`: HTTP method + path
- `message`: Human-readable action
- `duration`: Processing time (ms)
- `statusCode`: HTTP response code

### Normal Request Completion

```
[2026-07-27T14:30:45.567Z] [INFO] [req-1690000000-a1b2c3d4] GET /places/search - Request completed | Duration: 444ms | Status: 200
```

### Slow Request Warning (>500ms)

```
[2026-07-27T14:30:46.100Z] [WARN] [req-1690000000-a1b2c3d4] GET /places/search - High latency detected: Request queued or CPU throttled | Duration: 577ms | Status: 200 | threshold: 500 | isSlowRequest: true
```

**LLM-Friendly Elements:**
- Clear `[WARN]` tag for easy parsing
- Explicit threshold information
- Boolean flag `isSlowRequest`
- Contextual message

### Async Operation Timing

From your controller:

```
[2026-07-27T14:30:45.234Z] [INFO] [req-1690000000-a1b2c3d4] GET /places/search - Async operation completed: searchPlaces | operationLabel: searchPlaces | duration: 142ms | threshold: 500 | exceededThreshold: false | keywords: ["Rome", "museums"] | resultCount: 8
```

### Slow Async Operation Warning

```
[2026-07-27T14:30:45.600Z] [WARN] [req-1690000000-a1b2c3d4] GET /places/search - [SLOW] Async operation exceeded threshold: enrichPlacesWithDetails | operationLabel: enrichPlacesWithDetails | duration: 520ms | threshold: 500 | exceededThreshold: true | resultCount: 8 | avgTimePerResult: 65.00
```

### Error Log

```
[2026-07-27T14:30:45.800Z] [ERROR] [req-1690000000-a1b2c3d4] GET /places/search - Unhandled exception | errorName: ValidationError | errorMessage: Invalid search query | statusCode: 400 | url: /places/search?keywords=test | method: GET
[STACK_TRACE]
ValidationError: Invalid search query
    at validateSearch (/app/controllers/placeController.js:42:15)
    at processRequest (/app/controllers/placeController.js:50:8)
    at async performSearch (/app/controllers/placeController.js:100:20)
```

---

## Using in Your Controllers

### Example 1: Simple Database Operation Timing

```javascript
const performSearch = async (req, res, next) => {
  try {
    // Start timing
    const searchStart = Date.now();
    const results = await db.searchPlaces(searchTerms);
    const searchDuration = Date.now() - searchStart;
    
    // Log the operation
    req.logAsyncOperation('searchPlaces', searchDuration, {
      keywords: searchTerms,
      resultCount: results.length
    });
    
    res.json({ results });
  } catch (error) {
    next(error);
  }
};
```

### Example 2: Multiple Async Operations

```javascript
const getPlace = async (req, res, next) => {
  try {
    const placeId = parseInt(req.params.placeId);
    
    // Operation 1: Fetch place
    const dbStart = Date.now();
    const place = await db.getPlace(placeId);
    req.logAsyncOperation('getPlace', Date.now() - dbStart, { placeId });
    
    // Operation 2: Fetch reviews
    const reviewStart = Date.now();
    const reviews = await db.getReviewsForPlace(placeId);
    req.logAsyncOperation('getReviewsForPlace', Date.now() - reviewStart, {
      placeId,
      reviewCount: reviews.length
    });
    
    res.json({ place, reviews });
  } catch (error) {
    next(error);
  }
};
```

---

## Parsing Logs with Your LLM Agent

### 1. Extract Metrics for Anomaly Detection

```python
# In your anomaly_detector.py or AI agent
def parse_backend_logs(log_lines):
    """Extract performance metrics from structured logs"""
    metrics = {
        'slow_requests': [],
        'errors': [],
        'avg_latency': [],
        'operations': []
    }
    
    for line in log_lines:
        if '[WARN]' in line and 'High latency' in line:
            # Extract slow request
            if 'Duration: ' in line:
                duration = extract_number(line, 'Duration: ', 'ms')
                metrics['slow_requests'].append(duration)
        
        elif '[ERROR]' in line:
            # Extract error details
            error_msg = extract_between(line, 'errorMessage: ', ' |')
            metrics['errors'].append(error_msg)
        
        elif 'Async operation' in line:
            # Extract operation timing
            label = extract_between(line, 'operationLabel: ', ' |')
            duration = extract_number(line, 'duration: ', ' ms')
            metrics['operations'].append({
                'label': label,
                'duration': duration
            })
    
    return metrics
```

### 2. Feed to Your Agent

```python
# In agent.py
from anomaly_detector import parse_backend_logs

def trigger_ai_agent(metrics_json, recent_logs):
    """Enhanced agent with structured logs"""
    log_analysis = parse_backend_logs(recent_logs)
    
    prompt = f"""
    [ALERT - AIOPS TRIGGER]
    Current Metrics (JSON): {metrics_json}
    
    Log Analysis:
    - Slow requests detected: {len(log_analysis['slow_requests'])}
    - Errors: {len(log_analysis['errors'])}
    - Slow operations: {[op for op in log_analysis['operations'] if op['duration'] > 500]}
    
    Execution Protocol:
    1. Analyze the correlation between metrics and logs
    2. Query knowledge base for similar incidents
    3. Determine root cause
    4. Execute remediation
    5. Save resolution to knowledge base
    """
    
    response = sre_agent.run(prompt)
    return response
```

---

## Deployment Configuration

### For Kubernetes (backend-deployment.yaml)

```yaml
spec:
  containers:
  - name: backend
    image: aiops-backend:latest
    env:
    - name: NODE_ENV
      value: "production"
    - name: SLOW_REQUEST_THRESHOLD_MS
      value: "500"
    - name: PORT
      value: "3001"
    # ... other env vars ...
    volumeMounts:
    - name: logs
      mountPath: /var/log/app
  volumes:
  - name: logs
    emptyDir: {}
```

### Collecting Logs in Kubernetes

```bash
# Stream logs from a running pod
kubectl logs -f pod/aiops-backend-deployment-xxx -c backend

# Get recent logs (last 100 lines)
kubectl logs pod/aiops-backend-deployment-xxx -c backend --tail=100

# Export logs for analysis
kubectl logs pod/aiops-backend-deployment-xxx -c backend > backend-logs.txt
```

### For Monitoring Stack (Prometheus)

The logs will appear in container stdout, which Kubernetes will capture. You can:

1. Stream to ELK Stack (Elasticsearch, Logstash, Kibana)
2. Send to Loki (Grafana's log aggregation)
3. Parse with your custom log shipper

Example Loki config:

```yaml
scrape_configs:
  - job_name: kubernetes-pods
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_name]
        action: keep
        regex: aiops-backend.*
```

---

## How to Integrate with Your Thesis

### 1. Update Your Controllers

Replace or update your existing controller files to use `req.logAsyncOperation()`:

```bash
# Copy the enhanced example
cp controllers/placeController.enhanced.js controllers/placeController.js
```

Or manually add timing to your existing controllers.

### 2. Configure Environment

Add to your `.env` or deployment manifest:

```bash
SLOW_REQUEST_THRESHOLD_MS=500
NODE_ENV=production
```

### 3. Test the Logging

Start your server and make a request:

```bash
npm start

# In another terminal
curl "http://localhost:3001/places/search?keywords=Rome"
```

Look for logs like:

```
[2026-07-27T14:30:45.123Z] [INFO] [req-1690000000-a1b2c3d4] GET /places/search - Request started
[2026-07-27T14:30:45.234Z] [INFO] [req-1690000000-a1b2c3d4] Performing search - Keywords: Rome
[2026-07-27T14:30:45.400Z] [INFO] [req-1690000000-a1b2c3d4] GET /places/search - Async operation completed: searchPlaces | duration: 166ms
[2026-07-27T14:30:45.567Z] [INFO] [req-1690000000-a1b2c3d4] GET /places/search - Request completed | Duration: 444ms | Status: 200
```

### 4. Feed Logs to Your Agent

In your monitoring script (`anomaly_detector.py`), read the logs and pass them to your agent:

```python
import subprocess

def fetch_recent_logs(pod_name, lines=50):
    """Get recent logs from Kubernetes pod"""
    cmd = f"kubectl logs {pod_name} --tail={lines} -c backend"
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.stdout.split('\n')

# In your monitor loop
logs = fetch_recent_logs('pod/aiops-backend-deployment-xxx')
trigger_ai_agent(metrics_json, logs)
```

---

## Advantages for Your Thesis

1. **Structured Format**: Easy for LLM to parse
2. **Consistent Tagging**: `[INFO]`, `[WARN]`, `[ERROR]` tags for classification
3. **Performance Tracking**: Precise timing for anomaly detection
4. **Observability**: Full context for diagnosis
5. **Reproducibility**: Standardized logging for experiments
6. **Scalability**: Works with Kubernetes log aggregation

---

## Troubleshooting

### Logs Not Appearing?

Check that middleware is registered in the correct order:

```javascript
// Should be early in the stack, AFTER parsing middleware
app.use(express.json());
app.use(structuredLogger);  // ← Should be here
```

### Threshold Not Working?

Verify environment variable:

```bash
echo $SLOW_REQUEST_THRESHOLD_MS
# Should print: 500 (or your configured value)
```

### Errors Not Logged?

Ensure `errorLogger` is BEFORE `errorHandler`:

```javascript
app.use(errorLogger);      // ← First
app.use(errorHandler);     // ← Second
```

---

## Next Steps for Your Thesis

1. **Baseline Collection**: Run your application under normal load and collect logs for 5-10 minutes
2. **Anomaly Injection**: Introduce artificial slowdowns and errors to test detection
3. **Agent Testing**: Feed logs to your AI agent and verify it generates appropriate responses
4. **Evaluation**: Measure:
   - Detection accuracy
   - False positives
   - Time to diagnosis
   - Remediation success rate

---

## Questions?

For issues or improvements, check:
- `middleware/structuredLogger.js` - Main implementation
- `app.js` - Integration point
- `controllers/placeController.enhanced.js` - Usage example
