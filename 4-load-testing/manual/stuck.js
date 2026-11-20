// Hand test of the stuck fault in one command (thesis_notes/manual_testing.md §4):
//   cd 4-load-testing/manual && k6 run stuck.js            (k6 run -e FAULT_AT=1m stuck.js: the fault sooner)
// The load of the measured ../k6/stuck.js (57 rps, the request mix, 16 min, 1 pod) and, at t = 4 min, the fault itself:
// POST /chaos/stuck (every request waits 3 s for a DB connection, then 503; /ready fails). Right fix: a restart.
// ../k6/stuck.js stays as it is: it is frozen, its sha256 is checked in every campaign report, and in measured runs
// run_experiment.sh injects the fault.
import { options as measured } from '../k6/stuck.js';
import { loginPool, mixedRequest } from '../k6/lib/mix.js';
import { withFault, injectFault } from './fault.js';

export const options = withFault(measured, __ENV.FAULT_AT || '4m');
export function setup() { return loginPool(); }
export default function (pool) { mixedRequest(pool); }
export function inject() { injectFault('stuck'); }
