# 🔄 Backend CI/CD Pipeline Documentation

This directory contains GitHub Actions workflows for automated testing, quality assurance, and deployment of the myWorld Travel API backend.

## 📋 Overview

The backend CI/CD pipeline implements a robust continuous integration and deployment strategy that ensures code quality, maintains test coverage, and automates production deployments.

## 🚀 Workflows

### `backend-cicd.yml` - Main CI/CD Pipeline

**Purpose**: Automated testing and deployment pipeline for the backend application.

**Triggers**:
- ✅ Push to `main` branch
- ✅ Pull requests targeting `main` branch

**Pipeline Architecture**: Two-stage pipeline with CI (always runs) and CD (conditional deployment)

---

## 🧪 Stage 1: Continuous Integration (CI)

### Job: `ci-unit-tests`

**Runs on**: `ubuntu-latest`

**Purpose**: Validates code quality through comprehensive testing with coverage analysis.

### Steps

#### 1. Checkout Code
- Fetches the latest code from the repository using GitHub Actions checkout v6

#### 2. Setup Node.js Environment
- Configures Node.js v20 runtime
- Enables npm dependency caching for faster subsequent runs (~30-50% faster with cache hits)

#### 3. Install Dependencies
- Performs clean install (`npm ci`) for reproducible builds
- Ensures exact dependency versions from `package-lock.json`

#### 4. Run Tests with Coverage
- Executes all unit and integration tests (**599 tests**)
- Generates comprehensive coverage report
- **Enforces coverage thresholds**:
  - Statements: ≥80% (Current: 91.48%)
  - Branches: ≥80% (Current: 86.18%)
  - Functions: ≥80% (Current: 94.14%)
  - Lines: ≥80% (Current: 91.77%)
- **Build fails** if coverage drops below thresholds

#### 5. Upload Coverage Report
- Stores coverage reports as workflow artifacts
- Accessible from GitHub Actions UI
- Retained for 7 days for review and auditing

### CI Success Criteria

For the CI stage to pass:

- ✅ All 599 tests must pass
- ✅ Code coverage must meet ≥80% thresholds
- ✅ No build errors or dependency issues

---

## 🚢 Stage 2: Continuous Deployment (CD)

### Job: `cd` (Deploy to Production)

**Runs on**: `ubuntu-latest`

**Depends on**: `ci-unit-tests` (must pass first)

**Conditional Execution**: Only runs if:
1. ✅ Event is a push to `main` branch
2. ✅ CI tests passed successfully
3. ✅ Not a pull request

### Steps

#### 1. Deploy to Render
- Deploys application to Render hosting platform
- Waits for deployment completion before proceeding
- Uses GitHub secrets for secure authentication
- Preserves cache for faster deployments

**Required Secrets**:
- `RENDER_API_KEY`: Render API authentication key
- `RENDER_SERVICE_ID`: Unique identifier for backend service

#### 2. Post-Deploy Health Check
- Verifies deployment was successful
- Checks `/health` endpoint for healthy status
- Retries up to 5 times with 10-second delays
- Fails deployment if health check doesn't return `"healthy"`

### Deployment Targets

- **Production URL**: `https://myworld-backend-8u7h.onrender.com`
- **Health Check**: `https://myworld-backend-8u7h.onrender.com/health`
- **API Documentation**: `https://myworld-backend-8u7h.onrender.com/api-docs`

---

## 🔒 Security & Configuration

### Permissions

The workflow uses minimal permissions for security:
```yaml
permissions:
  contents: read
```

### Required Secrets

Configure these secrets in GitHub repository settings (`Settings → Secrets and variables → Actions`):

| Secret Name | Description | How to Obtain |
|-------------|-------------|---------------|
| `RENDER_API_KEY` | Render API authentication key | [Render Dashboard → Account Settings → API Keys](https://dashboard.render.com/u/settings/api-keys) |
| `RENDER_SERVICE_ID` | Unique identifier for backend service | Found in Render service URL or settings |

### Concurrency Control

- **Prevents concurrent runs** on the same branch/PR
- **Cancels older runs** when new commits are pushed
- **Saves CI minutes** and resources

---

## 📊 Monitoring & Logs

### Viewing Pipeline Status

**GitHub Actions Dashboard**:
- Navigate to: `Repository → Actions tab`
- View all workflow runs, their status, and logs
- [Direct link](https://github.com/fraidakis/software-engineering-2-backend/actions)

### Accessing Coverage Reports

1. Go to workflow run in GitHub Actions
2. Scroll to Artifacts section at the bottom
3. Download `coverage-report` artifact
4. Extract and open `index.html` in browser

### Common Workflow Outcomes

| Status | Description | Next Steps |
|--------|-------------|------------|
| ✅ Success | All tests passed, coverage met, deployment successful | No action needed |
| ❌ Test Failure | One or more tests failed | Review test logs, fix failing tests |
| ❌ Coverage Failure | Coverage below 80% threshold | Add tests to increase coverage |
| ❌ Deployment Failure | Deployment or health check failed | Check Render logs |
| 🟡 Skipped | CD skipped (PR or test failure) | Merge PR or fix tests first |

---

## 🛠️ Troubleshooting

### Tests Passing Locally but Failing in CI

**Possible Causes**:
- Environment variable differences
- Timing issues with async code
- Node.js version mismatch

**Solution**:
```bash
# Test with same Node.js version
nvm use 20
npm run test:coverage
```

### Coverage Dropping Below Threshold

**Cause**: New code added without sufficient test coverage

**Solution**:
```bash
# Identify uncovered code
npm run test:coverage
# Open coverage/index.html to see specific lines

# Add tests for uncovered code
```

### Deployment Failing

**Possible Causes**:
- Invalid Render secrets
- Render service issues
- Health check endpoint not responding

**Solutions**:
1. Verify secrets in GitHub settings
2. Check Render dashboard for service status
3. Test health endpoint manually:
   ```bash
   curl https://myworld-backend-8u7h.onrender.com/health
   ```

---

## 📈 Performance Metrics

### Typical Pipeline Execution Times

| Stage | Duration | Notes |
|-------|----------|-------|
| Checkout | ~1-2s | Fast with shallow clone |
| Node.js Setup | ~1-2s  | Faster with cache hit |
| Dependencies Install | ~1-2s  | Significantly faster with cache |
| Test Execution | ~45s | 599 tests with coverage |
| **Total CI Time** | **~1 min** | With cache hits |
| Deployment | ~7 min | Render deployment time |
| Health Check | ~10s | With retries |
| **Total CD Time** | **~7.5 min** | After CI passes |

**Total Pipeline Duration (Push to Main)**: ~8.5 minutes

---

## 🔗 Related Documentation

- [Backend README](../../README.md) - Main project documentation
- [Testing Documentation](../../tests/README.md) - Comprehensive test guide
- [GitHub Actions Documentation](https://docs.github.com/en/actions) - Official docs
- [Render Documentation](https://render.com/docs) - Render hosting platform

