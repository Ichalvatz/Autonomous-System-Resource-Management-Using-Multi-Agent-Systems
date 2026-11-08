/**
 * @fileoverview Readiness endpoint, search pagination and the stuck fault (added 2026-10-22, thesis phase 2).
 * The stuck state is global to the process, so the stuck tests run last in this file.
 */
import request from 'supertest';

process.env.CHAOS_ENABLED = 'true';
const { default: app } = await import('../../app.js');
const api = request(app);

describe('GET /ready', () => {
  it('reports ready while the process can serve', async () => {
    const response = await api.get('/ready');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready' });
  });
});

describe('GET /places/search pagination', () => {
  it('returns at most `limit` results but the full match count', async () => {
    const all = await api.get('/places/search').query({ keywords: 'a' });
    const page = await api.get('/places/search').query({ keywords: 'a', limit: 2 });
    expect(page.status).toBe(200);
    expect(page.body.data.results.length).toBeLessThanOrEqual(2);
    expect(page.body.data.totalResults).toBe(all.body.data.totalResults);
    expect(page.body.data.limit).toBe(2);
    expect(page.body.data.page).toBe(1);
  });

  it('serves the next page and caps the page size at 50', async () => {
    const second = await api.get('/places/search').query({ keywords: 'a', limit: 1, page: 2 });
    const first = await api.get('/places/search').query({ keywords: 'a', limit: 1, page: 1 });
    if (first.body.data.totalResults > 1) {
      expect(second.body.data.results[0].placeId).not.toBe(first.body.data.results[0].placeId);
    }
    const capped = await api.get('/places/search').query({ keywords: 'a', limit: 500 });
    expect(capped.body.data.limit).toBe(50);
  });
});

describe('stuck fault (POST /chaos/stuck)', () => {
  it('makes requests fail with 503 after the 3 s pool wait, and /ready report not ready', async () => {
    // The injection leaves no trace in the logs (A34, 2026-11-08): the agent reads them, and a real
    // connection leak has no request that announces it.
    const logged = [];
    const saved = { log: console.log, warn: console.warn, error: console.error };
    for (const level of Object.keys(saved)) console[level] = (...args) => logged.push(args.join(' '));
    let injected;
    try {
      injected = await api.post('/chaos/stuck');
    } finally {
      Object.assign(console, saved);
    }
    expect(injected.status).toBe(200);
    expect(logged.filter((line) => /chaos|inject/i.test(line))).toEqual([]);

    const ready = await api.get('/ready');
    expect(ready.status).toBe(503);
    expect(ready.body.reason).toBe('DB_POOL_EXHAUSTED');

    const started = Date.now();
    const response = await api.get('/places/search').query({ keywords: 'museum' });
    expect(response.status).toBe(503);
    expect(response.body.error).toBe('DB_POOL_EXHAUSTED');
    expect(Date.now() - started).toBeGreaterThanOrEqual(2900);
  });

  it('keeps the liveness check shallow: /health still answers at once', async () => {
    const started = Date.now();
    const response = await api.get('/health');
    expect(response.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
