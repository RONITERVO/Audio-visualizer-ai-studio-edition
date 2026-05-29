import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { formatClock, formatPreciseClock, cleanTitle } from "../lib/utils";
import { VisualizerEngine } from "../lib/graphics/VisualizerEngine";

export function PlayerView() {
  const view = useStore(s => s.view);
  const selectedAudioId = useStore(s => s.selectedAudioId);
  const audioFiles = useStore(s => s.audioFiles);
  const segments = useStore(s => s.segments);
  const currentSegmentIndex = useStore(s => s.currentSegmentIndex);

  const visualizerRef = useRef<VisualizerEngine | null>(null);
  const rafId = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const song = audioFiles.find(a => a.id === selectedAudioId);

  useEffect(() => {
    let index = -1;
    const grace = 0.08;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (currentTime >= seg.start - grace && currentTime <= seg.end + grace) {
        index = i;
        break;
      }
    }
    if (index !== currentSegmentIndex) {
      useStore.setState({ currentSegmentIndex: index });
    }
  }, [currentTime, segments, currentSegmentIndex]);

  useEffect(() => {
    if (view === "player") {
      visualizerRef.current = new VisualizerEngine();
      visualizerRef.current.init("visualizer-canvas");

      const tick = () => {
        const analyser = useStore.getState().analyser;
        const freq = useStore.getState().dataFrequency;
        const time = useStore.getState().dataTime;

        visualizerRef.current?.drawFrame(analyser, freq, time);
        rafId.current = requestAnimationFrame(tick);
      };
      rafId.current = requestAnimationFrame(tick);

      return () => {
        visualizerRef.current?.destroy();
        cancelAnimationFrame(rafId.current);
      }
    }
  }, [view]);

  const closePlayer = () => {
    useStore.setState({ view: "library" });
  };

  const togglePlay = async () => {
    let audioEl = document.getElementById("global-audio") as HTMLAudioElement;
    if (!audioEl) {
      audioEl = document.createElement("audio");
      audioEl.id = "global-audio";
      audioEl.crossOrigin = "anonymous";
      document.body.appendChild(audioEl);

      audioEl.addEventListener('play', () => setIsPlaying(true));
      audioEl.addEventListener('pause', () => setIsPlaying(false));
      audioEl.addEventListener('ended', () => setIsPlaying(false));
      audioEl.addEventListener('timeupdate', (e) => setCurrentTime((e.currentTarget as HTMLAudioElement).currentTime));
      audioEl.addEventListener('loadedmetadata', (e) => setDuration((e.currentTarget as HTMLAudioElement).duration));
    }

    if (song?.url && audioEl.src !== song.url) {
      audioEl.src = song.url;
      audioEl.load();
    }

    let { audioContext, analyser, dataFrequency, dataTime } = useStore.getState();

    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      dataFrequency = new Uint8Array(analyser.frequencyBinCount);
      dataTime = new Uint8Array(analyser.fftSize);

      const sourceNode = audioContext.createMediaElementSource(audioEl);
      sourceNode.connect(analyser);
      analyser.connect(audioContext.destination);

      useStore.setState({ audioContext, analyser, dataFrequency, dataTime, sourceNode });
    }

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    if (audioEl.paused) {
      try {
        await audioEl.play();
        setIsPlaying(true);
      } catch (e) { }
    } else {
      audioEl.pause();
      setIsPlaying(false);
    }
  };

  const seekBy = (delta: number) => {
    const el = document.getElementById("global-audio") as HTMLAudioElement;
    if (!el || !Number.isFinite(el.duration)) return;
    el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + delta));
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = document.getElementById("global-audio") as HTMLAudioElement;
    if (!el || !Number.isFinite(el.duration)) return;
    const val = Number(e.target.value);
    el.currentTime = (val / 1000) * el.duration;
  };

  useEffect(() => {
    let audioEl = document.getElementById("global-audio") as HTMLAudioElement;
    if (!audioEl) {
      audioEl = document.createElement("audio");
      audioEl.id = "global-audio";
      audioEl.crossOrigin = "anonymous";
      document.body.appendChild(audioEl);
      if (song?.url) {
        audioEl.src = song.url;
        audioEl.load();
      }
    }

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = (e: Event) => setCurrentTime((e.currentTarget as HTMLAudioElement).currentTime);
    const onLoadedMeta = (e: Event) => setDuration((e.currentTarget as HTMLAudioElement).duration);

    audioEl.addEventListener('play', onPlay);
    audioEl.addEventListener('pause', onPause);
    audioEl.addEventListener('ended', onPause);
    audioEl.addEventListener('timeupdate', onTimeUpdate);
    audioEl.addEventListener('loadedmetadata', onLoadedMeta);

    setIsPlaying(!audioEl.paused);
    setCurrentTime(audioEl.currentTime);
    setDuration(audioEl.duration || 0);

    return () => {
      audioEl.removeEventListener('play', onPlay);
      audioEl.removeEventListener('pause', onPause);
      audioEl.removeEventListener('ended', onPause);
      audioEl.removeEventListener('timeupdate', onTimeUpdate);
      audioEl.removeEventListener('loadedmetadata', onLoadedMeta);
    };
  }, [song?.url]);

  if (view !== "player") return null;

  const currentSegment = currentSegmentIndex >= 0 ? segments[currentSegmentIndex] : null;

  // --- Hand-drawn Lyric Renderer ---
  const renderDrawnLyrics = () => {
    if (!currentSegment) {
      if (segments.length > 0) {
        const upcoming = segments.find(s => s.start >= currentTime);
        return <span className="word-write text-ink-graphite-light">{upcoming ? "( Instrumental )" : "End of page"}</span>;
      }
      return <span className="word-write text-ink-graphite">{cleanTitle(song?.name || "")}</span>;
    }

    const words = currentSegment.words || [];

    // Fallback if no precise word timings exist
    if (!words.length) {
      const isErasing = currentTime > currentSegment.end;
      return <span className={isErasing ? "word-erase" : "word-write"}>{currentSegment.primary}</span>;
    }

    // Dynamic precise word rendering
    return words.map((w: any, i: number) => {
      const start = Number(w.start);
      const text = w.text || w.word || "";
      const hasStarted = currentTime >= start;
      // Erase slightly after the segment completely finishes
      const isErasing = currentTime > currentSegment.end + 0.3;

      let className = "word-hidden";
      if (hasStarted && !isErasing) className = "word-write";
      else if (hasStarted && isErasing) className = "word-erase";

      return (
        <span key={i} className={className}>
          {text}{i < words.length - 1 ? " " : ""}
        </span>
      );
    });
  };

  const displayTranslation = currentSegment?.translation || currentSegment?.secondary || "";

  return (
    <section className="player-view fixed inset-0 z-30 bg-transparent min-h-[100svh] overflow-hidden" aria-label="Visualizer player">

      {/* Procedural Coffee Stain layered onto the paper background */}
      <div className="coffee-stain"></div>

      {/* Global Grain Overlay to push the ink INTO the paper */}
      <div className="paper-grain-overlay"></div>

      <button className="player-back fixed top-5 right-5 z-50 bg-transparent border-none cursor-pointer font-display text-[1.5rem] font-bold" onClick={closePlayer} data-sketch-btn="red">
        <span aria-hidden="true">&lt; Lib</span>
      </button>

      <div className="stage-shell w-full h-[100svh] grid place-items-stretch" aria-label="Visualizer stage">
        <section className="stage relative w-full h-[100svh]" tabIndex={0}>
          {/* Main Visualizer Engine Canvas */}
          <canvas id="visualizer-canvas" className="absolute inset-0 z-[2] w-full h-full"></canvas>

          <div
            className="stage-meta absolute z-10 top-[30px] flex justify-between pointer-events-none"
            style={{
              left: "calc(max(50px, 4vw) + max(24px, 5vw))",
              right: "max(24px, 5vw)"
            }}
          >
            <span className="font-display text-[2rem] text-ink-graphite truncate max-w-[50%]">{song?.name || "Choose a song"}</span>
            <span className="font-display text-[2rem] text-ink-blueprint ml-2">{formatPreciseClock(currentTime)}</span>
          </div>

          <button
            className="play-zone absolute z-10 top-1/2 -translate-y-1/2 w-[120px] h-[120px] bg-transparent border-none cursor-pointer grid place-items-center font-display text-[4rem] text-ink-graphite"
            onClick={togglePlay} data-sketch-btn="blueprint" data-sketch-roughness="8" data-sketch-passes="3"
            style={{
              left: "calc((100% + max(50px, 4vw)) / 2)",
              transform: "translate(-50%, -50%)"
            }}
          >
            <span aria-hidden="true">{isPlaying ? "II" : ">"}</span>
          </button>

          <div
            className="lyric-wrap absolute z-10 bottom-[140px] pointer-events-none text-left"
            style={{
              left: "calc(max(50px, 4vw) + max(24px, 5vw))",
              right: "max(24px, 5vw)"
            }}
          >
            <div className="lyric-primary max-w-[min(1180px,100%)] font-display text-[clamp(2.5rem,4.35vw,5.25rem)] font-bold leading-[1.1] text-left text-ink-graphite whitespace-normal break-words">
              {renderDrawnLyrics()}
            </div>

            {displayTranslation && (
              <div className={`translation-wrap max-w-[min(1180px,100%)] flex justify-start gap-2 text-left text-ink-blueprint text-[clamp(1.35rem,2.6vh,2.2rem)] mt-2 transition-opacity duration-300 ${currentTime > currentSegment.end + 0.3 ? 'opacity-0' : 'opacity-80'}`}>
                <span className="annotation-arrow" aria-hidden="true">-&gt;</span>
                <div className="lyric-translation">
                  {displayTranslation}
                </div>
              </div>
            )}
          </div>

          <div
            className="segment-strip absolute bottom-[100px] flex gap-1 z-[9] flex-wrap items-end h-[20px]" aria-hidden="true"
            style={{
              left: "calc(max(50px, 4vw) + max(24px, 5vw))",
              right: "max(24px, 5vw)"
            }}
          >
            {segments.map((seg, i) => (
              <span key={seg.id} className={`strip-mark h-2 flex-1 rounded-sm transition-all duration-200 ${i === currentSegmentIndex ? 'bg-ink-blueprint h-[14px]' : 'bg-ink-graphite-light'}`}></span>
            ))}
          </div>
        </section>
      </div>

      <div
        className="transport fixed z-[45] bottom-5 p-4 grid grid-cols-[auto_auto_auto_minmax(120px,1fr)_auto] gap-[15px] items-center" data-sketch-box="graphite" data-sketch-bg="paper"
        style={{
          left: "calc((100vw + max(50px, 4vw)) / 2)",
          transform: "translateX(-50%)",
          width: "calc(min(760px, 100vw - max(50px, 4vw) - max(24px, 5vw) * 2))"
        }}
      >
        <button className="round-button bg-transparent border-none outline-none font-display text-[1.4rem] font-bold px-4 py-2 cursor-pointer transition-transform duration-150 inline-flex items-center justify-center hover:scale-105 hover:rotate-1 active:scale-95" onClick={() => seekBy(-5)} data-sketch-btn="graphite">-5</button>
        <button className="round-button primary bg-transparent border-none outline-none font-display text-[1.4rem] font-bold px-4 py-2 cursor-pointer transition-transform duration-150 inline-flex items-center justify-center hover:scale-105 hover:rotate-1 active:scale-95" onClick={togglePlay} data-sketch-btn="blueprint">{isPlaying ? "II" : ">"}</button>
        <button className="round-button bg-transparent border-none outline-none font-display text-[1.4rem] font-bold px-4 py-2 cursor-pointer transition-transform duration-150 inline-flex items-center justify-center hover:scale-105 hover:rotate-1 active:scale-95" onClick={() => seekBy(5)} data-sketch-btn="graphite">+5</button>
        <input type="range" min="0" max="1000" className="seek w-full accent-ink-blueprint cursor-pointer" value={duration > 0 ? (currentTime / duration) * 1000 : 0} onChange={handleSeek} />
        <div className="time-readout flex gap-[10px] font-body text-[1.2rem]">
          <span>{formatClock(currentTime)}</span>
          <span>{formatClock(duration)}</span>
        </div>
      </div>
    </section>
  );
}