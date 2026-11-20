import type { PlanItem, PurposeCode } from '../types';

export const PURPOSES: { code: PurposeCode; label: string }[] = [
  { code: 'EXAMS', label: 'Exams' }, { code: 'HIGHER_STUDIES', label: 'Higher studies / entrance preparation' },
  { code: 'CONCEPTUAL', label: 'Conceptual knowledge' }, { code: 'INTERVIEW', label: 'Interview / career preparation' },
  { code: 'REVISION', label: 'Revision' }, { code: 'PROJECTS', label: 'Projects / practical application' },
  { code: 'PERSONAL', label: 'Personal goal' }, { code: 'OTHER', label: 'Other / custom purpose' },
];
export const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Purpose is optional so legacy planner items keep working. */
export const purposeLabel = (p: Pick<PlanItem, 'purpose' | 'customPurpose'>): string => {
  if (!p.purpose) return '';
  if (p.purpose === 'OTHER') return squash(p.customPurpose ?? '') || 'Custom purpose';
  return PURPOSES.find(x => x.code === p.purpose)?.label ?? '';
};
export function validatePurpose(code: string, custom: string): string | null {
  if (code !== 'OTHER') return null;
  const c = squash(custom);
  if (!c) return 'Enter your custom purpose';
  return c.length > 60 ? 'Keep your purpose under 60 characters' : null;
}
