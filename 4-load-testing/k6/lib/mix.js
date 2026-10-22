// The request mix of every load script (thesis phase 2, 2026-10-22): one place for the endpoints, their
// weights and the test data, so the scenarios, the capacity discovery and the training traffic all send the
// same kind of traffic. Read-heavy, like a travel site: ~1 login per session of ~10 requests.
//
//   search          30%  GET  /places/search?keywords=<word>      full-text scan of ~5k places, 20 per page
//   place           25%  GET  /places/<id>                        one place with its reviews
//   reviews         15%  GET  /places/<id>/reviews
//   recommendations 10%  GET  /users/<id>/recommendations?lat&lon  (token) categories filter + distance sort
//   login           10%  POST /auth/login                          bcrypt: ~65 ms CPU, most of the CPU of the mix
//   review_post      5%  POST /places/<id>/reviews                 (token)
//   favourite_post   5%  POST /users/<id>/favourite-places         (token)
//
// The backend serves the generated catalogue (SEED_DATASET=load, config/seedData/generated.js): places
// 100000..104999, users loaduser1..loaduser1000 (ids 200001..201000), password password123. The words below
// come from the same generator, so searches find places. Each request carries a `name` tag (the endpoint),
// so k6 reports per endpoint instead of per URL.
import http from 'k6/http';
import { check } from 'k6';

export const BASE = __ENV.BASE_URL || 'http://mwtback.aiops';
const PLACES = 5000, FIRST_PLACE = 100000, USERS = 1000, FIRST_USER = 200000;
const TOKEN_POOL = 20;   // logged in once in setup(); tokens are valid for 7 days
const PASSWORD = 'password123';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const WORDS = ['Athens', 'Thessaloniki', 'Patras', 'Heraklion', 'Larissa', 'Volos', 'Ioannina', 'Chania', 'Rhodes',
    'Kavala', 'Corfu', 'Nafplio', 'sunsets', 'seafood', 'live music', 'local wine', 'ancient ruins', 'mosaics',
    'hiking', 'picnics', 'street food', 'modern art', 'icons', 'crystal water', 'rooftop', 'olive oil', 'sailing',
    'craft beer', 'guided tours', 'pastries', 'Beach', 'Museum', 'Taverna', 'Garden', 'Gallery', 'Bistro', 'Cove'];
const CITIES = [[37.9838, 23.7275], [40.6401, 22.9444], [38.2466, 21.7346], [35.3387, 25.1442], [39.6390, 22.4191]];

export const WEIGHTS = [
    ['search', 0.30], ['place', 0.25], ['reviews', 0.15], ['recommendations', 0.10],
    ['login', 0.10], ['review_post', 0.05], ['favourite_post', 0.05],
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const placeId = () => FIRST_PLACE + Math.floor(Math.random() * PLACES);
const auth = (token) => ({ headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` } });
const ok = (res, name) => check(res, { [`${name} 2xx`]: (r) => r.status >= 200 && r.status < 300 });

function login(n, tag = 'login') {
    return http.post(`${BASE}/auth/login`, JSON.stringify({ email: `loaduser${n}@example.com`, password: PASSWORD }),
        { headers: JSON_HEADERS, tags: { name: tag } });
}

// TOKENS_FILE (absolute path, written by 5-ml-training/k6_driver.py): a pool logged in once for a whole series
// of short k6 runs, so each run does not start with a burst of logins.
const POOL_FROM_FILE = __ENV.TOKENS_FILE ? JSON.parse(open(__ENV.TOKENS_FILE)) : null;

// Call from each script's setup(): a pool of logged-in users for the authenticated endpoints.
export function loginPool() {
    if (POOL_FROM_FILE) return POOL_FROM_FILE;
    const users = [];
    for (let i = 0; i < TOKEN_POOL; i++) users.push(1 + Math.floor(Math.random() * USERS));
    const responses = http.batch(users.map((n) => ['POST', `${BASE}/auth/login`,
        JSON.stringify({ email: `loaduser${n}@example.com`, password: PASSWORD }), { headers: JSON_HEADERS, tags: { name: 'setup_login' } }]));
    const pool = [];
    responses.forEach((res, i) => {
        if (res.status === 200) pool.push({ userId: FIRST_USER + users[i], token: res.json('data.token') || res.json('token') });
    });
    if (pool.length === 0) throw new Error('setup: no user could log in (is SEED_DATASET=load set on the backend?)');
    return pool;
}

export const REQUESTS = {
    search: () => http.get(`${BASE}/places/search?keywords=${encodeURIComponent(pick(WORDS))}`, { tags: { name: 'search' } }),
    place: () => http.get(`${BASE}/places/${placeId()}`, { tags: { name: 'place' } }),
    reviews: () => http.get(`${BASE}/places/${placeId()}/reviews`, { tags: { name: 'reviews' } }),
    recommendations: (pool) => {
        const u = pick(pool);
        const [lat, lon] = pick(CITIES);
        return http.get(`${BASE}/users/${u.userId}/recommendations?latitude=${lat}&longitude=${lon}`,
            { ...auth(u.token), tags: { name: 'recommendations' } });
    },
    login: () => login(1 + Math.floor(Math.random() * USERS)),
    review_post: (pool) => {
        const u = pick(pool);
        return http.post(`${BASE}/places/${placeId()}/reviews`,
            JSON.stringify({ rating: 1 + Math.floor(Math.random() * 5), comment: 'Visited during the load test, nice place.' }),
            { ...auth(u.token), tags: { name: 'review_post' } });
    },
    favourite_post: (pool) => {
        const u = pick(pool);
        return http.post(`${BASE}/users/${u.userId}/favourite-places`, JSON.stringify({ placeId: placeId() }),
            { ...auth(u.token), tags: { name: 'favourite_post' } });
    },
};

// One request drawn from the mix (one k6 iteration = one request, so the arrival rate is in requests/s).
export function mixedRequest(pool) {
    let r = Math.random();
    for (const [name, weight] of WEIGHTS) {
        r -= weight;
        if (r <= 0) return ok(REQUESTS[name](pool), name);
    }
    return ok(REQUESTS.search(pool), 'search');
}
