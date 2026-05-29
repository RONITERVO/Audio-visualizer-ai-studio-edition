import { getAudioMimeType } from "./utils";

function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop()! : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function generateScribeTranscript(options: {
  file: File;
  apiKey?: string;
  sourceLanguage?: string;
  previousText?: string;
  keyterms?: string[];
}) {
  const audioBase64 = await fileToBase64(options.file);

  const response = await fetch("/api/elevenlabs/scribe-realtime", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioBase64,
      mimeType: getAudioMimeType(options.file),
      fileName: options.file.name,
      apiKey: options.apiKey || "",
      sourceLanguage: options.sourceLanguage || "",
      previousText: options.previousText || "Song lyrics",
      keyterms: options.keyterms || [],
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || "Scribe transcription failed");
  }

  return data;
}
