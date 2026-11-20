// Hand test of the normal load, 1 -> 2 -> 3 -> 2 -> 1 pods, 38 min (thesis_notes/manual_testing.md §3):
//   cd 4-load-testing/manual && k6 run baseline.js
// The measured ../k6/baseline.js as it is (42.8 -> 123.5 -> 210 -> 105.2 -> 42.8 rps).
// Optionally a fault on the ramp (§5a, UNSTABLE and re-wake): k6 run -e FAULT=cpuhog -e FAULT_AT=6m baseline.js
import { options as measured } from '../k6/baseline.js';
import { loginPool, mixedRequest } from '../k6/lib/mix.js';
import { withFault, checkFault, injectFault } from './fault.js';

export const options = __ENV.FAULT ? withFault(measured, __ENV.FAULT_AT || '6m') : measured;
const FAULT = __ENV.FAULT ? checkFault(__ENV.FAULT) : null;
export function setup() { return loginPool(); }
export default function (pool) { mixedRequest(pool); }
export function inject() { injectFault(FAULT); }
