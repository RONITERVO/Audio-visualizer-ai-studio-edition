import { create } from "zustand";

export interface GlobalState {
  audioFiles: any[];
  orphanTextItems: any[];
  selectedAudioId: string | null;
  view: "library" | "player";
  segments: any[];
  currentSegmentIndex: number;
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
  orphanTextItems: [],
  selectedAudioId: null,
  view: "library",
  segments: [],
  currentSegmentIndex: -1,
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
