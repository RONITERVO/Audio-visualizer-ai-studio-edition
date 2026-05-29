export interface SongFile {
  id: string;
  key: string;
  file: File | null;
  name: string;
  base: string;
  size: number;
  type: string;
  lastModified: number;
  relativePath: string;
  folderHandleId: string;
  folderLabel: string;
  fileHandleId: string;
  fileLabel: string;
  guide: TranscriptItem | null;
  timing: TranscriptItem | null;
  recoveryStatus: string;
  needsRecovery: boolean;
  url: string;
}

export interface TranscriptItem {
  id: string;
  key: string;
  file: File | null;
  name: string;
  base: string;
  status: string;
  segments: Segment[] | null;
  error: string;
  source: string;
  persistedId: string;
  textCache: string;
  updatedAt: number;
  kind?: "guide" | "timed";
  title?: string;
  slotKind?: string;
}

export interface Segment {
  id: string;
  start: number;
  end: number;
  primary: string;
  translation: string;
  secondary: string;
  raw: string;
  speaker: string;
  section: string;
  role: string;
  kind?: string;
  words: any[];
  characterTimeline?: any[];
  order: number;
  source?: string;
  translationSource?: string;
  language_code?: string;
}
