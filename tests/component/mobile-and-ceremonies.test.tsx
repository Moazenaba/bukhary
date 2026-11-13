// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CeremoniesView } from '../../src/components/CeremoniesView';
import { MobileBottomNav } from '../../src/components/MobileBottomNav';
import type { Committee } from '../../src/types';
import { todayISO } from '../../src/utils/stageUtils';
import { grant } from './setup';

beforeEach(() => grant(['committees.read', 'committees.finalize', 'committees.create', 'tasks.read']));
afterEach(cleanup);

describe('phone bottom bar', () => {
  const user = { id: 'u1', role: 'super_admin' } as any;
  it('shows «+ لجنة» only when adding is offered, and it opens the form', () => {
    const onAdd = vi.fn();
    const { rerender } = render(<MobileBottomNav activeTab="committees" setActiveTab={() => {}} onOpenSidebar={() => {}} currentUser={user} onAddCommittee={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: 'إضافة لجنة جديدة' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    rerender(<MobileBottomNav activeTab="committees" setActiveTab={() => {}} onOpenSidebar={() => {}} currentUser={user} />);
    expect(screen.queryByRole('button', { name: 'إضافة لجنة جديدة' })).toBeNull();
  });
});

describe('ceremonies screen: PDF export and share', () => {
  const props = (committees: Committee[], tasks: any[] = []) => ({
    committees, scheduleTasks: tasks, currentUser: { id: 'u1', role: 'super_admin' } as any,
    onUpdateCommitteeCeremony: vi.fn(), onToggleCommitteeStage: vi.fn(), onAddTask: vi.fn(), onDeleteTask: vi.fn(), onToggleTaskComplete: vi.fn(),
  });
  const c: Committee = {
    id: 'c1', committeeNumber: 1, committeeName: 'لجنة 1', members: [], branch: '', competitionBook: 'كتاب', generalNotes: '',
    courseId: 'crs', stages: {} as any, createdDate: '', createdAtTime: '', ceremonyDetails: { ceremonyDate: todayISO() } as any,
  };

  it('PDF buttons are disabled when the period has no ceremonies', () => {
    render(<CeremoniesView {...props([{ ...c, ceremonyDetails: undefined }])} />);
    expect((screen.getByRole('button', { name: /تصدير PDF/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /مشاركة PDF/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('export and share are two different buttons, enabled when there is a ceremony today', () => {
    render(<CeremoniesView {...props([c], [{ id: 'task-ceremony-c1', committeeId: 'c1', type: 'ceremony', date: todayISO(), completed: false, title: 'حفل', priority: 'high' }])} />);
    const exp = screen.getByRole('button', { name: /تصدير PDF/ }) as HTMLButtonElement;
    const share = screen.getByRole('button', { name: /مشاركة PDF/ }) as HTMLButtonElement;
    expect(exp).not.toBe(share);
    expect(exp.disabled).toBe(false);
    expect(share.disabled).toBe(false);
  });
});

describe('ceremonies screen: «لم يتم الحفل» / «تم الحفل» PDF', () => {
  const base = {
    scheduleTasks: [], currentUser: { id: 'u1', role: 'super_admin' } as any,
    onUpdateCommitteeCeremony: vi.fn(), onToggleCommitteeStage: vi.fn(), onAddTask: vi.fn(), onDeleteTask: vi.fn(), onToggleTaskComplete: vi.fn(),
  };
  const mk = (id: string, held: boolean): Committee => ({
    id, committeeNumber: 1, committeeName: id, members: [], branch: '', competitionBook: '', generalNotes: '', courseId: 'crs',
    stages: { ceremony: { completed: held } } as any, createdDate: '', createdAtTime: '',
  });

  it('shows the count of each state and disables the empty one', () => {
    render(<CeremoniesView {...base} committees={[mk('a', false), mk('b', false)]} />);
    expect(screen.getByText('لم يتم الحفل (2 لجنة)')).toBeTruthy();
    expect(screen.getByText('تم الحفل (0 لجنة)')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'تصدير كشف لم يتم الحفل PDF' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'تصدير كشف تم الحفل PDF' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'مشاركة كشف تم الحفل PDF' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
