
export interface Verse {
  number: number;
  arabic: string;
  french: string;
}

export interface Surah {
  id: number;
  idString: string; // e.g. "001"
  name: string;
  frenchName: string;
  verses: Verse[];
  isSpecialVerse?: boolean;
}

export type AppTheme = 'emerald' | 'gold' | 'indigo' | 'rose';
export type Reciter = 'hossary' | 'albanna';

export interface UserProgress {
  completedSurahs: number[];
  completedVerses: string[];
  badges: string[];
  streak: number;
  theme: AppTheme;
  reciter: Reciter;
  fontSize: number;
  activityLog: { [date: string]: boolean };
  unlockedQuarters: number[];
  gameStars: number;
  userName?: string;
  userAge?: number;
  gender?: 'boy' | 'girl';
  isPremium?: boolean;
  preferredLanguage?: 'fr' | 'ar' | 'en';
}

export enum AppMode {
  SELECTION = 'SELECTION',
  LEARNING = 'LEARNING',
  BADGES = 'BADGES',
  GAMES = 'GAMES',
  COMPLETED_LIST = 'COMPLETED_LIST'
}
