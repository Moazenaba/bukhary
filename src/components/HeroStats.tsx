import React from 'react';
import { PageHeader, primaryAction } from './ui/PageHeader';

interface HeroStatsProps {
  totalCommittees: number;
  activeCommittees: number;
  completedCommittees: number;
  /** «إضافة لجنة»: the page's main action (it used to float over the list on phones). */
  onAddCommittee?: () => void;
}

/** The committees page header: one line of facts and the add button, then straight to the list. */
export const HeroStats: React.FC<HeroStatsProps> = ({ totalCommittees, activeCommittees, completedCommittees, onAddCommittee }) => (
  <PageHeader
    icon="groups"
    title="اللجان"
    subtitle={`${totalCommittees} لجنة · ${activeCommittees} قيد العمل · ${completedCommittees} تم الحفل`}
    actions={
      onAddCommittee && (
        <button type="button" onClick={onAddCommittee} className={primaryAction}>
          <span className="material-symbols-outlined text-lg">add</span>
          <span>إضافة لجنة</span>
        </button>
      )
    }
  />
);
