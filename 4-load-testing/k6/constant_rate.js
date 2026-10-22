// The mix (lib/mix.js) at one fixed arrival rate: one step of 5-ml-training/capacity_discovery.py.
//   k6 run -e RATE=42.5 -e DURATION=90s [-e TOKENS_FILE=/abs/path.json] 4-load-testing/k6/constant_rate.js
// RATE is requests/s (decimals allowed: the executor counts per 10 s).
import { loginPool, mixedRequest } from './lib/mix.js';

export const options = {
    scenarios: {
        load: {
            executor: 'constant-arrival-rate', rate: Math.round(Number(__ENV.RATE) * 10), timeUnit: '10s',
            duration: __ENV.DURATION || '90s', preAllocatedVUs: 100, maxVUs: 3000,
        },
    },
    summaryTrendStats: ['avg', 'p(50)', 'p(95)', 'p(99)', 'max'],
};

export function setup() { return loginPool(); }
export default function (pool) { mixedRequest(pool); }
