/**
 * @fileoverview Lookup indexes for the in-memory database (added 2026-10-22, thesis load tests).
 * @description With the generated load dataset (SEED_DATASET=load: ~5k places, ~50k reviews) the
 * linear scans of the original code made every place or review read cost O(all reviews), which a
 * real database answers by index. An index is rebuilt whenever its array was replaced or changed
 * length outside these helpers, and kept in step on the append path (`appended`).
 * @module config/inMemoryDb/indexes
 */

const cache = new WeakMap(); // array -> Map(key -> { length, multi, map })

function put(map, value, item, multi) {
    if (!multi) {
        if (!map.has(value)) map.set(value, item); // first match, like Array.find
        return;
    }
    const list = map.get(value);
    if (list) list.push(item);
    else map.set(value, [item]);
}

/** Map from item[key] to the item (multi: to the list of items, in array order). */
export function indexBy(array, key, multi = false) {
    let perArray = cache.get(array);
    if (!perArray) {
        perArray = new Map();
        cache.set(array, perArray);
    }
    let entry = perArray.get(key);
    if (!entry || entry.length !== array.length) {
        const map = new Map();
        for (const item of array) put(map, item[key], item, multi);
        entry = { length: array.length, multi, map };
        perArray.set(key, entry);
    }
    return entry.map;
}

/** Call right after array.push(item): updates the indexes in place instead of rebuilding them. */
export function appended(array, item) {
    const perArray = cache.get(array);
    if (!perArray) return;
    for (const [key, entry] of perArray) {
        if (entry.length === array.length - 1) {
            put(entry.map, item[key], item, entry.multi);
            entry.length = array.length;
        } else {
            perArray.delete(key);
        }
    }
}

/** Call after replacing an element in place (same length): the next lookup rebuilds. */
export function invalidate(array) {
    cache.delete(array);
}
