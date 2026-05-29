import { useStore } from "./store";
import { storeSongInDb } from "./db";
import { persistLibrary } from "./persistence";

function fileToBase64(file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            // The result includes the data URI prefix like: data:audio/mpeg;base64,...
            const b64 = result.split(",")[1];
            resolve(b64);
        };
        reader.onerror = error => reject(error);
    });
}

function base64ToBlob(b64: string, type: string = "application/octet-stream"): Blob {
    const byteCharacters = atob(b64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type });
}

export async function exportLibrary() {
    const records = useStore.getState().audioFiles;
    const parts: BlobPart[] = [];
    
    // Also trigger a save to ensure DB is up to date
    persistLibrary().catch(console.error);
    
    for (const song of records) {
        let fileBase64 = null;
        let fileType = song.type || "";
        let fileName = song.file?.name || song.name;

        if (song.file) {
            try {
                fileBase64 = await fileToBase64(song.file);
            } catch (e) {
                console.error("Failed to read file", song.name, e);
            }
        }
        
        const lineObj = {
            id: song.id,
            key: song.key,
            name: song.name,
            base: song.base,
            size: song.size,
            type: song.type,
            lastModified: song.lastModified,
            relativePath: song.relativePath,
            timing: song.timing,
            fileBase64,
            fileType,
            fileName
        };
        
        parts.push(JSON.stringify(lineObj) + "\n");
    }
    
    const blob = new Blob(parts, { type: "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `sketchbook-library-${new Date().toISOString().slice(0,10)}.ndjson`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 10000);
}

export async function importLibrary(file: File) {
    const state = useStore.getState();
    const currentAudioFiles = [...state.audioFiles];
    let added = 0;

    const stream = file.stream();
    const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
    
    let buffer = "";

    while (true) {
        const { value, done } = await reader.read();
        if (value) {
            buffer += value;
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // keep the last incomplete chunk

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const data = JSON.parse(line);
                    
                    let newFile = null;
                    if (data.fileBase64) {
                        const blob = base64ToBlob(data.fileBase64, data.fileType || data.type);
                        newFile = new File([blob], data.fileName || data.name, { type: data.fileType || data.type, lastModified: data.lastModified });
                    }
                    
                    const newSong = {
                        id: data.id,
                        key: data.key,
                        name: data.name,
                        base: data.base,
                        size: data.size,
                        type: data.type,
                        lastModified: data.lastModified,
                        relativePath: data.relativePath,
                        timing: data.timing,
                        file: newFile,
                        url: newFile ? URL.createObjectURL(newFile) : null,
                        recoveryStatus: newFile ? "" : "Needs recovery",
                        needsRecovery: !newFile
                    };
                    
                    const existingIndex = currentAudioFiles.findIndex(s => s.id === newSong.id);
                    if (existingIndex >= 0) {
                        if (currentAudioFiles[existingIndex].url) {
                            URL.revokeObjectURL(currentAudioFiles[existingIndex].url);
                        }
                        currentAudioFiles[existingIndex] = newSong;
                    } else {
                        currentAudioFiles.push(newSong);
                    }
                    
                    await storeSongInDb(newSong);
                    added++;
                    
                } catch(e) {
                    console.error("Failed to parse ndjson line", e);
                }
            }
        }
        
        if (done) {
            if (buffer.trim()) {
                 try {
                    const data = JSON.parse(buffer);
                    let newFile = null;
                    if (data.fileBase64) {
                        const blob = base64ToBlob(data.fileBase64, data.fileType || data.type);
                        newFile = new File([blob], data.fileName || data.name, { type: data.fileType || data.type, lastModified: data.lastModified });
                    }
                    
                    const newSong = {
                        id: data.id,
                        key: data.key,
                        name: data.name,
                        base: data.base,
                        size: data.size,
                        type: data.type,
                        lastModified: data.lastModified,
                        relativePath: data.relativePath,
                        timing: data.timing,
                        file: newFile,
                        url: newFile ? URL.createObjectURL(newFile) : null,
                        recoveryStatus: newFile ? "" : "Needs recovery",
                        needsRecovery: !newFile
                    };
                    
                    const existingIndex = currentAudioFiles.findIndex(s => s.id === newSong.id);
                    if (existingIndex >= 0) {
                        if (currentAudioFiles[existingIndex].url) {
                            URL.revokeObjectURL(currentAudioFiles[existingIndex].url);
                        }
                        currentAudioFiles[existingIndex] = newSong;
                    } else {
                        currentAudioFiles.push(newSong);
                    }
                    
                    await storeSongInDb(newSong);
                    added++;
                } catch(e) {}
            }
            break;
        }
    }
    
    useStore.setState({ audioFiles: currentAudioFiles });
}
