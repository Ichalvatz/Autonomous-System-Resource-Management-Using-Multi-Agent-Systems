# 🚀 MongoDB Documentation - Complete Guide

This guide explains how to configure and use MongoDB Atlas with the myWorld Travel API backend.

## 📋 Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Complete MongoDB Atlas Setup](#complete-mongodb-atlas-setup)
4. [Backend Configuration](#backend-configuration)
5. [Data Seeding & Persistence](#data-seeding--persistence)
6. [Switching Between Modes](#switching-between-modes)
7. [Troubleshooting](#troubleshooting)
8. [Resources](#resources)

---

## Overview

### Two Operating Modes

The backend supports **two database modes**:

#### 🟢 In-Memory Database (Default)
- ✅ No setup required
- ✅ Data loads automatically on every server start
- ✅ Perfect for development and deliverable #1
- ❌ Data is lost on server restart

#### 🔵 MongoDB Atlas (Optional)
- ✅ Permanent data storage
- ✅ Production-ready
- ✅ Better for testing (deliverable #2)
- ⚠️ Requires ~10 minutes setup

### What Happens Automatically

When using MongoDB:
1. **Connection** - Server connects to MongoDB on startup
2. **Auto-Seeding** - Mock data loads automatically the first time only
3. **Persistent Storage** - All changes are saved permanently

---

## Quick Start

### Option A: In-Memory Mode (RECOMMENDED FOR DELIVERABLE)

**Step 1:** Check your `.env` file:
```env
USE_MONGODB=false
```

**Step 2:** Start the server:
```bash 
bash start.sh
```

**That's it!** Backend runs with in-memory data.

---

### Option B: MongoDB Atlas (OPTIONAL)

**Step 1:** Create MongoDB Atlas account and get connection string (see [Complete Setup](#complete-mongodb-atlas-setup))

**Step 2:** Update `.env` file:
```env
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/myworld?retryWrites=true&w=majority
USE_MONGODB=true
```

**Step 3:** Start the server:
```bash
bash start.sh
```

---

## Complete MongoDB Atlas Setup

### Step 1: Create MongoDB Atlas Account

1. Go to: https://www.mongodb.com/cloud/atlas/register
2. Create a **free** account
3. Verify your email

### Step 2: Create Cluster

1. Once logged in, click **"Build a Database"**
2. Select **"M0 FREE"** (free tier)
3. Choose Provider: **AWS** or **Google Cloud**
4. Select Region: **Frankfurt (eu-central-1)** (closest to Greece)
5. Cluster Name: leave default or enter `myworld-cluster`
6. Click **"Create"**
7. Wait 3-5 minutes for cluster creation

### Step 3: Create Database User

1. Go to **"Database Access"** (left menu)
2. Click **"Add New Database User"**
3. Authentication Method: **Password**
4. Username: Enter a username (e.g., `myworld_admin`)
5. Password: Click **"Autogenerate Secure Password"** and **copy it!**
   
   ```
   IMPORTANT: Save the password in a secure location!
   ```

6. Database User Privileges: **"Read and write to any database"**
7. Click **"Add User"**

### Step 4: Network Access Configuration

1. Go to **"Network Access"** (left menu)
2. Click **"Add IP Address"**
3. Select **"ALLOW ACCESS FROM ANYWHERE"**
   - This will add IP: `0.0.0.0/0`
4. Click **"Confirm"**

⚠️ **Note**: For production, you should restrict the IP address!

### Step 5: Get Connection String

1. Go to **"Database"** (left menu)
2. Click **"Connect"** on your cluster
3. Select **"Connect your application"**
4. Driver: **Node.js**, Version: **4.1 or later**
5. Copy the **Connection String**

   It will look like:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

---

## Backend Configuration

### Update .env File

Open the `.env` file in the root directory and update:

```env
PORT=3000
JWT_SECRET=myworld_secret_key_2025_change_in_production
NODE_ENV=development

# MongoDB Configuration
MONGODB_URI=mongodb+srv://myworld_admin:YOUR_PASSWORD_HERE@cluster0.xxxxx.mongodb.net/myworld?retryWrites=true&w=majority
USE_MONGODB=true

CORS_ORIGIN=http://localhost:3000
```

**Replace:**
- `myworld_admin` → your username
- `YOUR_PASSWORD_HERE` → the password you copied
- `cluster0.xxxxx` → your cluster URL
- Add `/myworld` before the `?` to specify the database name

**Example:**
```env
MONGODB_URI=mongodb+srv://Mimis:MySecretPass123@cluster0.vmj4drr.mongodb.net/myworld?retryWrites=true&w=majority
USE_MONGODB=true
```

---

## Data Seeding & Persistence

### When Data is Loaded

#### In-Memory Mode:
- **Every time** the server starts
- Data is in `config/seedData.js`
- All changes lost on restart

#### MongoDB Mode:

**First Execution:**
1. Server connects to MongoDB
2. Checks if data exists (users collection)
3. **IF database is EMPTY** → Loads all mock data
4. **IF data exists** → Does nothing

**Subsequent Executions:**
- Data **ALREADY EXISTS** in the database
- No re-seeding
- All changes persist

### To Reload Data in MongoDB

If you want to reset and reload data:
1. Go to MongoDB Atlas
2. Collections → Browse Collections
3. Delete all collections
4. Restart the server

### What is Stored in MongoDB

**Collections created:**

1. **users** - User profiles and settings
   ```json
   {
     "userId": 1,
     "name": "Γιάννης Παπαδόπουλος",
     "email": "user1@example.com",
     ...
   }
   ```

2. **places** - Places/locations
   ```json
   {
     "placeId": 1,
     "name": "Ακρόπολη",
     "category": "MONUMENT",
     "city": "Αθήνα",
     ...
   }
   ```

3. **preferenceprofiles** - User preference profiles
4. **reviews** - Place reviews and ratings
5. **reports** - Problem reports
6. **favourites** - Favorite places
7. **dislikedplaces** - Disliked places
8. **settings** - User settings
9. **counters** - ID sequence counters

**Data preserved:**
- ✅ New users
- ✅ New preference profiles
- ✅ New reviews
- ✅ New favorites
- ✅ All changes (updates/deletes)

---

## Troubleshooting

### Connection Error
```
Error: connect ECONNREFUSED
```
**Solution**: Check MONGODB_URI in .env file

### Authentication Failed
```
Error: Authentication failed
```
**Solution**: Verify username/password in connection string

### Network Error
```
Error: connection timed out
```
**Solution**: Check Network Access in Atlas (Allow 0.0.0.0/0)

### Cannot Find Module 'mongoose'
```powershell
npm install mongoose
```

### MONGODB_URI Not Defined
```
Add MONGODB_URI to .env file
```

### Want to Switch from MongoDB to In-Memory
```
Change USE_MONGODB=false
Restart the server
```

---

## Resources

- MongoDB Atlas Documentation: https://docs.atlas.mongodb.com/
- Mongoose Documentation: https://mongoosejs.com/docs/guide.html
- Connection String Format: https://docs.mongodb.com/manual/reference/connection-string/
- Backend README: `README.md`

---
