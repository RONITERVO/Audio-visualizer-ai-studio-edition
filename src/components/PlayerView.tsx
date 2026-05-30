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

  const closePlayer = (e: React.MouseEvent) => {
    e.stopPropagation();
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
      analyser.smoothingTimeConstant = 0.78;
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

  const renderDrawnText = (isTranslation: boolean) => {
    if (!currentSegment) {
      if (isTranslation) return null;
      if (segments.length > 0) {
        const upcoming = segments.find(s => s.start >= currentTime);
        return <span className="word-write text-ink-graphite-light">{upcoming ? "( Instrumental )" : "End of page"}</span>;
      }
      return <span className="word-write text-ink-graphite">{cleanTitle(song?.name || "")}</span>;
    }

    const words = currentSegment.words || [];
    const sourceString = isTranslation
      ? (currentSegment.translation || currentSegment.secondary || "")
      : currentSegment.primary;

    if (!words.length || isTranslation) {
      const strWords = sourceString.split(" ");
      if (!strWords.length || !strWords[0]) return null;

      const duration = currentSegment.end - currentSegment.start;
      const timePerWord = duration / strWords.length;

      return strWords.map((wordStr: string, i: number) => {
        const fakedStart = currentSegment.start + (i * timePerWord);
        const hasStarted = currentTime >= fakedStart;
        const eraseOffset = isTranslation ? 0.1 : 0.3;
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

    return words.map((w: any, i: number) => {
      const start = Number(w.start);
      const text = w.text || w.word || "";
      const hasStarted = currentTime >= start;
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

  return (
    <section
      className="player-view fixed inset-0 z-30 bg-transparent min-h-[100svh] overflow-hidden cursor-pointer"
      aria-label="Visualizer player"
      onClick={togglePlay}
    >

      <div className="paper-grain-overlay pointer-events-none"></div>

      <button className="player-back fixed top-5 right-5 z-50 bg-transparent border-none cursor-pointer font-display text-[1.5rem] font-bold text-ink-red hover:scale-110 transition-transform" onClick={closePlayer}>
        <span aria-hidden="true">&lt; Lib</span>
      </button>

      <div className="stage-shell w-full h-[100svh] grid place-items-stretch" aria-label="Visualizer stage">
        <section className="stage relative w-full h-[100svh] pointer-events-none" tabIndex={0}>

          <canvas id="visualizer-canvas" className="absolute inset-0 z-[2] w-full h-full"></canvas>

          <div
            className="stage-meta absolute z-10 top-[30px] flex justify-between pointer-events-none opacity-40 mix-blend-multiply"
            style={{
              left: "calc(max(50px, 4vw) + max(24px, 5vw))",
              right: "max(24px, 5vw)"
            }}
          >
            <span className="font-display text-[2rem] text-ink-graphite truncate max-w-[50%]">{song?.name || "Choose a song"}</span>
            <span className="font-display text-[2rem] text-ink-blueprint ml-2">{formatPreciseClock(currentTime)}</span>
          </div>

          <div
            className="lyric-wrap absolute flex flex-col items-center text-center z-20 pointer-events-none"
            style={{
              perspective: "1000px",
              top: "40vh", // Push it slightly up so ocean has plenty of room below
              left: "calc(max(50px, 4vw) + max(24px, 5vw))",
              right: "max(24px, 5vw)"
            }}
          >
            {/* Primary Text: Controls the visualizer's engine Horizon line naturally */}
            <div className="lyric-primary relative z-20 max-w-[min(1000px,100%)] font-display text-[clamp(2.5rem,5vw,5.5rem)] font-bold leading-[1.05] text-ink-graphite whitespace-normal break-words drop-shadow-sm">
              {renderDrawnText(false)}
            </div>

            {/* 3D Cast Shadow Translation (Rippling on the ocean surface, target for rain drops) */}
            <div className="translation-wrap absolute top-[100%] z-10 max-w-[min(1000px,100%)] font-display font-bold text-[clamp(2.2rem,4vw,4rem)] leading-[1.05] whitespace-normal break-words mt-[15px]">
              {renderDrawnText(true)}
            </div>
          </div>

        </section>
      </div>

      {/* Giant Play/Pause indicator that gracefully fades out */}
      <div
        className={`absolute inset-0 grid place-items-center pointer-events-none transition-opacity duration-700 ${isPlaying ? 'opacity-0' : 'opacity-100'}`}
      >
        <div className="font-display text-ink-graphite-light text-[6rem] opacity-40 mix-blend-multiply" style={{ filter: 'blur(3px)' }}>
          II
        </div>
      </div>

    </section>
  );
}