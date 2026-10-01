/**
 * Express Application Configuration
 * Configures and exports the Express app instance
 */

// External dependencies (4 consolidated into 1)
import { express, cors, helmet, mongoose } from './dependencies.js';
// Middleware
import {
  errorHandler,
  requestLogger,
  requestId,
  metricsMiddleware,
  metricsHandler,
  structuredLogger,
  errorLogger,
  performanceMonitor,
  setupAsyncOperationLogger
} from './middleware/index.js';
// Configuration
import { setupSwagger, API_VERSION } from './config/index.js';
// Routes
import routes from './routes/index.js';



const app = express();

/**
 * CORS Configuration
 * Configure CORS via environment variable `CORS_ORIGIN` (comma-separated)
 * In production, CORS_ORIGIN must be explicitly set for security
 */
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  console.error('\n❌ FATAL: CORS_ORIGIN must be set in production environment\n');
  process.exit(1);
}

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',')
      : ['*'];

    if (allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
};

// Middleware
// Security headers with custom CSP for Swagger UI compatibility
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Required for Swagger UI
        styleSrc: ["'self'", "'unsafe-inline'"], // Required for Swagger UI
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  })
);
app.use(cors(corsOptions));
app.use(requestId); // Request ID for tracing
app.use(metricsMiddleware); // Prometheus metrics instrumentation
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Structured logging middleware stack (for AIOps observability)
app.use(structuredLogger); // Main structured logger with request timing
app.use(performanceMonitor); // Performance tracking utilities
app.use(setupAsyncOperationLogger); // Async operation logging capabilities

/**
 * Chaos: "stuck dependency" fault (thesis restart experiment, 4-load-testing/fault_experiment.sh).
 * POST /chaos/stuck puts THIS process in a state where every request first waits
 * STUCK_DELAY_MS for a database connection that never frees up, like a leaked
 * connection pool. It uses no CPU, so the pod looks idle while users wait.
 * Only a process restart clears it; new pods start healthy, so adding replicas
 * dilutes the problem but does not fix it.
 */
const STUCK_DELAY_MS = 3000;
let stuckSince = null;
app.post('/chaos/stuck', (_, res) => {
  if (process.env.CHAOS_ENABLED !== 'true') {
    return res.status(404).json({ error: 'CHAOS_DISABLED' });
  }
  stuckSince = stuckSince ?? new Date().toISOString();
  console.error(`[${new Date().toISOString()}] [ERROR] [chaos] - Database connection pool leak injected: every request will wait ${STUCK_DELAY_MS}ms`);
  res.status(200).json({ stuck: true, since: stuckSince, delayMs: STUCK_DELAY_MS });
});
app.use((req, res, next) => {
  if (!stuckSince || req.path === '/metrics' || req.path === '/health' || req.path.startsWith('/chaos')) {
    return next();
  }
  setTimeout(() => {
    console.error(
      `[${new Date().toISOString()}] [ERROR] [${req.id || '-'}] ${req.method} ${req.path} - ` +
      `DB connection pool exhausted: waited ${STUCK_DELAY_MS}ms for a free connection (0/10 idle since ${stuckSince})`
    );
    next();
  }, STUCK_DELAY_MS);
});

/**
 * Swagger API Documentation
 * Serves interactive API documentation at /api-docs
 */
setupSwagger(app);

/**
 * Prometheus Metrics Endpoint
 * Exposes metrics in Prometheus text format
 */
app.get('/metrics', metricsHandler);

/**
 * Root endpoint with minimal HATEOAS links
 * Provides a machine-readable entrypoint describing important routes
 */
app.get('/', (_, res) => {
  res.json({
    message: '🌍 Welcome to myWorld Travel API',
    version: API_VERSION,
    description: 'RESTful API with HATEOAS support for personalized travel experiences',
    documentation: '/api-docs',
    links: {
      'api-info': {
        href: '/',
        method: 'GET'
      },
      users: {
        href: '/users/{userId}/profile',
        method: 'GET',
        templated: true
      },
      places: {
        href: '/places/{placeId}',
        method: 'GET',
        templated: true
      },
      search: {
        href: '/places/search?keywords={keywords}',
        method: 'GET',
        templated: true
      },
      navigation: {
        href: '/navigation',
        method: 'GET'
      }
    }
  });
});

// Health check endpoint
app.get('/health', (_, res) => {
  // Determine database status
  let dbStatus = 'in-memory';
  if (process.env.USE_MONGODB === 'true') {
    const readyState = mongoose.connection.readyState;
    dbStatus = readyState === 1 ? 'connected' : readyState === 2 ? 'connecting' : 'disconnected';
  }

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatus,
    version: API_VERSION
  });
});

// Deliberately delays requests for chaos-engineering experiments.
app.get('/chaos/zombie', (_, res) => {
  if (process.env.CHAOS_ENABLED !== 'true') {
    return res.status(404).json({ error: 'CHAOS_DISABLED' });
  }

  console.warn('[CHAOS] Zombie mode: simulating a database deadlock');
  setTimeout(() => {
    res.status(200).json({ message: 'Recovered from zombie state' });
  }, 10000);
});

// Mount all API routes
app.use('/', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'ENDPOINT_NOT_FOUND',
    message: `Endpoint ${req.method} ${req.path} not found`,
    availableEndpoints: {
      users: '/users/{userId}/profile',
      places: '/places/{placeId}',
      search: '/places/search',
      navigation: '/navigation'
    }
  });
});

// Error handling middleware
// Log errors explicitly before handling them
app.use(errorLogger);
app.use(errorHandler);

export default app;
