// Hand test of the normal load, 1 -> 2 -> 3 -> 2 -> 1 pods, the short version, 22 min (thesis_notes/manual_testing.md §3):
//   cd 4-load-testing/manual && k6 run demo.js
// ../k6/demo.js as it is (the shape of baseline.js with shorter holds; not comparable with measured runs).
// Optionally a fault on the ramp: k6 run -e FAULT=cpuhog -e FAULT_AT=4m demo.js
import { options as measured } from '../k6/demo.js';
import { loginPool, mixedRequest } from '../k6/lib/mix.js';
import { withFault, checkFault, injectFault } from './fault.js';

export const options = __ENV.FAULT ? withFault(measured, __ENV.FAULT_AT || '4m') : measured;
const FAULT = __ENV.FAULT ? checkFault(__ENV.FAULT) : null;
export function setup() { return loginPool(); }
export default function (pool) { mixedRequest(pool); }
export function inject() { injectFault(FAULT); }
