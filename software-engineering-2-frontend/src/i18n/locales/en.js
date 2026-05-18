/**
 * English Translation Resources - Index file
 */
import common from './en/common.json';
import features from './en/features.json';
import pages from './en/pages.json';

export const en = {
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
