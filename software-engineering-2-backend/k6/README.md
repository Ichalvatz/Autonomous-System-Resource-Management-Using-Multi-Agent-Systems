# k6 Performance Tests

Performance tests for the myWorld Travel API using [k6](https://k6.io/).

## Test Overview

| Test File | Type | Endpoint |
|-----------|------|----------|
| `load-test-places.js` | Load | GET /places/:placeId |
| `spike-test-places.js` | Spike | GET /places/:placeId |
| `load-test-recommendations.js` | Load | GET /users/:userId/recommendations |
| `spike-test-recommendations.js` | Spike | GET /users/:userId/recommendations |

## Thresholds (Non-Functional Requirements)

| Test Type | p95 Response | Error Rate |
|-----------|--------------|------------|
| Load | < 500ms | < 1% |
| Spike | < 1000ms | < 5% |

## Running Locally

```bash
# Install k6: https://k6.io/docs/getting-started/installation/

# Start server first
npm start

# Run all tests
npm run k6:all

# Or run individually
npm run k6:load-places
npm run k6:spike-places
npm run k6:load-recommendations
npm run k6:spike-recommendations
```

## CI/CD

Tests run automatically via GitHub Actions on push/PR to main/master/develop branches.
See `.github/workflows/k6-performance-tests.yml`
