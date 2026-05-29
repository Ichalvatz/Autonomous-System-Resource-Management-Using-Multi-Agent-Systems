/**
 * Greek Translation Resources - Index file
 */
import common from './el/common.json';
import features from './el/features.json';
import pages from './el/pages.json';

export const el = {
    ...common.common,
    ...common.homePage,
    ...common.auth,
    ...common.validation,
    ...pages.userPages,
    ...pages.preferencesPage,
    ...pages.favouritesPage,
    ...features.navigationPage,
    ...features.recommendationsPage,
    ...features.placeDetails,
    ...features.categories,
    ...features.footer,
};
