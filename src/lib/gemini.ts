export async function generateGeminiContent(
  prompt: string,
  model: string,
  audioPart: any = null,
  responseSchema: any = null,
  onStream: (chunk: string) => void
) {
  const response = await fetch("/api/gemini/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt,
      model,
      audioPart,
      responseSchema
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error((errorData && errorData.error) ? errorData.error : "Failed to connect to API");
  }

  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.text) {
            onStream(parsed.text);
          }
        } catch (e) {
          // parse error
        }
      }
    }
  }
}
