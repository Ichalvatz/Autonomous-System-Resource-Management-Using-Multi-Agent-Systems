// Cost of each endpoint of the mix (lib/mix.js), one at a time on the current replica count (1 pod).
// Each endpoint alone at a fixed arrival rate for 90 s, then 30 s idle; the mix last. endpoint_costs.py reads
// CPU per request and the ingress p95 from Prometheus at the end of each window. ~16 min.
//   k6 run 4-load-testing/k6/endpoint_costs.js   (then: python 4-load-testing/endpoint_costs.py <start time>)
import { REQUESTS, loginPool, mixedRequest } from './lib/mix.js';

export const RATES = { search: 30, place: 50, reviews: 50, recommendations: 30, login: 8, review_post: 20,
    favourite_post: 20, mix: 40 };
const scenarios = {};
Object.keys(RATES).forEach((name, i) => {
    scenarios[name] = {
        executor: 'constant-arrival-rate', rate: RATES[name], timeUnit: '1s', duration: '90s',
        preAllocatedVUs: 50, maxVUs: 300, startTime: `${i * 120}s`, exec: 'run', env: { ENDPOINT: name },
    };
});
export const options = { scenarios, summaryTrendStats: ['avg', 'p(50)', 'p(95)', 'p(99)', 'max'] };

export function setup() { return loginPool(); }

export function run(pool) {
    if (__ENV.ENDPOINT === 'mix') mixedRequest(pool);
    else REQUESTS[__ENV.ENDPOINT](pool);
}
