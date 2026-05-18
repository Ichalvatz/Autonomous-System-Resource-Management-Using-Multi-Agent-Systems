// ***********************************************
// Helper Utilities Index - Re-exports all helpers
// ***********************************************

// Navigation helpers
export {
    visitHome,
    visitLogin,
    visitSignup,
    visitProfile,
    visitRecommendations,
    visitFavourites,
    visitPreferences,
    visitPlaceDetails,
    navigateAndVerify
} from './navigation';

// Form helpers
export {
    fillInput,
    submitForm,
    fillLoginForm,
    fillSignupForm,
    selectOption,
    checkCheckbox,
    uncheckCheckbox,
    fillNavigationForm,
    clearNavigationForm,
    clickCreateProfile,
    fillProfileName,
    selectCategories,
    submitProfileForm
} from './forms';

// Assertion helpers
export {
    expectUrlToContain,
    expectUrlToEqual,
    expectTextVisible,
    expectTextNotVisible,
    expectElementExists,
    expectElementVisible,
    expectElementNotExists,
    expectElementText,
    expectElementContainsText,
    expectInputValue,
    expectErrorMessage,
    expectSuccessMessage,
    assertAuthError,
    assertHtml5ValidationError,
    assertFormStillVisible,
    assertNoRouteResults
} from './assertions';

// Wait helpers
export {
    waitForLoadingToFinish,
    waitForPageLoad,
    waitForElement,
    waitForElementVisible,
    waitForNavigation
} from './waits';

// API helpers
export {
    interceptAPI,
    mockAPIResponse,
    waitForAPIRequest
} from './api';

// Utility helpers
export {
    getRandomEmail,
    getRandomString,
    takeScreenshot,
    logMessage,
    reloadPage,
    goBack,
    goForward,
    scrollToElement,
    scrollToTop,
    scrollToBottom
} from './utils';

// Place/Auth helpers
export {
    verifyPlaceInList,
    verifyPlaceNotInList,
    clickFirstPlaceCard,
    getPlaceIdFromUrl,
    verifyPlaceDetailsVisible,
    capturePlaceData,
    verifyRecommendationsChanged,
    verifyAuthenticationSuccess,
    testProtectedRoute
} from './places';
