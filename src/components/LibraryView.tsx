import { useStore } from "../lib/store";
import { formatBytes, cleanTitle, getAudioMimeType } from "../lib/utils";
import { loadSongSegments } from "../lib/fileHandlers";
import React, { useState, useEffect } from "react";
import { generateGeminiContent } from "../lib/gemini";
import { GUIDE_PROMPT, TIMING_PROMPT, TIMING_SCHEMA } from "../lib/prompts";

function SongDetail({ song }: { song: any }) {
    const [guideText, setGuideText] = useState(song.guide?.textCache || "");
    const [timingText, setTimingText] = useState(song.timing?.textCache || "");

    useEffect(() => {
        setGuideText(song.guide?.textCache || "");
        setTimingText(song.timing?.textCache || "");
    }, [song.id, song.guide?.textCache, song.timing?.textCache]);

    const saveTimeout = React.useRef<any>(null);

    const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);
    const [isGeneratingTiming, setIsGeneratingTiming] = useState(false);

    const handleProcess = async (kind: "guide" | "timing", isFixing: boolean) => {
        if (!song.file) return;
        if (kind === "guide" && isGeneratingGuide) return;
        if (kind === "timing" && isGeneratingTiming) return;

        const isGuide = kind === "guide";
        const setGeneratingState = isGuide ? setIsGeneratingGuide : setIsGeneratingTiming;
        
        setGeneratingState(true);

        try {
            const readFileAsBase64 = (file: File | Blob): Promise<string> => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const result = String(reader.result || "");
                        resolve(result.includes(",") ? result.split(",").pop()! : result);
                    };
                    reader.onerror = () => reject(reader.error);
                    reader.readAsDataURL(file);
                });
            };

            const base64 = await readFileAsBase64(song.file);
            const audioPart = {
                inline_data: {
                    mime_type: getAudioMimeType(song.file),
                    data: base64
                }
            };

            const model = useStore.getState().model;
            
            let updatedText = "";
            let cleaned = "";
            if (isGuide) {
                setGuideText(isFixing ? "Fixing guide..." : "Generating guide...");
                const prompt = isFixing
                    ? `Please fix the following lyrics guide based on the audio. Focus on correcting structural tags, transcription, or translations. Try to keep the same format as the input:\n\n${guideText}\n\nSystem instructions:\n${GUIDE_PROMPT}`
                    : GUIDE_PROMPT;
                
                await generateGeminiContent(
                    prompt,
                    model,
                    audioPart,
                    null,
                    (chunk) => {
                        updatedText += chunk;
                        setGuideText(updatedText);
                    }
                );
                
                cleaned = updatedText.trim().replace(/^```(?:text|markdown)?/i, "").replace(/```$/i, "").trim();
                setGuideText(cleaned);
                handleSave("guide", cleaned);

            } else {
                setTimingText(isFixing ? "Fixing timings..." : "Generating timings...");
                const finalTimingPrompt = TIMING_PROMPT.replace("{{audioName}}", song.name).replace("{{guideText}}", guideText);
                const prompt = isFixing
                    ? `Please fix the following timing segments JSON based on the audio and the canonical lyrics guide. Correct the start and end times or adjust the words while keeping to the guide text. Return only valid JSON.\n\nCurrent Timings:\n${timingText}\n\nSystem instructions:\n${finalTimingPrompt}`
                    : finalTimingPrompt;
                
                await generateGeminiContent(
                    prompt,
                    model,
                    audioPart,
                    TIMING_SCHEMA,
                    (chunk) => {
                        updatedText += chunk;
                        setTimingText(updatedText);
                    }
                );
                
                handleSave("timing", updatedText);
            }
            
        } catch (e) {
            console.error("Failed to generate/fix", e);
            if (isGuide) setGuideText(guideText);
            else setTimingText(timingText);
        } finally {
            setGeneratingState(false);
        }
    };

    const handleSave = (kind: "guide" | "timing", text: string) => {
        if (kind === "guide") setGuideText(text);
        else setTimingText(text);

        const state = useStore.getState();
        let updatedSong = null;
        
        const newAudioFiles = state.audioFiles.map(s => {
            if (s.id === song.id) {
                const updated = { ...s };
                if (kind === "guide") {
                    updated.guide = { ...updated.guide, textCache: text, kind: "guide", base: s.base, segments: null };
                } else {
                    updated.timing = { ...updated.timing, textCache: text, kind: "timing", base: s.base, segments: null };
                }
                updatedSong = updated;
                return updated;
            }
            return s;
        });
        useStore.setState({ audioFiles: newAudioFiles });

        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(() => {
            if (updatedSong) loadSongSegments(updatedSong);
        }, 500);
    };

    return (
        <div className="song-detail grid grid-cols-1 md:grid-cols-2 gap-4 px-5 pb-5 mt-4 border-t border-ink-graphite/20 pt-5 cursor-default" onClick={e => e.stopPropagation()}>
            <section className="editor-panel grid gap-2">
                <header className="flex items-center justify-between">
                    <h3 className="font-display text-[1.4rem] text-ink-graphite m-0">Guide</h3>
                    <div className="card-actions flex gap-2">
                        {!guideText.trim() ? (
                            <button className="primary-button bg-transparent border-none outline-none font-display text-[1.1rem] px-3 py-1 cursor-pointer text-ink-blueprint transition-transform hover:scale-105 active:scale-95" onClick={() => handleProcess("guide", false)} disabled={isGeneratingGuide || !song.file} data-sketch-btn="blueprint">{isGeneratingGuide ? "Generating..." : "Generate AI Guide"}</button>
                        ) : (
                            <>
                                <button className="soft-button bg-transparent border border-ink-graphite/40 px-3 py-1 font-body text-[1.1rem] cursor-pointer" onClick={() => handleProcess("guide", true)} disabled={isGeneratingGuide || !song.file}>{isGeneratingGuide ? "Fixing..." : "Fix with AI"}</button>
                                <button className="soft-button bg-transparent border border-ink-graphite/40 px-3 py-1 font-body text-[1.1rem] cursor-pointer" onClick={() => navigator.clipboard.writeText(guideText)}>Copy</button>
                            </>
                        )}
                    </div>
                </header>
                <textarea 
                    className="text-area w-full min-h-[190px] border border-ink-graphite/40 bg-transparent text-ink-graphite p-3 font-body"
                    spellCheck="false"
                    placeholder="Paste, drag & drop, or generate this song's guide"
                    value={guideText}
                    onChange={(e) => handleSave("guide", e.target.value)}
                />
            </section>
            
            <section className="editor-panel grid gap-2">
                <header className="flex items-center justify-between">
                    <h3 className="font-display text-[1.4rem] text-ink-graphite m-0">Timings</h3>
                    <div className="card-actions flex gap-2">
                        {!timingText.trim() ? (
                            <button className="primary-button bg-transparent border-none outline-none font-display text-[1.1rem] px-3 py-1 cursor-pointer text-ink-blueprint transition-transform hover:scale-105 active:scale-95" onClick={() => handleProcess("timing", false)} disabled={isGeneratingTiming || !song.file || !guideText.trim()} data-sketch-btn="blueprint" title={!guideText.trim() ? "Generate Guide first" : ""}>{isGeneratingTiming ? "Generating..." : "Generate AI Timings"}</button>
                        ) : (
                            <>
                                <button className="soft-button bg-transparent border border-ink-graphite/40 px-3 py-1 font-body text-[1.1rem] cursor-pointer" onClick={() => handleProcess("timing", true)} disabled={isGeneratingTiming || !song.file || !guideText}>{isGeneratingTiming ? "Fixing..." : "Fix with AI"}</button>
                                <button className="soft-button bg-transparent border border-ink-graphite/40 px-3 py-1 font-body text-[1.1rem] cursor-pointer" onClick={() => navigator.clipboard.writeText(timingText)}>Copy</button>
                            </>
                        )}
                    </div>
                </header>
                <textarea 
                    className="text-area w-full min-h-[190px] border border-ink-graphite/40 bg-transparent text-ink-graphite p-3 font-body"
                    spellCheck="false"
                    placeholder="Paste, drag & drop, or generate this song's timing data"
                    value={timingText}
                    onChange={(e) => handleSave("timing", e.target.value)}
                />
            </section>
        </div>
    );
}

export function LibraryView() {
  const audioFiles = useStore((s) => s.audioFiles);
  const selectedAudioId = useStore((s) => s.selectedAudioId);

  const handleSelectAudio = (id: string) => {
      loadSongSegments(id);
  };

  const missingCount = audioFiles.filter(a => !a.file).length;

  return (
    <section className="library-view" aria-label="Song library">
        <header className="library-header mb-8 flex justify-between items-center">
            <div className="brand flex items-center gap-3">
                <span className="brand-mark block w-[38px] h-[38px]" data-sketch-box="blueprint" data-sketch-bg="paper"></span>
                <strong className="block font-display text-[2rem] text-ink-graphite leading-tight mb-0">Living Sketchbook</strong>
            </div>
        </header>

        <div className="library-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 align-start" aria-live="polite">
            {audioFiles.map((song, index) => (
                <article key={song.id} className={`song-card relative min-h-[164px] bg-transparent border-none outline-none overflow-visible ${song.id === selectedAudioId ? 'col-span-full' : ''}`} data-sketch-box="graphite" data-sketch-bg="paper">
                    <button type="button" className="song-card-main w-full min-h-[164px] p-5 grid content-between gap-[14px] bg-transparent border-none text-left cursor-pointer" onClick={() => handleSelectAudio(song.id)}>
                        <div className="song-card-title grid gap-2">
                            <h2 className="font-display text-[1.5rem] leading-tight text-ink-graphite">{song.name}</h2>
                            <div className="song-card-meta font-body text-[1.1rem] text-ink-graphite-light">
                                {[
                                    formatBytes(song.size),
                                    song.folderLabel || song.relativePath?.split("/")[0] || ""
                                ].filter(Boolean).join(" - ")}
                            </div>
                        </div>

                        <div className="song-card-status flex flex-wrap gap-2">
                           <span className={`mini-pill px-2 font-display text-[1.1rem] ${song.file ? 'text-ink-blueprint' : 'text-ink-red'}`}>
                               {song.file ? "Audio ready" : "Needs recovery"}
                           </span>
                           {song.guide && <span className="mini-pill text-ink-blueprint px-2 font-display text-[1.1rem]">Guide ready</span>}
                           {song.timing && <span className="mini-pill text-ink-blueprint px-2 font-display text-[1.1rem]">Timing ready</span>}
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
                        : `Drop audio anywhere on the page to start.`}
                </span>
            </article>
        </div>

        <div className="mt-12 flex flex-col justify-center items-center gap-6 pb-8">
            <div className="flex items-center gap-4">
               <span className="font-display text-[1.2rem] text-ink-graphite">AI Model:</span>
               <select 
                    className="control-select bg-transparent border-none outline-none font-body text-[1.2rem] text-ink-blueprint p-[10px] cursor-pointer"
                    value={useStore((s) => s.model)}
                    onChange={(e) => useStore.setState({ model: e.target.value })}
                    data-sketch-underline="blueprint"
                >
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                    <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
                    <option value="gemini-pro-latest">Gemini Pro Latest</option>
                    <option value="gemini-flash-latest">Gemini Flash Latest</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
                    <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash</option>
                </select>
            </div>
            
            <div className="flex items-center gap-4">
                <button className="soft-button bg-transparent border-none font-display text-[1.2rem] cursor-pointer hover:text-ink-blueprint" data-sketch-underline="graphite" onClick={() => {
                        import("../lib/exportImport").then(m => m.exportLibrary());
                    }}>Export .ndjson</button>
                <label className="soft-button bg-transparent border-none font-display text-[1.2rem] cursor-pointer inline-flex items-center hover:text-ink-blueprint" data-sketch-underline="graphite">
                    Import .ndjson
                    <input type="file" className="sr-only" accept=".ndjson" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            import("../lib/exportImport").then(m => m.importLibrary(file));
                        }
                        e.target.value = "";
                    }} />
                </label>
            </div>
        </div>
    </section>
  );
}

