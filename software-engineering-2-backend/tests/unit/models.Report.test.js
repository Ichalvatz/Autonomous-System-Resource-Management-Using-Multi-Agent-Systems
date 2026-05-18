/**
 * @fileoverview Report Model Unit Tests
 * Tests static and instance methods for function coverage
 */

import Report from '../../models/Report.js';
import {
    setupMongoDb,
    teardownMongoDb,
    clearMongoDbData
} from '../helpers/mongoDbSetup.js';

describe('Report Model', () => {
    // Initialize test database connection
    beforeAll(async () => {
        await setupMongoDb();
    });

    // Clean up database connection
    afterAll(async () => {
        await teardownMongoDb();
    });

    // Clear data between tests for isolation
    beforeEach(async () => {
        await clearMongoDbData();
    });

    describe('Static Methods', () => {
        // Create test reports with different statuses
        beforeEach(async () => {
            await Report.create({ reportId: 1, userId: 100, placeId: 200, description: 'Issue 1', status: 'PENDING' });
            await Report.create({ reportId: 2, userId: 100, placeId: 201, description: 'Issue 2', status: 'REVIEWED' });
            await Report.create({ reportId: 3, userId: 101, placeId: 200, description: 'Issue 3', status: 'RESOLVED' });
            await Report.create({ reportId: 4, userId: 102, placeId: 202, description: 'Issue 4', status: 'PENDING' });
        });

        test('findByStatus returns reports with matching status', async () => {
            const results = await Report.findByStatus('PENDING');
            expect(results).toHaveLength(2);
            results.forEach(r => expect(r.status).toBe('PENDING'));
        });

        test('findByStatus returns empty for rare status', async () => {
            const results = await Report.findByStatus('UNKNOWN');
            expect(results).toHaveLength(0);
        });

        test('findPending returns only pending reports', async () => {
            const results = await Report.findPending();
            expect(results).toHaveLength(2);
            results.forEach(r => expect(r.status).toBe('PENDING'));
        });

        test('findByPlaceId returns reports for specific place', async () => {
            const results = await Report.findByPlaceId(200);
            expect(results).toHaveLength(2);
        });

        test('findByPlaceId returns empty for unknown place', async () => {
            const results = await Report.findByPlaceId(999);
            expect(results).toHaveLength(0);
        });
    });

    describe('Instance Methods', () => {
        test('resolve sets status to RESOLVED and resolvedAt', async () => {
            const report = await Report.create({
                reportId: 10, userId: 100, placeId: 200, description: 'Test'
            });
            await report.resolve();

            const updated = await Report.findOne({ reportId: 10 });
            expect(updated.status).toBe('RESOLVED');
            expect(updated.resolvedAt).toBeDefined();
        });

        test('markReviewed sets status to REVIEWED', async () => {
            const report = await Report.create({
                reportId: 11, userId: 100, placeId: 200, description: 'Test'
            });
            await report.markReviewed();

            const updated = await Report.findOne({ reportId: 11 });
            expect(updated.status).toBe('REVIEWED');
        });

        // Test pending status check
        test('isPending returns true for pending report', async () => {
            const report = await Report.create({
                reportId: 20, userId: 100, placeId: 200, description: 'Test'
            });
            expect(report.isPending()).toBe(true);
        });

        // Test pending status for resolved report
        test('isPending returns false for resolved report', async () => {
            const report = await Report.create({
                reportId: 21, userId: 100, placeId: 200, description: 'Test', status: 'RESOLVED'
            });
            expect(report.isPending()).toBe(false);
        });

        // Test resolved status check
        test('isResolved returns true for resolved report', async () => {
            const report = await Report.create({
                reportId: 30, userId: 100, placeId: 200, description: 'Test', status: 'RESOLVED'
            });
            expect(report.isResolved()).toBe(true);
        });

        // Test resolved status for pending report
        test('isResolved returns false for pending report', async () => {
            const report = await Report.create({
                reportId: 31, userId: 100, placeId: 200, description: 'Test'
            });
            expect(report.isResolved()).toBe(false);
        });
    });
});
