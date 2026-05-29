/**
 * Prometheus Metrics Middleware
 * Instruments HTTP requests with:
 * - http_requests_total (Counter): method, route, status_code
 * - http_request_duration_seconds (Histogram): method, route, status_code
 * 
 * Ignores /metrics and /health to prevent monitoring ping pollution
 */

import { register, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

// ============================================================================
// METRICS INITIALIZATION
// ============================================================================

// Collect default Node.js metrics (heap, CPU, event loop lag, etc.)
collectDefaultMetrics({ register });

// Add static label to all metrics
const defaultLabels = { app: 'aiops-backend' };
register.setDefaultLabels(defaultLabels);

// ============================================================================
// METRIC DEFINITIONS
// ============================================================================

// Counter: Track total HTTP requests
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

// Histogram: Track HTTP request duration in seconds
export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 1.5, 2, 5],
  registers: [register]
});

// ============================================================================
// MIDDLEWARE FUNCTION
// ============================================================================

/**
 * Express middleware to record HTTP metrics
 * Skips /metrics and /health endpoints to avoid polluting data with monitoring pings
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const metricsMiddleware = (req, res, next) => {
  // Skip monitoring endpoints
  if (req.path === '/metrics' || req.path === '/health') {
    return next();
  }

  // Record start time for histogram
  const startTime = Date.now();

  // Intercept response.end() to capture status code
  const originalEnd = res.end;
  res.end = function(...args) {
    // Calculate duration in seconds
    const duration = (Date.now() - startTime) / 1000;

    // Extract route (normalized path without IDs)
    const route = req.route?.path || req.path;

    // Record metrics
    httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: res.statusCode
    });

    httpRequestDurationSeconds.observe(
      {
        method: req.method,
        route,
        status_code: res.statusCode
      },
      duration
    );

    // Call original end
    originalEnd.apply(res, args);
  };

  next();
};

// ============================================================================
// METRICS ENDPOINT
// ============================================================================

/**
 * Route handler for GET /metrics
 * Returns Prometheus metrics in text format
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const metricsHandler = async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
};

export default metricsMiddleware;
