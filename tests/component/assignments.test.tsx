// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommitteeObserversPanel, MyObservationPanel, UserAssignmentsPanel } from '../../src/components/Assignments';
import { DataService } from '../../src/services/DataService';
import { AuthService } from '../../src/services/AuthService';
import { ApiError } from '../../src/services/api';
import type { Committee, CommitteeAssignment } from '../../src/types';
import { grant } from './setup';

const committee = { id: 'c1', committeeNumber: 4, committeeName: 'لجنة', staff: [{ id: 'own', name: 'مسند', role: 'sheikh' }] } as unknown as Committee;
const assignment = (over: Partial<CommitteeAssignment> = {}): CommitteeAssignment => ({
  id: 'a1', userId: 'u2', userName: 'الشيخ مراقب', committeeId: 'c1', committeeNumber: 4, committeeName: 'لجنة', kind: 'observer',
  task: 'exam', status: 'active', startsOn: '', endsOn: '2026-12-01', assignedBy: 'الإدارة', createdAt: '2026-11-16T00:00:00Z', ...over,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('who sees the observers panel', () => {
  it('a sheikh without the right sees nothing, and makes no request', () => {
    grant(['committees.read']);
    const spy = vi.spyOn(DataService, 'getAssignments');
    const { container } = render(<CommitteeObserversPanel committee={committee} />);
    expect(container.innerHTML).toBe('');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('the manager panel', () => {
  beforeEach(() => grant(['assignments.manage', 'committees.read']));

  it('lists the observers with task, dates, status and who assigned; end asks first', async () => {
    vi.spyOn(DataService, 'getAssignments').mockResolvedValue([assignment()]);
    const finish = vi.spyOn(DataService, 'finishAssignment').mockResolvedValue(assignment({ status: 'ended' }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CommitteeObserversPanel committee={committee} />);
    expect(await screen.findByText('الشيخ مراقب')).toBeTruthy();
    expect(screen.getByText(/مراقبة امتحان · حتى 2026-12-01 · أسنده الإدارة/)).toBeTruthy();
    expect(screen.getByText('نشط')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'إنهاء' }));
    await waitFor(() => expect(finish).toHaveBeenCalledWith('a1', 'end'));
  });

  it('adds an observer from people not already on the committee', async () => {
    vi.spyOn(DataService, 'getAssignments').mockResolvedValue([]);
    vi.spyOn(DataService, 'getCeremonyCandidates').mockResolvedValue([
      { id: 'own', name: 'مسند', role: 'sheikh' },
      { id: 'u2', name: 'الشيخ مراقب', role: 'sheikh' },
    ]);
    const create = vi.spyOn(DataService, 'createAssignment').mockResolvedValue(assignment());
    render(<CommitteeObserversPanel committee={committee} />);
    fireEvent.click(await screen.findByRole('button', { name: 'تكليف مراقب' }));
    const select = (await screen.findByText('الشخص')).parentElement!.querySelector('select')!;
    await waitFor(() => expect(select.querySelectorAll('option').length).toBe(2)); // placeholder + the one not on the committee
    fireEvent.change(select, { target: { value: 'u2' } });
    fireEvent.click(screen.getByRole('button', { name: 'تكليف' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ userId: 'u2', committeeId: 'c1', task: 'exam' }));
  });

  it('shows the server refusal instead of failing silently', async () => {
    vi.spyOn(DataService, 'getAssignments').mockRejectedValue(new ApiError('ليس لديك صلاحية', 403));
    render(<CommitteeObserversPanel committee={committee} />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/صلاحية/);
  });
});

describe('the observer', () => {
  it('sees what they were sent to do, writes a note, and a plain committee shows nothing', async () => {
    grant(['committees.read']);
    (AuthService as any).permissions.observing = [{ id: 'a1', committeeId: 'c1', task: 'exam' }];
    vi.spyOn(DataService, 'getObservations').mockResolvedValue([{ id: 'n1', note: 'الأمور منضبطة', by: 'أنا', at: '2026-11-16T10:00:00Z' }]);
    const add = vi.spyOn(DataService, 'addObservation').mockResolvedValue(undefined as never);
    render(<MyObservationPanel committee={committee} />);
    expect(await screen.findByText('أنت مكلّف في هذه اللجنة: مراقبة امتحان')).toBeTruthy();
    expect(await screen.findByText('الأمور منضبطة')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('ملاحظة المراقبة'), { target: { value: ' تأخر الطلبة ' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الملاحظة' }));
    await waitFor(() => expect(add).toHaveBeenCalledWith('a1', 'تأخر الطلبة'));
    cleanup();
    const { container } = render(<MyObservationPanel committee={{ ...committee, id: 'other' } as Committee} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('the user profile', () => {
  it('shows the primary role next to the extra assignments and loads them only on demand', async () => {
    grant(['assignments.manage']);
    const spy = vi.spyOn(DataService, 'getAssignments').mockResolvedValue([assignment({ status: 'cancelled' })]);
    render(<UserAssignmentsPanel userId="u2" roleLabel="شيخ" />);
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('show-assignments'));
    expect(await screen.findByText(/الرتبة الأساسية: شيخ/)).toBeTruthy();
    expect(await screen.findByText('مراقبة امتحان — لجنة 4')).toBeTruthy();
    expect(screen.getByText('ملغي')).toBeTruthy();
    expect(spy).toHaveBeenCalledWith({ userId: 'u2' });
    expect(screen.queryByRole('button', { name: 'إنهاء' })).toBeNull(); // not active: nothing to end
  });
});
