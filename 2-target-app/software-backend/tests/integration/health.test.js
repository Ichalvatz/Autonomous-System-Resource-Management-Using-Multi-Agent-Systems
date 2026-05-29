/**
 * @fileoverview Integration Test for Health Check Endpoint
 * @description This test suite verifies the health check endpoint is responding correctly. 
 * Tests the /health endpoint to verify:
 * - Server is running and responding
 * - Health status information is returned
 * - Response format and timestamps are valid
 */

import { api } from '../helpers/testUtils.js';

describe('Health Check Endpoint', () => {
  describe('GET /health', () => {
    it('should return 200 and health status', async () => {
      const response = await api.get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });

    it('should return valid timestamp', async () => {
      const response = await api.get('/health');

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).not.toBeNaN();
    });
  });
});
