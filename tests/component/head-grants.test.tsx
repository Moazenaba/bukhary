// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CeremonyDecisionCard, HeadGrantsAdminPanel } from '../../src/components/HeadGrants';
import { DataService } from '../../src/services/DataService';
import type { Committee, HeadGrant } from '../../src/types';
import { grant } from './setup';

const committee = { id: 'c1', committeeNumber: 4, committeeName: 'لجنة' } as unknown as Committee;
const headGrant = (over: Partial<HeadGrant> = {}): HeadGrant => ({
  id: 'g1', userId: 'u9', userName: 'الشيخ المؤقت', committeeIds: ['c1'], startsOn: '2026-12-01', endsOn: '2026-12-05',
  status: 'active', ceremonyDecision: 'undecided', decidedByRole: null, decidedAt: null, grantedBy: 'الأدمن',
  createdAt: '2026-11-19T00:00:00Z', endedAt: null, ...over,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the admin panel', () => {
  beforeEach(() => grant(['users.grant']));

  it('lists the grants with the committees, dates and the ceremony decision', async () => {
    vi.spyOn(DataService, 'getHeadGrants').mockResolvedValue([headGrant({ ceremonyDecision: 'yes' })]);
    vi.spyOn(DataService, 'getAssignableUsers').mockResolvedValue([]);
    render(<HeadGrantsAdminPanel committees={[committee]} />);
    expect(await screen.findByText(/الشيخ المؤقت/)).toBeTruthy();
    expect(screen.getByText(/سيكون هناك حفل/)).toBeTruthy();
  });

  it('a grant needs a person, at least one committee and a valid window', async () => {
    vi.spyOn(DataService, 'getHeadGrants').mockResolvedValue([]);
    vi.spyOn(DataService, 'getAssignableUsers').mockResolvedValue([{ id: 'u9', name: 'الشيخ', role: 'sheikh' }]);
    const create = vi.spyOn(DataService, 'createHeadGrant').mockResolvedValue(headGrant());
    render(<HeadGrantsAdminPanel committees={[committee]} />);
    const submit = await screen.findByRole('button', { name: 'إسناد الرئاسة المؤقتة' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'u9' } });
    fireEvent.click(screen.getByText('لجنة 4'));
    const dates = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dates[0], { target: { value: '2026-12-01' } });
    fireEvent.change(dates[1], { target: { value: '2026-12-05' } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);
    await vi.waitFor(() => expect(create).toHaveBeenCalledWith({ userId: 'u9', committeeIds: ['c1'], startsOn: '2026-12-01', endsOn: '2026-12-05' }));
  });
});

describe('the ceremony decision on a committee', () => {
  it('shows nothing when there is no active grant on the committee', async () => {
    vi.spyOn(DataService, 'getHeadGrants').mockResolvedValue([headGrant({ committeeIds: ['c9'] })]);
    const { container } = render(<CeremonyDecisionCard committee={committee} />);
    await vi.waitFor(() => expect(DataService.getHeadGrants).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('offers the three decisions and sends the one picked', async () => {
    vi.spyOn(DataService, 'getHeadGrants').mockResolvedValue([headGrant()]);
    const decide = vi.spyOn(DataService, 'decideHeadGrant').mockResolvedValue(headGrant({ ceremonyDecision: 'no' }));
    render(<CeremonyDecisionCard committee={committee} />);
    fireEvent.click(await screen.findByRole('button', { name: 'لن يكون هناك حفل' }));
    await vi.waitFor(() => expect(decide).toHaveBeenCalledWith('g1', 'no'));
  });
});
