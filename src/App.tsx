import { useEffect, useState } from "react";
import { GraphiteDesignSystem } from "./lib/graphics/GraphiteEngine";
import { useStore } from "./lib/store";
import { LibraryView } from "./components/LibraryView";
import { PlayerView } from "./components/PlayerView";
import { getDroppedFiles } from "./lib/fileSystem";
import { handleGlobalDroppedFiles } from "./lib/fileHandlers";
import { restorePersistedLibrary, persistLibrary } from "./lib/persistence";

export default function App() {
  const view = useStore((s) => s.view);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const engine = new GraphiteDesignSystem();
    engine.init();
    
    // Restore saved library state
    restorePersistedLibrary();

    const unsub = useStore.subscribe((state, prevState) => {
      if (state.audioFiles !== prevState.audioFiles) {
        // Debounce slightly or just call
        persistLibrary().catch(console.error);
      }
    });

    let dragDepth = 0;
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragDepth++;
      setIsDragging(true);
    };
    
    const handleDragOver = (e: DragEvent) => e.preventDefault();
    
    const handleDragLeave = (e: DragEvent) => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setIsDragging(false);
    };
    
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragDepth = 0;
      setIsDragging(false);
      
      if (!e.dataTransfer) return;
      const files = await getDroppedFiles(e.dataTransfer);
      
      await handleGlobalDroppedFiles(files);
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      unsub();
      engine.destroy();
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  return (
    <>
      <div 
        className="relative z-20 py-8 pb-32 min-h-screen"
        style={{ 
          paddingLeft: "calc(max(50px, 4vw) + max(24px, 5vw))",
          paddingRight: "max(24px, 5vw)"
        }}
      >
        <div className="max-w-[1000px] mx-auto">
          {view === "library" && <LibraryView />}
        </div>
        <PlayerView />
      </div>

      {/* Global Drop Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 backdrop-blur-sm pointer-events-none">
          <div className="w-[min(400px,90vw)] min-h-[200px] p-8 grid place-items-center text-center bg-transparent drop-card-fx rounded-xl border-2 border-dashed border-ink-blueprint">
            <strong className="font-display text-[3rem] text-ink-blueprint">Drop files</strong>
            <span className="text-ink-paper font-body text-xl">Audio, guide, timing, or a folder</span>
          </div>
        </div>
      )}
    </>
  );
}
