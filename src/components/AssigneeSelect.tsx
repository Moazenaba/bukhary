import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { DATA_ROOT_KEY } from '../data/queries';
import { AuthService } from '../services/AuthService';
import { DataService } from '../services/DataService';
import { Committee } from '../types';

interface AssigneeSelectProps {
  value: string;
  onChange: (userId: string) => void;
  id?: string;
  className?: string;
}

/**
 * Who a task is assigned to, by user id (WEB-07). The list comes from the server and holds only
 * people the current user may assign; before, a free-text name was sent and silently dropped.
 */
export const AssigneeSelect: React.FC<AssigneeSelectProps> = ({ value, onChange, id, className }) => {
  const me = AuthService.getCurrentUser();
  const { data = [], isLoading } = useQuery({
    queryKey: [...DATA_ROOT_KEY, 'assignable', me?.id],
    queryFn: () => DataService.getAssignableUsers(),
    enabled: AuthService.can('tasks.write'),
    staleTime: 60_000,
  });
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">{isLoading ? 'جارٍ التحميل…' : 'بدون تكليف'}</option>
      {data.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}{u.id === me?.id ? ' (أنا)' : ''}
        </option>
      ))}
    </select>
  );
};

interface CommitteeSelectProps {
  committees: Committee[];
  value: string;
  onChange: (committeeId: string) => void;
  id?: string;
  className?: string;
  /** Text of the empty option; omit to require a committee. */
  emptyLabel?: string;
}

/** A committee by id, labelled with its course (numbers repeat across courses); only committees in scope. */
export const CommitteeSelect: React.FC<CommitteeSelectProps> = ({ committees, value, onChange, id, className, emptyLabel }) => {
  const options = committees
    .filter((c) => AuthService.canAccessCommittee(c))
    .sort((a, b) => (a.courseName ?? '').localeCompare(b.courseName ?? '', 'ar') || a.committeeNumber - b.committeeNumber);
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className} required={emptyLabel === undefined}>
      <option value="">{emptyLabel ?? 'اختر اللجنة'}</option>
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          لجنة #{c.committeeNumber} ({c.committeeName}){c.courseName ? ` — ${c.courseName}` : ''}
        </option>
      ))}
    </select>
  );
};
