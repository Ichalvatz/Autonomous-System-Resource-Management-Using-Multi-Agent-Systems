/**
 * Request Logger Middleware
 * Logs all incoming HTTP requests with timing information
 */

/**
 * Lightweight request logger for development and observability
 * Format: [ISO_TIMESTAMP] METHOD PATH - STATUS_CODE (DURATION)
 */
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log response when it finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    const timestamp = new Date().toISOString();
    const method = req.method;
    const path = req.path;
    const statusCode = res.statusCode;
    
    // Color code based on status
    let statusColor = '\x1b[32m'; // Green for 2xx
    if (statusCode >= 400 && statusCode < 500) {
      statusColor = '\x1b[33m'; // Yellow for 4xx
    } else if (statusCode >= 500) {
      statusColor = '\x1b[31m'; // Red for 5xx
    }
    
    console.log(
      `[${timestamp}] ${method} ${path} - ${statusColor}${statusCode}\x1b[0m (${duration}ms)`
    );
  });
  
  next();
};

/**
 * Detailed request logger (optional)
 * Logs additional information like headers, body, query params
 */
export const detailedLogger = (req, res, next) => {
  const start = Date.now();
  
  console.log('\n--- Incoming Request ---');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Method: ${req.method}`);
  console.log(`Path: ${req.path}`);
  console.log(`Query:`, req.query);
  console.log(`Body:`, req.body);
  console.log(`Headers:`, req.headers);
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log('\n--- Response ---');
    console.log(`Status: ${res.statusCode}`);
    console.log(`Duration: ${duration}ms`);
    console.log('--- End ---\n');
  });
  
  next();
};

export default requestLogger;
