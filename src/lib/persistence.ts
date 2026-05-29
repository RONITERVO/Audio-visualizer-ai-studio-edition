import { useStore } from "./store";
import { getAllSongsFromDb, storeSongInDb } from "./db";

const SETTINGS_KEYS = {
    elevenLabsApiKey: "living-sketchbook:elevenlabs-api-key",
    saveElevenLabsKey: "living-sketchbook:elevenlabs-save-key",
    sourceLanguage: "living-sketchbook:source-language",
    targetLanguage: "living-sketchbook:target-language",
    translationEnabled: "living-sketchbook:translation-enabled",
    googleTranslateApiKey: "living-sketchbook:google-translate-api-key",
    saveGoogleTranslateKey: "living-sketchbook:google-translate-save-key",
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

export function saveSettings(settings = useStore.getState()) {
    try {
        if (settings.saveElevenLabsKey) {
            localStorage.setItem(SETTINGS_KEYS.elevenLabsApiKey, settings.elevenLabsApiKey || "");
        } else {
            localStorage.removeItem(SETTINGS_KEYS.elevenLabsApiKey);
        }

        if (settings.saveGoogleTranslateKey) {
            localStorage.setItem(SETTINGS_KEYS.googleTranslateApiKey, settings.googleTranslateApiKey || "");
        } else {
            localStorage.removeItem(SETTINGS_KEYS.googleTranslateApiKey);
        }

        localStorage.setItem(SETTINGS_KEYS.saveElevenLabsKey, settings.saveElevenLabsKey ? "true" : "false");
        localStorage.setItem(SETTINGS_KEYS.sourceLanguage, settings.sourceLanguage || "");
        localStorage.setItem(SETTINGS_KEYS.targetLanguage, settings.targetLanguage || "en");
        localStorage.setItem(SETTINGS_KEYS.translationEnabled, settings.translationEnabled ? "true" : "false");
        localStorage.setItem(SETTINGS_KEYS.saveGoogleTranslateKey, settings.saveGoogleTranslateKey ? "true" : "false");
    } catch(e) {}
}

export function loadSettings() {
    try {
        const saveElevenLabsKey = localStorage.getItem(SETTINGS_KEYS.saveElevenLabsKey) === "true";
        const saveGoogleTranslateKey = localStorage.getItem(SETTINGS_KEYS.saveGoogleTranslateKey) === "true";

        return {
            elevenLabsApiKey: saveElevenLabsKey ? localStorage.getItem(SETTINGS_KEYS.elevenLabsApiKey) || "" : "",
            saveElevenLabsKey,
            sourceLanguage: localStorage.getItem(SETTINGS_KEYS.sourceLanguage) || "",
            targetLanguage: localStorage.getItem(SETTINGS_KEYS.targetLanguage) || "en",
            translationEnabled: localStorage.getItem(SETTINGS_KEYS.translationEnabled) !== "false",
            googleTranslateApiKey: saveGoogleTranslateKey ? localStorage.getItem(SETTINGS_KEYS.googleTranslateApiKey) || "" : "",
            saveGoogleTranslateKey,
        };
    } catch(e) {
        return {
            elevenLabsApiKey: "",
            saveElevenLabsKey: false,
            sourceLanguage: "",
            targetLanguage: "en",
            translationEnabled: true,
            googleTranslateApiKey: "",
            saveGoogleTranslateKey: false,
        };
    }
}
