import { useStore } from "./store";
import { parseTranscript } from "./parser";
import { getExtension, getBaseName, getTextMimeType, createId } from "./utils";
import { getAllSongsFromDb, storeSongInDb } from "./db";

const STORAGE_KEYS = {
    transcripts: "living-sketchbook:text-files" // remaining old stuff if any
};

export async function persistLibrary() {
    const { audioFiles } = useStore.getState();
    for (const song of audioFiles) {
        if (!song || !song.name) continue;
        try {
            await storeSongInDb(song);
        } catch(e) {
            console.error("IDB save failed", e);
        }
    }
}

export async function restorePersistedLibrary() {
    try {
        const records: any[] = await getAllSongsFromDb();
        const state = useStore.getState();
        const audioFiles = [...state.audioFiles];
        
        for (const record of records) {
            // Re-create object URLs for the audio blobs so they can play
            if (record.file && !record.url) {
                try {
                    record.url = URL.createObjectURL(record.file);
                } catch(e) {}
            }
            if(!audioFiles.some(s => s.id === record.id)) {
                 audioFiles.push(record);
            }
        }
        useStore.setState({ audioFiles });
    } catch(e) {
        console.error("Failed to restore from IDB", e);
    }
}

export function saveSettings(model: string, apiKey: string, saveKey: boolean) {
    try {
        if (saveKey) {
            localStorage.setItem("living-sketchbook:gemini-api-key", apiKey);
        } else {
            localStorage.removeItem("living-sketchbook:gemini-api-key");
        }
        localStorage.setItem("living-sketchbook:gemini-save-key", saveKey ? "true" : "false");
        localStorage.setItem("living-sketchbook:gemini-model", model);
    } catch(e) {}
}

export function loadSettings() {
    try {
        return {
            apiKey: localStorage.getItem("living-sketchbook:gemini-api-key") || "",
            saveKey: localStorage.getItem("living-sketchbook:gemini-save-key") === "true",
            model: localStorage.getItem("living-sketchbook:gemini-model") || "gemini-3.1-pro-preview"
        };
    } catch(e) {
        return { apiKey: "", saveKey: false, model: "gemini-3.1-pro-preview" };
    }
}
