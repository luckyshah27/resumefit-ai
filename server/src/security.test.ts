import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import net from 'node:net';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from './app.js';
import { env } from './config/env.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { AuditLogModel } from './models/AuditLog.js';
import { RefreshTokenModel } from './models/RefreshToken.js';
import { ClamdScanner, setFileScanner } from './services/fileScanner.js';
import { parseResumeFile } from './services/resumeParser.js';
import { JWT_AUDIENCE, JWT_ISSUER } from './services/tokenService.js';
import { makePdf } from './test/fileFactory.js';
import { SAMPLE_RESUME } from './test/fixtures.js';

let mongo: MongoMemoryServer;
const CLIENT = { 'X-Requested-With': 'resumefit' };

const cookieFrom = (response: request.Response) => {
  const raw = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
  return raw.find((cookie) => cookie.startsWith('rf_refresh='));
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe('secure defaults', () => {
  it('sends security headers and a request id, and hides the framework', async () => {
    const response = await request(app).get('/api/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['x-frame-options']).toBeDefined();
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps a well-formed incoming request id', async () => {
    const response = await request(app).get('/api/health').set('X-Request-Id', 'trace-12345678');
    expect(response.headers['x-request-id']).toBe('trace-12345678');
  });

  it('returns safe JSON errors without stack traces', async () => {
    const malformed = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ');
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({ code: 'INVALID_JSON', message: 'Request body is not valid JSON.' });
    const unknown = await request(app).get('/api/does-not-exist');
    expect(unknown.status).toBe(404);
    expect(JSON.stringify(unknown.body)).not.toMatch(/at .*\.(ts|js):\d+/);
  });

  it('strips MongoDB operators from input (NoSQL injection)', async () => {
    const response = await request(app).post('/api/auth/login').send({ email: { $gt: '' }, password: { $ne: null } });
    expect(response.status).toBe(400);
  });
});

describe('sessions: short-lived access token + rotating refresh token', () => {
  let cookie = '';
  let accessToken = '';

  it('sets an httpOnly refresh cookie scoped to /api/auth on register', async () => {
    const response = await request(app).post('/api/auth/register').send({ name: 'Riya Patel', email: 'riya@test.dev', password: 'password123' });
    expect(response.status).toBe(201);
    accessToken = response.body.token;
    cookie = cookieFrom(response)!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/auth');
    expect(cookie).toContain('SameSite=Strict');
    const decoded = jwt.decode(accessToken) as jwt.JwtPayload;
    expect(decoded.exp! - decoded.iat!).toBe(15 * 60);
    expect(decoded.iss).toBe(JWT_ISSUER);
  });

  it('stores only a hash of the refresh token', async () => {
    const raw = cookie.split(';')[0].split('=')[1];
    const records = await RefreshTokenModel.find({}).lean();
    expect(records.length).toBeGreaterThan(0);
    expect(records.some((record) => record.tokenHash === raw)).toBe(false);
  });

  it('rejects refresh without the client header (CSRF defence)', async () => {
    const response = await request(app).post('/api/auth/refresh').set('Cookie', cookie.split(';')[0]);
    expect(response.status).toBe(403);
  });

  it('rotates the refresh token and detects reuse of an old one', async () => {
    const first = await request(app).post('/api/auth/refresh').set(CLIENT).set('Cookie', cookie.split(';')[0]);
    expect(first.status).toBe(200);
    expect(first.body.token).toBeTruthy();
    const rotated = cookieFrom(first)!;
    expect(rotated.split(';')[0]).not.toBe(cookie.split(';')[0]);

    // Replaying the old (rotated) token revokes the whole family …
    const replay = await request(app).post('/api/auth/refresh').set(CLIENT).set('Cookie', cookie.split(';')[0]);
    expect(replay.status).toBe(204);
    expect(replay.headers["x-session-status"]).toBe("reuse_detected");
    // … so the legitimately rotated token stops working too.
    const afterTheft = await request(app).post('/api/auth/refresh').set(CLIENT).set('Cookie', rotated.split(';')[0]);
    expect(afterTheft.status).toBe(204);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await AuditLogModel.exists({ action: 'auth.refresh_reuse_detected' })).toBeTruthy();
  });

  it('logout revokes the session', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'riya@test.dev', password: 'password123' });
    const loginCookie = cookieFrom(login)!.split(';')[0];
    const logout = await request(app).post('/api/auth/logout').set(CLIENT).set('Cookie', loginCookie);
    expect(logout.status).toBe(204);
    const refresh = await request(app).post('/api/auth/refresh').set(CLIENT).set('Cookie', loginCookie);
    expect(refresh.status).toBe(204);
  });

  it('logout-all revokes every session of the user', async () => {
    const a = await request(app).post('/api/auth/login').send({ email: 'riya@test.dev', password: 'password123' });
    const b = await request(app).post('/api/auth/login').send({ email: 'riya@test.dev', password: 'password123' });
    const out = await request(app).post('/api/auth/logout-all').set('Authorization', `Bearer ${a.body.token}`);
    expect(out.status).toBe(204);
    for (const response of [a, b]) {
      const refresh = await request(app).post('/api/auth/refresh').set(CLIENT).set('Cookie', cookieFrom(response)!.split(';')[0]);
      expect(refresh.status).toBe(204);
    }
  });

  it('distinguishes expired and invalid access tokens', async () => {
    const expired = jwt.sign({ email: 'x', name: 'x', typ: 'access' }, env.jwtSecret, { subject: '507f1f77bcf86cd799439011', expiresIn: -10, issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
    const wrongAudience = jwt.sign({ email: 'x', name: 'x', typ: 'access' }, env.jwtSecret, { subject: '507f1f77bcf86cd799439011', expiresIn: 60, issuer: JWT_ISSUER, audience: 'someone-else' });
    const noneAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"sub":"1","typ":"access"}').toString('base64url')}.`;
    expect((await request(app).get('/api/analysis').set('Authorization', `Bearer ${expired}`)).body.code).toBe('TOKEN_EXPIRED');
    expect((await request(app).get('/api/analysis').set('Authorization', `Bearer ${wrongAudience}`)).body.code).toBe('TOKEN_INVALID');
    expect((await request(app).get('/api/analysis').set('Authorization', `Bearer ${noneAlg}`)).body.code).toBe('TOKEN_INVALID');
  });

  it('audits failed logins without leaking whether the email exists', async () => {
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@test.dev', password: 'password123' });
    const wrong = await request(app).post('/api/auth/login').send({ email: 'riya@test.dev', password: 'wrong-password' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.message).toBe(wrong.body.message);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await AuditLogModel.countDocuments({ action: 'auth.login_failed' })).toBeGreaterThanOrEqual(2);
  });
});

describe('rate limiting', () => {
  it('answers 429 with a consistent JSON body once the limit is reached', async () => {
    const mini = express();
    mini.use(createRateLimiter({ name: 'test', windowMs: 60_000, limit: 2, force: true }));
    mini.get('/', (_req, res) => res.json({ ok: true }));
    expect((await request(mini).get('/')).status).toBe(200);
    expect((await request(mini).get('/')).status).toBe(200);
    const limited = await request(mini).get('/');
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
    expect(limited.headers['ratelimit-policy'] ?? limited.headers.ratelimit).toBeDefined();
  });
});

describe('upload scanning', () => {
  const fakeClamd = (reply: string) =>
    new Promise<{ port: number; close: () => void }>((resolve) => {
      const server = net.createServer((socket) => {
        let received = Buffer.alloc(0);
        socket.on('data', (chunk) => {
          received = Buffer.concat([received, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
          // Zero-length chunk marks the end of the INSTREAM.
          if (received.subarray(-4).equals(Buffer.alloc(4))) socket.end(`stream: ${reply}\0`);
        });
      });
      server.listen(0, () => resolve({ port: (server.address() as net.AddressInfo).port, close: () => server.close() }));
    });

  it('speaks the clamd INSTREAM protocol (clean and infected)', async () => {
    const clean = await fakeClamd('OK');
    expect(await new ClamdScanner('127.0.0.1', clean.port).scan(Buffer.from('hello'))).toEqual({ clean: true, engine: 'clamav' });
    clean.close();
    const infected = await fakeClamd('Eicar-Test-Signature FOUND');
    expect(await new ClamdScanner('127.0.0.1', infected.port).scan(Buffer.from('X5O!P%'))).toEqual({ clean: false, engine: 'clamav', signature: 'Eicar-Test-Signature' });
    infected.close();
  });

  it('rejects files the scanner flags', async () => {
    setFileScanner({ engine: 'fake', scan: async () => ({ clean: false, engine: 'fake', signature: 'Test' }) });
    await expect(parseResumeFile(await makePdf(SAMPLE_RESUME), 'resume.pdf', 'application/pdf')).rejects.toMatchObject({ code: 'INFECTED_FILE' });
    setFileScanner(null);
  });
});
