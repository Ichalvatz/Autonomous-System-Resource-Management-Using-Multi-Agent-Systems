/**
 * @fileoverview Security Tests - JWT Token Handling & Authorization
 * @description This test suite validates JWT token security including expiry,
 * malformed tokens, and authorization bypass prevention.
 * 
 * @module tests/integration/security.auth.test
 * @requires ../helpers/testUtils
 * @requires ../../config/db
 */

import { api, createAuthenticatedUser, createAuthenticatedAdmin, generateExpiredToken, authRequest } from '../helpers/testUtils.js';
import db from '../../config/db.js';

/**
 * Security Tests - JWT & Authorization
 * @description Tests for JWT token handling and authorization.
 */
describe('Security Tests - JWT & Authorization', () => {
    describe('JWT Token Handling', () => {
        describe('Token Expiry', () => {
            it('should reject expired tokens', async () => {
                const { user } = await createAuthenticatedUser({ email: 'expired@test.com' });
                const expiredToken = generateExpiredToken(user);
                const response = await api.get(`/users/${user.userId}/profile`).set('Authorization', `Bearer ${expiredToken}`);
                expect(response.status).toBe(401);
                expect(response.body.error).toBe('TOKEN_EXPIRED');
            });
        });

        describe('Invalid Tokens', () => {
            it('should reject malformed tokens', async () => {
                const response = await api.get('/users/1/profile').set('Authorization', 'Bearer invalid.token.here');
                expect(response.status).toBe(401);
                expect(response.body.error).toBe('INVALID_TOKEN');
            });

            it('should reject tokens without Bearer prefix', async () => {
                const { token } = await createAuthenticatedUser({ email: 'nobearer@test.com' });
                const response = await api.get('/users/1/profile').set('Authorization', token);
                expect(response.status).toBe(401);
            });

            it('should reject empty Authorization header', async () => {
                const response = await api.get('/users/1/profile').set('Authorization', '');
                expect(response.status).toBe(401);
            });

            it('should reject Bearer without token', async () => {
                const response = await api.get('/users/1/profile').set('Authorization', 'Bearer ');
                expect(response.status).toBe(401);
            });
        });
    });

    describe('Authorization Bypass Prevention', () => {
        describe('User Resource Access', () => {
            it('should prevent accessing another user profile', async () => {
                const { token: token1 } = await createAuthenticatedUser({ email: 'user1profile@test.com' });
                const { user: user2 } = await createAuthenticatedUser({ email: 'user2profile@test.com' });
                const response = await authRequest(token1).get(`/users/${user2.userId}/profile`);
                expect(response.status).toBe(403);
            });

            it('should prevent modifying another user favourites', async () => {
                const { token: token1 } = await createAuthenticatedUser({ email: 'user1fav@test.com' });
                const { user: user2 } = await createAuthenticatedUser({ email: 'user2fav@test.com' });
                const place = await db.createPlace({ name: 'Fav Test Place', category: 'RESTAURANT', description: 'Test', location: { latitude: 40.64, longitude: 22.94 } });
                const response = await api.post(`/users/${user2.userId}/favourite-places`).set('Authorization', `Bearer ${token1}`).send({ placeId: place.placeId });
                expect(response.status).toBe(403);
            });

            it('should prevent modifying another user settings', async () => {
                const { token: token1 } = await createAuthenticatedUser({ email: 'user1settings@test.com' });
                const { user: user2 } = await createAuthenticatedUser({ email: 'user2settings@test.com' });
                const response = await api.put(`/users/${user2.userId}/settings`).set('Authorization', `Bearer ${token1}`).send({ emailNotifications: false });
                expect(response.status).toBe(403);
            });

            it('should prevent accessing another user preference profiles', async () => {
                const { token: token1 } = await createAuthenticatedUser({ email: 'user1prefs@test.com' });
                const { user: user2 } = await createAuthenticatedUser({ email: 'user2prefs@test.com' });
                const response = await api.get(`/users/${user2.userId}/preference-profiles`).set('Authorization', `Bearer ${token1}`);
                expect(response.status).toBe(403);
            });
        });

        describe('Admin Endpoint Protection', () => {
            it('should reject admin endpoints for regular users', async () => {
                const { user, token } = await createAuthenticatedUser({ email: 'regularuser@test.com' });
                await db.createPlace({ name: 'Admin Test Place', category: 'MUSEUM', description: 'Test', location: { latitude: 40.64, longitude: 22.94 } });
                const response = await api.get(`/admin/${user.userId}/places/1/reports`).set('Authorization', `Bearer ${token}`);
                expect(response.status).toBe(403);
            });

            it('should allow admin access to admin endpoints', async () => {
                const { token } = await createAuthenticatedAdmin({ email: 'adminaccess@test.com' });
                const place = await db.createPlace({ name: 'Admin Access Test', category: 'MUSEUM', description: 'Test', location: { latitude: 40.64, longitude: 22.94 } });
                const response = await api.get(`/admin/1/places/${place.placeId}/reports`).set('Authorization', `Bearer ${token}`);
                expect([200, 404]).toContain(response.status);
            });
        });
    });
});
