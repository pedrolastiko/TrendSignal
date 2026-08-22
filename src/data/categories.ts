import type { SourceCategory } from '../types';

export const SOURCE_CATEGORIES: SourceCategory[] = [
  'consulting',
  'technology',
  'cybersecurity',
  'artificial-intelligence',
  'media',
];

export const CATEGORY_LABELS: Record<SourceCategory, { fr: string; en: string }> = {
  consulting: { fr: 'Conseil', en: 'Consulting' },
  technology: { fr: 'Technologie', en: 'Technology' },
  cybersecurity: { fr: 'Cybersécurité', en: 'Cybersecurity' },
  'artificial-intelligence': { fr: 'Intelligence artificielle', en: 'Artificial intelligence' },
  media: { fr: 'Média', en: 'Media' },
};
