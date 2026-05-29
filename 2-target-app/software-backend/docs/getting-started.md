# Getting Started

This guide walks you through setting up and running the backend API on your local machine.

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** v18 or higher ([Download](https://nodejs.org/))
- **Bash terminal** (Git Bash on Windows, native terminal on Linux/macOS)
- **MongoDB** (optional, for production use) - See [Database Setup Guide](./database-guide.md)

---

## 🚀 Quick Start with `start.sh`

The `start.sh` script automatically handles dependency installation, environment setup, and server startup.

### 1. Clone the Repository

```bash
git clone https://github.com/fraidakis/software-engineering-2-backend.git
cd software-engineering-2-backend
```

### 2. Run the Start Script

Run the start script in a **Bash terminal**:

```bash
bash start.sh
```

The script will:
- ✅ Install dependencies (`npm install`)
- ✅ Create `.env` file from `.env.example` if it doesn't exist
- ✅ Start the server in development mode with auto-reload (nodemon) if `NODE_ENV=development`
- ✅ Start the server in production mode otherwise

### 3. Access the API

Once the server is running, you can access:

- **API Base URL**: `http://localhost:3001`
- **API Documentation**: `http://localhost:3001/api-docs`
- **Health Check**: `http://localhost:3001/health`

---

## 🔧 Manual Setup

If you prefer manual setup or need more control:

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Server Configuration
PORT=3001

# Security - IMPORTANT: Change in production!
JWT_SECRET=your_strong_secret_here_minimum_32_chars

# Environment
NODE_ENV=development

# Database Configuration
MONGODB_URI=mongodb+srv://username:password@host/database?retryWrites=true&w=majority
USE_MONGODB=false  # Set to true to use MongoDB, false for in-memory database

# CORS Configuration
CORS_ORIGIN=http://localhost:3000  # Frontend URL(s), comma-separated
```

### 3. Start the Server

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm start
```

---

## 🗄️ Database Configuration

The API supports two database modes. Choose the one that fits your needs:

### Option 1: In-Memory Database (Default)

**Recommended for:** Development, testing, and quick demos

**Configuration:**
```bash
USE_MONGODB=false
```

**Features:**
- ✅ No MongoDB installation required
- ✅ Pre-loaded with sample data
- ✅ Fast startup
- ✅ Perfect for testing
- ⚠️ Data resets on server restart

**Sample Data Includes:**
- 10+ places with reviews and ratings
- 3 test users with different roles
- Sample preferences and favorites

### Option 2: MongoDB

**Recommended for:** Production, persistent data

**Configuration:**
```bash
USE_MONGODB=true
MONGODB_URI=mongodb+srv://username:password@host/database
```

**Setup Steps:**
1. Create a MongoDB database (local or cloud)
2. Get your connection string
3. Update `MONGODB_URI` in `.env`
4. Set `USE_MONGODB=true`

📖 **For detailed MongoDB setup instructions, see:** [Database Setup Guide](./database-guide.md)

---

## 🔐 Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port number | `3001` | No |
| `JWT_SECRET` | Secret key for JWT token signing | - | **Yes** |
| `NODE_ENV` | Environment mode (`development` or `production`) | `production` | No |
| `USE_MONGODB` | Use MongoDB (`true`) or in-memory database (`false`) | `false` | No |
| `MONGODB_URI` | MongoDB connection string | - | Only if `USE_MONGODB=true` |
| `CORS_ORIGIN` | Allowed CORS origins (comma-separated) | `http://localhost:3000` | No |

---

## 🌐 Environment Modes

### Development Mode

Optimized for development with auto-reload:

```bash
NODE_ENV=development
npm run dev
```

**Features:**
- Auto-reload on code changes (nodemon)
- Detailed error messages
- Request/response logging

### Production Mode

Optimized for production performance:

```bash
NODE_ENV=production
npm start
```

**Features:**
- No auto-reload
- Minimal logging
- Optimized performance

---

## ✅ Verify Installation

### 1. Check Health Endpoint

```bash
curl http://localhost:3001/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-05T10:30:00.000Z"
}
```

### 2. Access API Documentation

Open your browser and navigate to:
```
http://localhost:3001/api-docs
```

You should see the interactive Swagger UI documentation.

### 3. Test Authentication

**Login with test user:**
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "john.doe@example.com", "password": "password123"}'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "email": "john.doe@example.com",
      "name": "John Doe"
    }
  }
}
```

---

## 🧪 Running Tests

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Generate Coverage Report

```bash
npm run test:coverage
```

Coverage reports are generated in the `coverage/` directory.

📖 **For detailed testing documentation, see:** [../tests/README.md](../tests/README.md)

---

## 🐛 Troubleshooting

### Port Already in Use

**Error:** `EADDRINUSE: address already in use :::3001`

**Solution:** Change the port in `.env`:
```bash
PORT=3002
```

### JWT Secret Not Set

**Error:** `JWT_SECRET is not defined`

**Solution:** Add `JWT_SECRET` to your `.env` file:
```bash
JWT_SECRET=your_strong_secret_here_minimum_32_chars
```

### MongoDB Connection Failed

**Error:** `MongoServerError: Authentication failed`

**Solution:**
1. Verify your `MONGODB_URI` is correct
2. Check username and password
3. Ensure your IP is whitelisted (for cloud databases)
4. Or switch to in-memory database: `USE_MONGODB=false`

### CORS Issues

**Error:** `Access to XMLHttpRequest has been blocked by CORS policy`

**Solution:** Update `CORS_ORIGIN` in `.env` with your frontend URL:
```bash
CORS_ORIGIN=http://localhost:3000
```

For multiple origins:
```bash
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
```

---

## 📚 Next Steps

Now that your backend is running:

1. 📖 **[Explore the API](./api-overview.md)** - Learn about available endpoints
2. 🏗️ **[Understand the Architecture](./architecture.md)** - Deep dive into design patterns
3. 🔌 **[Connect the Frontend](https://github.com/fraidakis/software-engineering-2-frontend)** - Set up the React frontend

---

## 🆘 Need Help?

- **Database Setup**: See [Database Setup Guide](./database-guide.md)
- **API Reference**: See [API Overview](./api-overview.md) or [Swagger UI](http://localhost:3001/api-docs)
- **Testing Guide**: See [../tests/README.md](../tests/README.md)
- **CI/CD Documentation**: See [../.github/workflows/README.md](../.github/workflows/README.md)
