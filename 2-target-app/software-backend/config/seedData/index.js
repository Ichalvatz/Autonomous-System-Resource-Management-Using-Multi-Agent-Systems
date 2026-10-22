/**
 * Seed Data Index - Loads JSON seed data and aggregates for in-memory database
 */
import { createRequire } from 'module';
import bcrypt from 'bcryptjs';
import { generateLoadDataset } from './generated.js';

const require = createRequire(import.meta.url);

// Load JSON data file from relative path
function loadJsonData(path) {
    return require(path);
}

// Hash passwords for all users using bcrypt
function hashUserPasswords(usersArray) {
    return usersArray.map(user => ({
        ...user,
        password: bcrypt.hashSync(user.plainPassword, 10),
        plainPassword: undefined
    }));
}

// Initialize counter values for auto-increment IDs
function createCounters() {
    return {
        userId: 20000,
        profileId: 10,
        placeId: 5000,
        reviewId: 8000,
        reportId: 1000,
        favouriteId: 1000,
        dislikedId: 500
    };
}

// Load all JSON seed data files
const placesData = loadJsonData('./places.json');
const placesExtendedData = loadJsonData('./placesExtended.json');
const interactionsData = loadJsonData('./interactions.json');
const usersData = loadJsonData('./users.json');

// Prepare data arrays for database insertion
let places = [...placesData];
let placesExtended = [...placesExtendedData];
let { reviews, reports, favouritePlaces, dislikedPlaces } = interactionsData;
let users = hashUserPasswords(usersData.users);
let { preferenceProfiles, settings } = usersData;
const allPlaces = [...places, ...placesExtended];
let counters = createCounters();

// SEED_DATASET=load: add the generated catalogue for the load tests (see generated.js).
// The unit tests never set it, so they keep the small hand-written data above.
if (process.env.SEED_DATASET === 'load') {
    const generated = generateLoadDataset({
        places: parseInt(process.env.SEED_PLACES || '5000', 10),
        reviewsPerPlace: parseInt(process.env.SEED_REVIEWS_PER_PLACE || '10', 10),
        users: parseInt(process.env.SEED_USERS || '1000', 10)
    });
    users.push(...generated.users);
    preferenceProfiles.push(...generated.preferenceProfiles);
    settings.push(...generated.settings);
    allPlaces.push(...generated.places);
    reviews.push(...generated.reviews);
    favouritePlaces.push(...generated.favouritePlaces);
}

export { places, placesExtended, reviews, reports, favouritePlaces, dislikedPlaces, users, preferenceProfiles, settings };

export default { users, preferenceProfiles, places: allPlaces, reviews, reports, favouritePlaces, dislikedPlaces, settings, counters };
