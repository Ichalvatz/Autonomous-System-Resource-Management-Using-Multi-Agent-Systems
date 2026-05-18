/**
 * @fileoverview Response Utilities Tests - Success Responses
 * @module tests/unit/responses.success.test
 * 
 * Tests standardized success response functions for HTTP responses.
 * Verifies status codes, data structure, and pagination metadata.
 */

import {
    sendSuccess,
    sendCreated,
    sendNoContent,
    sendPaginatedResponse
} from '../../utils/responses.js';
import { createMockRes } from '../helpers/mockUtils.js';

/**
 * Test suite for success response utility functions.
 * Tests sendSuccess, sendCreated, sendNoContent, sendPaginatedResponse.
 */
describe('Response Utilities - Success Responses', () => {

    // Tests for generic success response with data and optional meta
    describe('sendSuccess()', () => {

        // Validates correct response structure and status codes
        describe('Happy Path - Success Responses', () => {

            it('should return 200 with data', () => {
                const res = createMockRes();
                const testData = { userId: 1, username: 'test' };

                sendSuccess(res, testData);

                expect(res.statusCode).toBe(200);
                expect(res.jsonData.success).toBe(true);
                expect(res.jsonData.data).toEqual(testData);
            });

            it('should accept custom status code', () => {
                const res = createMockRes();

                sendSuccess(res, { message: 'ok' }, 202);

                expect(res.statusCode).toBe(202);
                expect(res.jsonData.success).toBe(true);
            });

            it('should include meta when provided', () => {
                const res = createMockRes();
                const meta = { page: 1, total: 100 };

                sendSuccess(res, [], 200, meta);

                expect(res.jsonData.meta).toEqual(meta);
            });

            it('should NOT include meta when null', () => {
                const res = createMockRes();

                sendSuccess(res, { test: 'data' });

                expect(res.jsonData.meta).toBeUndefined();
            });

        });

    });

    describe('sendCreated()', () => {

        it('should return 201 with success message', () => {
            const res = createMockRes();
            const newResource = { id: 123, name: 'New Resource' };

            sendCreated(res, newResource);

            expect(res.statusCode).toBe(201);
            expect(res.jsonData.success).toBe(true);
            expect(res.jsonData.data).toEqual(newResource);
            expect(res.jsonData.message).toBe('Resource created successfully');
        });

        it('should accept custom message', () => {
            const res = createMockRes();

            sendCreated(res, { id: 1 }, 'User created!');

            expect(res.jsonData.message).toBe('User created!');
        });

    });

    describe('sendNoContent()', () => {

        it('should return 204 without body', () => {
            const res = createMockRes();

            sendNoContent(res);

            expect(res.statusCode).toBe(204);
            expect(res.sendCalled).toBe(true);
        });

    });

    describe('sendPaginatedResponse()', () => {

        describe('Happy Path - Paginated Data', () => {

            it('should return paginated data with meta', () => {
                const res = createMockRes();
                const items = [{ id: 1 }, { id: 2 }, { id: 3 }];

                sendPaginatedResponse(res, { items, page: 1, pageSize: 10, total: 30 });

                expect(res.jsonData.success).toBe(true);
                expect(res.jsonData.data).toEqual(items);
                expect(res.jsonData.meta.page).toBe(1);
                expect(res.jsonData.meta.pageSize).toBe(10);
                expect(res.jsonData.meta.total).toBe(30);
                expect(res.jsonData.meta.totalPages).toBe(3);
            });

            it('should calculate correctly the totalPages', () => {
                const res = createMockRes();

                sendPaginatedResponse(res, { items: [], page: 1, pageSize: 10, total: 25 });

                expect(res.jsonData.meta.totalPages).toBe(3); // Math.ceil(25/10)
            });

            it('should show hasNextPage correctly', () => {
                const res1 = createMockRes();
                const res2 = createMockRes();

                sendPaginatedResponse(res1, { items: [], page: 1, pageSize: 10, total: 30 });
                sendPaginatedResponse(res2, { items: [], page: 3, pageSize: 10, total: 30 });

                expect(res1.jsonData.meta.hasNextPage).toBe(true);
                expect(res2.jsonData.meta.hasNextPage).toBe(false);
            });

            it('should show hasPrevPage correctly', () => {
                const res1 = createMockRes();
                const res2 = createMockRes();

                sendPaginatedResponse(res1, { items: [], page: 1, pageSize: 10, total: 30 });
                sendPaginatedResponse(res2, { items: [], page: 2, pageSize: 10, total: 30 });

                expect(res1.jsonData.meta.hasPrevPage).toBe(false);
                expect(res2.jsonData.meta.hasPrevPage).toBe(true);
            });

        });

        describe('Edge Cases', () => {

            it('should handle empty results', () => {
                const res = createMockRes();

                sendPaginatedResponse(res, { items: [], page: 1, pageSize: 10, total: 0 });

                expect(res.jsonData.data).toEqual([]);
                expect(res.jsonData.meta.total).toBe(0);
                expect(res.jsonData.meta.totalPages).toBe(0);
            });

            it('should handle single page', () => {
                const res = createMockRes();

                sendPaginatedResponse(res, { items: [1, 2, 3], page: 1, pageSize: 10, total: 3 });

                expect(res.jsonData.meta.totalPages).toBe(1);
                expect(res.jsonData.meta.hasNextPage).toBe(false);
                expect(res.jsonData.meta.hasPrevPage).toBe(false);
            });

        });

    });

});
