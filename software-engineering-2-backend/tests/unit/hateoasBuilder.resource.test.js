/**
 * @fileoverview Unit Tests for HATEOAS Builder - Resource Links
 * @description This test suite validates the HATEOAS (Hypermedia as the Engine of Application State)
 * link generation functionality for various API resources. Tests ensure that proper navigational
 * links are generated for places, reviews, navigation, admin resources, and search operations.
 * 
 * @module tests/unit/hateoasBuilder.resource.test
 * @requires ../../utils/hateoasBuilder
 * 
 * @see {@link https://restfulapi.net/hateoas/} for HATEOAS principles
 * 
 * Resources tested:
 * - Place links (with and without user context)
 * - Place with website links
 * - Search links
 * - Review links
 * - Report links
 * - Navigation links
 * - Admin links
 * - Select links
 */

import buildHateoasLinks from '../../utils/hateoasBuilder.js';

/**
 * HATEOAS Builder - Resource Links Test Suite
 * 
 * @description Comprehensive unit tests for the HATEOAS link builder utility.
 * These tests validate that the correct links are generated for each resource type,
 * including proper href values, HTTP methods, and conditional link inclusion
 * based on user context and other parameters.
 */
describe('HATEOAS Builder - Resource Links', () => {
    /**
     * Place Links Tests
     * 
     * @description Tests for generating HATEOAS links for place resources.
     * Place links include navigation to reviews, reports, and conditionally
     * user-specific actions like adding to favourites.
     */
    describe('place links', () => {
        /**
         * @test Verifies standard place links are generated correctly
         * @expected Links include self, reviews, add-review, and add-report
         */
        it('should generate place links', () => {
            // Generate links for place with ID 10
            const links = buildHateoasLinks.place(10);

            // Verify all standard place links are present
            expect(links.self.href).toBe('/places/10');
            expect(links['see-reviews'].href).toBe('/places/10/reviews');
            expect(links['add-review'].href).toBe('/places/10/reviews');
            expect(links['add-report'].href).toBe('/places/10/reports');
        });

        /**
         * @test Verifies user-specific links are included when userId is provided
         * @expected Links include add-to-favourites, add-to-disliked, and user-profile
         */
        it('should include user-specific links when userId is provided', () => {
            // Generate links with both place ID and user context
            const links = buildHateoasLinks.place(10, 1);

            // Verify standard links
            expect(links.self.href).toBe('/places/10');

            // Verify user-specific links for favourites
            expect(links['add-to-favourites']).toBeDefined();
            expect(links['add-to-favourites'].href).toBe('/users/1/favourite-places');
            expect(links['add-to-favourites'].method).toBe('POST');

            // Verify user-specific links for disliked places
            expect(links['add-to-disliked']).toBeDefined();
            expect(links['add-to-disliked'].href).toBe('/users/1/disliked-places');

            // Verify user profile link
            expect(links['user-profile']).toBeDefined();
            expect(links['user-profile'].href).toBe('/users/1/profile');
        });

        /**
         * @test Verifies user links are excluded when userId is null
         * @expected User-specific links are not present in the response
         */
        it('should not include user links when userId is null', () => {
            // Generate links without user context
            const links = buildHateoasLinks.place(10, null);

            // User-specific links should not be present
            expect(links['add-to-favourites']).toBeUndefined();
            expect(links['add-to-disliked']).toBeUndefined();
            expect(links['user-profile']).toBeUndefined();
        });
    });

    /**
     * Place with Website Links Tests
     * 
     * @description Tests for place links that include external website references.
     * Website links are conditionally included based on whether the place has a website URL.
     */
    describe('placeWithWebsite links', () => {
        /**
         * @test Verifies website link is included when URL is provided
         * @expected Website link has correct href, method, and content type
         */
        it('should generate place links with website when websiteUrl is provided', () => {
            // Generate links with website URL
            const links = buildHateoasLinks.placeWithWebsite(10, 'https://example.com');

            // Verify standard place link
            expect(links.self.href).toBe('/places/10');

            // Verify website link properties
            expect(links.website).toBeDefined();
            expect(links.website.href).toBe('https://example.com');
            expect(links.website.method).toBe('GET');
            expect(links.website.type).toBe('text/html');
        });

        /**
         * @test Verifies website link is excluded when URL is null
         * @expected Website link is not present in the response
         */
        it('should not include website link when websiteUrl is null', () => {
            const links = buildHateoasLinks.placeWithWebsite(10, null);

            expect(links.self.href).toBe('/places/10');
            expect(links.website).toBeUndefined();
        });

        /**
         * @test Verifies website link is excluded when URL is undefined
         * @expected Website link is not present in the response
         */
        it('should not include website link when websiteUrl is undefined', () => {
            const links = buildHateoasLinks.placeWithWebsite(10, undefined);

            expect(links.website).toBeUndefined();
        });

        /**
         * @test Verifies website link is excluded when URL is empty string
         * @expected Website link is not present for empty strings
         */
        it('should not include website link when websiteUrl is empty string', () => {
            const links = buildHateoasLinks.placeWithWebsite(10, '');

            expect(links.website).toBeUndefined();
        });

        /**
         * @test Verifies user links are included alongside website link
         * @expected Both website and user-specific links are present
         */
        it('should include user links when userId is provided', () => {
            // Generate links with both website and user context
            const links = buildHateoasLinks.placeWithWebsite(10, 'https://example.com', 1);

            // Verify both website and user links are present
            expect(links.website.href).toBe('https://example.com');
            expect(links['add-to-favourites']).toBeDefined();
            expect(links['add-to-favourites'].href).toBe('/users/1/favourite-places');
            expect(links['add-to-disliked']).toBeDefined();
            expect(links['user-profile'].href).toBe('/users/1/profile');
        });
    });

    /**
     * Search Links Tests
     * 
     * @description Tests for generating HATEOAS links for search operations.
     * Search links include templated URLs for refining search queries.
     */
    describe('search links', () => {
        /**
         * @test Verifies basic search links are generated
         * @expected Includes refine-search link with URL template
         */
        it('should generate search links', () => {
            const links = buildHateoasLinks.search();

            // Verify templated search URL (RFC 6570 URI Template)
            expect(links['refine-search'].href).toBe('/places/search{?keywords}');
        });

        /**
         * @test Verifies user profile link is included when userId is provided
         * @expected Both search and user-profile links are present
         */
        it('should include user-profile link when userId is provided', () => {
            // Generate search links with user context
            const links = buildHateoasLinks.search(1);

            expect(links['refine-search'].href).toBe('/places/search{?keywords}');
            expect(links['user-profile']).toBeDefined();
            expect(links['user-profile'].href).toBe('/users/1/profile');
        });
    });

    /**
     * Review Links Tests
     * 
     * @description Tests for generating HATEOAS links for review resources.
     * Review links connect reviews to their parent place resource.
     */
    describe('review links', () => {
        /**
         * @test Verifies review links include reference to parent place
         * @expected Links include self (reviews collection) and place reference
         */
        it('should generate review links with place ID', () => {
            const links = buildHateoasLinks.review(10);

            // Verify review collection and parent place links
            expect(links.self.href).toBe('/places/10/reviews');
            expect(links.place.href).toBe('/places/10');
        });

        /**
         * @test Verifies user profile link is included when userId is provided
         * @expected User profile link is added to review links
         */
        it('should include user-profile link when userId is provided', () => {
            const links = buildHateoasLinks.review(10, 1);

            expect(links.self.href).toBe('/places/10/reviews');
            expect(links.place.href).toBe('/places/10');
            expect(links['user-profile']).toBeDefined();
            expect(links['user-profile'].href).toBe('/users/1/profile');
        });
    });

    /**
     * Reviews Collection Links with User Context Tests
     * 
     * @description Tests for reviews collection links that include user context.
     */
    describe('reviews links with userId', () => {
        /**
         * @test Verifies user profile link in reviews collection
         * @expected User profile link is included when userId is provided
         */
        it('should include user-profile link when userId is provided', () => {
            const links = buildHateoasLinks.reviews(10, 1);

            expect(links.self.href).toBe('/places/10/reviews');
            expect(links['user-profile']).toBeDefined();
            expect(links['user-profile'].href).toBe('/users/1/profile');
        });

        /**
         * @test Verifies user profile link is excluded when userId is null
         * @expected User profile link is not present
         */
        it('should not include user-profile when userId is null', () => {
            const links = buildHateoasLinks.reviews(10, null);

            expect(links['user-profile']).toBeUndefined();
        });
    });

    /**
     * Report Links Tests
     * 
     * @description Tests for generating HATEOAS links for report resources.
     * Reports are associated with places and can include user context.
     */
    describe('report links', () => {
        /**
         * @test Verifies report links include reference to place
         * @expected Links include place reference
         */
        it('should generate report links with place ID', () => {
            const links = buildHateoasLinks.report(10);

            expect(links.place.href).toBe('/places/10');
        });

        /**
         * @test Verifies user profile link is included when userId is provided
         * @expected Both place and user-profile links are present
         */
        it('should include user-profile link when userId is provided', () => {
            const links = buildHateoasLinks.report(10, 1);

            expect(links.place.href).toBe('/places/10');
            expect(links['user-profile']).toBeDefined();
            expect(links['user-profile'].href).toBe('/users/1/profile');
        });
    });

    /**
     * Navigation Links Tests
     * 
     * @description Tests for generating HATEOAS links for navigation/routing resources.
     * Navigation links support alternative routes and destination references.
     */
    describe('navigation links', () => {
        /**
         * @test Verifies basic navigation links are generated
         * @expected Includes alternative-routes link
         */
        it('should generate navigation links', () => {
            const links = buildHateoasLinks.navigation();

            // Verify navigation links include alternative routes
            expect(links['alternative-routes'].href).toContain('/navigation');
            expect(links['alternative-routes'].method).toBe('GET');
        });

        /**
         * @test Verifies destination link is included when placeId is provided
         * @expected Destination link references the target place
         */
        it('should include destination link when placeId is provided', () => {
            const links = buildHateoasLinks.navigation(10);

            expect(links.destination).toBeDefined();
            expect(links.destination.href).toBe('/places/10');
            expect(links.destination.method).toBe('GET');
        });

        /**
         * @test Verifies user profile link without destination
         * @expected User profile is included, destination is not
         */
        it('should include user-profile when userId is provided', () => {
            // Generate navigation links with user but no destination
            const links = buildHateoasLinks.navigation(null, 1);

            expect(links.destination).toBeUndefined();
            expect(links['user-profile']).toBeDefined();
            expect(links['user-profile'].href).toBe('/users/1/profile');
        });

        /**
         * @test Verifies both destination and user profile links
         * @expected Both links are present when both IDs are provided
         */
        it('should include both destination and user-profile when both are provided', () => {
            const links = buildHateoasLinks.navigation(10, 1);

            expect(links.destination.href).toBe('/places/10');
            expect(links['user-profile'].href).toBe('/users/1/profile');
        });
    });

    /**
     * Admin Links Tests
     * 
     * @description Tests for generating HATEOAS links for admin resources.
     * Admin links provide management capabilities for places and reports.
     */
    describe('admin links', () => {
        /**
         * @test Verifies admin report collection links
         * @expected Self link includes admin path with user and place IDs
         */
        it('should generate admin report collection links', () => {
            const links = buildHateoasLinks.adminReportsCollection(1, 10);

            expect(links.self.href).toBe('/admin/1/places/10/reports');
        });

        /**
         * @test Verifies admin report links with edit capability
         * @expected Includes place reference and edit-place action link
         */
        it('should generate admin report links', () => {
            const links = buildHateoasLinks.adminReport(10, 1);

            expect(links.place.href).toBe('/places/10');
            expect(links['edit-place']).toBeDefined();
            expect(links['edit-place'].href).toBe('/admin/1/places/10');
            expect(links['edit-place'].method).toBe('PUT');
        });

        /**
         * @test Verifies admin place links with multiple parameters
         * @expected Includes self, edit, and reports links
         */
        it('should handle multiple parameters correctly', () => {
            const links = buildHateoasLinks.adminPlace(2, 1);

            // Verify all admin place management links
            expect(links.self.href).toBe('/places/2');
            expect(links.edit.href).toBe('/admin/1/places/2');
            expect(links.reports.href).toBe('/admin/1/places/2/reports');
        });
    });

    /**
     * Select Link Tests
     * 
     * @description Tests for generating selection links for places.
     * Select links provide a simple way to retrieve place details.
     */
    describe('selectLink', () => {
        /**
         * @test Verifies select link generation
         * @expected Select link points to place details with GET method
         */
        it('should generate select link for a place', () => {
            const links = buildHateoasLinks.selectLink(10);

            expect(links.select).toBeDefined();
            expect(links.select.href).toBe('/places/10');
            expect(links.select.method).toBe('GET');
        });
    });

    /**
     * Edge Case Tests - Large IDs
     * 
     * @description Tests for handling edge cases like very large ID values.
     * Ensures the link builder doesn't break with unusual input values.
     */
    describe('Edge cases - Large IDs', () => {
        /**
         * @test Verifies handling of large ID numbers
         * @expected Large IDs are properly included in link URLs
         */
        it('should handle large ID numbers', () => {
            // Test with 6-digit ID number
            const links = buildHateoasLinks.place(999999);
            expect(links.self.href).toBe('/places/999999');
        });
    });
});
