/**
 * @fileoverview Generated load-test dataset and the in-memory lookup indexes (added 2026-10-22, thesis phase 2).
 */
import bcrypt from 'bcryptjs';
import { generateLoadDataset, CATEGORIES, FIRST_PLACE_ID, FIRST_USER_ID, LOAD_PASSWORD } from '../../config/seedData/generated.js';
import { indexBy, appended, invalidate } from '../../config/inMemoryDb/indexes.js';

describe('generateLoadDataset', () => {
  const small = { places: 200, reviewsPerPlace: 10, users: 50 };

  it('is deterministic: every pod serves the same catalogue', () => {
    const a = generateLoadDataset(small);
    const b = generateLoadDataset(small);
    expect(b.places).toEqual(a.places);
    expect(b.reviews).toEqual(a.reviews);
    expect(b.favouritePlaces).toEqual(a.favouritePlaces);
    expect(b.users.map(u => u.email)).toEqual(a.users.map(u => u.email));
  });

  it('has the requested sizes and consistent references', () => {
    const d = generateLoadDataset(small);
    expect(d.places).toHaveLength(200);
    expect(d.users).toHaveLength(50);
    expect(d.preferenceProfiles).toHaveLength(50);
    expect(d.reviews.length / 200).toBeGreaterThan(7);
    expect(d.reviews.length / 200).toBeLessThan(13);
    const placeIds = new Set(d.places.map(p => p.placeId));
    const userIds = new Set(d.users.map(u => u.userId));
    expect(d.places[0].placeId).toBe(FIRST_PLACE_ID);
    expect(d.users[0].userId).toBe(FIRST_USER_ID + 1);
    expect(d.reviews.every(r => placeIds.has(r.placeId) && userIds.has(r.userId))).toBe(true);
    expect(d.places.every(p => CATEGORIES.includes(p.category))).toBe(true);
    for (const user of d.users) {
      const profile = d.preferenceProfiles.find(p => p.userId === user.userId);
      expect(profile.profileId).toBe(user.activeProfile);
      expect(profile.categories.length).toBeGreaterThan(0);
    }
  });

  it('lets every generated user log in with the shared password', async () => {
    const d = generateLoadDataset({ places: 1, users: 2 });
    expect(await bcrypt.compare(LOAD_PASSWORD, d.users[1].password)).toBe(true);
    expect(d.users[1].email).toBe('loaduser2@example.com');
  });
});

describe('in-memory indexes', () => {
  it('finds by key, keeps the first match like Array.find, and groups with multi', () => {
    const items = [{ id: 1, g: 'a' }, { id: 2, g: 'b' }, { id: 1, g: 'c' }];
    expect(indexBy(items, 'id').get(1)).toBe(items[0]);
    expect(indexBy(items, 'g', true).get('b')).toEqual([items[1]]);
  });

  it('follows appends in place and rebuilds after other changes', () => {
    const items = [{ id: 1, p: 7 }];
    expect(indexBy(items, 'p', true).get(7)).toHaveLength(1);
    const added = { id: 2, p: 7 };
    items.push(added);
    appended(items, added);
    expect(indexBy(items, 'p', true).get(7)).toHaveLength(2);
    items.splice(0, 1);                        // length change without the helper: rebuilt
    expect(indexBy(items, 'p', true).get(7)).toEqual([added]);
    items[0] = { id: 3, p: 8 };                // same length: needs invalidate
    invalidate(items);
    expect(indexBy(items, 'p', true).get(8)).toHaveLength(1);
    expect(indexBy(items, 'p', true).get(7)).toBeUndefined();
  });
});
