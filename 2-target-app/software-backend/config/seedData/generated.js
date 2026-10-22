/**
 * Generated load-test dataset (added 2026-10-22 for the thesis load tests).
 *
 * The hand-written seed data has 15 places and 3 users, so every read is trivially cheap and a
 * load test can only stress the login (bcrypt). With SEED_DATASET=load (set in the Kubernetes
 * deployment, never in the unit tests) the in-memory database is extended with a deterministic
 * catalogue of the size a small travel site would have: places in Greek cities, their reviews,
 * and users with an active preference profile. The same seed always yields the same data, so
 * every pod and every run serves the same catalogue.
 *
 * Sizes: SEED_PLACES (5000), SEED_REVIEWS_PER_PLACE (mean 10, 0..2x), SEED_USERS (1000).
 * Users log in as loaduser<i>@example.com / password123 (i = 1..SEED_USERS); the bcrypt hash
 * is computed once and shared, so start-up stays fast.
 */
import bcrypt from 'bcryptjs';

export const LOAD_PASSWORD = 'password123';
export const FIRST_PLACE_ID = 100000;
export const FIRST_USER_ID = 200000;
const FIRST_REVIEW_ID = 1000000;
const FIRST_PROFILE_ID = 100000;

export const CITIES = [
    ['Athens', 37.9838, 23.7275], ['Thessaloniki', 40.6401, 22.9444], ['Patras', 38.2466, 21.7346],
    ['Heraklion', 35.3387, 25.1442], ['Larissa', 39.6390, 22.4191], ['Volos', 39.3622, 22.9420],
    ['Ioannina', 39.6650, 20.8537], ['Chania', 35.5138, 24.0180], ['Rhodes', 36.4341, 28.2176],
    ['Kavala', 40.9376, 24.4129], ['Corfu', 39.6243, 19.9217], ['Nafplio', 37.5673, 22.8015]
];
const NOUNS = {
    BEACH: ['Beach', 'Bay', 'Cove', 'Shore'],
    CULTURE: ['Theatre', 'Gallery', 'Cultural Centre', 'Old Town'],
    MUSEUM: ['Museum', 'Archive', 'Collection', 'Exhibition Hall'],
    NIGHTLIFE: ['Bar', 'Club', 'Lounge', 'Jazz Corner'],
    PARK: ['Park', 'Garden', 'Grove', 'Trail'],
    RESTAURANT: ['Taverna', 'Bistro', 'Grill', 'Kitchen']
};
export const CATEGORIES = Object.keys(NOUNS);
const ADJECTIVES = ['Blue', 'Golden', 'Old', 'Royal', 'Hidden', 'Sunny', 'Silver', 'Olive', 'Aegean', 'Ionian',
    'Marble', 'Lemon', 'Cedar', 'Windmill', 'Harbour', 'Lighthouse', 'Byzantine', 'Venetian', 'Seaside', 'Mountain'];
export const FEATURES = ['sunsets', 'seafood', 'live music', 'local wine', 'ancient ruins', 'mosaics', 'hiking paths',
    'family picnics', 'street food', 'modern art', 'byzantine icons', 'crystal water', 'rooftop views', 'olive oil',
    'folk dances', 'sailing trips', 'craft beer', 'shaded benches', 'guided tours', 'fresh pastries'];
const AUDIENCES = ['families', 'couples', 'students', 'history lovers', 'photographers', 'groups of friends',
    'solo travellers', 'food lovers'];
const OPINIONS = ['Absolutely worth the visit', 'Nice place, a bit crowded at noon', 'Friendly staff and great atmosphere',
    'Good value for money', 'Not what I expected, but still pleasant', 'We came back twice during our stay',
    'Perfect for an afternoon walk', 'Prices are a little high', 'The best spot in town for this', 'Clean and well kept'];

/** Small deterministic PRNG (mulberry32): the dataset must be identical in every pod. */
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function generateLoadDataset({
    places = 5000, reviewsPerPlace = 10, users = 1000, seed = 20261022
} = {}) {
    const rand = mulberry32(seed);
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const date = (i) => new Date(Date.UTC(2025, 0, 1) + (i % 600) * 86400000).toISOString();

    const passwordHash = bcrypt.hashSync(LOAD_PASSWORD, 10);
    const genUsers = [];
    const profiles = [];
    const settings = [];
    for (let i = 1; i <= users; i++) {
        const userId = FIRST_USER_ID + i;
        const [, lat, lon] = pick(CITIES);
        const categories = [...new Set([pick(CATEGORIES), pick(CATEGORIES), pick(CATEGORIES)])];
        const profileId = FIRST_PROFILE_ID + i;
        genUsers.push({
            userId, name: `Load User ${i}`, email: `loaduser${i}@example.com`, password: passwordHash, role: 'user',
            preferences: { categories, tags: [] }, location: { latitude: lat, longitude: lon },
            activeProfile: profileId, createdAt: date(i)
        });
        profiles.push({ profileId, userId, name: 'Default', categories, tags: [], isActive: true });
        settings.push({ userId, preferredLanguage: 'ENGLISH', accessibilitySettings: [], privacySettings: [],
            userAgreementAccepted: true });
    }

    const genPlaces = [];
    const genReviews = [];
    let reviewId = FIRST_REVIEW_ID;
    for (let i = 0; i < places; i++) {
        const placeId = FIRST_PLACE_ID + i;
        const [city, lat, lon] = pick(CITIES);
        const category = pick(CATEGORIES);
        const noun = pick(NOUNS[category]);
        const adjective = pick(ADJECTIVES);
        const latitude = +(lat + (rand() - 0.5) * 0.2).toFixed(4);
        const longitude = +(lon + (rand() - 0.5) * 0.2).toFixed(4);
        genPlaces.push({
            placeId, name: `${adjective} ${noun} of ${city}`,
            description: `A ${pick(ADJECTIVES).toLowerCase()} ${noun.toLowerCase()} in ${city} known for its `
                + `${pick(FEATURES)} and ${pick(FEATURES)}. Visitors recommend it for ${pick(AUDIENCES)}, `
                + `especially in the ${pick(['morning', 'afternoon', 'evening'])}.`,
            location: { latitude, longitude, address: `${pick(ADJECTIVES)} Street ${1 + Math.floor(rand() * 200)}`, city,
                country: 'Greece', postalCode: String(10000 + Math.floor(rand() * 80000)) },
            address: `${city}, Greece`, city, country: 'Greece', latitude, longitude, category,
            website: null, rating: +(2.5 + rand() * 2.5).toFixed(1)
        });
        const count = Math.floor(rand() * (2 * reviewsPerPlace + 1));
        for (let r = 0; r < count; r++) {
            genReviews.push({
                reviewId: reviewId++, userId: FIRST_USER_ID + 1 + Math.floor(rand() * users), placeId,
                rating: 1 + Math.floor(rand() * 5), comment: `${pick(OPINIONS)}. Loved the ${pick(FEATURES)}.`,
                createdAt: date(reviewId)
            });
        }
    }

    const favourites = [];
    let favouriteId = 5000000;
    for (const user of genUsers) {
        const n = Math.floor(rand() * 4);
        for (let k = 0; k < n; k++) {
            favourites.push({ favouriteId: favouriteId++, userId: user.userId,
                placeId: FIRST_PLACE_ID + Math.floor(rand() * places) });
        }
    }
    return { users: genUsers, preferenceProfiles: profiles, settings, places: genPlaces, reviews: genReviews,
        favouritePlaces: favourites };
}
