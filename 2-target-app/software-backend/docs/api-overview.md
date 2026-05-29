# API Overview

Complete reference for all API endpoints.

---

## 🌐 Base URL

```
http://localhost:3001
```

---

## 📖 Interactive Documentation

For interactive API testing and detailed request/response examples, visit:

**Swagger UI**: [`http://localhost:3001/api-docs`](http://localhost:3001/api-docs)

**OpenAPI Specification**: [`swagger.yaml`](./swagger.yaml)

---

## 🔑 Authentication

Most endpoints require JWT authentication. Include the token in the `Authorization` header:

```
Authorization: Bearer <your_jwt_token>
```

**Get a token:**
- Login: `POST /auth/login`
- Signup: `POST /auth/signup`

---

## 📋 API Endpoints Reference

### Core Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | API information and entry point | No |
| GET | `/health` | Health check endpoint | No |
| GET | `/api-docs` | Interactive Swagger documentation | No |

---

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | User login (returns JWT token) |
| POST | `/auth/signup` | User registration |

**Example Login Request:**
```json
{
  "email": "john.doe@example.com",
  "password": "password123"
}
```

**Example Login Response:**
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

### Users

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/users/:userId/profile` | Get user profile | ✅ |
| PUT | `/users/:userId/profile` | Update user profile | ✅ |
| GET | `/users/:userId/settings` | Get user settings | ✅ |
| PUT | `/users/:userId/settings` | Update user settings | ✅ |

**Profile Fields:**
- `name`, `email`, `bio`, `profilePicture`

**Settings Fields:**
- `language` (en, el)
- `theme` (light, dark)
- `accessibility` options

---

### Places

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/places` | Get all places | No |
| GET | `/places/:placeId` | Get specific place details | No |
| GET | `/places/search` | Search places by keywords | No |
| POST | `/places/:placeId/reviews` | Add review to place | ✅ |

**Query Parameters for `/places`:**
- `category` - Filter by category (e.g., `museum`, `restaurant`)
- `rating` - Minimum rating (1-5)
- `limit` - Number of results (default: 10)

**Search Parameters:**
- `q` - Search query
- `category` - Filter by category
- `lat`, `lon` - Location-based search

---

### Preferences & Recommendations

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/users/:userId/preferences` | Get all preference profiles | ✅ |
| POST | `/users/:userId/preferences` | Create new preference profile | ✅ |
| PUT | `/users/:userId/preferences/:profileId` | Update preference profile | ✅ |
| DELETE | `/users/:userId/preferences/:profileId` | Delete preference profile | ✅ |
| GET | `/users/:userId/recommendations` | Get AI-powered recommendations | ✅ |

**Preference Profile Fields:**
- `name` - Profile name
- `categories` - Preferred place categories
- `priceRange` - Budget preferences
- `accessibility` - Accessibility requirements

**Recommendations Parameters:**
- `profileId` - Use specific preference profile
- `limit` - Number of recommendations

---

### Favorites

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/users/:userId/favourites` | Get favorite places | ✅ |
| POST | `/users/:userId/favourites` | Add place to favorites | ✅ |
| DELETE | `/users/:userId/favourites/:placeId` | Remove from favorites | ✅ |
| GET | `/users/:userId/disliked` | Get disliked places | ✅ |
| POST | `/users/:userId/disliked` | Mark place as disliked | ✅ |
| DELETE | `/users/:userId/disliked/:placeId` | Remove from disliked | ✅ |

---

### Navigation

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/navigation` | Get turn-by-turn navigation | ✅ |

**Query Parameters:**
- `origin` - Starting location (lat,lon)
- `destination` - Destination (lat,lon)
- `mode` - Transport mode (`walking`, `driving`, `transit`, `cycling`)

**Example Response:**
```json
{
  "success": true,
  "data": {
    "route": {
      "distance": "2.5 km",
      "duration": "30 minutes",
      "steps": [
        {
          "instruction": "Head north on Main St",
          "distance": "500 m",
          "duration": "6 minutes"
        }
      ]
    }
  }
}
```

---

### Admin

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/admin/reports` | Get all reports | ✅ Admin |
| GET | `/admin/reports/:reportId` | Get specific report | ✅ Admin |
| PUT | `/admin/reports/:reportId` | Resolve report | ✅ Admin |

**Report Types:**
- `inappropriate_content`
- `spam`
- `incorrect_information`
- `other`

---

## 🔗 HATEOAS Links

All responses include HATEOAS links for discoverability:

```json
{
  "data": {
    "id": 1,
    "name": "Acropolis Museum"
  },
  "_links": {
    "self": { "href": "/places/1" },
    "reviews": { "href": "/places/1/reviews" },
    "favourite": { "href": "/users/:userId/favourites", "method": "POST" }
  }
}
```

---

## 📊 Response Format

All API responses follow a consistent format:

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "_links": { ... }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "status": 400
  }
}
```

---

## 🔢 Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Internal Server Error |

---

## 🧪 Testing the API

### Using cURL

**Health Check:**
```bash
curl http://localhost:3001/health
```

**Login:**
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "john.doe@example.com", "password": "password123"}'
```

**Get Places (with auth):**
```bash
curl http://localhost:3001/places \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Using Swagger UI

Visit [`http://localhost:3001/api-docs`](http://localhost:3001/api-docs) for interactive testing:

1. Click "Authorize" button
2. Enter your JWT token
3. Try out any endpoint with the "Try it out" button

---

## 📚 Related Documentation

- [Getting Started Guide](./getting-started.md) - Setup and installation
- [Architecture](./architecture.md) - Design patterns and structure
- [Database Setup Guide](./database-guide.md) - MongoDB configuration
- [Swagger UI](http://localhost:3001/api-docs) - Interactive API documentation
- [OpenAPI Specification](./swagger.yaml) - Complete API specification
