/**
 * myWorld Travel API - Server Entry Point
 * Software Engineering II Project
 *
 * Main server file that starts the HTTP server and manages database connections.
 * Responsibilities:
 * - Load environment variables
 * - Connect to MongoDB (if enabled)
 * - Start the HTTP server
 * - Handle graceful shutdown
 */

import 'dotenv/config';
import app from './app.js';

// Toggle for whether to use a real MongoDB connection or an in-memory fallback
const useMongoDB = process.env.USE_MONGODB === 'true';
const isProduction = process.env.NODE_ENV === 'production';

// Ensure a default JWT secret is available when not provided via .env
const DEFAULT_JWT_SECRET = 'myworld_secret_key_2025_change_in_production';
if (!process.env.JWT_SECRET) {
  if (isProduction) {
    console.error('\n❌ FATAL: JWT_SECRET must be set in production environment\n');
    process.exit(1);
  }
  process.env.JWT_SECRET = DEFAULT_JWT_SECRET;
  console.warn('\n⚠️  JWT_SECRET not set in environment; using default secret.');
  console.warn('  Change this value in production by setting JWT_SECRET in .env\n');
}

// Database connection module (only loaded if using MongoDB)
let database;

// HTTP server instance
let server;

const PORT = Number(process.env.PORT) || 3001;

/**
 * Initializes the optional MongoDB connection (when USE_MONGODB=true)
 * and starts the HTTP server. Logs startup information and exits the process
 * with code 1 if any fatal error occurs during initialization.
 */
const startServer = async () => {
  try {
    if (useMongoDB) {
      console.log('\nMongoDB is enabled. Connecting...');
      const mod = await import('./config/database.js');
      database = mod.default ?? mod;
      await database.connectDB();
      console.log('✓ MongoDB connection successful\n');
    } else {
      console.log('\n⚠️  Using in-memory database (MongoDB disabled)\n');
    }

    // Start listening for incoming requests
    server = app.listen(PORT, () => {
      console.log('╔═══════════════════════════════════════════════════════════╗');
      console.log('║                                                           ║');
      console.log('║         🌍  myWorld Travel API Server Started             ║');
      console.log('║                                                           ║');
      console.log('╚═══════════════════════════════════════════════════════════╝');
      console.log(`\n🚀 Server running on: http://localhost:${PORT}`);
      console.log(`📊 Database: ${useMongoDB ? 'MongoDB Atlas' : 'In-Memory'}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
      console.log('\n✨ Ready to accept requests!\n');
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('\n✗ Failed to start server:', msg);
    if (!isProduction) {
      console.error(error);
    }
    console.error('\nTips:');
    console.error('  1. Check your MONGODB_URI in .env file');
    console.error('  2. Make sure MongoDB Atlas allows your IP address');
    console.error('  3. Verify username and password are correct');
    console.error('  4. Set USE_MONGODB=false to use in-memory database\n');
    process.exit(1);
  }
};

/**
 * Gracefully shutdown the HTTP server and database connections
 */
const shutdown = async (exitCode = 0) => {
  console.log('\n\n🛑 Shutting down server...');
  try {
    if (server && server.listening) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      console.log('✓ HTTP server closed');
    } else if (server) {
      console.log('ℹ️  HTTP server already closed');
    }

    if (useMongoDB && database) {
      await database.disconnectDB();
      console.log('✓ MongoDB connection closed');
    }

    console.log('✓ Server stopped gracefully\n');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error during shutdown:', msg);
    if (!isProduction) {
      console.error(error);
    }
    exitCode = exitCode || 1;
  } finally {
    process.exit(exitCode);
  }
};

// Graceful shutdown handlers
process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

// Handle unexpected errors at the process level
const handleFatalError = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('\n❌ Unhandled error:', message);

  if (!isProduction) {
    console.error(error);
  }

  void shutdown(1);
};

process.on('unhandledRejection', handleFatalError);
process.on('uncaughtException', handleFatalError);

// Start the server
startServer();

export default app;
export { startServer, shutdown };
