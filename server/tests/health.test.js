import { describe, expect, it } from 'vitest';
import request from 'supertest';

import app from '../app.js';

describe('Express application', () => {
  it('returns the health status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns a JSON 404 response for an unknown route', async () => {
    const response = await request(app).get('/unknown-route');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({ error: 'Route not found' });
  });
});