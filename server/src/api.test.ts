import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from './app.js';
import { makeDocx, makePdf } from './test/fileFactory.js';
import { SAMPLE_JD, SAMPLE_RESUME } from './test/fixtures.js';
import { UserModel } from './models/User.js';

let mongo: MongoMemoryServer;
let token = '';
let refreshCookie = '';
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe('end-to-end API flow', () => {
  let analysisId = '';
  let resumeId = '';
  let fixedAnalysisId = '';

  it('registers, logs in and updates the candidate profile', async () => {
    const register = await request(app).post('/api/auth/register').send({ name: 'Aditi Sharma', email: 'aditi@test.dev', password: 'password123', targetRole: 'Full Stack Developer' });
    expect(register.status).toBe(201);
    const duplicate = await request(app).post('/api/auth/register').send({ name: 'Aditi Sharma', email: 'aditi@test.dev', password: 'password123' });
    expect(duplicate.status).toBe(409);
    const login = await request(app).post('/api/auth/login').send({ email: 'aditi@test.dev', password: 'password123' });
    expect(login.status).toBe(200);
    token = login.body.token;
    refreshCookie = login.headers['set-cookie'][0].split(';')[0];
    const bad = await request(app).post('/api/auth/login').send({ email: 'aditi@test.dev', password: 'wrong-password' });
    expect(bad.status).toBe(401);
    const profile = await request(app).put('/api/auth/profile').set(auth()).send({ profile: { college: 'RV College of Engineering', graduationYear: 2026, github: 'github.com/aditisharma' } });
    expect(profile.status).toBe(200);
    expect(profile.body.user.profile.college).toBe('RV College of Engineering');
    const me = await request(app).get('/api/auth/me').set(auth());
    expect(me.body.user.profile.graduationYear).toBe(2026);
  });

  it('changes the password securely and revokes refresh sessions', async () => {
    const unauthenticated = await request(app).post('/api/auth/change-password').send({ currentPassword: 'password123', newPassword: 'NewSecurePass123!' });
    expect(unauthenticated.status).toBe(401);

    const incorrect = await request(app).post('/api/auth/change-password').set(auth()).send({ currentPassword: 'incorrect', newPassword: 'NewSecurePass123!' });
    expect(incorrect.status).toBe(400);
    expect(incorrect.body.message).toBe('Current password is incorrect.');

    const weak = await request(app).post('/api/auth/change-password').set(auth()).send({ currentPassword: 'password123', newPassword: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.message).toBe('Password must be at least 8 characters.');

    const unchanged = await request(app).post('/api/auth/change-password').set(auth()).send({ currentPassword: 'password123', newPassword: 'password123' });
    expect(unchanged.status).toBe(400);
    expect(unchanged.body.message).toBe('New password must be different from your current password.');

    const response = await request(app).post('/api/auth/change-password').set(auth()).send({ currentPassword: 'password123', newPassword: 'NewSecurePass123!' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Password changed successfully.' });
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|password123|NewSecurePass123!/);

    const user = await UserModel.findOne({ email: 'aditi@test.dev' });
    expect(user).not.toBeNull();
    expect(await bcrypt.compare('NewSecurePass123!', user!.passwordHash)).toBe(true);
    expect(await bcrypt.compare('password123', user!.passwordHash)).toBe(false);

    const oldLogin = await request(app).post('/api/auth/login').send({ email: 'aditi@test.dev', password: 'password123' });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post('/api/auth/login').send({ email: 'aditi@test.dev', password: 'NewSecurePass123!' });
    expect(newLogin.status).toBe(200);
    token = newLogin.body.token;

    const revokedRefresh = await request(app).post('/api/auth/refresh').set('X-Requested-With', 'resumefit').set('Cookie', refreshCookie);
    expect(revokedRefresh.status).toBe(204);
  });

  it('rejects unauthenticated access', async () => {
    expect((await request(app).get('/api/analysis')).status).toBe(401);
  });

  it('uploads a real PDF, parses it and returns a full analysis', async () => {
    const pdf = await makePdf(SAMPLE_RESUME);
    const response = await request(app).post('/api/analysis').set(auth()).field('jobDescription', SAMPLE_JD).field('title', 'Aditi resume').attach('resume', pdf, { filename: 'aditi.pdf', contentType: 'application/pdf' });
    expect(response.status).toBe(201);
    const { report } = response.body;
    expect(report.extraction.fileType).toBe('pdf');
    expect(report.scores.jobFit).toBeGreaterThan(0);
    expect(report.jobFit.requirementMatches.find((m: { canonical: string }) => m.canonical === 'go').finalMatchState).toBe('MISSING');
    expect(report.costingPoints.jobFit.length).toBeGreaterThan(0);
    expect(report.fixes.length).toBeGreaterThan(0);
    expect(report.interview.questions.length).toBeGreaterThan(0);
    analysisId = response.body.id;
    resumeId = response.body.resumeId;
  });

  it('rejects a corrupted upload with a clear error', async () => {
    const response = await request(app).post('/api/analysis').set(auth()).field('jobDescription', SAMPLE_JD).attach('resume', Buffer.from('%PDF-1.4 this is not really a pdf'.padEnd(400, 'x')), { filename: 'broken.pdf', contentType: 'application/pdf' });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('CORRUPTED_FILE');
  });

  it('accepts DOCX uploads too', async () => {
    const docx = await makeDocx(SAMPLE_RESUME);
    const response = await request(app).post('/api/analysis').set(auth()).field('jobDescription', SAMPLE_JD).attach('resume', docx, { filename: 'aditi.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    expect(response.status).toBe(201);
    expect(response.body.report.extraction.fileType).toBe('docx');
  });

  it('refuses unconfirmed new claims and unfilled placeholders', async () => {
    const analysis = (await request(app).get(`/api/analysis/${analysisId}`).set(auth())).body;
    const missing = analysis.report.fixes.find((fix: { type: string }) => fix.type === 'missing-skill');
    const evidence = analysis.report.fixes.find((fix: { type: string }) => fix.type === 'add-evidence');
    const response = await request(app).post(`/api/analysis/${analysisId}/fixes`).set(auth()).send({ fixes: [{ id: missing.id }, { id: evidence.id }] });
    expect(response.status).toBe(422);
    const messages = response.body.details.errors.map((error: { message: string }) => error.message).join(' ');
    expect(messages).toMatch(/Confirm it is true/);
    expect(messages).toMatch(/placeholder/);
  });

  it('applies fixes, saves a new version and re-scores with before/after deltas', async () => {
    const analysis = (await request(app).get(`/api/analysis/${analysisId}`).set(auth())).body;
    const auto = analysis.report.fixes.filter((fix: { requiresUserInput: boolean; requiresConfirmation: boolean }) => !fix.requiresUserInput && !fix.requiresConfirmation);
    const evidence = analysis.report.fixes.find((fix: { type: string; targetRequirement: string }) => fix.type === 'add-evidence' && fix.targetRequirement.startsWith('PostgreSQL'));
    const response = await request(app)
      .post(`/api/analysis/${analysisId}/fixes`)
      .set(auth())
      .send({
        label: 'Targeted for Acme',
        fixes: [...auto.map((fix: { id: string }) => ({ id: fix.id })), { id: evidence.id, finalText: '- Designed the PostgreSQL schema for orders and wrote the migrations', confirmed: true }],
      });
    expect(response.status).toBe(201);
    const { comparison, analysis: after } = response.body;
    const jobFit = comparison.scores.find((score: { key: string }) => score.key === 'jobFit');
    expect(jobFit.before).toBe(analysis.report.scores.jobFit);
    expect(jobFit.after).toBe(after.report.scores.jobFit);
    expect(jobFit.delta).toBeGreaterThan(0);
    expect(after.versionNumber).toBe(2);
    expect(after.previousAnalysisId).toBe(analysisId);
    fixedAnalysisId = after.id;
  });

  it.skipIf(Boolean(process.env.ANTHROPIC_API_KEY))('reports AI rewriting as disabled when no API key is configured (no fake output)', async () => {
    const response = await request(app).post(`/api/analysis/${analysisId}/ai-rewrite`).set(auth());
    expect(response.status).toBe(501);
    expect(response.body.code).toBe('AI_DISABLED');
  });

  it('re-scoring the same version is deterministic', async () => {
    const response = await request(app).post(`/api/analysis/${fixedAnalysisId}/rescore`).set(auth());
    expect(response.body.identical).toBe(true);
  });

  it('lists, compares and restores resume versions', async () => {
    const versions = (await request(app).get(`/api/resumes/${resumeId}/versions`).set(auth())).body.versions;
    expect(versions.map((version: { versionNumber: number }) => version.versionNumber)).toEqual([2, 1]);
    expect(versions[0].changeCount).toBeGreaterThan(0);
    const compare = await request(app).get(`/api/resumes/compare/${versions[1].id}/${versions[0].id}`).set(auth());
    expect(compare.status).toBe(200);
    expect(compare.body.diff.some((line: { type: string }) => line.type === 'added')).toBe(true);
    expect(compare.body.scoreDeltas.find((delta: { key: string }) => delta.key === 'jobFit').delta).toBeGreaterThan(0);

    const restore = await request(app).post(`/api/resumes/versions/${versions[1].id}/restore`).set(auth());
    expect(restore.status).toBe(201);
    expect(restore.body.analysis.versionNumber).toBe(3);
    expect(restore.body.analysis.scores.jobFit).toBe(versions[1].scores.jobFit);
  });

  it('marks interview questions as practised and raises readiness', async () => {
    const before = (await request(app).get(`/api/analysis/${fixedAnalysisId}`).set(auth())).body;
    const questionId = before.report.interview.questions[0].id;
    const response = await request(app).patch(`/api/analysis/${fixedAnalysisId}/practice`).set(auth()).send({ questionId, practiced: true });
    expect(response.status).toBe(200);
    expect(response.body.practicedQuestionIds).toContain(questionId);
    expect(response.body.scores.interviewReadiness).toBeGreaterThan(before.scores.interviewReadiness);
  });

  it('tracks applications with job-fit taken from the analysis', async () => {
    const created = await request(app).post('/api/applications').set(auth()).send({ company: 'Acme Fintech', role: 'Junior Full Stack Developer', analysisId: fixedAnalysisId, status: 'APPLIED' });
    expect(created.status).toBe(201);
    expect(created.body.resumeVersionNumber).toBe(2);
    expect(created.body.jobFitScore).toBeGreaterThan(0);
    const updated = await request(app).patch(`/api/applications/${created.body.id}`).set(auth()).send({ status: 'INTERVIEW', notes: 'Round 1 on Monday' });
    expect(updated.body.statusHistory.map((entry: { status: string }) => entry.status)).toEqual(['APPLIED', 'INTERVIEW']);
    await request(app).post('/api/applications').set(auth()).send({ company: 'Globex', role: 'SDE Intern', status: 'REJECTED' });
    await request(app).post('/api/applications').set(auth()).send({ company: 'Initech', role: 'Backend Intern' });
  });

  it('computes analytics from stored records', async () => {
    const response = await request(app).get('/api/analytics').set(auth());
    expect(response.status).toBe(200);
    expect(response.body.totals).toMatchObject({ applications: 3, submitted: 2, interviews: 1, offers: 0, interviewRate: 50, selectionRate: 0 });
    expect(response.body.totals.averageJobFit).toBeGreaterThan(0);
    expect(response.body.scoreTrend.length).toBeGreaterThanOrEqual(4);
  });

  it('serves the research dataset description', async () => {
    const response = await request(app).get('/api/research/dataset').set(auth());
    expect(response.body.counts.requirementLabels).toBeGreaterThan(100);
  });

  it('exports the selected version as DOCX and PDF, and the analysis as a PDF/JSON report', async () => {
    const versions = (await request(app).get(`/api/resumes/${resumeId}/versions`).set(auth())).body.versions;
    const latest = versions[0];
    const docx = await request(app).get(`/api/resumes/versions/${latest.id}/export?format=docx`).set(auth()).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(docx.status).toBe(200);
    expect(docx.headers['content-type']).toContain('wordprocessingml');
    expect(docx.headers['content-disposition']).toMatch(/Aditi-resume-v\d+\.docx/);
    expect((docx.body as Buffer).subarray(0, 2).toString()).toBe('PK');

    const pdf = await request(app).get(`/api/resumes/versions/${latest.id}/export?format=pdf`).set(auth());
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');

    const report = await request(app).get(`/api/analysis/${fixedAnalysisId}/report`).set(auth());
    expect(report.status).toBe(200);
    expect(report.headers['content-type']).toBe('application/pdf');
    const json = await request(app).get(`/api/analysis/${fixedAnalysisId}/report?format=json`).set(auth());
    expect(json.body.report.scores.jobFit).toBeGreaterThan(0);
    expect((await request(app).get(`/api/resumes/versions/${latest.id}/export?format=exe`).set(auth())).status).toBe(400);
  });

  it('stores the scoring version and keeps version history immutable', async () => {
    const versions = (await request(app).get(`/api/resumes/${resumeId}/versions`).set(auth())).body.versions;
    const original = versions[versions.length - 1];
    expect(original.scoringVersion).toBe('2.1.0');
    const before = (await request(app).get(`/api/resumes/versions/${original.id}`).set(auth())).body;
    // Re-analysing v1 against a different JD must not overwrite v1's snapshot.
    await request(app).post('/api/analysis').set(auth()).field('jobDescription', `Data Analyst\nRequirements\n- SQL\n- Python\n- Power BI\n- Excel for reporting dashboards and stakeholder analysis`).field('resumeVersionId', original.id);
    const after = (await request(app).get(`/api/resumes/versions/${original.id}`).set(auth())).body;
    expect(after.scores).toEqual(before.scores);
    expect(after.job.role).toBe(before.job.role);
    // Direct attempts to rewrite content are ignored by the schema.
    const { ResumeVersionModel } = await import('./models/Resume.js');
    await ResumeVersionModel.updateOne({ _id: original.id }, { text: 'tampered' });
    expect((await ResumeVersionModel.findById(original.id))!.text).toBe(before.text);
  });

  it('requires confirmation before saving a manual edit that adds new claims', async () => {
    const latest = (await request(app).get(`/api/resumes/${resumeId}/versions`).set(auth())).body.versions[0];
    const text = (await request(app).get(`/api/resumes/versions/${latest.id}`).set(auth())).body.text as string;
    const edited = `${text}\n- Built a Kafka consumer in Go processing 5000 events per minute`;
    const unconfirmed = await request(app).post(`/api/resumes/${resumeId}/versions`).set(auth()).send({ text: edited });
    expect(unconfirmed.status).toBe(422);
    expect(unconfirmed.body.details.code).toBe('CONFIRMATION_REQUIRED');
    expect(unconfirmed.body.details.violations.map((violation: { value: string }) => violation.value)).toEqual(expect.arrayContaining(['Kafka', 'Go', '5000']));
    const confirmed = await request(app).post(`/api/resumes/${resumeId}/versions`).set(auth()).send({ text: edited, confirmed: true, label: 'Added Kafka project' });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.comparison.attribution.some((item: { target: string; causes: unknown[] }) => item.target === 'Go' && item.causes.length > 0)).toBe(true);
  });

  it('attributes before/after differences to the applied changes', async () => {
    const compare = await request(app).get(`/api/analysis/${fixedAnalysisId}/compare/${analysisId}`).set(auth());
    const postgres = compare.body.comparison.attribution.find((item: { group: string; target: string }) => item.group === 'Requirement' && item.target === 'PostgreSQL');
    expect(postgres.causes[0].text).toContain('PostgreSQL schema');
    expect(compare.body.changes.some((change: { type: string }) => change.type === 'add-evidence')).toBe(true);
  });

  it('supports the Withdrawn status without counting it as submitted', async () => {
    const created = await request(app).post('/api/applications').set(auth()).send({ company: 'Umbrella', role: 'Backend Intern', status: 'WITHDRAWN' });
    expect(created.status).toBe(201);
    expect(created.body.appliedAt).toBeNull();
    const analytics = (await request(app).get('/api/analytics').set(auth())).body;
    expect(analytics.byStatus.find((item: { status: string }) => item.status === 'WITHDRAWN').count).toBe(1);
    expect(analytics.totals.submitted).toBe(2);
  });

  it('isolates users from each other', async () => {
    const other = await request(app).post('/api/auth/register').send({ name: 'Other User', email: 'other@test.dev', password: 'password123' });
    const response = await request(app).get(`/api/analysis/${analysisId}`).set({ Authorization: `Bearer ${other.body.token}` });
    expect(response.status).toBe(404);
  });

  it('returns a clear 503 when the database is unavailable (no silent fallback)', async () => {
    await mongoose.disconnect();
    const response = await request(app).get('/api/analysis').set(auth());
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('DATABASE_UNAVAILABLE');
    const register = await request(app).post('/api/auth/register').send({ name: 'X Y', email: 'x@test.dev', password: 'password123' });
    expect(register.status).toBe(503);
    await mongoose.connect(mongo.getUri());
  });
});
