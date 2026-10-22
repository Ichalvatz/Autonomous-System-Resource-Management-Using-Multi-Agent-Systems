// The mix (lib/mix.js) along a piecewise-linear arrival-rate profile: the training traffic of
// 5-ml-training/collect_healthy_data.py.
//   k6 run -e STAGES='[[30,"60s"],[45,"5m"]]' -e START=30 [-e TOKENS_FILE=...] 4-load-testing/k6/ramp_rate.js
// STAGES: [target requests/s, duration] pairs (decimals allowed: the executor counts per 10 s).
import { loginPool, mixedRequest } from './lib/mix.js';

const stages = JSON.parse(__ENV.STAGES).map(([target, duration]) => ({ target: Math.round(target * 10), duration }));
export const options = {
    scenarios: {
        ramp: {
            executor: 'ramping-arrival-rate', startRate: Math.round(Number(__ENV.START || 1) * 10), timeUnit: '10s',
            stages, preAllocatedVUs: 100, maxVUs: 3000,
        },
    },
    summaryTrendStats: ['avg', 'p(50)', 'p(95)', 'p(99)', 'max'],
};

export function setup() { return loginPool(); }
export default function (pool) { mixedRequest(pool); }
