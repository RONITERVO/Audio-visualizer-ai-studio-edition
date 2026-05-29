import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { cleanTitle } from "../lib/utils";
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

  const closePlayer = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent toggling play state when leaving
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
      analyser.smoothingTimeConstant = 0.85; // Smooth out for natural weather flow
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
      } catch (e) { }
    } else {
      audioEl.pause();
    }
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

    audioEl.addEventListener('play', onPlay);
    audioEl.addEventListener('pause', onPause);
    audioEl.addEventListener('ended', onPause);
    audioEl.addEventListener('timeupdate', onTimeUpdate);

    setIsPlaying(!audioEl.paused);
    setCurrentTime(audioEl.currentTime);

    return () => {
      audioEl.removeEventListener('play', onPlay);
      audioEl.removeEventListener('pause', onPause);
      audioEl.removeEventListener('ended', onPause);
      audioEl.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [song?.url]);

  if (view !== "player") return null;

  const currentSegment = currentSegmentIndex >= 0 ? segments[currentSegmentIndex] : null;

  // --- Hand-drawn Lyric Renderer ---
  const renderDrawnText = (isTranslation: boolean) => {
    if (!currentSegment) {
      if (isTranslation) return null;
      if (segments.length > 0) {
        const upcoming = segments.find(s => s.start >= currentTime);
        // Floating dot prompt before lyrics
        return <span className="word-write text-ink-graphite-light">{upcoming ? ". . ." : ""}</span>;
      }
      return <span className="word-write text-ink-graphite">{cleanTitle(song?.name || "")}</span>;
    }

    const words = currentSegment.words || [];
    const sourceString = isTranslation
      ? (currentSegment.translation || currentSegment.secondary || "")
      : currentSegment.primary;

    // Fallback or Translation Line Renderer
    if (!words.length || isTranslation) {
      const strWords = sourceString.split(" ");
      if (!strWords.length || !strWords[0]) return null;

      const duration = currentSegment.end - currentSegment.start;
      const timePerWord = duration / strWords.length;

      return strWords.map((wordStr: string, i: number) => {
        const fakedStart = currentSegment.start + (i * timePerWord);
        const hasStarted = currentTime >= fakedStart;
        const eraseOffset = isTranslation ? 0.1 : 0.4;
        const isErasing = currentTime > currentSegment.end + eraseOffset;

        let className = "word-hidden";
        if (hasStarted && !isErasing) className = "word-write";
        else if (hasStarted && isErasing) className = "word-erase";

        return (
          <span key={i} className={className}>
            {wordStr}{i < strWords.length - 1 ? " " : ""}
          </span>
        );
      });
    }

    // Precise Timing Renderer
    return words.map((w: any, i: number) => {
      const start = Number(w.start);
      const text = w.text || w.word || "";
      const hasStarted = currentTime >= start;
      const isErasing = currentTime > currentSegment.end + 0.4;

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

  return (
    // The entire stage acts as an invisible play/pause button
    <section
      className="player-view fixed inset-0 z-30 bg-transparent min-h-[100svh] overflow-hidden cursor-pointer"
      aria-label="Visualizer player"
      onClick={togglePlay}
    >

      {/* Global Grain Overlay pushes ink INTO paper */}
      <div className="paper-grain-overlay pointer-events-none"></div>

      {/* Back Button escapes the invisible play/pause overlay via stopPropagation */}
      <button
        className="player-back fixed top-6 right-6 z-50 bg-transparent border-none cursor-pointer font-display text-[1.5rem] font-bold text-ink-red hover:scale-110 transition-transform"
        onClick={closePlayer}
      >
        <span aria-hidden="true">&lt; Lib</span>
      </button>

      <div className="stage-shell w-full h-[100svh] grid place-items-stretch" aria-label="Visualizer stage">
        <section className="stage relative w-full h-[100svh] pointer-events-none">

          {/* Main Weather Engine Canvas */}
          <canvas id="visualizer-canvas" className="absolute inset-0 z-[2] w-full h-full"></canvas>

          {/* Perspective Container for 3D Lyrics and Shadows */}
          <div
            className="lyric-wrap flex flex-col items-center text-center absolute w-full z-20"
            style={{
              perspective: "1000px",
              bottom: "20vh", // Positioned to look good on portrait phones
              padding: "0 max(24px, 5vw)"
            }}
          >
            {/* Primary Text (The Umbrella) */}
            <div className="lyric-primary max-w-[min(1000px,100%)] font-display text-[clamp(2.5rem,7vw,5.5rem)] font-bold leading-[1.05] text-ink-graphite whitespace-normal break-words drop-shadow-sm">
              {renderDrawnText(false)}
            </div>

            {/* 3D Cast Shadow Translation */}
            <div className="translation-wrap max-w-[min(1000px,100%)] font-display font-bold text-[clamp(2.2rem,5vw,4rem)] leading-[1.05] whitespace-normal break-words mt-3">
              {renderDrawnText(true)}
            </div>
          </div>

        </section>
      </div>

      {/* Tiny Pause/Play indicator (Fades out when playing) */}
      <div
        className={`absolute inset-0 grid place-items-center pointer-events-none transition-opacity duration-700 ${isPlaying ? 'opacity-0' : 'opacity-100'}`}
      >
        <div className="font-display text-ink-graphite-light text-[6rem] opacity-50" style={{ filter: 'blur(2px)' }}>
          II
        </div>
      </div>

    </section>
  );
}