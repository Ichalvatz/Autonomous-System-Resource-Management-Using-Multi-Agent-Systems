/**
 * HATEOAS Place Links - Link generators for place resources
 */

// Helper to create link object with method and optional type
const link = (href, method = 'GET', type = null) => type ? { href, method, type } : { href, method };
// Helper to conditionally add user profile link
const userProfile = (userId) => userId ? { 'user-profile': link(`/users/${userId}/profile`) } : {};

const placeLinks = {
    // Generate standard place links with optional user context
    place: (placeId, userId = null) => {
        const links = {
            self: link(`/places/${placeId}`),
            'see-reviews': link(`/places/${placeId}/reviews`),
            'add-review': link(`/places/${placeId}/reviews`, 'POST'),
            'add-report': link(`/places/${placeId}/reports`, 'POST'),
            navigation: link(`/navigation{?userLocation,placeLocation,transportationMode}`)
        };
        if (userId) {
            links['add-to-favourites'] = link(`/users/${userId}/favourite-places`, 'POST');
            links['add-to-disliked'] = link(`/users/${userId}/disliked-places`, 'POST');
            links['user-profile'] = link(`/users/${userId}/profile`);
        }
        return links;
    },

    // Place links with optional website link appended
    placeWithWebsite: (placeId, websiteUrl, userId = null) => {
        const links = placeLinks.place(placeId, userId);
        if (websiteUrl) links.website = link(websiteUrl, 'GET', 'text/html');
        return links;
    },

    // Links for reviews collection of a place
    reviews: (placeId, userId = null) => ({
        self: link(`/places/${placeId}/reviews`),
        'add-review': link(`/places/${placeId}/reviews`, 'POST'),
        place: link(`/places/${placeId}`),
        ...userProfile(userId)
    }),

    // Links for a single review
    review: (placeId, userId = null) => ({
        self: link(`/places/${placeId}/reviews`),
        place: link(`/places/${placeId}`),
        ...userProfile(userId)
    }),

    // Links for report submission
    report: (placeId, userId = null) => ({
        place: link(`/places/${placeId}`),
        ...userProfile(userId)
    }),

    // Links for place search results
    search: (userId = null) => ({
        'refine-search': link(`/places/search{?keywords}`),
        ...userProfile(userId)
    }),

    // Links for navigation to a place
    navigation: (placeId = null, userId = null) => ({
        ...(placeId ? { destination: link(`/places/${placeId}`) } : {}),
        'alternative-routes': link(`/navigation{?userLocation,placeLocation,transportationMode}`),
        ...userProfile(userId)
    }),

    // Simple select link for a place
    selectLink: (placeId) => ({ select: link(`/places/${placeId}`) })
};

export default placeLinks;
