import { Types } from 'mongoose';
import { ApplicationModel, APPLICATION_STATUSES, type ApplicationStatus } from '../models/Application.js';
import { AnalysisModel } from '../models/Analysis.js';
import { ResumeVersionModel } from '../models/Resume.js';
import { round1 } from '../utils/text.js';

const REACHED_INTERVIEW: ApplicationStatus[] = ['INTERVIEW', 'SELECTED'];

/** All metrics are computed from stored records; nothing is estimated or seeded. */
export const computeAnalytics = async (userId: string) => {
  const uid = new Types.ObjectId(userId);
  const [applications, analyses, versions] = await Promise.all([
    ApplicationModel.find({ userId: uid }).lean(),
    AnalysisModel.find({ userId: uid }).select('scores jobTitle company createdAt versionNumber resumeId').sort({ createdAt: 1 }).lean(),
    ResumeVersionModel.find({ userId: uid }).select('scores resumeId versionNumber').lean(),
  ]);

  // Submitted = actually sent. A withdrawal counts only if the application had been sent first.
  const submitted = applications.filter((application) => application.status !== 'SAVED' && (application.status !== 'WITHDRAWN' || Boolean(application.appliedAt)));
  const interviews = applications.filter((application) => application.statusHistory.some((entry) => REACHED_INTERVIEW.includes(entry.status)) || REACHED_INTERVIEW.includes(application.status));
  const offers = applications.filter((application) => application.status === 'SELECTED');
  const avg = (values: number[]) => (values.length ? round1(values.reduce((total, value) => total + value, 0) / values.length) : null);

  // Latest version per resume represents the "current" resume quality.
  const latestByResume = new Map<string, (typeof versions)[number]>();
  versions.forEach((version) => {
    const key = String(version.resumeId);
    const current = latestByResume.get(key);
    if (version.scores && (!current || version.versionNumber > current.versionNumber)) latestByResume.set(key, version);
  });

  const byStatus = APPLICATION_STATUSES.map((status) => ({ status, count: applications.filter((application) => application.status === status).length }));
  const fitBands = [
    { band: '0–49', min: 0, max: 50 },
    { band: '50–64', min: 50, max: 65 },
    { band: '65–79', min: 65, max: 80 },
    { band: '80–100', min: 80, max: 101 },
  ].map(({ band, min, max }) => {
    const inBand = applications.filter((application) => typeof application.jobFitScore === 'number' && application.jobFitScore >= min && application.jobFitScore < max);
    return {
      band,
      applications: inBand.length,
      interviews: inBand.filter((application) => interviews.includes(application)).length,
    };
  });

  return {
    totals: {
      applications: applications.length,
      submitted: submitted.length,
      interviews: interviews.length,
      offers: offers.length,
      rejected: applications.filter((application) => application.status === 'REJECTED').length,
      analyses: analyses.length,
      interviewRate: submitted.length ? round1((interviews.length / submitted.length) * 100) : null,
      selectionRate: submitted.length ? round1((offers.length / submitted.length) * 100) : null,
      averageJobFit: avg(analyses.map((analysis) => analysis.scores.jobFit)),
      averageResumeQuality: avg([...latestByResume.values()].map((version) => version.scores!.resumeQuality)),
      averageAtsReadiness: avg(analyses.map((analysis) => analysis.scores.atsReadiness)),
      averageApplicationJobFit: avg(applications.map((application) => application.jobFitScore).filter((value): value is number => typeof value === 'number')),
    },
    byStatus,
    fitBands,
    scoreTrend: analyses.map((analysis) => ({
      id: String(analysis._id),
      date: analysis.createdAt,
      label: `${analysis.jobTitle}${analysis.company ? ` · ${analysis.company}` : ''} (v${analysis.versionNumber})`,
      jobFit: analysis.scores.jobFit,
      atsReadiness: analysis.scores.atsReadiness,
      resumeQuality: analysis.scores.resumeQuality,
    })),
    recentAnalyses: [...analyses].reverse().slice(0, 5).map((analysis) => ({ id: String(analysis._id), jobTitle: analysis.jobTitle, company: analysis.company, scores: analysis.scores, createdAt: analysis.createdAt })),
  };
};
