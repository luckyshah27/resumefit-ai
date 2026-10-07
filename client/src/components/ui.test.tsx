import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Delta, MatchBadge, ScoreRing, scoreBand } from './ui';

describe('ui primitives', () => {
  it('renders signed deltas with direction', () => {
    const { container, rerender } = render(<Delta value={13.04} />);
    expect(container.textContent).toBe('+13');
    rerender(<Delta value={-2.5} />);
    expect(container.textContent).toBe('-2.5');
    rerender(<Delta value={null} />);
    expect(container.textContent).toBe('—');
  });

  it('labels match states in words, not colour alone', () => {
    render(<MatchBadge state="WEAK_EVIDENCE" />);
    expect(screen.getByText('Weak evidence')).toBeTruthy();
  });

  it('exposes the score to assistive technology', () => {
    render(<ScoreRing value={84.4} label="Job Fit" />);
    expect(screen.getByRole('img', { name: 'Job Fit 84 out of 100' })).toBeTruthy();
  });

  it('bands scores', () => {
    expect(scoreBand(84)).toBe('Strong');
    expect(scoreBand(68)).toBe('Good');
    expect(scoreBand(40)).toBe('Needs work');
  });
});
