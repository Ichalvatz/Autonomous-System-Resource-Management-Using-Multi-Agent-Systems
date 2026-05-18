# 🔄 Frontend CI/CD Pipeline Documentation

This directory contains GitHub Actions workflows for automated end-to-end testing and deployment of the myWorld Travel frontend application.

## 📋 Overview

The frontend CI/CD pipeline implements a comprehensive testing and deployment strategy that validates the complete user experience with E2E tests against a live backend before deploying to production.

## 🚀 Workflows

### `frontend-cicd.yml` - Main CI/CD Pipeline

**Purpose**: Automated E2E acceptance testing and deployment pipeline for the frontend application.

**Triggers**:
- ✅ Push to `main` branch
- ✅ Pull requests targeting `main` branch

**Pipeline Architecture**: Two-stage pipeline with CI (E2E tests with backend integration) and CD (conditional deployment)

---

## 🧪 Stage 1: Continuous Integration (CI) - E2E Acceptance Tests

### Job: `ci-e2e-acceptance-tests`

**Runs on**: `ubuntu-latest`

**Purpose**: Validates the entire user experience through comprehensive E2E tests with a live backend.

### Pipeline Steps

#### 1. Checkout Frontend Code
```yaml
- name: Checkout Frontend Code
  uses: actions/checkout@v6
```
- Fetches the latest frontend code from the repository

#### 2. Checkout Backend Code
```yaml
- name: Checkout Backend Code
  uses: actions/checkout@v6
  with:
    repository: fraidakis/software-engineering-2-backend
    token: ${{ secrets.BACKEND_REPO_TOKEN }}
    path: backend
```
- Clones the backend repository into `backend/` directory
- Required for running true end-to-end tests
- Uses Personal Access Token for private repository access

#### 3. Setup Node.js Environment
```yaml
- name: Setup Node.js
  uses: actions/setup-node@v6
  with:
    node-version: '20'
    cache: 'npm'
```
- Configures Node.js v20 runtime
- Enables npm dependency caching for both frontend and backend
- Caches based on both `package-lock.json` files

#### 4. Install Backend Dependencies
```yaml
- name: Install Backend Dependencies
  run: npm ci --loglevel=error --no-audit --no-fund
  working-directory: backend
```
- Performs clean install of backend dependencies
- Prepares backend for local execution during tests

#### 5. Start Local Backend Server
```yaml
- name: Start Local Backend (background)
  working-directory: backend
  run: |
    npm start &> backend.log &
    npx wait-on http://localhost:3001/health
```
- Starts backend server in background mode
- Waits for health endpoint to respond before continuing
- Backend runs on `http://localhost:3001`
- Logs output to `backend.log` for debugging

#### 6. Install Frontend Dependencies
```yaml
- name: Install Frontend Dependencies
  run: npm ci --loglevel=error --no-audit --no-fund
```
- Performs clean install of frontend dependencies
- Ensures reproducible builds

#### 7. Run Cypress E2E Tests
```yaml
- name: Run Cypress E2E
  uses: cypress-io/github-action@v6
  with:
    install: false
    start: npm start
    wait-on: 'http://localhost:3000'
    command: npm run test:e2e
```
- **Starts frontend server**: `npm start` runs React development server
- **Waits for frontend**: Ensures app is ready before testing
- **Executes E2E tests**: Runs all Cypress test suites (65+ tests)
- **Backend integration**: Tests interact with live backend API
- **Test coverage**: All 9 pages validated with happy/unhappy paths

#### 8. Upload Cypress Screenshots
```yaml
- name: Upload Cypress Screenshots
  uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: cypress-screenshots
    path: cypress/screenshots/
```
- **Conditional**: Only runs if tests fail
- Captures screenshots from failed test assertions
- Stored for 7 days for debugging

#### 9. Upload Cypress Videos
```yaml
- name: Upload Cypress Videos
  uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: cypress-videos
    path: cypress/videos/
```
- **Conditional**: Only runs if tests fail
- Full video recordings of test execution
- Retained for 7 days for analysis

### CI Success Criteria

For the CI stage to pass:

- ✅ Backend must start successfully and pass health check
- ✅ Frontend must compile and serve without errors
- ✅ All 65+ Cypress E2E tests must pass
- ✅ No test failures or timeout errors
- ✅ Backend API must respond correctly to all test requests

---

## 🚢 Stage 2: Continuous Deployment (CD)

### Job: `cd` (Deploy to Production)

**Runs on**: `ubuntu-latest`

**Depends on**: `ci-e2e-acceptance-tests` (must pass first)

**Conditional Execution**: Only runs if:
1. ✅ Event is a push to `main` branch
2. ✅ CI E2E tests passed successfully
3. ✅ Not a pull request

```yaml
if: github.ref == 'refs/heads/main' && github.event_name == 'push' && success()
```

### Deployment Steps

#### 1. Deploy to Render
```yaml
- name: Deploy to Render and wait for completion
  uses: JorgeLNJunior/render-deploy@v1.4.6
  with:
    api_key: ${{ secrets.RENDER_API_KEY }}
    service_id: ${{ secrets.RENDER_SERVICE_ID }}
    wait_deploy: true
```
- Deploys application to Render hosting platform
- Waits for deployment completion (can take 3-5 minutes)
- Uses GitHub secrets for secure authentication

**Required Secrets**:
- `RENDER_API_KEY`: Render API authentication key
- `RENDER_SERVICE_ID`: Unique identifier for frontend service
- `BACKEND_REPO_TOKEN`: GitHub PAT for accessing backend repository

#### 2. Post-Deploy Health Checks
```yaml
- name: Post-deploy sanity check
  run: |
    curl -fsS --retry 5 --retry-all-errors --retry-delay 3 -o /dev/null $FRONTEND_URL
    curl -fsS $BACKEND_HEALTH | jq -e '.status == "healthy"'
```
- **Frontend check**: Verifies frontend is accessible
- **Backend check**: Ensures backend API is healthy
- **Retries**: Up to 5 attempts with 3-second delays
- **Fails deployment**: If either check fails

### Deployment Targets

- **Frontend URL**: `https://myworld-frontend.onrender.com`
- **Backend URL**: `https://myworld-backend-8u7h.onrender.com`
- **Backend Health**: `https://myworld-backend-8u7h.onrender.com/health`

---

## 🔒 Security & Configuration

### Permissions

The workflow uses minimal permissions for security:

```yaml
permissions:
  contents: read
```

Only read access to repository contents is granted.

### Required Secrets

Configure these secrets in GitHub repository settings (`Settings → Secrets and variables → Actions`):

| Secret Name | Description | How to Obtain |
|-------------|-------------|---------------|
| `RENDER_API_KEY` | Render API authentication key | [Render Dashboard → Account Settings → API Keys](https://dashboard.render.com/u/settings/api-keys) |
| `RENDER_SERVICE_ID` | Unique identifier for frontend service | Found in Render service URL or settings |
| `BACKEND_REPO_TOKEN` | GitHub Personal Access Token | [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens) |

#### Creating GitHub PAT for Backend Access

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Click "Generate new token (classic)"
3. Select scopes:
   - ✅ `repo` (Full control of private repositories)
4. Generate token and copy immediately
5. Add as `BACKEND_REPO_TOKEN` secret in frontend repository

### Concurrency Control

```yaml
concurrency:
  group: frontend-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

- **Prevents concurrent runs** on the same branch/PR
- **Cancels older runs** when new commits are pushed
- **Saves CI minutes** and resources

---

## 📊 Monitoring & Logs

### Viewing Pipeline Status

**GitHub Actions Dashboard**:
- Navigate to: `Repository → Actions tab`
- View all workflow runs, their status, and logs
- [Direct link](https://github.com/fraidakis/software-engineering-2-frontend/actions)

### Accessing Test Artifacts

When tests fail, artifacts are automatically uploaded:

1. **Go to failed workflow run** in GitHub Actions
2. **Scroll to Artifacts** section at the bottom
3. **Download artifacts**:
   - `cypress-screenshots`: Screenshots from failed assertions
   - `cypress-videos`: Full test execution videos
4. **Extract and review** to debug failures

### Viewing Backend Logs

If backend fails to start during CI:

1. Check the "Start Local Backend" step in the workflow
2. Look for `backend.log` output in the step logs
3. Review error messages for debugging

### Common Workflow Outcomes

| Status | Description | Next Steps |
|--------|-------------|------------|
| ✅ Success | All E2E tests passed, deployment successful | No action needed |
| ❌ Backend Startup Failed | Backend didn't start or pass health check | Review backend logs, check backend code |
| ❌ Frontend Build Failed | Frontend compilation or build errors | Check frontend build logs, fix errors |
| ❌ E2E Tests Failed | One or more Cypress tests failed | Review screenshots/videos, fix failing tests |
| ❌ Deployment Failed | Deployment or health check failed | Check Render logs, verify service configuration |
| 🟡 Skipped | CD skipped (PR or test failure) | Merge PR or fix tests first |

---

## 🛠️ Troubleshooting

### Common Issues

#### 1. Backend Fails to Start in CI

**Symptoms**:
- "Start Local Backend" step fails or times out
- Backend health check never responds

**Possible Causes**:
- Backend code errors
- Missing environment variables
- Port conflicts
- Database connection issues

**Solutions**:
```bash
# Test backend locally
cd backend
npm install
npm start

# Check health endpoint
curl http://localhost:3001/health
```

#### 2. E2E Tests Fail in CI but Pass Locally

**Possible Causes**:
- Timing issues (CI is slower)
- Environment variable differences
- Backend API differences
- Browser/viewport differences

**Solutions**:
```javascript
// Add longer timeouts in tests
cy.get('.element', { timeout: 10000 }).should('exist');

// Use wait-on for async operations
cy.wait('@apiRequest');

// Check environment variables
console.log('API URL:', Cypress.env('apiUrl'));
```

#### 3. Tests are Flaky (Sometimes Pass, Sometimes Fail)

**Causes**:
- Race conditions with async operations
- Insufficient waits for API responses
- DOM elements not fully loaded

**Solutions**:
```javascript
// Wait for loading spinner to disappear
cy.get('.loading-spinner').should('not.exist');

// Use explicit waits
cy.wait('@apiRequest').its('response.statusCode').should('eq', 200);

// Retry assertions
cy.get('.dynamic-content', { timeout: 10000 }).should('be.visible');
```

#### 4. Deployment Succeeds but Health Check Fails

**Causes**:
- Render service taking too long to start
- Backend service not responding
- Health endpoint returning wrong status

**Solutions**:
1. Check Render dashboard for service status
2. Manually test health endpoints:
   ```bash
   curl https://myworld-frontend.onrender.com
   curl https://myworld-backend-8u7h.onrender.com/health
   ```
3. Increase retry attempts in health check step

#### 5. "BACKEND_REPO_TOKEN" Authentication Failed

**Cause**: PAT expired or lacks permissions

**Solution**:
1. Generate new GitHub Personal Access Token
2. Ensure `repo` scope is selected
3. Update secret in repository settings

---

## 📈 Performance Metrics

### Typical Pipeline Execution Times

| Stage | Duration | Notes |
|-------|----------|-------|
| Checkout Code | ~5s | Fast with shallow clones |
| Node.js Setup | ~1-2s | Faster with cache hit |
| Install Backend Deps | ~10s | Faster with cache |
| Start Backend | ~5s | Includes health check wait |
| Install Frontend Deps | ~30s | Faster with cache |
| Run E2E Tests | ~2 min | 65+ tests with backend integration |
| **Total CI Time** | **~2.5 min** | With cache hits |
| Deployment | ~1 min | Render build and deploy |
| Health Checks | ~30s | With retries |
| **Total CD Time** | **~1.5 min** | After CI passes |

**Total Pipeline Duration (Push to Main)**: ~4-5 minutes

---

## 🔗 Related Documentation

- [Frontend README](../../README.md) - Main project documentation
- [Cypress E2E Tests](../../cypress/README.md) - Comprehensive test documentation
- [Backend Repository](https://github.com/fraidakis/software-engineering-2-backend) - Backend API
- [GitHub Actions Documentation](https://docs.github.com/en/actions) - Official GitHub Actions docs
- [Cypress Documentation](https://docs.cypress.io/) - Official Cypress docs
- [Render Documentation](https://render.com/docs) - Render hosting platform

---
