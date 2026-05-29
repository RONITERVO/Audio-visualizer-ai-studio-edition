import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { formatBytes, createId } from "../lib/utils";
import { loadSongSegments } from "../lib/fileHandlers";
import { generateScribeTranscript } from "../lib/scribe";
import { translateSegments } from "../lib/translate";

function createTimingItem(song: any, text: string) {
  const existing = song.timing || {};
  return {
    id: existing.id || createId("transcript"),
    key: existing.key || `${song.key}:scribe-timing`,
    file: null,
    name: existing.name || `${song.base || song.name}.scribe.json`,
    base: song.base,
    status: "ready",
    segments: null,
    error: "",
    source: "elevenlabs-scribe-v2-realtime",
    persistedId: existing.persistedId || "",
    textCache: text,
    updatedAt: Date.now(),
    kind: "timed",
    title: existing.title || "",
    slotKind: "timing",
  };
}

function getErrorMessage(error: any) {
  return String(error?.message || error || "Generation failed");
}

function SongDetail({ song }: { song: any }) {
  const [timingText, setTimingText] = useState(song.timing?.textCache || "");
  const [statusText, setStatusText] = useState("");
  const [isGeneratingTiming, setIsGeneratingTiming] = useState(false);
  const translationEnabled = useStore((state) => state.translationEnabled);
  const saveTimeout = useRef<any>(null);

  useEffect(() => {
    setTimingText(song.timing?.textCache || "");
    setStatusText("");
  }, [song.id, song.timing?.textCache]);

  const handleSaveTiming = (text: string) => {
    setTimingText(text);

    const state = useStore.getState();
    let updatedSong: any = null;

    const audioFiles = state.audioFiles.map((item) => {
      if (item.id !== song.id) return item;
      updatedSong = {
        ...item,
        timing: createTimingItem(item, text),
      };
      return updatedSong;
    });

    useStore.setState({ audioFiles });

    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      if (updatedSong) loadSongSegments(updatedSong.id);
    }, 500);
  };

  const handleGenerateSyncedTranslations = async () => {
    if (!song.file || isGeneratingTiming) return;

    const state = useStore.getState();
    const rawSourceLanguage = state.sourceLanguage.trim();
    const sourceLanguage = rawSourceLanguage.toLowerCase() === "auto" ? "" : rawSourceLanguage;
    const targetLanguage = state.targetLanguage.trim() || "en";
    let segments: any[] = [];
    let translationSource = "";
    let translationError = "";

    setIsGeneratingTiming(true);
    setStatusText("Streaming audio to Scribe...");
    setTimingText("Streaming audio to ElevenLabs Scribe v2 Realtime...\nThis can take about the song length.");

    try {
      const scribe = await generateScribeTranscript({
        file: song.file,
        apiKey: state.elevenLabsApiKey,
        sourceLanguage,
        previousText: sourceLanguage ? `Song lyrics in ${sourceLanguage}` : "Song lyrics",
      });

      segments = Array.isArray(scribe.segments) ? scribe.segments : [];
      if (!segments.length) {
        throw new Error("Scribe did not return lyric segments for this audio.");
      }

      if (state.translationEnabled) {
        setStatusText("Translating lyrics...");
        setTimingText("Scribe transcript ready.\nTranslating lyric segments...");

        try {
          segments = await translateSegments({
            segments,
            sourceLanguage,
            targetLanguage,
            apiKey: state.googleTranslateApiKey,
          });
          translationSource = "google-translate";
        } catch (error: any) {
          translationError = getErrorMessage(error);
          translationSource = "";
        }
      }

      setStatusText(translationError ? "Translation failed, but the Scribe transcript was saved." : "Saving synced subtitles...");

      const output = JSON.stringify({
        source: "elevenlabs-scribe-v2-realtime",
        transcriptionSource: "elevenlabs-scribe-v2-realtime",
        translationSource,
        geminiUsed: false,
        sourceLanguage: sourceLanguage || "auto",
        targetLanguage: state.translationEnabled ? targetLanguage : "",
        generatedAt: new Date().toISOString(),
        ...(translationError ? { translationError } : {}),
        segments,
      }, null, 2);

      handleSaveTiming(output);
      setStatusText(translationError ? "Translation failed, but the Scribe transcript was saved." : "Synced subtitles saved.");
    } catch (error: any) {
      const message = getErrorMessage(error);
      setStatusText("Scribe failed.");
      setTimingText(`Failed to generate synced translations.\n\n${message}`);
    } finally {
      setIsGeneratingTiming(false);
    }
  };

  return (
    <div className="song-detail grid gap-4 px-5 pb-5 mt-4 border-t border-ink-graphite/20 pt-5 cursor-default" onClick={(event) => event.stopPropagation()}>
      <section className="editor-panel grid gap-3">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-display text-[1.45rem] text-ink-graphite m-0">Synced subtitles</h3>
            {statusText && <p className="font-body text-[1.05rem] leading-tight text-ink-graphite-light">{statusText}</p>}
          </div>
          <div className="card-actions flex flex-wrap gap-2">
            <button
              className="primary-button bg-transparent border-none outline-none font-display text-[1.1rem] px-3 py-1 cursor-pointer text-ink-blueprint transition-transform hover:scale-105 active:scale-95"
              onClick={handleGenerateSyncedTranslations}
              disabled={isGeneratingTiming || !song.file}
              data-sketch-btn="blueprint"
              title="Uses the keys below, or server environment keys when fields are empty."
            >
              {isGeneratingTiming
                ? "Creating synced translations..."
                : translationEnabled
                  ? "Generate Synced Translations"
                  : "Generate Scribe Timings"}
            </button>
            {timingText.trim() && (
              <button
                className="soft-button bg-transparent border border-ink-graphite/40 px-3 py-1 font-body text-[1.1rem] cursor-pointer"
                onClick={() => navigator.clipboard.writeText(timingText)}
              >
                Copy
              </button>
            )}
          </div>
        </header>
        <textarea
          className="text-area w-full min-h-[260px] border border-ink-graphite/40 bg-transparent text-ink-graphite p-3 font-body"
          spellCheck="false"
          placeholder="Generated Scribe timing JSON appears here. You can also paste synced subtitle JSON."
          value={timingText}
          onChange={(event) => handleSaveTiming(event.target.value)}
        />
      </section>
    </div>
  );
}

function TranscriptionSettings() {
  const elevenLabsApiKey = useStore((state) => state.elevenLabsApiKey);
  const saveElevenLabsKey = useStore((state) => state.saveElevenLabsKey);
  const sourceLanguage = useStore((state) => state.sourceLanguage);
  const targetLanguage = useStore((state) => state.targetLanguage);
  const translationEnabled = useStore((state) => state.translationEnabled);
  const googleTranslateApiKey = useStore((state) => state.googleTranslateApiKey);
  const saveGoogleTranslateKey = useStore((state) => state.saveGoogleTranslateKey);

  const labelClass = "grid gap-1 font-body text-[1.08rem] text-ink-graphite";
  const inputClass = "bg-transparent border border-ink-graphite/35 px-3 py-2 text-[1.05rem] outline-none focus:border-ink-blueprint";
  const checkboxLabelClass = "inline-flex items-center gap-2 font-body text-[1.08rem] text-ink-graphite";

  return (
    <section className="mt-12 grid gap-4 justify-center pb-8">
      <form
        data-sketch-box="graphite"
        data-sketch-bg="paper"
        className="p-5 grid gap-4 w-[min(760px,calc(100vw-2rem))] bg-transparent"
        autoComplete="off"
        onSubmit={(event) => event.preventDefault()}
      >
        <h2 className="font-display text-[1.6rem] text-ink-graphite">Transcription &amp; Translation</h2>

        <label className={labelClass}>
          ElevenLabs API key
          <input
            type="password"
            name="elevenlabs-api-key"
            className={inputClass}
            value={elevenLabsApiKey}
            onChange={(event) => useStore.setState({ elevenLabsApiKey: event.target.value })}
            autoComplete="new-password"
          />
        </label>

        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={saveElevenLabsKey}
            onChange={(event) => useStore.setState({ saveElevenLabsKey: event.target.checked })}
          />
          Save ElevenLabs key on this device
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className={labelClass}>
            Source language
            <input
              className={inputClass}
              list="source-language-options"
              placeholder="auto, es, en, fi..."
              value={sourceLanguage}
              onChange={(event) => useStore.setState({ sourceLanguage: event.target.value })}
            />
          </label>

          <label className={labelClass}>
            Target language
            <input
              className={inputClass}
              list="target-language-options"
              placeholder="en"
              value={targetLanguage}
              onChange={(event) => useStore.setState({ targetLanguage: event.target.value })}
            />
          </label>
        </div>

        <datalist id="source-language-options">
          {["auto", "es", "en", "fi", "ja", "ko", "fr", "de", "it", "pt", "hi", "zh"].map((language) => (
            <option key={language} value={language} />
          ))}
        </datalist>
        <datalist id="target-language-options">
          {["en", "es", "fi", "ja", "ko", "fr", "de", "it", "pt", "hi", "zh"].map((language) => (
            <option key={language} value={language} />
          ))}
        </datalist>

        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={translationEnabled}
            onChange={(event) => useStore.setState({ translationEnabled: event.target.checked })}
          />
          Translate lyrics
        </label>

        {translationEnabled && (
          <>
            <label className={labelClass}>
              Google Translate API key
              <input
                type="password"
                name="google-translate-api-key"
                className={inputClass}
                value={googleTranslateApiKey}
                onChange={(event) => useStore.setState({ googleTranslateApiKey: event.target.value })}
                autoComplete="new-password"
              />
            </label>

            <label className={checkboxLabelClass}>
              <input
                type="checkbox"
                checked={saveGoogleTranslateKey}
                onChange={(event) => useStore.setState({ saveGoogleTranslateKey: event.target.checked })}
              />
              Save Google Translate key on this device
            </label>
          </>
        )}
      </form>
    </section>
  );
}

export function LibraryView() {
  const audioFiles = useStore((state) => state.audioFiles);
  const selectedAudioId = useStore((state) => state.selectedAudioId);

  const handleSelectAudio = (id: string) => {
    loadSongSegments(id);
  };

  const missingCount = audioFiles.filter((audio) => !audio.file).length;

  return (
    <section className="library-view" aria-label="Song library">
      <header className="library-header mb-8 flex justify-between items-center">
        <div className="brand flex items-center gap-3">
          <span className="brand-mark block w-[38px] h-[38px]" data-sketch-box="blueprint" data-sketch-bg="paper"></span>
          <strong className="block font-display text-[2rem] text-ink-graphite leading-tight mb-0">Living Sketchbook</strong>
        </div>
      </header>

      <div className="library-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 align-start" aria-live="polite">
        {audioFiles.map((song) => (
          <article key={song.id} className={`song-card relative min-h-[164px] bg-transparent border-none outline-none overflow-visible ${song.id === selectedAudioId ? "col-span-full" : ""}`} data-sketch-box="graphite" data-sketch-bg="paper">
            <button type="button" className="song-card-main w-full min-h-[164px] p-5 grid content-between gap-[14px] bg-transparent border-none text-left cursor-pointer" onClick={() => handleSelectAudio(song.id)}>
              <div className="song-card-title grid gap-2">
                <h2 className="font-display text-[1.5rem] leading-tight text-ink-graphite">{song.name}</h2>
                <div className="song-card-meta font-body text-[1.1rem] text-ink-graphite-light">
                  {[
                    formatBytes(song.size),
                    song.folderLabel || song.relativePath?.split("/")[0] || "",
                  ].filter(Boolean).join(" - ")}
                </div>
              </div>

              <div className="song-card-status flex flex-wrap gap-2">
                <span className={`mini-pill px-2 font-display text-[1.1rem] ${song.file ? "text-ink-blueprint" : "text-ink-red"}`}>
                  {song.file ? "Audio ready" : "Needs recovery"}
                </span>
                {song.timing && <span className="mini-pill text-ink-blueprint px-2 font-display text-[1.1rem]">Synced lyrics ready</span>}
              </div>
            </button>

            {!song.file && (
              <div className="card-actions px-5 pb-5">
                <span className="font-body text-[1.1rem] text-ink-graphite-light">Drop the original file or folder to recover</span>
              </div>
            )}

            {song.id === selectedAudioId && <SongDetail song={song} />}
          </article>
        ))}

        <article
          className="add-card w-full min-h-[164px] p-5 grid place-content-center justify-items-start gap-[14px] bg-transparent border-none outline-none relative overflow-visible"
          role="region"
          data-sketch-box="blueprint"
          data-sketch-bg="paper"
          data-sketch-roughness="4"
        >
          <span className="add-plus text-[4rem] font-display bg-transparent leading-none">+</span>
          <h2 className="font-display text-ink-graphite leading-tight text-2xl">Add song</h2>
          <span className="font-body text-[1.1rem] text-ink-graphite-light">
            {missingCount > 0
              ? `${missingCount} remembered songs can recover if you drop their folder.`
              : "Drop audio anywhere on the page to start."}
          </span>
        </article>
      </div>

      <TranscriptionSettings />

      <div className="flex items-center justify-center gap-4 pb-8">
        <button
          className="soft-button bg-transparent border-none font-display text-[1.2rem] cursor-pointer hover:text-ink-blueprint"
          data-sketch-underline="graphite"
          onClick={() => {
            import("../lib/exportImport").then((module) => module.exportLibrary());
          }}
        >
          Export .ndjson
        </button>
        <label className="soft-button bg-transparent border-none font-display text-[1.2rem] cursor-pointer inline-flex items-center hover:text-ink-blueprint" data-sketch-underline="graphite">
          Import .ndjson
          <input
            type="file"
            className="sr-only"
            accept=".ndjson"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                import("../lib/exportImport").then((module) => module.importLibrary(file));
              }
              event.target.value = "";
            }}
          />
        </label>
      </div>
    </section>
  );
}
