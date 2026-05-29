/**
 * @fileoverview Security Tests - Input Validation & Headers
 * @description This test suite validates security features including XSS prevention,
 * input length limits, auth validation, request ID tracing, and security headers.
 * 
 * @module tests/integration/security.test
 * @requires ../helpers/testUtils
 * @requires ../../config/db
 */

import { api, createAuthenticatedUser } from '../helpers/testUtils.js';
import db from '../../config/db.js';

/**
 * Security Tests - Input Validation
 * @description Tests for input validation and security headers.
 */
describe('Security Tests - Input Validation', () => {
    describe('XSS Prevention', () => {
        it('should sanitize XSS in review comments', async () => {
            const { token } = await createAuthenticatedUser({ email: 'xsstest@test.com' });
            const place = await db.createPlace({ name: 'XSS Test Place', category: 'RESTAURANT', description: 'Test', location: { latitude: 40.64, longitude: 22.94 } });
            const response = await api.post(`/places/${place.placeId}/reviews`).set('Authorization', `Bearer ${token}`)
                .send({ rating: 5, comment: '<script>alert("XSS")</script>Great place!' });
            if (response.status === 201) {
                expect(response.body.data.review.comment).not.toContain('<script>');
                expect(response.body.data.review.comment).toContain('Great place!');
            }
        });

        it('should sanitize XSS in report descriptions', async () => {
            const { token } = await createAuthenticatedUser({ email: 'xssreport@test.com' });
            const place = await db.createPlace({ name: 'XSS Report Test', category: 'MUSEUM', description: 'Test', location: { latitude: 40.64, longitude: 22.94 } });
            const response = await api.post(`/places/${place.placeId}/reports`).set('Authorization', `Bearer ${token}`)
                .send({ description: '<img src=x onerror="alert(1)">Invalid hours' });
            if (response.status === 201) {
                expect(response.body.data.report.description).not.toContain('<img');
            }
        });
    });

    describe('Input Length Limits', () => {
        it('should handle very long name in signup', async () => {
            const response = await api.post('/auth/signup')
                .send({ name: 'a'.repeat(10000), email: 'longname@test.com', password: 'Test@12345' });
            expect([201, 400]).toContain(response.status);
            expect(response.body).toHaveProperty('success');
        });

        it('should limit review comment length', async () => {
            const { token } = await createAuthenticatedUser({ email: 'longcomment@test.com' });
            const place = await db.createPlace({ name: 'Long Comment Test', category: 'RESTAURANT', description: 'Test', location: { latitude: 40.64, longitude: 22.94 } });
            const response = await api.post(`/places/${place.placeId}/reviews`).set('Authorization', `Bearer ${token}`)
                .send({ rating: 4, comment: 'x'.repeat(10000) });
            if (response.status === 201) {
                expect(response.body.data.review.comment.length).toBeLessThanOrEqual(500);
            }
        });
    });

    describe('Auth Validation', () => {
        it('should reject signup with empty email', async () => {
            const response = await api.post('/auth/signup').send({ name: 'Test User', email: '', password: 'Test@12345' });
            expect(response.status).toBe(400);
        });

        it('should reject signup with invalid email format', async () => {
            const response = await api.post('/auth/signup').send({ name: 'Test User', email: 'not-an-email', password: 'Test@12345' });
            expect(response.status).toBe(400);
        });

        it('should reject login with empty password', async () => {
            const response = await api.post('/auth/login').send({ email: 'test@example.com', password: '' });
            expect(response.status).toBe(400);
        });
    });

    describe('Request ID Tracing', () => {
        it('should return X-Request-ID header', async () => {
            const response = await api.get('/health');
            expect(response.status).toBe(200);
            expect(response.headers).toHaveProperty('x-request-id');
        });

        it('should echo back provided X-Request-ID', async () => {
            const customRequestId = 'test-request-id-12345';
            const response = await api.get('/health').set('X-Request-ID', customRequestId);
            expect(response.headers['x-request-id']).toBe(customRequestId);
        });
    });

    describe('Security Headers', () => {
        it('should include security headers from helmet', async () => {
            const response = await api.get('/health');
            expect(response.headers).toHaveProperty('x-content-type-options');
            expect(response.headers['x-content-type-options']).toBe('nosniff');
        });
    });
});
