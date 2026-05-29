import "dotenv/config";
import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import os from "os";
import WebSocket from "ws";
import ffmpegPath from "ffmpeg-static";
import crypto from "crypto";
import { spawn } from "child_process";

const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
const CHANNELS = 1;
const BYTES_PER_SECOND = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS;

const CHUNK_MS = 250;
const FINAL_TAIL_SILENCE_MS = 500;
const FINAL_MESSAGE_WAIT_MS = 3000;
const WS_OPEN_TIMEOUT_MS = 15_000;
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const GOOGLE_TRANSLATE_REQUEST_BYTE_LIMIT = 100_000;
const GOOGLE_TRANSLATE_BODY_HEADROOM_BYTES = 10_000;
const TRANSLATE_HTML_BYTE_LIMIT = GOOGLE_TRANSLATE_REQUEST_BYTE_LIMIT - GOOGLE_TRANSLATE_BODY_HEADROOM_BYTES;
const TARGET_SEGMENT_WORDS = 7;
const MAX_SEGMENT_WORDS = 10;
const TARGET_SEGMENT_CHARS = 42;
const MAX_SEGMENT_CHARS = 58;
const TARGET_SEGMENT_SECONDS = 4.2;
const MAX_SEGMENT_SECONDS = 6;
const MIN_SEGMENT_WORDS = 2;
const MIN_NONVOCAL_GAP_SECONDS = 0.65;
const MIN_MANUAL_COMMIT_SPACING_SECONDS = 12;
const MAX_MANUAL_COMMIT_MARKS = 80;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function scribeLog(requestId: string, message: string, details: Record<string, any> = {}) {
  const safeDetails = Object.fromEntries(
    Object.entries(details).map(([key, value]) => [key, typeof value === "string" ? redactError(value) : value])
  );
  console.log(`[scribe:${requestId}] ${message}`, safeDetails);
}

class PublicError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

function redactError(error: any) {
  return String(error?.message || error || "Unknown error")
    .replace(/xi-api-key[^\s,}]*/gi, "xi-api-key=[redacted]")
    .replace(/key=([^&\s]+)/gi, "key=[redacted]")
    .replace(/AIza[0-9A-Za-z_-]+/g, "[redacted-google-key]")
    .replace(/sk_[0-9A-Za-z_-]+/g, "[redacted-key]");
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stripTags(value: string) {
  return String(value || "").replace(/<[^>]*>/g, "").trim();
}

function decodeBasicEntities(value: string) {
  return String(value || "")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeLanguageCode(value: any) {
  const cleaned = String(value || "").trim();
  return cleaned && cleaned.toLowerCase() !== "auto" ? cleaned : "";
}

function getEventType(event: any) {
  return String(event?.message_type || event?.type || event?.event || "");
}

function getFriendlyScribeError(event: any) {
  const type = getEventType(event);
  const detail = redactError(event?.message || event?.error || event?.detail || "");

  if (type.includes("auth")) return "ElevenLabs authentication or quota error.";
  if (type.includes("quota") || type.includes("resource_exhausted")) return "ElevenLabs authentication or quota error.";
  if (type.includes("rate_limited") || type.includes("queue_overflow")) return "ElevenLabs is busy or rate limited. Try again in a moment.";
  if (type.includes("unaccepted_terms")) return "ElevenLabs Scribe terms must be accepted in the ElevenLabs dashboard.";
  if (type.includes("input") || type.includes("chunk_size")) return "Could not decode this audio file. Try MP3, WAV, M4A, FLAC, OGG, or WEBM.";
  if (type.includes("insufficient_audio_activity")) return "ElevenLabs could not detect enough vocal audio in this file.";
  if (type.includes("transcriber")) return "ElevenLabs could not transcribe this audio.";

  return detail || "Scribe transcription failed.";
}

function isScribeErrorEvent(event: any) {
  const type = getEventType(event);
  return [
    "auth_error",
    "quota_exceeded",
    "transcriber_error",
    "input_error",
    "error",
    "commit_throttled",
    "unaccepted_terms",
    "rate_limited",
    "queue_overflow",
    "resource_exhausted",
    "session_time_limit_exceeded",
    "chunk_size_exceeded",
    "insufficient_audio_activity",
  ].some((errorType) => type.includes(errorType));
}

function parseWsMessage(data: WebSocket.RawData) {
  const text = Buffer.isBuffer(data)
    ? data.toString("utf8")
    : Array.isArray(data)
      ? Buffer.concat(data).toString("utf8")
      : data instanceof ArrayBuffer
        ? Buffer.from(data).toString("utf8")
        : Buffer.from(data as any).toString("utf8");
  return JSON.parse(text);
}

function sendWsJson(ws: WebSocket, payload: Record<string, any>) {
  if (ws.readyState !== WebSocket.OPEN) {
    throw new PublicError("Scribe connection closed before transcription finished.", 502);
  }
  ws.send(JSON.stringify(payload));
}

function waitForOpen(ws: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      try {
        ws.close();
      } catch {}
      reject(new PublicError("Could not connect to ElevenLabs Scribe. Check your network and API key.", 504));
    }, WS_OPEN_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timer);
      ws.off("open", onOpen);
      ws.off("error", onError);
      ws.off("close", onClose);
    };
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new PublicError("Scribe connection closed before it was ready.", 502));
    };
    ws.once("open", onOpen);
    ws.once("error", onError);
    ws.once("close", onClose);
  });
}

function extractScribeText(value: any): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(extractScribeText).join("");
  if (typeof value === "object") {
    return extractScribeText(
      value.text ??
      value.word ??
      value.character ??
      value.char ??
      value.value ??
      value.grapheme ??
      value.symbol ??
      ""
    );
  }
  return "";
}

function normalizeScribeCharacter(character: any, index: number, total: number, wordStart: number, wordEnd: number) {
  const text = extractScribeText(character);
  const rawStart = Number(character?.start);
  const rawEnd = Number(character?.end);
  const hasWordTiming = Number.isFinite(wordStart) && Number.isFinite(wordEnd) && wordEnd > wordStart;
  const interpolatedStart = hasWordTiming ? wordStart + ((wordEnd - wordStart) * index) / Math.max(1, total) : NaN;
  const interpolatedEnd = hasWordTiming ? wordStart + ((wordEnd - wordStart) * (index + 1)) / Math.max(1, total) : NaN;

  return {
    text,
    start: Number.isFinite(rawStart) ? rawStart : interpolatedStart,
    end: Number.isFinite(rawEnd) ? rawEnd : interpolatedEnd,
    order: index,
  };
}

function lettersFromWord(text: string, characters: any, start: number, end: number) {
  const rawCharacters = Array.isArray(characters) && characters.length
    ? characters
    : Array.from(text);
  const letters = rawCharacters
    .map((character, index) => normalizeScribeCharacter(character, index, rawCharacters.length, start, end))
    .filter((character) => character.text);
  const duration = Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : 0;

  if (letters.length) return letters;

  return Array.from(text).map((char, index, pieces) => {
    const letterStart = duration ? start + (duration * index) / pieces.length : NaN;
    const letterEnd = duration ? start + (duration * (index + 1)) / pieces.length : NaN;
    return {
      text: char,
      start: Number.isFinite(letterStart) ? letterStart : NaN,
      end: Number.isFinite(letterEnd) ? letterEnd : NaN,
      order: index,
    };
  });
}

function normalizeScribeWord(word: any) {
  const rawCharacters = Array.isArray(word?.characters) ? word.characters : [];
  const characterText = rawCharacters.map(extractScribeText).join("");
  const text = extractScribeText(word?.text ?? word?.word) || characterText;
  const start = Number(word?.start);
  const end = Number(word?.end);
  const safeStart = Number.isFinite(start) ? start : NaN;
  const safeEnd = Number.isFinite(end) ? end : NaN;
  const letters = lettersFromWord(text, rawCharacters, safeStart, safeEnd);
  const characters = letters.map((letter) => letter.text);

  return {
    word: text,
    text,
    type: word?.type || "word",
    start: safeStart,
    end: safeEnd,
    logprob: word?.logprob,
    characters,
    letters,
  };
}

function hasReadableText(value: string) {
  return /[\p{L}\p{N}]/u.test(value || "");
}

function joinScribeWords(words: any[]) {
  return words
    .map((word) => word.text || word.word || "")
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([,.;:!?%…])/g, "$1")
    .replace(/([¿¡])\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTimedWordsForLyrics(words: any[]) {
  const chunks: any[][] = [];

  let startIndex = 0;
  while (startIndex < words.length) {
    let bestEnd = startIndex;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let endIndex = startIndex; endIndex < words.length; endIndex += 1) {
      const chunk = words.slice(startIndex, endIndex + 1);
      const text = joinScribeWords(chunk);
      const wordCount = chunk.length;
      const duration = Number(chunk[chunk.length - 1].end) - Number(chunk[0].start);
      const next = words[endIndex + 1];
      const gapAfter = next ? Math.max(0, Number(next.start) - Number(chunk[chunk.length - 1].end)) : 0;
      const lastText = String(chunk[chunk.length - 1].text || chunk[chunk.length - 1].word || "");
      const sentenceBoundary = /[.!?]$/.test(lastText);
      const phraseBoundary = /[,;:]$/.test(lastText);

      const hardLimit =
        wordCount > MAX_SEGMENT_WORDS ||
        text.length > MAX_SEGMENT_CHARS ||
        (Number.isFinite(duration) && duration > MAX_SEGMENT_SECONDS);
      if (hardLimit && endIndex > startIndex) break;

      let score = 0;
      score += Math.min(gapAfter, 2) * 9;
      if (sentenceBoundary) score += 18;
      if (phraseBoundary) score += 8;
      if (wordCount >= MIN_SEGMENT_WORDS && wordCount <= TARGET_SEGMENT_WORDS) score += 5;
      if (text.length <= TARGET_SEGMENT_CHARS) score += 4;
      if (Number.isFinite(duration) && duration <= TARGET_SEGMENT_SECONDS) score += 3;
      if (wordCount < MIN_SEGMENT_WORDS && !sentenceBoundary && !phraseBoundary) score -= 8;
      if (wordCount > TARGET_SEGMENT_WORDS) score -= (wordCount - TARGET_SEGMENT_WORDS) * 3;
      if (text.length > TARGET_SEGMENT_CHARS) score -= (text.length - TARGET_SEGMENT_CHARS) * 0.45;
      if (Number.isFinite(duration) && duration > TARGET_SEGMENT_SECONDS) {
        score -= (duration - TARGET_SEGMENT_SECONDS) * 2;
      }
      if (!next) score += 4;

      if (score > bestScore) {
        bestScore = score;
        bestEnd = endIndex;
      }

      if (sentenceBoundary && wordCount >= MIN_SEGMENT_WORDS) break;
    }

    chunks.push(words.slice(startIndex, bestEnd + 1));
    startIndex = bestEnd + 1;
  }

  return chunks;
}

function segmentFromWords(words: any[], event: any, order: number, fallbackText = "") {
  const text = joinScribeWords(words) || fallbackText.trim();
  if (!hasReadableText(text)) return null;

  const timedItems = words.filter((word: any) => Number.isFinite(word.start) && Number.isFinite(word.end));
  const start = timedItems.length ? timedItems[0].start : 0;
  const end = timedItems.length ? timedItems[timedItems.length - 1].end : start + 0.5;

  return {
    id: `seg-${crypto.randomUUID()}`,
    start,
    end: Math.max(end, start + 0.05),
    primary: text,
    translation: "",
    secondary: "",
    raw: text,
    speaker: "",
    section: "",
    role: "lyric",
    words,
    characterTimeline: words.flatMap((word: any) => Array.isArray(word.letters) ? word.letters : []),
    order,
    source: "elevenlabs-scribe-v2-realtime",
    language_code: event?.language_code || "",
  };
}

function segmentsFromScribeEvent(event: any, order: number) {
  const words = Array.isArray(event?.words)
    ? event.words.map(normalizeScribeWord)
    : [];

  const timedWords = words.filter(
    (word: any) => word.type === "word" && Number.isFinite(word.start) && Number.isFinite(word.end)
  );

  const text = extractScribeText(event?.text).trim();
  if (!text && !timedWords.length) return [];

  if (!timedWords.length) {
    const segment = segmentFromWords(words, event, order, text);
    return segment ? [segment] : [];
  }

  return splitTimedWordsForLyrics(timedWords)
    .map((chunk, index) => segmentFromWords(chunk, event, order + index))
    .filter(Boolean);
}

async function* pcmChunksFromAudioFile(filePath: string): AsyncGenerator<Buffer> {
  if (!ffmpegPath) throw new PublicError("ffmpeg-static binary not found", 500);

  const ffmpeg = spawn(ffmpegPath, [
    "-hide_banner",
    "-loglevel", "error",
    "-i", filePath,
    "-vn",
    "-ac", "1",
    "-ar", String(SAMPLE_RATE),
    "-acodec", "pcm_s16le",
    "-f", "s16le",
    "pipe:1",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let stderr = "";
  ffmpeg.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  const closePromise = new Promise<number>((resolve) => ffmpeg.once("close", resolve));
  const chunkBytes = Math.floor((BYTES_PER_SECOND * CHUNK_MS) / 1000);
  let buffer = Buffer.alloc(0);

  for await (const data of ffmpeg.stdout) {
    buffer = Buffer.concat([buffer, data as Buffer]);

    while (buffer.length >= chunkBytes) {
      yield buffer.subarray(0, chunkBytes);
      buffer = buffer.subarray(chunkBytes);
    }
  }

  if (buffer.length > 0) yield buffer;

  const exitCode = await closePromise;
  if (exitCode !== 0) {
    console.error("ffmpeg decode failed:", redactError(stderr));
    throw new PublicError("Could not decode this audio file. Try MP3, WAV, M4A, FLAC, OGG, or WEBM.", 400);
  }
}

function getFiniteNumber(value: any) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function extractReferenceTimedWords(segment: any) {
  if (!Array.isArray(segment?.words)) return [];
  return segment.words
    .map((word: any) => ({
      start: getFiniteNumber(word?.start),
      end: getFiniteNumber(word?.end),
    }))
    .filter((word: any) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start)
    .sort((left: any, right: any) => left.start - right.start);
}

function deriveManualCommitMarks(referenceSegments: any[]) {
  const candidates: number[] = [];
  const sortedSegments = (Array.isArray(referenceSegments) ? referenceSegments : [])
    .map((segment) => ({
      start: getFiniteNumber(segment?.start),
      end: getFiniteNumber(segment?.end),
      words: extractReferenceTimedWords(segment),
    }))
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start)
    .sort((left, right) => left.start - right.start);

  for (let index = 0; index < sortedSegments.length - 1; index += 1) {
    const current = sortedSegments[index];
    const next = sortedSegments[index + 1];
    const gap = next.start - current.end;
    if (gap >= MIN_NONVOCAL_GAP_SECONDS) {
      candidates.push(current.end + Math.min(gap / 2, 1.5));
    }
  }

  for (const segment of sortedSegments) {
    const words = segment.words;
    for (let index = 0; index < words.length - 1; index += 1) {
      const gap = words[index + 1].start - words[index].end;
      if (gap >= MIN_NONVOCAL_GAP_SECONDS) {
        candidates.push(words[index].end + Math.min(gap / 2, 1.5));
      }
    }
  }

  const marks: number[] = [];
  for (const candidate of candidates.sort((left, right) => left - right)) {
    if (candidate < 2) continue;
    const previous = marks[marks.length - 1];
    if (previous == null || candidate - previous >= MIN_MANUAL_COMMIT_SPACING_SECONDS) {
      marks.push(Number(candidate.toFixed(3)));
    }
    if (marks.length >= MAX_MANUAL_COMMIT_MARKS) break;
  }

  return marks;
}

function normalizeCommitStrategy(value: any, manualCommitMarks: number[]) {
  return value === "manual-from-gaps" && manualCommitMarks.length ? "manual" : "vad";
}

function buildScribeUrl(options: {
  sourceLanguage: string;
  keyterms: string[];
  commitStrategy: "vad" | "manual";
}) {
  const url = new URL("wss://api.elevenlabs.io/v1/speech-to-text/realtime");
  url.searchParams.set("model_id", "scribe_v2_realtime");
  url.searchParams.set("audio_format", "pcm_16000");
  url.searchParams.set("include_timestamps", "true");
  url.searchParams.set("no_verbatim", "false");
  url.searchParams.set("commit_strategy", options.commitStrategy);

  if (options.commitStrategy === "vad") {
    url.searchParams.set("vad_silence_threshold_secs", "1.5");
    url.searchParams.set("vad_threshold", "0.4");
    url.searchParams.set("min_speech_duration_ms", "120");
    url.searchParams.set("min_silence_duration_ms", "650");
  }

  if (options.sourceLanguage) {
    url.searchParams.set("language_code", options.sourceLanguage);
  } else {
    url.searchParams.set("include_language_detection", "true");
  }

  for (const term of options.keyterms.slice(0, 50)) {
    const clean = String(term || "").trim().slice(0, 20);
    if (clean) url.searchParams.append("keyterms", clean);
  }

  return url;
}

async function streamToScribe(filePath: string, options: {
  apiKey: string;
  sourceLanguage: string;
  previousText: string;
  keyterms: string[];
  requestId: string;
  commitStrategy: "vad" | "manual";
  manualCommitMarks: number[];
}) {
  const requestId = options.requestId;
  const scribeUrl = buildScribeUrl({
    sourceLanguage: options.sourceLanguage,
    keyterms: options.keyterms,
    commitStrategy: options.commitStrategy,
  });
  scribeLog(requestId, "opening websocket", {
    host: scribeUrl.host,
    model: scribeUrl.searchParams.get("model_id"),
    sourceLanguage: options.sourceLanguage || "auto",
    commitStrategy: options.commitStrategy,
    manualCommitMarks: options.manualCommitMarks.length,
  });

  const ws = new WebSocket(scribeUrl, {
    headers: { "xi-api-key": options.apiKey },
  });

  const segments: any[] = [];
  let order = 0;
  let streamError: Error | null = null;
  let lastLoggedType = "";
  let chunksSent = 0;
  let audioMsSent = 0;
  let manualCommitIndex = 0;

  ws.on("message", (data) => {
    try {
      const event = parseWsMessage(data);
      const type = getEventType(event);

      if (type && type !== "partial_transcript" && type !== lastLoggedType) {
        scribeLog(requestId, "received event", { type });
        lastLoggedType = type;
      }

      if (type === "committed_transcript_with_timestamps") {
        const eventSegments = segmentsFromScribeEvent(event, order);
        if (eventSegments.length) {
          segments.push(...eventSegments);
          order += eventSegments.length;
          const first = eventSegments[0];
          const last = eventSegments[eventSegments.length - 1];
          scribeLog(requestId, "committed segment", {
            added: eventSegments.length,
            segments: segments.length,
            start: Number(first.start.toFixed(2)),
            end: Number(last.end.toFixed(2)),
          });
        }
      } else if (isScribeErrorEvent(event)) {
        streamError = new PublicError(getFriendlyScribeError(event), type.includes("auth") ? 401 : 502);
        ws.close();
      }
    } catch (error: any) {
      streamError = new PublicError(redactError(error), 502);
      ws.close();
    }
  });

  ws.on("error", (error) => {
    streamError = new PublicError(redactError(error), 502);
  });

  await waitForOpen(ws);
  scribeLog(requestId, "websocket open");

  let firstChunk = true;
  try {
    for await (const chunk of pcmChunksFromAudioFile(filePath)) {
      if (streamError) throw streamError;

      const payload: Record<string, any> = {
        message_type: "input_audio_chunk",
        audio_base_64: chunk.toString("base64"),
        commit: false,
        sample_rate: SAMPLE_RATE,
      };

      if (firstChunk && options.previousText) {
        payload.previous_text = String(options.previousText).slice(0, 50);
      }

      sendWsJson(ws, payload);
      firstChunk = false;
      chunksSent += 1;
      audioMsSent += Math.round((chunk.length / BYTES_PER_SECOND) * 1000);

      if (options.commitStrategy === "manual") {
        const audioSecondsSent = audioMsSent / 1000;
        while (
          manualCommitIndex < options.manualCommitMarks.length &&
          audioSecondsSent >= options.manualCommitMarks[manualCommitIndex]
        ) {
          sendWsJson(ws, {
            message_type: "input_audio_chunk",
            audio_base_64: "",
            commit: true,
            sample_rate: SAMPLE_RATE,
          });
          scribeLog(requestId, "manual gap commit sent", {
            at: options.manualCommitMarks[manualCommitIndex],
            audioSecondsSent: Number(audioSecondsSent.toFixed(1)),
          });
          manualCommitIndex += 1;
        }
      }

      if (chunksSent === 1 || chunksSent % Math.round(30_000 / CHUNK_MS) === 0) {
        scribeLog(requestId, "audio streamed", {
          chunksSent,
          audioSecondsSent: Number((audioMsSent / 1000).toFixed(1)),
          wsBufferedBytes: ws.bufferedAmount,
        });
      }
      await sleep(CHUNK_MS);
    }

    scribeLog(requestId, "audio stream finished", {
      chunksSent,
      audioSecondsSent: Number((audioMsSent / 1000).toFixed(1)),
      segments: segments.length,
    });

    const finalSilence = Buffer.alloc(Math.floor((BYTES_PER_SECOND * FINAL_TAIL_SILENCE_MS) / 1000));
    sendWsJson(ws, {
      message_type: "input_audio_chunk",
      audio_base_64: finalSilence.toString("base64"),
      commit: false,
      sample_rate: SAMPLE_RATE,
    });
    await sleep(FINAL_TAIL_SILENCE_MS);

    sendWsJson(ws, {
      message_type: "input_audio_chunk",
      audio_base_64: "",
      commit: true,
      sample_rate: SAMPLE_RATE,
    });
    scribeLog(requestId, "final commit sent");
    await sleep(FINAL_MESSAGE_WAIT_MS);

    if (streamError) throw streamError;
  } finally {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  }

  const sortedSegments = segments
    .sort((a, b) => a.start - b.start || a.order - b.order)
    .map((segment, index) => ({ ...segment, order: index }));

  scribeLog(requestId, "finished", { segments: sortedSegments.length, commitStrategy: options.commitStrategy });
  return sortedSegments;
}

function cleanBase64Audio(value: any) {
  return String(value || "").replace(/^data:[^,]+,/, "").trim();
}

function buildTempAudioPath(fileName: string) {
  const ext = path.extname(fileName || "").replace(/[^a-zA-Z0-9.]/g, "") || ".audio";
  return path.join(os.tmpdir(), `living-sketchbook-${crypto.randomUUID()}${ext}`);
}

function makeGoogleError(error: any) {
  const message = redactError(error);
  if (/api key|permission|forbidden|quota|billing|daily limit|rate/i.test(message)) {
    return new PublicError("Google Translate authentication or quota error.", 401);
  }
  return new PublicError(message || "Translation failed.", 502);
}

function extractGoogleTranslations(html: string, expectedIndexes: number[]) {
  const translations = new Map<number, string>();
  const blockPattern = /<p\b[^>]*data-i=["']?(\d+)["']?[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(html))) {
    translations.set(Number(match[1]), decodeBasicEntities(stripTags(match[2])));
  }

  if (translations.size) return translations;

  const fallbackLines = html
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map((line) => decodeBasicEntities(stripTags(line)))
    .filter(Boolean);

  expectedIndexes.forEach((index, lineIndex) => {
    if (fallbackLines[lineIndex]) translations.set(index, fallbackLines[lineIndex]);
  });

  return translations;
}

function getSegmentText(segment: any) {
  return String(segment?.primary || segment?.raw || segment?.text || "").trim();
}

function buildTranslationBatches(segments: any[]) {
  const batches: Array<Array<{ index: number; text: string }>> = [];
  let current: Array<{ index: number; text: string }> = [];
  let currentBytes = 0;

  segments.forEach((segment, index) => {
    if (String(segment?.translation || "").trim()) return;

    const text = getSegmentText(segment);
    if (!text) return;

    const htmlLine = `<p data-i="${index}">${escapeHtml(text)}</p>`;
    const lineBytes = Buffer.byteLength(htmlLine, "utf8") + 1;
    if (current.length && currentBytes + lineBytes > TRANSLATE_HTML_BYTE_LIMIT) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }

    current.push({ index, text });
    currentBytes += lineBytes;
  });

  if (current.length) batches.push(current);
  return batches;
}

async function translateHtmlBatch(batch: Array<{ index: number; text: string }>, options: {
  apiKey: string;
  sourceLanguage: string;
  targetLanguage: string;
}) {
  const html = batch.map((item) => `<p data-i="${item.index}">${escapeHtml(item.text)}</p>`).join("\n");
  const url = new URL("https://translation.googleapis.com/language/translate/v2");
  url.searchParams.set("key", options.apiKey);

  const body: Record<string, any> = {
    q: html,
    target: options.targetLanguage,
    format: "html",
    model: "nmt",
  };

  if (options.sourceLanguage) body.source = options.sourceLanguage;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw makeGoogleError(data?.error?.message || data?.error || response.statusText);
  }

  const translatedHtml = data?.data?.translations?.[0]?.translatedText;
  if (!translatedHtml) throw new PublicError("Translation failed.", 502);

  return extractGoogleTranslations(translatedHtml, batch.map((item) => item.index));
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: "150mb" }));

  app.post("/api/elevenlabs/scribe-realtime", async (req, res) => {
    let tmpPath = "";
    const requestId = crypto.randomUUID().slice(0, 8);

    try {
      const body = req.body || {};
      const apiKey = String(body.apiKey || process.env.ELEVENLABS_API_KEY || "").trim();
      if (!apiKey) {
        throw new PublicError("Enter an ElevenLabs API key, or set ELEVENLABS_API_KEY on the server.", 400);
      }

      const audioBase64 = cleanBase64Audio(body.audioBase64);
      if (!audioBase64) throw new PublicError("No audio file was received.", 400);

      const audioBytes = Buffer.byteLength(audioBase64, "base64");
      if (audioBytes > MAX_AUDIO_BYTES) {
        throw new PublicError("Audio file is too large for this local transcription route.", 413);
      }

      scribeLog(requestId, "request accepted", {
        fileName: body.fileName || "audio",
        audioMb: Number((audioBytes / (1024 * 1024)).toFixed(2)),
        keySource: body.apiKey ? "request" : "env",
      });

      const audioBuffer = Buffer.from(audioBase64, "base64");
      tmpPath = buildTempAudioPath(body.fileName);
      await fs.promises.writeFile(tmpPath, audioBuffer);

      const sourceLanguage = normalizeLanguageCode(body.sourceLanguage);
      const keyterms = Array.isArray(body.keyterms) ? body.keyterms : [];
      const previousText = String(body.previousText || "Song lyrics").slice(0, 50);
      const manualCommitMarks = deriveManualCommitMarks(body.referenceSegments);
      const commitStrategy = normalizeCommitStrategy(body.commitStrategy, manualCommitMarks);
      if (body.commitStrategy === "manual-from-gaps" && commitStrategy !== "manual") {
        scribeLog(requestId, "no usable transcript gaps found; using vad");
      }

      const segments = await streamToScribe(tmpPath, {
        apiKey,
        sourceLanguage,
        previousText,
        keyterms,
        requestId,
        commitStrategy,
        manualCommitMarks,
      });

      res.json({
        source: "elevenlabs-scribe-v2-realtime",
        model: "scribe_v2_realtime",
        commitStrategy,
        manualCommitMarks: commitStrategy === "manual" ? manualCommitMarks : [],
        segments,
      });
    } catch (error: any) {
      const status = error instanceof PublicError ? error.status : 500;
      const message = error instanceof PublicError ? error.message : redactError(error);
      console.error("Scribe route error:", message);
      res.status(status).json({ error: message || "Scribe transcription failed" });
    } finally {
      if (tmpPath) {
        fs.promises.unlink(tmpPath).catch(() => {});
      }
    }
  });

  app.post("/api/translate/google", async (req, res) => {
    try {
      const body = req.body || {};
      const key = String(body.apiKey || process.env.GOOGLE_TRANSLATE_API_KEY || "").trim();
      if (!key) {
        throw new PublicError("Enter a Google Translate API key, or set GOOGLE_TRANSLATE_API_KEY on the server.", 400);
      }

      const targetLanguage = normalizeLanguageCode(body.targetLanguage) || "en";
      const sourceLanguage = normalizeLanguageCode(body.sourceLanguage);
      const incomingSegments = Array.isArray(body.segments) ? body.segments : [];
      const updatedSegments = incomingSegments.map((segment: any) => ({ ...segment }));
      const batches = buildTranslationBatches(updatedSegments);

      for (const batch of batches) {
        const translated = await translateHtmlBatch(batch, {
          apiKey: key,
          sourceLanguage,
          targetLanguage,
        });

        for (const { index } of batch) {
          const translation = translated.get(index);
          if (translation && !String(updatedSegments[index]?.translation || "").trim()) {
            updatedSegments[index].translation = translation;
          }
        }
      }

      res.json({
        segments: updatedSegments,
        translationSource: "google-translate",
        translationRequestMode: batches.length <= 1 ? "single-request" : "chunked-by-api-limit",
        translationBatchCount: batches.length,
      });
    } catch (error: any) {
      const publicError = error instanceof PublicError ? error : makeGoogleError(error);
      console.error("Google Translate route error:", publicError.message);
      res.status(publicError.status).json({ error: publicError.message || "Translation failed" });
    }
  });

  // Legacy endpoint kept for old saved workflows. The main UI no longer calls Gemini.
  app.post("/api/gemini/generate", async (req, res) => {
    let uploadedFileRef: any = null;
    let ai: any = null;

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API key is not configured" });
      }

      const { prompt, audioPart, model, responseSchema } = req.body;
      ai = new GoogleGenAI({ apiKey });
      const targetModel = model || "gemini-3.1-pro-preview";

      const parts: any[] = [{ text: prompt }];

      if (audioPart?.inline_data) {
        const bufferSize = Buffer.byteLength(audioPart.inline_data.data, "base64");
        if (bufferSize > 18 * 1024 * 1024) {
          const tmpPath = path.join(os.tmpdir(), `upload-${Date.now()}.audio`);
          fs.writeFileSync(tmpPath, Buffer.from(audioPart.inline_data.data, "base64"));

          uploadedFileRef = await ai.files.upload({
            file: tmpPath,
            mimeType: audioPart.inline_data.mime_type,
            displayName: `Upload-${Date.now()}`,
          });

          parts.push({
            fileData: {
              fileUri: uploadedFileRef.uri,
              mimeType: audioPart.inline_data.mime_type,
            },
          });
          fs.unlinkSync(tmpPath);
        } else {
          parts.push({
            inlineData: {
              data: audioPart.inline_data.data,
              mimeType: audioPart.inline_data.mime_type,
            },
          });
        }
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const config: any = {
        temperature: responseSchema ? 0.1 : 0.35,
      };

      if (responseSchema) {
        config.responseMimeType = "application/json";
        config.responseSchema = responseSchema;
      }

      const stream = await ai.models.generateContentStream({
        model: targetModel,
        contents: parts,
        config,
      });

      for await (const chunk of stream) {
        const textChunk = chunk.text;
        if (textChunk) {
          res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error: any) {
      const message = redactError(error);
      console.error("Gemini API Error:", message);
      if (!res.headersSent) {
        res.status(500).json({ error: message || "Failed to generate content" });
      } else {
        res.write(`data: ${JSON.stringify({ error: message || "Failed to generate content" })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      }
    } finally {
      if (uploadedFileRef && ai) {
        try {
          await ai.files.delete({ name: uploadedFileRef.name });
        } catch (e) {
          console.error("Failed to delete temp Gemini file", redactError(e));
        }
      }
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
