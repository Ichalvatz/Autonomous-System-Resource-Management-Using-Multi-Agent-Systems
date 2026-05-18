/**
 * HATEOAS User Links - Link generators for user resources
 */

// Helper: Create a link object with href and method
const link = (href, method = 'GET') => ({ href, method });

// Generate all path templates for a user ID
const getPaths = (u) => ({
    self: `/users/${u}`,
    profile: `/users/${u}/profile`,
    settings: `/users/${u}/settings`,
    preferences: `/users/${u}/preference-profiles`,
    preference: (p) => `/users/${u}/preference-profiles/${p}`,
    recommendations: `/users/${u}/recommendations{?currentLocation}`,
    favourites: `/users/${u}/favourite-places`,
    favourite: (f) => `/users/${u}/favourite-places/${f}`
});

// Generate path to a place resource
const placePath = (p) => `/places/${p}`;

const userLinks = {
    // Links for user profile page
    userProfile: (userId) => {
        const p = getPaths(userId);
        return {
            self: link(p.profile),
            edit: link(p.profile, 'PUT'),
            settings: link(p.settings),
            'preference-profiles': link(p.preferences),
            'create-profile': link(p.preferences, 'POST'),
            recommendations: link(p.recommendations),
            favourites: link(p.favourites)
        };
    },

    // Links for user settings page
    settings: (userId) => {
        const p = getPaths(userId);
        return {
            self: link(p.settings),
            update: link(p.settings, 'PUT'),
            'user-profile': link(p.profile)
        };
    },

    // Links for preference profiles collection
    preferenceProfilesCollection: (userId) => {
        const p = getPaths(userId);
        return {
            self: link(p.preferences),
            'create-profile': link(p.preferences, 'POST'),
            'user-profile': link(p.profile)
        };
    },

    // Links for individual preference profile
    preferenceProfile: (userId, profileId) => {
        const p = getPaths(userId);
        const prefPath = p.preference(profileId);
        return {
            self: link(prefPath),
            edit: link(prefPath, 'PUT'),
            delete: link(prefPath, 'DELETE'),
            activate: link(p.profile, 'PUT'),
            recommendations: link(p.recommendations),
            'user-profile': link(p.profile)
        };
    },

    // Links for recommendations page
    recommendations: (userId) => {
        const p = getPaths(userId);
        return {
            refresh: link(p.recommendations),
            'user-profile': link(p.profile)
        };
    },

    // Links for favourites collection page
    favouritesCollection: (userId) => {
        const p = getPaths(userId);
        return {
            self: link(p.favourites),
            'add-favourite': link(p.favourites, 'POST'),
            'user-profile': link(p.profile)
        };
    },

    // Links for individual favourite with place details
    favourite: (userId, favouriteId, placeId) => {
        const p = getPaths(userId);
        return {
            self: link(p.favourites),
            remove: link(p.favourite(favouriteId), 'DELETE'),
            place: link(placePath(placeId)),
            'user-profile': link(p.profile)
        };
    },

    // Simplified links for favourite item in list view
    favouriteItem: (userId, favouriteId, placeId) => {
        const p = getPaths(userId);
        return {
            select: link(placePath(placeId)),
            'remove-favourite': link(p.favourite(favouriteId), 'DELETE')
        };
    },

    // Links for disliked place action result
    dislikedPlace: (userId) => {
        const p = getPaths(userId);
        return {
            recommendations: link(p.recommendations),
            'user-profile': link(p.profile)
        };
    }
};

export default userLinks;
