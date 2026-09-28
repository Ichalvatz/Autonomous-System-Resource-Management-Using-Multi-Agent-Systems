/**
 * Structured Logger Middleware
 * Designed for AIOps observability and LLM parsing
 *
 * Features:
 * - Request start/end timing (ms)
 * - Slow request detection (>500ms threshold)
 * - LLM-friendly format with [INFO], [WARN], [ERROR] tags
 * - Request ID tracing
 * - Performance metrics for anomaly detection
 *
 * @module middleware/structuredLogger
 */

const SLOW_REQUEST_THRESHOLD_MS = parseInt(process.env.SLOW_REQUEST_THRESHOLD_MS || '500');

/**
 * Generates a structured log entry
 * Format: [TIMESTAMP] [LEVEL] [REQUEST_ID] [ENDPOINT] MESSAGE
 */
const createLogEntry = (timestamp, level, requestId, endpoint, message, additionalData = {}) => {
  const baseEntry = {
    timestamp,
    level,
    requestId,
    endpoint,
    message
  };

  return Object.keys(additionalData).length > 0
    ? { ...baseEntry, ...additionalData }
    : baseEntry;
};

/**
 * Formats log entry for console output (human and LLM readable)
 */
const formatLogLine = (entry) => {
  const { timestamp, level, requestId, endpoint, message, duration, statusCode, error } = entry;
  
  let logLine = `[${timestamp}] [${level}] [${requestId}] ${endpoint} - ${message}`;
  
  if (duration !== undefined) logLine += ` | Duration: ${duration}ms`;
  if (statusCode !== undefined) logLine += ` | Status: ${statusCode}`;
  if (error !== undefined) logLine += ` | Error: ${error}`;
  
  return logLine;
};

/**
 * Main structured logger middleware
 * Logs all incoming requests with timing and detection of slow requests
 */
export const structuredLogger = (req, res, next) => {
  const startTime = Date.now();
  const requestId = req.id || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const timestamp = new Date().toISOString();
  const endpoint = `${req.method} ${req.path}`;

  // Store request metadata on the request object for later use
  req.startTime = startTime;
  req.requestId = requestId;
  req.timestamp = timestamp;

  // Log request start
  const startEntry = createLogEntry(timestamp, 'INFO', requestId, endpoint, 'Request started', {
    method: req.method,
    path: req.path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    userAgent: req.get('user-agent')
  });
  console.log(formatLogLine(startEntry));

  // Capture original res.end to log after response is sent
  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const responseTimestamp = new Date().toISOString();

    // Determine log level based on status code and duration
    let level = 'INFO';
    let message = 'Request completed';

    if (statusCode >= 500) {
      level = 'ERROR';
      message = `Server error (5xx): ${statusCode}`;
    } else if (statusCode >= 400) {
      level = 'WARN';
      message = `Client error (4xx): ${statusCode}`;
    } else if (duration > SLOW_REQUEST_THRESHOLD_MS) {
      level = 'WARN';
      message = `High latency detected: Request queued or CPU throttled`;
    }

    const endEntry = createLogEntry(responseTimestamp, level, requestId, endpoint, message, {
      statusCode,
      duration,
      threshold: SLOW_REQUEST_THRESHOLD_MS,
      isSlowRequest: duration > SLOW_REQUEST_THRESHOLD_MS
    });

    console.log(formatLogLine(endEntry));

    // Call original res.end
    originalEnd.apply(res, args);
  };

  next();
};

/**
 * Enhanced error logging middleware
 * Logs unhandled errors with full stack traces for debugging
 */
export const errorLogger = (err, req, res, next) => {
  const timestamp = new Date().toISOString();
  const requestId = req.requestId || `req-${Date.now()}`;
  const endpoint = `${req.method} ${req.path}`;

  const errorEntry = createLogEntry(timestamp, 'ERROR', requestId, endpoint, 'Unhandled exception', {
    errorName: err.name,
    errorMessage: err.message,
    statusCode: err.statusCode || 500,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method
  });

  console.log(formatLogLine(errorEntry));
  if (err.stack) {
    console.log(`[STACK_TRACE]\n${err.stack}`);
  }

  // Continue to next error handler
  next(err);
};

/**
 * Performance monitoring middleware
 * Tracks and logs performance metrics for AIOps analysis
 */
export const performanceMonitor = (req, res, next) => {
  // Attach timing method for endpoint-specific tracking
  req.logTiming = (label, duration) => {
    const timestamp = new Date().toISOString();
    const requestId = req.requestId;
    const endpoint = `${req.method} ${req.path}`;

    const timingEntry = createLogEntry(timestamp, 'INFO', requestId, endpoint, `Timing checkpoint: ${label}`, {
      label,
      duration
    });

    console.log(formatLogLine(timingEntry));
  };

  next();
};

/**
 * Request body logger (optional - for debugging)
 * Logs request body for complex POST/PUT operations
 */
export const requestBodyLogger = (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && Object.keys(req.body).length > 0) {
    const timestamp = new Date().toISOString();
    const requestId = req.requestId;
    const endpoint = `${req.method} ${req.path}`;

    const bodyEntry = createLogEntry(timestamp, 'INFO', requestId, endpoint, 'Request body', {
      bodyKeys: Object.keys(req.body),
      bodySize: JSON.stringify(req.body).length
    });

    console.log(formatLogLine(bodyEntry));
  }

  next();
};

/**
 * Logs slow database/async operations within endpoint handlers
 * Usage: call req.logAsyncOperation(label, duration, details)
 */
export const setupAsyncOperationLogger = (req, res, next) => {
  req.logAsyncOperation = (label, duration, details = {}) => {
    const timestamp = new Date().toISOString();
    const requestId = req.requestId;
    const endpoint = `${req.method} ${req.path}`;

    const level = duration > SLOW_REQUEST_THRESHOLD_MS ? 'WARN' : 'INFO';
    const message = duration > SLOW_REQUEST_THRESHOLD_MS
      ? `[SLOW] Async operation exceeded threshold: ${label}`
      : `Async operation completed: ${label}`;

    const asyncEntry = createLogEntry(timestamp, level, requestId, endpoint, message, {
      operationLabel: label,
      duration,
      threshold: SLOW_REQUEST_THRESHOLD_MS,
      exceededThreshold: duration > SLOW_REQUEST_THRESHOLD_MS,
      ...details
    });

    console.log(formatLogLine(asyncEntry));
  };

  next();
};

export default structuredLogger;
