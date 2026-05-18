/**
 * @fileoverview In-Memory Database Index
 * @module config/inMemoryDb
 * Aggregates all operation modules for unified API
 */

import * as userOps from './userOps.js';
import * as placeOps from './placeOps.js';

export default {
    ...userOps,
    ...placeOps
};
