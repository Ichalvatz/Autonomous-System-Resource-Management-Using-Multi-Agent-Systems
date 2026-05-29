/**
 * @fileoverview Unit Tests for HATEOAS Builder - User Links
 * @description This test suite validates the HATEOAS link generation for user-related
 * resources including profiles, settings, preferences, recommendations, and favourites.
 * 
 * @module tests/unit/hateoasBuilder.user.test
 * @requires ../../utils/hateoasBuilder
 */

import buildHateoasLinks from '../../utils/hateoasBuilder.js';

/**
 * HATEOAS Builder - User Links Test Suite
 * @description Tests link generation for user-related resources.
 */
describe('HATEOAS Builder - User Links', () => {
    describe('userProfile links', () => {
        it('should generate all user profile links', () => {
            const links = buildHateoasLinks.userProfile(1);

            expect(links).toHaveProperty('self');
            expect(links.self.href).toBe('/users/1/profile');
            expect(links).toHaveProperty('edit');
            expect(links).toHaveProperty('settings');
            expect(links).toHaveProperty('preference-profiles');
            expect(links).toHaveProperty('recommendations');
            expect(links).toHaveProperty('favourites');
        });
    });

    describe('settings links', () => {
        it('should generate settings links', () => {
            const links = buildHateoasLinks.settings(1);

            expect(links.self.href).toBe('/users/1/settings');
            expect(links.update.method).toBe('PUT');
            expect(links['user-profile'].href).toBe('/users/1/profile');
        });
    });

    describe('preferenceProfile links', () => {
        it('should generate preference profile links', () => {
            const links = buildHateoasLinks.preferenceProfile(1, 5);

            expect(links.self.href).toBe('/users/1/preference-profiles/5');
            expect(links.edit.href).toBe('/users/1/preference-profiles/5');
            expect(links.delete.href).toBe('/users/1/preference-profiles/5');
            expect(links.delete.method).toBe('DELETE');
        });
    });

    describe('preferenceProfilesCollection links', () => {
        it('should generate all collection links', () => {
            const links = buildHateoasLinks.preferenceProfilesCollection(1);

            expect(links.self.href).toBe('/users/1/preference-profiles');
            expect(links['create-profile']).toBeDefined();
            expect(links['create-profile'].href).toBe('/users/1/preference-profiles');
            expect(links['create-profile'].method).toBe('POST');
            expect(links['user-profile'].href).toBe('/users/1/profile');
        });
    });

    describe('recommendations links', () => {
        it('should generate recommendations links with user ID', () => {
            const links = buildHateoasLinks.recommendations(1);

            expect(links.refresh.href).toContain('/users/1/recommendations');
            expect(links['user-profile'].href).toBe('/users/1/profile');
        });
    });

    describe('favourites links', () => {
        it('should generate favourites collection links', () => {
            const links = buildHateoasLinks.favouritesCollection(1);

            expect(links.self.href).toBe('/users/1/favourite-places');
            expect(links['add-favourite'].method).toBe('POST');
            expect(links['user-profile'].href).toBe('/users/1/profile');
        });
    });

    describe('favourite links', () => {
        it('should generate favourite links with all parameters', () => {
            const links = buildHateoasLinks.favourite(1, 5, 10);

            expect(links.self.href).toBe('/users/1/favourite-places');
            expect(links.remove).toBeDefined();
            expect(links.remove.href).toBe('/users/1/favourite-places/5');
            expect(links.remove.method).toBe('DELETE');
            expect(links.place.href).toBe('/places/10');
            expect(links['user-profile'].href).toBe('/users/1/profile');
        });
    });

    describe('favouriteItem links', () => {
        it('should generate favourite item links', () => {
            const links = buildHateoasLinks.favouriteItem(1, 5, 10);

            expect(links.select).toBeDefined();
            expect(links.select.href).toBe('/places/10');
            expect(links.select.method).toBe('GET');
            expect(links['remove-favourite']).toBeDefined();
            expect(links['remove-favourite'].href).toBe('/users/1/favourite-places/5');
            expect(links['remove-favourite'].method).toBe('DELETE');
        });
    });

    describe('disliked places links', () => {
        it('should generate disliked place links', () => {
            const links = buildHateoasLinks.dislikedPlace(1);

            expect(links.recommendations.href).toContain('/users/1/recommendations');
            expect(links['user-profile'].href).toBe('/users/1/profile');
        });
    });

    describe('Edge cases - User IDs', () => {
        it('should handle string user IDs', () => {
            const links = buildHateoasLinks.userProfile('123');
            expect(links.self.href).toBe('/users/123/profile');
        });
    });
});
