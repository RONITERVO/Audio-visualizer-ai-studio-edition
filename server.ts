import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import os from "os";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // API Routes
  app.post("/api/gemini/generate", async (req, res) => {
    let uploadedFileRef: any = null;
    let ai: any = null;
    
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API key is not configured" });
      }

      const { prompt, audioPart, model, responseSchema, phaseId } = req.body;
      ai = new GoogleGenAI({ apiKey });
      const targetModel = model || "gemini-3.1-pro-preview";

      const parts: any[] = [{ text: prompt }];

      if (audioPart) {
        if (audioPart.inline_data) {
          const bufferSize = Buffer.byteLength(audioPart.inline_data.data, 'base64');
          if (bufferSize > 18 * 1024 * 1024) {
             // File is too large for inline, upload it to Gemini Files API
             const tmpPath = path.join(os.tmpdir(), `upload-${Date.now()}.audio`);
             fs.writeFileSync(tmpPath, Buffer.from(audioPart.inline_data.data, 'base64'));
             
             uploadedFileRef = await ai.files.upload({
                 file: tmpPath,
                 mimeType: audioPart.inline_data.mime_type,
                 displayName: `Upload-${Date.now()}`
             });
             
             parts.push({
               fileData: {
                 fileUri: uploadedFileRef.uri,
                 mimeType: audioPart.inline_data.mime_type
               }
             });
             fs.unlinkSync(tmpPath);
          } else {
             parts.push({
               inlineData: {
                 data: audioPart.inline_data.data,
                 mimeType: audioPart.inline_data.mime_type
               }
             });
          }
        }
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const config: any = {
        temperature: responseSchema ? 0.1 : 0.35
      };

      if (responseSchema) {
        config.responseMimeType = "application/json";
        config.responseSchema = responseSchema;
      }

      const stream = await ai.models.generateContentStream({
        model: targetModel,
        contents: parts,
        config
      });

      let answer = "";
      for await (const chunk of stream) {
        const textChunk = chunk.text;
        if (textChunk) {
          answer += textChunk;
          res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
        }
      }

      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || "Failed to generate content" });
      } else {
        res.write(`data: ${JSON.stringify({ error: error.message || "Failed to generate content" })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
      }
    } finally {
        if (uploadedFileRef && ai) {
            try {
                await ai.files.delete({ name: uploadedFileRef.name });
            } catch (e) {
                console.error("Failed to delete temp Gemini file", e);
            }
        }
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
