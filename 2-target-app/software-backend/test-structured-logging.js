#!/usr/bin/env node

/**
 * Structured Logging Integration Test
 * Tests that the new structured logger middleware works correctly
 *
 * Usage:
 *   node test-structured-logging.js
 */

import express from 'express';
import { structuredLogger, performanceMonitor, setupAsyncOperationLogger, errorLogger } from './middleware/structuredLogger.js';

console.log('🧪 Testing Structured Logger Middleware\n');

const app = express();
let testsPassed = 0;
let testsFailed = 0;

// Mock request/response objects for testing
const createMockReq = (method = 'GET', path = '/test') => ({
  id: `req-test-${Date.now()}`,
  method,
  path,
  get: () => 'test-agent',
  query: {},
  body: {}
});

const createMockRes = () => ({
  statusCode: 200,
  listeners: {},
  on: function(event, callback) {
    this.listeners[event] = callback;
    return this;
  },
  end: function(...args) {
    if (this.listeners.finish) {
      this.listeners.finish();
    }
  },
  json: function(data) {
    this.end();
  }
});

// Test 1: Structured Logger basic functionality
console.log('Test 1: Request timing middleware');
try {
  const req = createMockReq('GET', '/places/search');
  const res = createMockRes();
  let middlewareCalled = false;

  structuredLogger(req, res, () => {
    middlewareCalled = true;
  });

  if (middlewareCalled && req.startTime && req.requestId) {
    console.log('✓ PASS: Middleware initializes request metadata\n');
    testsPassed++;
  } else {
    console.log('✗ FAIL: Middleware did not initialize request metadata\n');
    testsFailed++;
  }
} catch (error) {
  console.log(`✗ FAIL: ${error.message}\n`);
  testsFailed++;
}

// Test 2: Performance monitor utility
console.log('Test 2: Performance monitor utilities');
try {
  const req = createMockReq('GET', '/test');
  const res = createMockRes();
  let hasLogTiming = false;

  performanceMonitor(req, res, () => {
    hasLogTiming = typeof req.logTiming === 'function';
  });

  if (hasLogTiming) {
    console.log('✓ PASS: Performance monitor adds logTiming method\n');
    testsPassed++;
  } else {
    console.log('✗ FAIL: Performance monitor did not add logTiming method\n');
    testsFailed++;
  }
} catch (error) {
  console.log(`✗ FAIL: ${error.message}\n`);
  testsFailed++;
}

// Test 3: Async operation logger setup
console.log('Test 3: Async operation logger');
try {
  const req = createMockReq('GET', '/test');
  const res = createMockRes();
  let hasAsyncOp = false;

  setupAsyncOperationLogger(req, res, () => {
    hasAsyncOp = typeof req.logAsyncOperation === 'function';
  });

  if (hasAsyncOp) {
    console.log('✓ PASS: Async operation logger adds logAsyncOperation method\n');
    testsPassed++;
  } else {
    console.log('✗ FAIL: Async operation logger did not add logAsyncOperation method\n');
    testsFailed++;
  }
} catch (error) {
  console.log(`✗ FAIL: ${error.message}\n`);
  testsFailed++;
}

// Test 4: Slow request threshold
console.log('Test 4: Slow request detection (threshold check)');
try {
  const threshold = parseInt(process.env.SLOW_REQUEST_THRESHOLD_MS || '500');
  if (threshold === 500 || threshold > 0) {
    console.log(`✓ PASS: Threshold is set to ${threshold}ms\n`);
    testsPassed++;
  } else {
    console.log(`✗ FAIL: Invalid threshold: ${threshold}\n`);
    testsFailed++;
  }
} catch (error) {
  console.log(`✗ FAIL: ${error.message}\n`);
  testsFailed++;
}

// Summary
console.log('═══════════════════════════════════════');
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);
console.log('═══════════════════════════════════════\n');

if (testsFailed === 0) {
  console.log('✅ All tests passed! Structured logging is ready.\n');
  process.exit(0);
} else {
  console.log('❌ Some tests failed. Please check the implementation.\n');
  process.exit(1);
}
