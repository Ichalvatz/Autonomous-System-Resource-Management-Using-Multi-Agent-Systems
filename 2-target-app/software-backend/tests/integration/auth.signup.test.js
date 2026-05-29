/**
 * @fileoverview Integration Tests for Authentication Controller - Signup
 * @description This test suite validates the user registration/signup flow.
 * Tests cover successful registration scenarios, input validation errors
 * (missing fields, invalid email, weak password), and conflict errors
 * when attempting to register with an existing email address.
 * 
 * @module tests/integration/auth.signup.test
 * @requires ../helpers/testUtils
 */

import { api } from '../helpers/testUtils.js';

/**
 * Authentication Controller - Signup Tests
 * @description Tests for user registration functionality.
 */
describe('Authentication Controller - Signup Tests', () => {
    describe('POST /auth/signup', () => {
        describe('Happy Path - Successful Registration', () => {
            it('should return 201 and token when registration data is valid', async () => {
                const response = await api.post('/auth/signup').send({ name: 'John Doe', email: 'john@example.com', password: 'Test@12345' });
                expect(response.status).toBe(201);
                expect(response.body.data).toHaveProperty('token');
                expect(response.body.data.user).toMatchObject({ name: 'John Doe', email: 'john@example.com', role: 'user' });
            });

            it('should return proper JSON structure', async () => {
                const response = await api.post('/auth/signup').send({ name: 'Jane Doe', email: 'jane@example.com', password: 'Test@12345' });
                expect(response.status).toBe(201);
                expect(response.body).toMatchObject({ success: true, data: { token: expect.any(String), user: { userId: expect.any(Number) } } });
            });

            it('should auto-assign user role', async () => {
                const response = await api.post('/auth/signup').send({ name: 'Alice Smith', email: 'alice@example.com', password: 'Test@12345' });
                expect(response.status).toBe(201);
                expect(response.body.data.user.role).toBe('user');
            });
        });

        describe('Unhappy Path - Validation Errors', () => {
            it('should return 400 when name is missing', async () => {
                const response = await api.post('/auth/signup').send({ email: 'test@example.com', password: 'Test@12345' });
                expect(response.status).toBe(400);
            });

            it('should return 400 when email is missing', async () => {
                const response = await api.post('/auth/signup').send({ name: 'Test User', password: 'Test@12345' });
                expect(response.status).toBe(400);
            });

            it('should return 400 when password is missing', async () => {
                const response = await api.post('/auth/signup').send({ name: 'Test User', email: 'test@example.com' });
                expect(response.status).toBe(400);
            });

            it('should return 400 when email format is invalid', async () => {
                const response = await api.post('/auth/signup').send({ name: 'Test User', email: 'invalid-email', password: 'Test@12345' });
                expect(response.status).toBe(400);
            });

            it('should return 400 when password is too weak', async () => {
                const response = await api.post('/auth/signup').send({ name: 'Test User', email: 'test@example.com', password: 'weak' });
                expect(response.status).toBe(400);
            });
        });

        describe('Unhappy Path - Conflict Errors', () => {
            it('should return 409 when email already exists', async () => {
                await api.post('/auth/signup').send({ name: 'Existing User', email: 'existing@example.com', password: 'Test@12345' });
                const response = await api.post('/auth/signup').send({ name: 'Another User', email: 'existing@example.com', password: 'Test@12345' });
                expect(response.status).toBe(409);
            });

            it('should provide clear error message for duplicate email', async () => {
                await api.post('/auth/signup').send({ name: 'First User', email: 'duplicate@example.com', password: 'Test@12345' });
                const response = await api.post('/auth/signup').send({ name: 'Second User', email: 'duplicate@example.com', password: 'Test@12345' });
                expect(response.body.message).toMatch(/already exists|email/i);
            });
        });
    });
});
