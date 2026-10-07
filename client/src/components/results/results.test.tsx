import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WhyPanel } from './WhyPanel';
import { AttributionList } from './AttributionList';
import type { AnalysisReport, ScoreComponent } from '../../types';

const component = (id: string, label: string, weight: number, earned: number, summary: string, applicable = true): ScoreComponent => ({
  id,
  label,
  weight,
  earned,
  ratio: weight ? earned / weight : 0,
  status: earned / Math.max(weight, 1) > 0.75 ? 'pass' : 'warn',
  rule: 'rule',
  evidence: ['e'],
  applicable,
  summary,
});

const report = {
  scoringVersion: '2.1.0',
  scores: { jobFit: 68.5, atsReadiness: 99.3, resumeQuality: 83.6, interviewReadiness: 56 },
  jobFit: {
    components: [
      component('mandatory', 'Mandatory skills', 48.9, 34.1, 'Of 11 mandatory requirements: 6 strong, 2 missing.'),
      component('preferred', 'Preferred skills', 51.1, 34.4, 'Of 5 preferred requirements: 1 matched.'),
      component('experience', 'Experience level', 0, 0, 'Not scored: the JD does not require prior experience, so freshers are not penalised.', false),
    ],
  },
  ats: { checks: [component('keywords', 'JD keyword alignment', 8, 7.3, 'The JD says “Postgres”.')] },
  quality: { components: [component('action-verbs', 'Action verbs', 10, 6.3, '4/8 bullets start with a strong verb.')] },
} as unknown as AnalysisReport;

describe('WhyPanel', () => {
  it('explains each category and shows that they sum to the score', () => {
    render(<WhyPanel report={report} />);
    expect(screen.getByText('Of 11 mandatory requirements: 6 strong, 2 missing.')).toBeTruthy();
    expect(screen.getByText(/34\.1 \+ 34\.4 =/)).toBeTruthy();
    expect(screen.getByText('68.5')).toBeTruthy();
    expect(screen.getByText(/freshers are not penalised/)).toBeTruthy();
    expect(screen.getByText(/Biggest deduction — Action verbs/)).toBeTruthy();
  });
});

describe('AttributionList', () => {
  it('shows two causes per difference and reveals the rest on demand', () => {
    render(
      <AttributionList
        attribution={[
          {
            target: 'Action verbs',
            group: 'Resume Quality',
            delta: 3.7,
            causes: ['a', 'b', 'c'].map((id) => ({ changeId: id, text: `Edit ${id}`, why: 'A “weak-verb” fix targets this category.' })),
          },
        ]}
      />,
    );
    expect(screen.queryByText('“Edit c”')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '+1 more edit' }));
    expect(screen.getByText('“Edit c”')).toBeTruthy();
  });

  it('renders nothing when there is nothing to attribute', () => {
    const { container } = render(<AttributionList attribution={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
