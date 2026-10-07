import type {
  Analysis,
  AnalysisSummary,
  Analytics,
  Application,
  ApplicationStatus,
  AuthUser,
  CandidateProfile,
  Experiment,
  ReportComparison,
  ResearchDataset,
  ResumeFamily,
  VersionComparison,
  VersionDetail,
  VersionSummary,
} from '../types';

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public details?: unknown) {
    super(message);
  }
}

/**
 * Session model: the short-lived access token lives only in memory; the long-lived refresh token is an
 * httpOnly cookie the browser sends to /api/auth/refresh. Nothing secret is written to localStorage.
 */
let accessToken: string | null = null;
let refreshInFlight: Promise<{ token: string; user: AuthUser } | null> | null = null;
let onSessionEnded: ((reason: 'expired' | 'logout') => void) | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export const setSessionEndedHandler = (handler: (reason: 'expired' | 'logout') => void) => {
  onSessionEnded = handler;
};

const CLIENT_HEADER = { 'X-Requested-With': 'resumefit' };

const FRIENDLY: Record<string, string> = {
  NETWORK: 'Cannot reach the RESUMEFIT server. Check your connection and try again.',
  DATABASE_UNAVAILABLE: 'The database is temporarily unavailable. Please try again shortly.',
  RATE_LIMITED: 'Too many requests. Please wait a little and try again.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
};

/** Exchanges the refresh cookie for a new access token. Concurrent callers share one request. */
export const refreshSession = () => {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include', headers: CLIENT_HEADER })
      .then(async (response) => {
        if (response.status !== 200) return null; // 204 = no session
        const data = (await response.json()) as { token: string; user: AuthUser };
        accessToken = data.token;
        return data;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
};

type RequestInit = { method?: string; body?: unknown; form?: FormData; auth?: boolean; raw?: boolean };

const send = (endpoint: string, init: RequestInit) => {
  const headers = new Headers();
  if (init.auth !== false && accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  let body: BodyInit | undefined;
  if (init.form) body = init.form;
  else if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.body);
  }
  return fetch(`${API_BASE}${endpoint}`, { method: init.method ?? 'GET', headers, body, credentials: 'include' });
};

const toError = async (response: Response) => {
  const data = (await response.json().catch(() => ({}))) as { message?: string; code?: string; details?: unknown };
  return new ApiError((data.code && FRIENDLY[data.code] && response.status >= 429 ? FRIENDLY[data.code] : data.message) ?? `Request failed (${response.status})`, response.status, data.code, data.details);
};

const request = async <T>(endpoint: string, init: RequestInit = {}): Promise<T> => {
  let response: Response;
  try {
    response = await send(endpoint, init);
    // Access tokens are short-lived: refresh once and retry transparently.
    if (response.status === 401 && init.auth !== false) {
      const refreshed = await refreshSession();
      if (refreshed) response = await send(endpoint, init);
      else if (accessToken) {
        accessToken = null;
        onSessionEnded?.('expired');
      }
    }
  } catch {
    throw new ApiError(FRIENDLY.NETWORK, 0, 'NETWORK');
  }
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json().catch(() => ({}))) as T;
};

/** Downloads a file produced by the API (auth header + refresh handled like any request). */
export const downloadFile = async (endpoint: string, fallbackName: string) => {
  let response: Response;
  try {
    response = await send(endpoint, {});
    if (response.status === 401 && (await refreshSession())) response = await send(endpoint, {});
  } catch {
    throw new ApiError(FRIENDLY.NETWORK, 0, 'NETWORK');
  }
  if (!response.ok) throw await toError(response);
  const blob = await response.blob();
  const name = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Auth & profile
export const registerUser = (payload: { name: string; email: string; password: string; targetRole?: string }) =>
  request<{ token: string; user: AuthUser }>('/auth/register', { method: 'POST', body: payload, auth: false });
export const loginUser = (payload: { email: string; password: string }) => request<{ token: string; user: AuthUser }>('/auth/login', { method: 'POST', body: payload, auth: false });
export const logoutUser = () =>
  fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include', headers: CLIENT_HEADER })
    .catch(() => undefined)
    .finally(() => {
      accessToken = null;
    });
export const logoutEverywhere = () => request<void>('/auth/logout-all', { method: 'POST' });
export const changePassword = (payload: { currentPassword: string; newPassword: string }) =>
  request<{ message: string }>('/auth/change-password', { method: 'POST', body: payload });
export const getMe = () => request<{ user: AuthUser }>('/auth/me');
export const updateProfile = (payload: { name?: string; targetRole?: string; profile?: CandidateProfile }) => request<{ user: AuthUser }>('/auth/profile', { method: 'PUT', body: payload });

// Health
export const getHealth = () =>
  request<{ status: string; database: { connected: boolean; mode: string }; scoringVersion: string; aiRewrite: boolean }>('/health', { auth: false });

// Analyses
export const createAnalysis = (input: { jobDescription: string; file?: File | null; resumeText?: string; title?: string; resumeVersionId?: string }) => {
  const form = new FormData();
  form.set('jobDescription', input.jobDescription);
  if (input.file) form.set('resume', input.file);
  if (input.resumeText) form.set('resumeText', input.resumeText);
  if (input.title) form.set('title', input.title);
  if (input.resumeVersionId) form.set('resumeVersionId', input.resumeVersionId);
  return request<Analysis>('/analysis', { method: 'POST', form });
};
export const listAnalyses = () => request<{ analyses: AnalysisSummary[] }>('/analysis');
export const getAnalysis = (id: string) => request<Analysis>(`/analysis/${id}`);
export const compareAnalyses = (id: string, otherId: string) =>
  request<{ before: AnalysisSummary; after: AnalysisSummary; comparison: ReportComparison; changes: VersionDetail['changes'] }>(`/analysis/${id}/compare/${otherId}`);
export const applyFixes = (id: string, fixes: Array<{ id: string; finalText?: string; confirmed?: boolean }>, label?: string) =>
  request<{ analysis: Analysis; comparison: ReportComparison; changes: Array<{ id: string; applied: boolean; reason?: string }> }>(`/analysis/${id}/fixes`, { method: 'POST', body: { fixes, label } });
export const rescoreAnalysis = (id: string) => request<{ identical: boolean; scores: Analysis['scores'] }>(`/analysis/${id}/rescore`, { method: 'POST' });
export const setPracticed = (id: string, questionId: string, practiced: boolean) =>
  request<{ practicedQuestionIds: string[]; interview: Analysis['report']['interview']; scores: Analysis['scores'] }>(`/analysis/${id}/practice`, { method: 'PATCH', body: { questionId, practiced } });
export const aiRewrite = (id: string) =>
  request<{ model: string; rewrites: Array<{ fixId: string; original: string; text: string; accepted: boolean; violations: Array<{ type: string; value: string }> }> }>(`/analysis/${id}/ai-rewrite`, { method: 'POST' });
export const deleteAnalysis = (id: string) => request<void>(`/analysis/${id}`, { method: 'DELETE' });
export const downloadReport = (id: string) => downloadFile(`/analysis/${id}/report?format=pdf`, 'resumefit-report.pdf');

// Resumes & versions
export const listResumes = () => request<{ resumes: ResumeFamily[] }>('/resumes');
export const listVersions = (resumeId: string) => request<{ resume: { id: string; title: string }; versions: VersionSummary[] }>(`/resumes/${resumeId}/versions`);
export const getVersion = (versionId: string) => request<VersionDetail>(`/resumes/versions/${versionId}`);
export const createVersion = (resumeId: string, payload: { text: string; jobDescription?: string; label?: string; confirmed?: boolean }) =>
  request<{ analysis: Analysis; comparison: ReportComparison | null }>(`/resumes/${resumeId}/versions`, { method: 'POST', body: payload });
export const restoreVersion = (versionId: string) => request<{ analysis: Analysis; comparison: ReportComparison | null }>(`/resumes/versions/${versionId}/restore`, { method: 'POST' });
export const compareVersions = (a: string, b: string) => request<VersionComparison>(`/resumes/compare/${a}/${b}`);
export const downloadResume = (versionId: string, format: 'docx' | 'pdf') => downloadFile(`/resumes/versions/${versionId}/export?format=${format}`, `resume.${format}`);

// Applications
export type ApplicationInput = { company: string; role: string; jobDescription?: string; jobUrl?: string; location?: string; status?: ApplicationStatus; notes?: string; appliedAt?: string; deadline?: string; analysisId?: string };
export const listApplications = () => request<{ applications: Application[] }>('/applications');
export const createApplication = (payload: ApplicationInput) => request<Application>('/applications', { method: 'POST', body: payload });
export const updateApplication = (id: string, payload: Partial<ApplicationInput>) => request<Application>(`/applications/${id}`, { method: 'PATCH', body: payload });
export const deleteApplication = (id: string) => request<void>(`/applications/${id}`, { method: 'DELETE' });

// Analytics & research
export const getAnalytics = () => request<Analytics>('/analytics');
export const getResearchDataset = () => request<ResearchDataset>('/research/dataset');
export const listExperiments = () => request<{ experiments: Experiment[] }>('/research/experiments');
export const runExperiment = (payload: { name?: string; methods?: string[] }) => request<Experiment>('/research/experiments', { method: 'POST', body: payload });
