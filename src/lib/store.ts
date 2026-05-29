import { create } from "zustand";

export interface GlobalState {
  audioFiles: any[];
  transcriptFiles: any[];
  orphanTextItems: any[];
  selectedAudioId: string | null;
  selectedTranscriptId: string | null;
  activeGuideId: string | null;
  activeTimingId: string | null;
  view: "library" | "player";
  pendingTextKind: string;
  pendingRecoverSongId: string;
  restoring: boolean;
  geminiBusy: boolean;
  streamBlocks: Record<string, any>;
  segments: any[];
  currentSegmentIndex: number;
  model: string;
  elevenLabsApiKey: string;
  saveElevenLabsKey: boolean;
  sourceLanguage: string;
  targetLanguage: string;
  translationEnabled: boolean;
  googleTranslateApiKey: string;
  saveGoogleTranslateKey: boolean;

  // Audio state
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  sourceNode: MediaElementAudioSourceNode | null;
  dataFrequency: Uint8Array | null;
  dataTime: Uint8Array | null;
  objectUrl: string | null;
  seekLock: boolean;
  lastRenderSecond: number;
}

export const useStore = create<GlobalState>((set) => ({
  audioFiles: [],
  transcriptFiles: [],
  orphanTextItems: [],
  selectedAudioId: null,
  selectedTranscriptId: null,
  activeGuideId: null,
  activeTimingId: null,
  view: "library",
  pendingTextKind: "",
  pendingRecoverSongId: "",
  restoring: false,
  geminiBusy: false,
  streamBlocks: {},
  segments: [],
  currentSegmentIndex: -1,
  model: "gemini-3.1-pro-preview",
  elevenLabsApiKey: "",
  saveElevenLabsKey: false,
  sourceLanguage: "",
  targetLanguage: "en",
  translationEnabled: true,
  googleTranslateApiKey: "",
  saveGoogleTranslateKey: false,
  
  audioContext: null,
  analyser: null,
  sourceNode: null,
  dataFrequency: null,
  dataTime: null,
  objectUrl: null,
  seekLock: false,
  lastRenderSecond: -1,
}));
