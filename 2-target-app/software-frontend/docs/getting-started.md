# Getting Started

This guide walks you through setting up and running the frontend application on your local machine.

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** v18 or higher ([Download](https://nodejs.org/))
- **npm** or **yarn** package manager
- **Bash terminal** (Git Bash on Windows, native terminal on Linux/macOS)
- **Backend API** running ([Backend Repository](https://github.com/fraidakis/software-engineering-2-backend))

---

## 🚀 Quick Start with `start.sh`

The `start.sh` script automatically handles dependency installation, environment setup, and development server startup.

### 1. Clone the Repository

```bash
git clone https://github.com/fraidakis/software-engineering-2-frontend.git
cd software-engineering-2-frontend
```

### 2. Run the Start Script

Run the start script in a **Bash terminal**:

```bash
bash start.sh
```

The script will:
- ✅ Install dependencies (`npm install`)
- ✅ Create `.env` file from `.env.example` if it doesn't exist
- ✅ Start the development server on `http://localhost:3000`

### 3. Access the Application

Once the server is running:
- **Frontend**: `http://localhost:3000`
- **Backend API**: Must be running on `http://localhost:3001`

---

## 🔧 Manual Setup

If you prefer manual setup or need more control:

### 1. Install Dependencies

```bash
npm install
```

Or using yarn:
```bash
yarn install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Port number for the development server
PORT=3000

# Backend API URL
REACT_APP_API_URL=http://localhost:3001
```

### 3. Start the Development Server

```bash
npm start
```

Or using yarn:
```bash
yarn start
```

The application will open automatically in your browser at `http://localhost:3000`.

---

## 🔗 Backend Setup

The frontend requires the backend API to be running. Follow these steps:

### 1. Clone and Setup Backend

```bash
# In a separate terminal window
git clone https://github.com/fraidakis/software-engineering-2-backend.git
cd software-engineering-2-backend
bash start.sh
```

📖 **For detailed backend setup, see:** [Backend Getting Started Guide](https://github.com/fraidakis/software-engineering-2-backend/blob/main/docs/getting-started.md)

### 2. Verify Backend is Running

Check the backend health endpoint:
```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-12-05T10:30:00.000Z"
}
```

---

## 🔐 Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Development server port | `3000` | No |
| `REACT_APP_API_URL` | Backend API base URL | `http://localhost:3001` | **Yes** |

**Note:** All custom environment variables must be prefixed with `REACT_APP_` to be accessible in React.

---

## 💻 Development Workflow

### Typical Development Flow

1. **Start Backend** (in terminal 1):
   ```bash
   cd software-engineering-2-backend
   npm start
   ```

2. **Start Frontend** (in terminal 2):
   ```bash
   cd software-engineering-2-frontend
   npm start
   ```

3. **Open Browser**: Navigate to `http://localhost:3000`

4. **Make Changes**: Edit files in `src/` - hot module replacement will automatically refresh

5. **Test Changes**: Use the application or run tests

---

## ✅ Verify Installation

### 1. Check Application Loads

Open your browser and navigate to `http://localhost:3000`. You should see the homepage with:
- Header with navigation
- Featured places
- Login/Signup buttons

### 2. Test Authentication

1. Click "Sign Up" and create a test account
2. Login with your credentials
3. Access protected pages (Recommendations, Profile, etc.)

### 3. Test API Connection

Open browser console (F12) and check for:
- ✅ No CORS errors
- ✅ Successful API responses
- ✅ Authentication tokens being sent

---

## 🧪 Running Tests

### End-to-End Tests with Cypress

**Run tests in interactive mode:**
```bash
npm run cypress:open
```

**Run tests in headless mode:**
```bash
npm run cypress:run
```

**Run specific test file:**
```bash
npx cypress run --spec "cypress/e2e/auth_happy_unhappy.cy.js"
```

### Test Coverage

The E2E test suite includes:
- **15+ Authentication tests** - Login, signup, logout flows
- **30+ Happy path tests** - Complete user journeys
- **20+ Unhappy path tests** - Error handling and validation

📖 **For detailed testing documentation, see:** [../cypress/README.md](../cypress/README.md)

---

## 🐛 Troubleshooting

### Port Already in Use

**Error:** `Something is already running on port 3000`

**Solution 1:** Change the port in `.env`:
```bash
PORT=3001
```

**Solution 2:** Kill the process using the port:
```bash
# On Linux/macOS
lsof -ti:3000 | xargs kill

# On Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Backend Connection Failed

**Error:** `Network Error` or `CORS policy` errors

**Solutions:**
1. Verify backend is running: `curl http://localhost:3001/health`
2. Check `REACT_APP_API_URL` in `.env` matches backend URL
3. Ensure backend CORS is configured to allow frontend origin
4. Check backend `.env` has: `CORS_ORIGIN=http://localhost:3000`

### API Requests Failing

**Error:** `401 Unauthorized` or `403 Forbidden`

**Solutions:**
1. Clear browser localStorage: `localStorage.clear()`
2. Log out and log back in to get fresh token
3. Check token expiration in backend JWT_SECRET
4. Verify authentication token in browser DevTools → Application → Local Storage

### Environment Variables Not Working

**Error:** `undefined` when accessing `process.env.REACT_APP_*`

**Solutions:**
1. Ensure variable name starts with `REACT_APP_`
2. Restart development server after changing `.env`
3. Clear cache: `npm start` or delete `node_modules/.cache`

### Build Fails

**Error:** `Module not found` or dependency errors

**Solutions:**
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Or using yarn
rm -rf node_modules yarn.lock
yarn install
```

### Cypress Tests Failing

**Error:** Tests timeout or fail unexpectedly

**Solutions:**
1. Ensure backend is running with test data
2. Clear browser data in Cypress
3. Check `cypress.config.js` base URL matches your setup
4. Run tests individually to isolate issues

---

## 🏗️ Building for Production

### Create Production Build

```bash
npm run build
```

This creates an optimized production build in the `build/` directory.

### Test Production Build Locally

```bash
# Install serve globally
npm install -g serve

# Serve the build
serve -s build -l 3000
```

### Build Optimization

The production build includes:
- ✅ Minified JavaScript and CSS
- ✅ Optimized images
- ✅ Code splitting
- ✅ Tree shaking
- ✅ Source maps for debugging

---

## 📱 Browser Support

The application supports:
- **Chrome** (latest)
- **Firefox** (latest)
- **Safari** (latest)
- **Edge** (latest)

**Minimum versions:**
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

## 🎨 Development Tools

### Recommended VS Code Extensions

- **ES7+ React/Redux/React-Native snippets** - Code snippets
- **ESLint** - Code quality
- **Prettier** - Code formatting
- **Auto Rename Tag** - HTML tag editing
- **Path Intellisense** - File path autocomplete

### Browser DevTools

- **React Developer Tools** - Component inspection
- **Redux DevTools** - State management debugging (if applicable)

---

## 📚 Next Steps

Now that your frontend is running:

1. 🏗️ **[Explore the Architecture](./architecture.md)** - Understand the codebase structure
2. 🧪 **[Run the Tests](../cypress/README.md)** - Learn about E2E testing
3. 🔌 **[Backend API Docs](https://github.com/fraidakis/software-engineering-2-backend)** - Understand the API
4. 🌐 **[Try the App](http://localhost:3000)** - Start exploring features

---

## 📖 Learning Resources

### React Documentation
- [React Official Docs](https://react.dev/)
- [React Router Docs](https://reactrouter.com/)
- [Hooks API Reference](https://react.dev/reference/react)

### Form Handling
- [Formik Documentation](https://formik.org/)
- [Yup Validation](https://github.com/jquense/yup)

### Testing
- [Cypress Documentation](https://docs.cypress.io/)
- [Testing Best Practices](https://docs.cypress.io/guides/references/best-practices)

---

## 🆘 Need Help?

- **Architecture**: See [Architecture Guide](./architecture.md)
- **Testing**: See [Cypress E2E README](../cypress/README.md)
- **CI/CD**: See [GitHub Workflows README](../.github/workflows/README.md)
- **Backend Issues**: See [Backend Docs](https://github.com/fraidakis/software-engineering-2-backend)
- **API Reference**: Visit `http://localhost:3001/api-docs` when backend is running
