# Backend Architecture

This document provides a detailed overview of the backend architecture, design patterns, and project structure.

---

## 📂 Project Structure

This backend follows industry best practices for Node.js/Express API architecture with clear separation of concerns:

```
software-engineering-2-backend/
├── config/                         # Application configuration
│   ├── constants.js                # Application constants and enums
│   ├── database.js                 # Database connection setup
│   ├── db.js                       # Database factory (MongoDB/In-Memory)
│   ├── inMemoryDb.js               # In-memory database for development/testing
│   ├── mongoDb.js                  # MongoDB implementation
│   └── seedData.js                 # Sample data for development
│     
├── controllers/                    # Route controllers (handle HTTP requests/responses)
│   ├── adminController.js          # Admin operations (reports, moderation)
│   ├── authController.js           # Authentication (login, signup)
│   ├── favouriteController.js      # Favorite/disliked places management
│   ├── navigationController.js     # Turn-by-turn navigation
│   ├── placeController.js          # Place CRUD operations and search
│   ├── preferenceController.js     # User preference profiles
│   ├── recommendationController.js # AI-powered recommendations
│   └── userController.js           # User profile management
│
├── middleware/               # Express middleware
│   ├── auth.js               # JWT authentication verification
│   ├── errorHandler.js       # Global error handling
│   ├── logger.js             # Request/response logging
│   └── validation.js         # Request validation with express-validator
│
├── models/                   # MongoDB/Mongoose data models
│   ├── Counter.js            # Auto-increment counters for IDs
│   ├── DislikedPlace.js      # User's disliked places
│   ├── FavouritePlace.js     # User's favorite places
│   ├── Place.js              # Place information and reviews
│   ├── PreferenceProfile.js  # User preference profiles
│   ├── Report.js             # User reports for moderation
│   ├── Review.js             # Place reviews and ratings
│   ├── Settings.js           # User settings (language, accessibility)
│   ├── User.js               # User accounts and authentication
│   └── index.js              # Model exports
│
├── routes/                     # API route definitions
│   ├── adminRoutes.js          # /admin/* endpoints
│   ├── authRoutes.js           # /auth/* endpoints
│   ├── favouriteRoutes.js      # /users/:userId/favourites/* endpoints
│   ├── navigationRoutes.js     # /navigation/* endpoints
│   ├── placeRoutes.js          # /places/* endpoints
│   ├── preferenceRoutes.js     # /users/:userId/preferences/* endpoints
│   ├── recommendationRoutes.js # /users/:userId/recommendations/* endpoints
│   ├── userRoutes.js           # /users/* endpoints
│   └── index.js                # Route aggregation
│
├── services/                 # Business logic layer
│   ├── authService.js        # Authentication business logic
│   ├── favouriteService.js   # Favorites management logic
│   ├── placeService.js       # Place operations logic
│   ├── preferenceService.js  # Preference profile logic
│   └── userService.js        # User management logic
│
├── utils/                    # Utility functions and helpers
│   ├── errors.js             # Custom error classes
│   ├── hateoasBuilder.js     # HATEOAS link generation
│   ├── helpers.js            # General helper functions
│   ├── responses.js          # Standardized response formatting
│   └── validators.js         # Custom validation functions
│
├── tests/                    # Test suites (Jest)
│   ├── unit/                 # Unit tests for services, utils
│   ├── integration/          # Integration tests for API endpoints
│   ├── helpers/              # Test helper functions
│   └── setup.js              # Test environment configuration
│
├── docs/                     # Documentation
│   ├── swagger.yaml          # OpenAPI 3.0 specification
│   ├── database-guide.md     # MongoDB setup guide
│   ├── architecture.md       # This file
│   ├── getting-started.md    # Setup and installation guide
│   └── api-overview.md       # API endpoints overview
│
├── .github/                  # GitHub configuration
│   └── workflows/            # CI/CD pipeline definitions
│       └── backend-cicd.yml  # GitHub Actions workflow
│
├── app.js                    # Express application setup
├── server.js                 # Server entry point and startup
├── package.json              # Dependencies and scripts
├── jest.config.cjs           # Jest testing configuration
├── eslint.config.js          # ESLint code quality configuration
├── .env.example              # Environment variables template
└── start.sh                  # Quick start script for Bash
```

---

## 🏗️ Architecture Patterns

### Layered Architecture

The application follows a clear layered architecture with separation of concerns:

```
┌─────────────────────────────────────┐
│         HTTP Request/Response        │
│              (Routes)                │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│          Controllers Layer           │
│    (Handle HTTP, validate input)     │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│          Services Layer              │
│      (Business logic & rules)        │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│          Models/Database             │
│     (Data persistence & queries)     │
└──────────────────────────────────────┘
```

**Benefits:**
- Clear separation of concerns
- Easier testing and maintenance
- Business logic isolated from HTTP handling
- Reusable service layer

---

### Service Layer Pattern

Business logic is isolated in service modules that are independent of HTTP concerns:

- **Controllers** handle HTTP requests/responses and delegate to services
- **Services** contain all business logic and data validation
- **Models** define data schemas and database interactions

**Example Flow:**
```
Route → Controller → Service → Model → Database
                        ↓
                   Validation
                   Business Logic
                   Error Handling
```

---

### Repository Pattern

Database operations are abstracted in the service layer, making it easy to:
- Switch between in-memory and MongoDB databases
- Mock database calls in tests
- Change database implementations without affecting business logic

---

### Dependency Injection

Services and utilities are modular and testable:
- No hard dependencies on specific implementations
- Easy to mock for unit testing
- Clear dependency flow

---

### Error Handling

Centralized error handling with custom error classes:

- **Custom Error Classes** (`errors.js`): `NotFoundError`, `ValidationError`, `UnauthorizedError`, etc.
- **Global Error Handler** (`errorHandler.js`): Catches all errors and formats responses
- **Consistent Error Format**: All errors return standardized JSON structure

---

### HATEOAS Implementation

The API implements REST Level 3 (HATEOAS) for discoverability:

- **`hateoasBuilder.js`** generates dynamic hypermedia links
- Every response includes `_links` with available actions
- Clients can navigate the API without hard-coded URLs

**Example Response:**
```json
{
  "data": {
    "id": 1,
    "name": "Place Name"
  },
  "_links": {
    "self": { "href": "/places/1" },
    "reviews": { "href": "/places/1/reviews" }
  }
}
```

---

## 🔐 Authentication & Security

### JWT Authentication

- **Stateless authentication** using JSON Web Tokens
- Tokens generated on login/signup
- `auth.js` middleware verifies tokens on protected routes
- Tokens include user ID and role

### Password Security

- **bcryptjs** for secure password hashing
- Passwords never stored in plain text
- Salt rounds configurable for security/performance balance

### CORS Configuration

- Configurable allowed origins via environment variables
- Supports multiple frontend URLs (comma-separated)
- Credentials support for cookie-based auth

---

## 🗄️ Database Architecture

### Dual Database Support

The application supports two database modes:

1. **In-Memory Database** (`inMemoryDb.js`)
   - Simple JavaScript object storage
   - Pre-loaded with sample data
   - Perfect for development and testing
   - No external dependencies

2. **MongoDB** (`mongoDb.js`)
   - Production-ready NoSQL database
   - Mongoose ODM for schema validation
   - Auto-increment IDs via Counter model
   - Rich querying capabilities

### Database Factory Pattern

The `db.js` module acts as a factory that returns the appropriate database implementation based on the `USE_MONGODB` environment variable.

---

## 📊 Data Models

### Core Models

- **User**: Authentication, profile, settings
- **Place**: Location information, reviews, ratings
- **Review**: User reviews for places
- **FavouritePlace**: User's favorite places
- **DislikedPlace**: Places user has marked as disliked
- **PreferenceProfile**: User's travel preferences
- **Settings**: User settings (language, accessibility)
- **Report**: User reports for moderation
- **Counter**: Auto-increment ID counter

### Model Relationships

```
User ──┬─── FavouritePlace ──→ Place
       ├─── DislikedPlace ──→ Place
       ├─── PreferenceProfile
       ├─── Settings
       └─── Report

Place ──→ Review ──→ User
```

---

## 🧪 Testing Architecture

### Test Structure

```
tests/
├── unit/               # Unit tests for services, utils
├── integration/        # Integration tests for API endpoints
├── helpers/           # Test helper functions
└── setup.js           # Test environment configuration
```

### Testing Approach

- **Unit Tests**: Test services and utilities in isolation
- **Integration Tests**: Test full API endpoints with HTTP requests
- **Test Database**: In-memory database for isolated, fast tests
- **Mocking**: Mock external dependencies (MongoDB, third-party APIs)

📖 **For detailed testing documentation, see:** [../tests/README.md](../tests/README.md)

---

## 🛠️ Technology Stack

### Core Technologies
- **Runtime**: Node.js ≥18
- **Framework**: Express.js 4.x
- **Language**: JavaScript (ES6+ with ES Modules)

### Authentication & Security
- **JWT**: JSON Web Tokens for stateless authentication
- **bcryptjs**: Secure password hashing
- **CORS**: Cross-Origin Resource Sharing with configurable origins

### Database
- **MongoDB**: Production database (via Mongoose ODM)
- **In-Memory Database**: Development/testing fallback

### API Documentation
- **Swagger UI**: Interactive API documentation
- **OpenAPI 3.0**: API specification standard
- **js-yaml**: YAML parsing for Swagger docs

### Testing
- **Jest**: Testing framework with ES modules support
- **Supertest**: HTTP assertion library for API testing
- **mongodb-memory-server**: In-memory MongoDB for isolated tests

### Development Tools
- **nodemon**: Auto-reload during development
- **ESLint**: Code quality and style enforcement
- **dotenv**: Environment variable management
- **cross-env**: Cross-platform environment variable setting

### Validation
- **express-validator**: Request validation middleware

---

## 📚 Related Documentation

- [Getting Started Guide](./getting-started.md) - Setup and installation
- [API Overview](./api-overview.md) - Endpoint reference
- [Database Setup Guide](./database-guide.md) - MongoDB configuration
