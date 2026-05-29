/**
 * @fileoverview Integration Tests for Authentication Controller - Login
 * @description This test suite validates the user login authentication flow.
 * Tests cover successful login scenarios, input validation errors, and
 * authentication failures like invalid credentials or non-existent users.
 * 
 * @module tests/integration/auth.test
 * @requires ../helpers/testUtils
 */

import { api } from '../helpers/testUtils.js';

/**
 * Authentication Controller - Login Tests
 * @description Tests for user login functionality.
 */
describe('Authentication Controller - Login Tests', () => {
  const createUser = async (name, email, password) => {
    const response = await api.post('/auth/signup').send({ name, email, password });
    return response.body.data.user;
  };

  describe('POST /auth/login', () => {
    describe('Happy Path - Successful Login', () => {
      it('should return 200 and token when credentials are valid', async () => {
        await createUser('Login User', 'login@example.com', 'Test@12345');
        const response = await api.post('/auth/login').send({ email: 'login@example.com', password: 'Test@12345' });
        expect(response.status).toBe(200);
        expect(response.body.data).toHaveProperty('token');
        expect(response.body.data).toHaveProperty('user');
        expect(response.body.data.user.email).toBe('login@example.com');
      });

      it('should return proper JSON structure', async () => {
        await createUser('Structure Test', 'structure@example.com', 'Test@12345');
        const response = await api.post('/auth/login').send({ email: 'structure@example.com', password: 'Test@12345' });
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ success: true, data: { token: expect.any(String), user: { userId: expect.any(Number) } } });
      });
    });

    describe('Unhappy Path - Validation Errors', () => {
      it('should return 400 when email is missing', async () => {
        const response = await api.post('/auth/login').send({ password: 'Test@12345' });
        expect(response.status).toBe(400);
      });

      it('should return 400 when password is missing', async () => {
        const response = await api.post('/auth/login').send({ email: 'test@example.com' });
        expect(response.status).toBe(400);
      });

      it('should return 400 when email format is invalid', async () => {
        const response = await api.post('/auth/login').send({ email: 'invalid-email', password: 'Test@12345' });
        expect(response.status).toBe(400);
      });
    });

    describe('Unhappy Path - Authentication Failures', () => {
      it('should return 401 when user does not exist', async () => {
        const response = await api.post('/auth/login').send({ email: 'nonexistent@example.com', password: 'Test@12345' });
        expect(response.status).toBe(401);
      });

      it('should return 401 when password is incorrect', async () => {
        await createUser('Wrong Pass User', 'wrongpass@example.com', 'CorrectPassword123!');
        const response = await api.post('/auth/login').send({ email: 'wrongpass@example.com', password: 'WrongPassword123!' });
        expect(response.status).toBe(401);
      });

      it('should not reveal whether email exists', async () => {
        const response = await api.post('/auth/login').send({ email: 'nonexistent2@example.com', password: 'Test@12345' });
        expect(response.body.message).toMatch(/invalid email or password/i);
      });
    });
  });
});
