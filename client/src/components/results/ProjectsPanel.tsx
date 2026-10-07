import type { AnalysisReport, EntryAnalysis } from '../../types';
import { Badge, Card, CardHeader, EmptyState, Meter } from '../ui';

const EntryCard = ({ entry }: { entry: EntryAnalysis }) => (
  <div className="rounded-lg border border-line bg-white p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">{entry.title}</h3>
          <Badge tone="outline">{entry.kind}</Badge>
          {entry.isFinalYearProject && <Badge tone="brand">Final-year project</Badge>}
          {entry.roleRelevance === 'related' && <Badge tone="good">Role related to this job</Badge>}
          {entry.roleRelevance === 'unrelated' && <Badge tone="warn">Different role family</Badge>}
        </div>
        {(entry.organization || entry.durationMonths) && (
          <div className="mt-0.5 text-xs text-ink-3">
            {entry.organization}
            {entry.organization && entry.durationMonths ? ' · ' : ''}
            {entry.durationMonths ? `${entry.durationMonths} month${entry.durationMonths === 1 ? '' : 's'}` : ''}
          </div>
        )}
      </div>
      <div className="text-right">
        <div className="text-xl font-semibold tracking-[-0.02em] text-ink">{Math.round(entry.overall)}</div>
        <div className="text-2xs text-ink-4">/ 100</div>
      </div>
    </div>
    {entry.technologies.length > 0 && (
      <div className="mt-3 flex flex-wrap gap-1">
        {entry.technologies.map((tech) => (
          <Badge key={tech} tone={entry.relevantTechnologies.includes(tech) ? 'brand' : 'neutral'}>
            {tech}
          </Badge>
        ))}
      </div>
    )}
    <ul className="mt-4 space-y-2">
      {entry.dimensions.map((dimension) => (
        <li key={dimension.id} title={dimension.note}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-2">{dimension.label}</span>
            <span className="num text-ink-3">{dimension.score.toFixed(1)}/10</span>
          </div>
          <Meter value={dimension.score} max={10} tone="auto" className="mt-1" />
        </li>
      ))}
    </ul>
    {entry.improvements.length > 0 && (
      <div className="mt-4 border-t border-line pt-3">
        <div className="eyebrow mb-1.5">To improve</div>
        <ul className="space-y-1 text-xs text-ink-2">
          {entry.improvements.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    )}
    {entry.flags && entry.flags.length > 0 && (
      <div className="mt-3 border-t border-line pt-3">
        <div className="eyebrow mb-1.5">Flags</div>
        <ul className="space-y-1 text-xs text-warn">
          {entry.flags.map((flag) => (
            <li key={flag}>{flag}</li>
          ))}
        </ul>
      </div>
    )}
  </div>
);

const StudentProfile = ({ report }: { report: AnalysisReport }) => {
  const signals = report.resume.studentSignals;
  if (!signals) return null;
  const rows: Array<[string, string]> = [
    ['Final-year project', signals.finalYearProjects.join(', ') || 'Not labelled — add “Final Year Project” to its heading if applicable'],
    ['Academic / personal projects', String(signals.academicProjects)],
    ['Hackathons', signals.hackathons.join('; ') || 'None mentioned'],
    ['Competitive programming', signals.competitiveProgramming.join('; ') || 'None mentioned'],
    ['Open source', signals.openSource.join('; ') || 'None mentioned'],
    ['Certifications', String(signals.certifications)],
    ['Relevant coursework', signals.coursework.join(', ') || 'None listed'],
    ['GitHub profile', signals.githubLinked ? 'Linked' : 'Not linked'],
  ];
  return (
    <div>
      <h3 className="eyebrow mb-3">{signals.isStudentOrFresher ? 'Fresher profile' : 'Early-career profile'}</h3>
      <dl className="grid gap-x-6 gap-y-2 rounded-lg border border-line bg-white p-4 text-[13px] sm:grid-cols-[12rem_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink-3">{label}</dt>
            <dd className="text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-ink-3">Recognised for context and interview preparation. These signals are not scored separately, so freshers are not penalised for missing them.</p>
    </div>
  );
};

export const ProjectsPanel = ({ report }: { report: AnalysisReport }) => {
  const { projects, internships, experience } = report.projectAnalysis;
  const work = [...internships, ...experience];
  return (
    <Card as="section" id="projects">
      <CardHeader title="Projects, internships & profile" description="Scored on technical depth, relevance to this JD, complexity, implementation evidence, measurable outcomes and clarity. Highlighted technologies appear in the JD." />
      <div className="space-y-6 p-5">
        <StudentProfile report={report} />
        <div>
          <h3 className="eyebrow mb-3">Projects ({projects.length})</h3>
          {projects.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {projects.map((project) => (
                <EntryCard key={project.title} entry={project} />
              ))}
            </div>
          ) : (
            <EmptyState title="No projects detected" description="Add a PROJECTS section — for freshers it is often the strongest evidence of skill." />
          )}
        </div>
        <div>
          <h3 className="eyebrow mb-3">Internships & experience ({work.length})</h3>
          {work.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {work.map((entry) => (
                <EntryCard key={`${entry.kind}-${entry.title}-${entry.organization}`} entry={entry} />
              ))}
            </div>
          ) : (
            <EmptyState title="No internships detected" description="If you have one, add it under an INTERNSHIPS or EXPERIENCE heading with dates." />
          )}
        </div>
      </div>
    </Card>
  );
};
