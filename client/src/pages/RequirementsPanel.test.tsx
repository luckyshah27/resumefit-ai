import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RequirementsPanel } from '../components/results/RequirementsPanel';
import type { AnalysisReport, RequirementMatch } from '../types';

const match = (overrides: Partial<RequirementMatch>): RequirementMatch => ({
  requirementId: 'req-x',
  requirement: 'React',
  originalPhrase: 'React',
  canonical: 'react',
  importance: 'MANDATORY',
  category: 'frontend',
  exactMatch: true,
  semanticMatch: null,
  evidenceStrength: 'HIGH',
  finalMatchState: 'STRONG_MATCH',
  credit: 1,
  evidence: [{ text: 'Built dashboards in React', source: 'project', entryTitle: 'ShopFlow' }],
  explanation: 'React found with high evidence.',
  ...overrides,
});

const report = {
  jobFit: {
    requirementMatches: [
      match({}),
      match({ requirementId: 'req-pg', requirement: 'PostgreSQL', originalPhrase: 'Postgres', canonical: 'postgresql', finalMatchState: 'WEAK_EVIDENCE', evidenceStrength: 'LOW', credit: 0.4 }),
      match({ requirementId: 'req-go', requirement: 'Go', originalPhrase: 'GoLang', canonical: 'go', finalMatchState: 'MISSING', exactMatch: false, evidenceStrength: 'NONE', credit: 0, evidence: [] }),
    ],
    responsibilityMatches: [],
  },
} as unknown as AnalysisReport;

describe('RequirementsPanel', () => {
  it('shows the JD wording next to the canonical requirement', () => {
    render(<RequirementsPanel report={report} />);
    expect(screen.getByText('JD says “Postgres”')).toBeTruthy();
    expect(screen.getByText('JD says “GoLang”')).toBeTruthy();
  });

  it('filters by match state', () => {
    render(<RequirementsPanel report={report} />);
    fireEvent.click(screen.getByRole('tab', { name: /Missing/ }));
    expect(screen.queryByText('PostgreSQL')).toBeNull();
    expect(screen.getByText('Go')).toBeTruthy();
  });
});
