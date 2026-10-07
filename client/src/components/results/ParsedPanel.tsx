import { useState } from 'react';
import type { AnalysisReport } from '../../types';
import { Badge, Card, CardHeader, Tabs } from '../ui';

const STRENGTH_TONE = { HIGH: 'good', MEDIUM: 'brand', LOW: 'neutral' } as const;

export const ParsedPanel = ({ report }: { report: AnalysisReport }) => {
  const [tab, setTab] = useState<'resume' | 'job'>('resume');
  const { resume, job, extraction } = report;
  return (
    <Card as="section" id="parsed">
      <CardHeader
        title="What the engine extracted"
        description="The structured data every score is computed from. If something is wrong here, fix it in the resume."
        action={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'resume', label: 'Resume' },
              { value: 'job', label: 'Job description' },
            ]}
          />
        }
      />
      {tab === 'resume' ? (
        <div className="grid gap-6 p-5 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-5 text-[13px]">
            <div>
              <h3 className="eyebrow mb-2">Candidate</h3>
              <dl className="grid grid-cols-[6rem_1fr] gap-y-1">
                {[
                  ['Name', resume.candidate.name],
                  ['Email', resume.candidate.email],
                  ['Phone', resume.candidate.phone],
                  ['Location', resume.candidate.location],
                  ['Links', resume.links.map((link) => link.url).join(', ')],
                ].map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-ink-4">{label}</dt>
                    <dd className="truncate text-ink">{value || <span className="text-ink-4">Not found</span>}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <h3 className="eyebrow mb-2">Sections detected</h3>
              <ul className="flex flex-wrap gap-1">
                {resume.sections
                  .filter((section) => section.key !== 'header')
                  .map((section) => (
                    <li key={`${section.key}-${section.heading}`}>
                      <Badge tone={section.standardHeading ? 'outline' : 'warn'}>
                        {section.heading} → {section.key}
                      </Badge>
                    </li>
                  ))}
              </ul>
            </div>
            <div>
              <h3 className="eyebrow mb-2">Education</h3>
              <ul className="space-y-1">
                {resume.education.map((entry, index) => (
                  <li key={index} className="text-ink-2">
                    {[entry.degree, entry.field, entry.institution, entry.year, entry.score].filter(Boolean).join(' · ') || entry.raw}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="eyebrow mb-2">File</h3>
              <p className="text-ink-2">
                {extraction.fileType.toUpperCase()}
                {extraction.fileName ? ` · ${extraction.fileName}` : ''}
                {extraction.pageCount ? ` · ${extraction.pageCount} page${extraction.pageCount > 1 ? 's' : ''}` : ''} · {extraction.charCount.toLocaleString()} characters · {resume.stats.wordCount} words ·{' '}
                {resume.stats.bulletCount} bullets
              </p>
              {extraction.warnings.length > 0 && <p className="mt-1 text-xs text-ink-4">{extraction.warnings.join(' ')}</p>}
            </div>
          </div>
          <div>
            <h3 className="eyebrow mb-2">Skills and evidence strength</h3>
            <p className="mb-3 text-xs text-ink-3">High = used in a project/internship bullet. Medium = in a tech stack, certification or achievement. Low = only listed in Skills.</p>
            <ul className="flex flex-wrap gap-1.5">
              {resume.skills.map((skill) => (
                <li key={skill.id}>
                  <span title={skill.evidence.map((item) => `${item.source}: ${item.text}`).join('\n')}>
                    <Badge tone={STRENGTH_TONE[skill.evidenceStrength]}>
                      {skill.skill}
                      <span className="font-normal">· {skill.evidenceStrength.toLowerCase()}</span>
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 p-5 text-[13px] lg:grid-cols-2">
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5">
            {[
              ['Role', job.role],
              ['Company', job.company],
              ['Seniority', job.seniority.toLowerCase()],
              ['Experience', job.experience.raw ?? 'Not specified'],
              ['Education', job.education.raw ?? 'Not specified'],
              ['Tools', job.tools.join(', ')],
              ['Domain', job.domainKeywords.join(', ')],
            ].map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-ink-4">{label}</dt>
                <dd className="text-ink">{value || <span className="text-ink-4">—</span>}</dd>
              </div>
            ))}
          </dl>
          <div className="space-y-4">
            {[
              { title: 'Mandatory skills', items: job.mandatorySkills },
              { title: 'Preferred skills', items: job.preferredSkills },
            ].map((group) => (
              <div key={group.title}>
                <h3 className="eyebrow mb-2">{group.title}</h3>
                <ul className="flex flex-wrap gap-1.5">
                  {group.items.map((req) => (
                    <li key={req.id}>
                      <Badge tone="outline">
                        {req.originalPhrase !== req.canonicalName ? (
                          <>
                            “{req.originalPhrase}” → {req.canonicalName}
                          </>
                        ) : (
                          req.canonicalName
                        )}
                      </Badge>
                    </li>
                  ))}
                  {!group.items.length && <li className="text-ink-4">None detected</li>}
                </ul>
              </div>
            ))}
            <div>
              <h3 className="eyebrow mb-2">Responsibilities</h3>
              <ul className="list-disc space-y-1 pl-4 text-ink-2">
                {job.responsibilities.map((item) => (
                  <li key={item.id}>{item.text}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};
