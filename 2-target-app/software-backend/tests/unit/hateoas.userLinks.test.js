/**
 * Test suite for HATEOAS user links generation
 * Validates that hypermedia links are correctly generated for user-related resources
 */
import userLinks from '../../utils/hateoas/userLinks.js';

describe('userLinks', () => {
    // Sample IDs for testing link generation across different resource types
    const userId = 'user123';
    const profileId = 'profile456';
    const favouriteId = 'fav789';
    const placeId = 'place321';

    /**
     * Test user profile links generation
     * Verifies all navigational links from the user profile endpoint
     */
    test('userProfile links', () => {
        // Execute the userProfile link builder with test user ID
        expect(userLinks.userProfile(userId)).toEqual({
            // Self-reference link for retrieving user profile
            self: { href: `/users/${userId}/profile`, method: 'GET' },
            // Link to update profile information
            edit: { href: `/users/${userId}/profile`, method: 'PUT' },
            // Navigation to user settings
            settings: { href: `/users/${userId}/settings`, method: 'GET' },
            // Access to user's preference profiles collection
            'preference-profiles': { href: `/users/${userId}/preference-profiles`, method: 'GET' },
            // Action to create new preference profile
            'create-profile': { href: `/users/${userId}/preference-profiles`, method: 'POST' },
            // Templated link to recommendations with optional location parameter
            recommendations: { href: `/users/${userId}/recommendations{?currentLocation}`, method: 'GET' },
            // Link to user's favourite places collection
            favourites: { href: `/users/${userId}/favourite-places`, method: 'GET' }
        });
    });

    /**
     * Test settings resource links
     * Validates links for user settings management
     */
    test('settings links', () => {
        // Execute the settings link builder
        expect(userLinks.settings(userId)).toEqual({
            // Self-reference for settings retrieval
            self: { href: `/users/${userId}/settings`, method: 'GET' },
            // Link to update settings
            update: { href: `/users/${userId}/settings`, method: 'PUT' },
            // Navigation back to user profile
            'user-profile': { href: `/users/${userId}/profile`, method: 'GET' }
        });
    });

    /**
     * Test preference profiles collection links
     * Ensures collection-level operations are correctly linked
     */
    test('preferenceProfilesCollection links', () => {
        // Execute the preference profiles collection link builder
        expect(userLinks.preferenceProfilesCollection(userId)).toEqual({
            // Self-reference for collection retrieval
            self: { href: `/users/${userId}/preference-profiles`, method: 'GET' },
            // Action to create new profile in collection
            'create-profile': { href: `/users/${userId}/preference-profiles`, method: 'POST' },
            // Navigation to parent user profile
            'user-profile': { href: `/users/${userId}/profile`, method: 'GET' }
        });
    });

    /**
     * Test individual preference profile links
     * Validates CRUD operations and related actions for a specific profile
     */
    test('preferenceProfile links', () => {
        // Execute the individual preference profile link builder
        expect(userLinks.preferenceProfile(userId, profileId)).toEqual({
            // Self-reference for profile retrieval
            self: { href: `/users/${userId}/preference-profiles/${profileId}`, method: 'GET' },
            // Link to update this preference profile
            edit: { href: `/users/${userId}/preference-profiles/${profileId}`, method: 'PUT' },
            // Link to delete this preference profile
            delete: { href: `/users/${userId}/preference-profiles/${profileId}`, method: 'DELETE' },
            // Action to activate this profile as the active preference
            activate: { href: `/users/${userId}/profile`, method: 'PUT' },
            // Get recommendations based on this profile
            recommendations: { href: `/users/${userId}/recommendations{?currentLocation}`, method: 'GET' },
            // Navigation to parent user profile
            'user-profile': { href: `/users/${userId}/profile`, method: 'GET' }
        });
    });

    /**
     * Test recommendations resource links
     * Validates links for recommendation refresh and navigation
     */
    test('recommendations links', () => {
        // Execute the recommendations link builder
        expect(userLinks.recommendations(userId)).toEqual({
            // Link to refresh recommendations with optional location
            refresh: { href: `/users/${userId}/recommendations{?currentLocation}`, method: 'GET' },
            // Navigation back to user profile
            'user-profile': { href: `/users/${userId}/profile`, method: 'GET' }
        });
    });

    /**
     * Test favourites collection links
     * Ensures links for managing favourite places are correct
     */
    test('favouritesCollection links', () => {
        // Execute the favourites collection link builder
        expect(userLinks.favouritesCollection(userId)).toEqual({
            // Self-reference for favourites list retrieval
            self: { href: `/users/${userId}/favourite-places`, method: 'GET' },
            // Action to add new favourite place
            'add-favourite': { href: `/users/${userId}/favourite-places`, method: 'POST' },
            // Navigation to user profile
            'user-profile': { href: `/users/${userId}/profile`, method: 'GET' }
        });
    });

    /**
     * Test individual favourite resource links
     * Validates links for specific favourite place operations
     */
    test('favourite links', () => {
        // Execute the favourite link builder with all required IDs
        expect(userLinks.favourite(userId, favouriteId, placeId)).toEqual({
            // Self-reference to favourites collection
            self: { href: `/users/${userId}/favourite-places`, method: 'GET' },
            // Action to remove this favourite
            remove: { href: `/users/${userId}/favourite-places/${favouriteId}`, method: 'DELETE' },
            // Link to the associated place details
            place: { href: `/places/${placeId}`, method: 'GET' },
            // Navigation to user profile
            'user-profile': { href: `/users/${userId}/profile`, method: 'GET' }
        });
    });

    /**
     * Test favourite item links within a collection
     * Validates item-level actions for favourites
     */
    test('favouriteItem links', () => {
        // Execute the favourite item link builder
        expect(userLinks.favouriteItem(userId, favouriteId, placeId)).toEqual({
            // Link to select and view the place details
            select: { href: `/places/${placeId}`, method: 'GET' },
            // Action to remove from favourites
            'remove-favourite': { href: `/users/${userId}/favourite-places/${favouriteId}`, method: 'DELETE' }
        });
    });

    /**
     * Test disliked place links
     * Validates navigation after disliking a place
     */
    test('dislikedPlace links', () => {
        // Execute the disliked place link builder
        expect(userLinks.dislikedPlace(userId)).toEqual({
            // Link to get new recommendations after disliking
            recommendations: { href: `/users/${userId}/recommendations{?currentLocation}`, method: 'GET' },
            // Navigation back to user profile
            'user-profile': { href: `/users/${userId}/profile`, method: 'GET' }
        });
    });
});
