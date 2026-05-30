export async function translateSegments(options: {
  segments: any[];
  sourceLanguage?: string;
  targetLanguage: string;
  apiKey?: string;
}) {
  const response = await fetch("/api/translate/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || "Translation failed");
  }

  return data.segments;
}
