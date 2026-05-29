/**
 * Express Application Configuration
 * Configures and exports the Express app instance
 */

// External dependencies (4 consolidated into 1)
import { express, cors, helmet, mongoose } from './dependencies.js';
// Middleware
import { errorHandler, requestLogger, requestId, metricsMiddleware, metricsHandler } from './middleware/index.js';
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
app.use(requestLogger);

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
app.use(errorHandler);

export default app;
