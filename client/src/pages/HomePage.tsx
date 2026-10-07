import { ArrowRight, Check, FileSearch, ListChecks, MessagesSquare, ShieldCheck, Target, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, MatchBadge } from '../components/ui';

const steps = [
  { icon: FileSearch, title: 'Parse', text: 'Upload a PDF or DOCX. Sections, projects, internships and skills are extracted, and each skill is linked to the bullet that proves it.' },
  { icon: Target, title: 'Match', text: 'Every JD requirement is normalised (Postgres → PostgreSQL) and checked against real evidence, not just a keyword in your skills list.' },
  { icon: ListChecks, title: 'Explain', text: 'See what is costing you points, down to the requirement, with weights you can audit.' },
  { icon: Wrench, title: 'Fix', text: 'Apply rewording that uses only facts already in your resume. Re-score the new version with the same engine.' },
  { icon: MessagesSquare, title: 'Prepare', text: 'Interview questions generated from the role, your projects and your gaps.' },
];

const example = [
  { label: 'React', state: 'STRONG_MATCH' as const },
  { label: 'Node.js', state: 'MATCH' as const },
  { label: 'PostgreSQL', state: 'WEAK_EVIDENCE' as const },
  { label: 'Go', state: 'MISSING' as const },
];

export const HomePage = () => (
  <div className="space-y-24 pb-8">
    <section className="grid items-center gap-12 rounded-[32px] bg-gradient-to-br from-brand-50 via-white/70 to-[#E9F8F5] p-4 pt-8 sm:p-8 lg:grid-cols-[1.08fr_0.92fr] lg:p-10">
      <div>
        <Badge tone="outline" className="mb-5 rounded-full border-brand-100 bg-white/80 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-brand-700 shadow-sm">
          For final-year students and freshers
        </Badge>
        <h1 className="max-w-[620px] text-4xl font-semibold leading-[0.96] tracking-[-0.055em] text-ink sm:text-[56px] lg:text-[64px]">
          Know exactly why your resume <span className="text-brand-700">fits the job.</span>
        </h1>
        <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-ink-3">
          Compare your resume with a real job description, understand every gap, and fix what is holding you back.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/register" className="focus-ring inline-flex h-12 items-center gap-2 rounded-md bg-brand-600 px-5 text-[15px] font-medium text-white shadow-[0_8px_20px_rgba(70,86,214,0.22)] transition hover:bg-brand-700">
            Analyze My Resume <ArrowRight className="size-4" />
          </Link>
          <a href="#how" className="focus-ring inline-flex h-12 items-center rounded-md border border-brand-100 bg-white/90 px-5 text-[15px] font-medium text-brand-700 shadow-sm transition hover:border-brand-200 hover:bg-white">
            See How It Works
          </a>
        </div>
        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-3">
          {['PDF & DOCX parsing', 'No invented facts', 'Before/after re-scoring'].map((item) => (
            <li key={item} className="flex items-center gap-1.5">
              <Check className="size-3.5 text-good" aria-hidden /> {item}
            </li>
          ))}
        </ul>
      </div>

      <figure className="rounded-[28px] border border-white/90 bg-white p-5 shadow-[0_24px_60px_rgba(45,62,120,0.14)] sm:p-6" aria-label="Example results preview">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-700">Job fit</span>
          <span className="text-[11px] text-ink-4">Junior Full Stack Developer</span>
        </div>

        <div className="mt-6 flex items-center gap-6">
          <div className="rounded-[22px] border border-good-line bg-good-bg p-3">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-[8px] border-good bg-white text-[28px] font-semibold tracking-[-0.05em] text-good">
              84
            </div>
          </div>

          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-[0.12em] text-ink-4">Overall score</div>
            <div className="mt-2 text-[42px] font-semibold tracking-[-0.06em] text-ink">
              84<span className="text-[20px] text-ink-4"> / 100</span>
            </div>
            <div className="mt-4 flex gap-4 text-[11px] uppercase tracking-[0.12em] text-ink-4">
              <span>ATS <span className="text-ink">91</span></span>
              <span>Quality <span className="text-ink">82</span></span>
            </div>
          </div>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-brand-700">ATS Readiness</div>
            <div className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-brand-700">91</div>
          </div>
          <div className="rounded-2xl border border-good-line bg-good-bg p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-good">Resume Quality</div>
            <div className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-good">82</div>
          </div>
          <div className="rounded-2xl border border-warn-line bg-warn-bg p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-warn">Missing</div>
            <div className="mt-2 text-[13px] font-medium text-ink">Docker, Kafka</div>
          </div>
        </div>

        <ul className="mt-6 space-y-2.5">
          {example.map((item) => (
            <li key={item.label} className="flex items-center justify-between rounded-xl border border-line bg-[#FAFBFE] px-3 py-2.5 text-[12px]">
              <span className="font-medium text-ink">{item.label}</span>
              <MatchBadge state={item.state} />
            </li>
          ))}
        </ul>
      </figure>
    </section>

    <section id="how" aria-labelledby="how-heading">
      <h2 id="how-heading" className="text-2xl font-semibold tracking-[-0.02em] text-ink">
        How it works
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-ink-3">One pipeline from job description to application, with nothing hidden in between.</p>
      <ol className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
        {steps.map(({ icon: Icon, title, text }, index) => (
          <li key={title} className="bg-white p-5 transition-colors hover:bg-brand-50/40">
            <div className="flex items-center gap-2">
              <span className="num text-xs font-semibold text-brand-700">0{index + 1}</span>
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50">
                <Icon className="size-4 text-brand-600" aria-hidden />
              </span>
            </div>
            <h3 className="mt-3 text-sm font-semibold text-ink">{title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{text}</p>
          </li>
        ))}
      </ol>
    </section>

    <section className="grid gap-8 rounded-[28px] border border-good-line bg-gradient-to-br from-good-bg via-white to-brand-50/60 p-8 shadow-card md:grid-cols-[1fr_1.2fr] md:p-10">
      <div>
        <ShieldCheck className="size-5 text-good" aria-hidden />
        <h2 className="mt-3 text-xl font-semibold tracking-[-0.02em] text-ink">Honest by design</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-3">The goal is a better resume you can defend in an interview — not a higher number.</p>
      </div>
      <ul className="space-y-3 text-sm text-ink-2">
        {[
          'Suggestions never add technologies, companies, metrics or outcomes. A fact check blocks any rewrite that would.',
          'A skill listed only in your Skills section earns partial credit. Show it in a project to earn full credit.',
          'A related technology (MySQL for a PostgreSQL role) is shown as transferable, never as a match.',
          'ATS Readiness is labelled as an estimate of parsing risk, not a guarantee.',
        ].map((item) => (
          <li key={item} className="flex gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </section>
  </div>
);
