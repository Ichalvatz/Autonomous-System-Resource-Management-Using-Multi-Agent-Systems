/**
 * HATEOAS Admin Links - Link generators for admin resources
 */

const link = (href, method = 'GET') => ({ href, method });

const adminLinks = {
    adminReportsCollection: (adminId, placeId) => ({
        self: link(`/admin/${adminId}/places/${placeId}/reports`)
    }),

    adminReport: (placeId, adminId) => ({
        place: link(`/places/${placeId}`),
        'edit-place': link(`/admin/${adminId}/places/${placeId}`, 'PUT')
    }),

    adminPlace: (placeId, adminId) => ({
        self: link(`/places/${placeId}`),
        edit: link(`/admin/${adminId}/places/${placeId}`, 'PUT'),
        reports: link(`/admin/${adminId}/places/${placeId}/reports`)
    })
};

export default adminLinks;
