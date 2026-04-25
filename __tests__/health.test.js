import request from 'supertest';
import express from 'express';

const app = express();

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Judge-it Backend is live' });
});

describe('GET /health', () => {
  it('should return 200 OK and the correct status message', async () => {
    const res = await request(app).get('/health');
    
    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toBe('OK');
  });
});