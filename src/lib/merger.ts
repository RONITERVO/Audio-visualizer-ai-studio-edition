import { splitBilingualText, stripTranslationMarks, stripTrailingDots } from "./parser";

export function mergeGuideWithTiming(guideSegments: any[], timingSegments: any[]) {
    const merged = buildSyncedTimingSegments(timingSegments);
    if (!merged.length) return guideSegments;

    const tokens = buildTimingTokens(timingSegments);
    if (!tokens.length || !guideSegments.length) return merged;

    let cursor = 0;
    for (const guide of guideSegments) {
      const match = findGuideTimingMatch(tokens, guide, cursor);
      if (!match) continue;

      const anchorIndex = pickAnchorSegmentIndex(tokens, match);
      if (!Number.isInteger(anchorIndex) || anchorIndex < 0 || anchorIndex >= merged.length) continue;

      applyGuideOverlay(merged[anchorIndex], guide);
      cursor = Math.max(cursor, match.end + 1);
    }

    return merged;
}

function buildSyncedTimingSegments(timingSegments: any[]) {
    return timingSegments.map((segment: any, index: number) => {
      const start = Number.isFinite(segment.start) ? segment.start : 0;
      const end = Number.isFinite(segment.end) && segment.end >= start ? segment.end : start;
      
      const splitInfo = segment.raw || segment.primary || "";
      // we need to write our own basic split logic here or use the imported one.
      // Unfortunately we can't easily export splitBilingualText if it's internal to parser, wait I did export it? No I didn't.
      // I'll just write it directly. Wait, the parser doesn't export them currently. I'll just rely on the imported splitBilingualText
      // I should go export splitBilingualText in parser.ts

      const split = splitBilingualText(segment.raw || segment.primary || "");
      return {
        ...segment,
        start,
        end,
        primary: segment.primary || split.primary || "",
        translation: segment.translation || segment.secondary || split.translation || "",
        secondary: segment.secondary || split.secondary || "",
        raw: segment.raw || segment.primary || "",
        order: segment.order ?? index
      };
    });
}

function pickAnchorSegmentIndex(tokens: any[], match: any) {
    const counts = new Map();
    for (let index = match.start; index <= match.end; index += 1) {
      const token = tokens[index];
      if (!token || !Number.isInteger(token.segmentIndex)) continue;
      counts.set(token.segmentIndex, (counts.get(token.segmentIndex) || 0) + 1);
    }
    if (!counts.size) {
      const first = tokens[match.start];
      return first && Number.isInteger(first.segmentIndex) ? first.segmentIndex : -1;
    }

    let bestIndex = -1;
    let bestCount = -1;
    for (const [segmentIndex, count] of counts.entries()) {
      if (count > bestCount || (count === bestCount && (bestIndex < 0 || segmentIndex < bestIndex))) {
        bestIndex = segmentIndex;
        bestCount = count;
      }
    }
    return bestIndex;
}

function applyGuideOverlay(segment: any, guide: any) {
    const guidePrimary = (guide.primary || "").trim();
    const guideTranslation = (guide.translation || guide.secondary || "").trim();
    if (guidePrimary) segment.primary = guidePrimary;
    if (guideTranslation) {
      segment.translation = mergeSupplementText(segment.translation, guideTranslation);
    }
    if (guide.section) segment.section = guide.section;
    if (guide.role && guide.role !== "lyric") segment.role = guide.role;
    segment.raw = guide.raw || guide.text || segment.raw || segment.primary;
}

function mergeSupplementText(existing: string, incoming: string) {
    const left = (existing || "").trim();
    const right = (incoming || "").trim();
    if (!right) return left;
    if (!left) return right;

    const leftNorm = normalizeComparableText(left);
    const rightNorm = normalizeComparableText(right);
    if (leftNorm === rightNorm || leftNorm.includes(rightNorm)) return left;
    if (rightNorm.includes(leftNorm)) return right;
    return `${left} / ${right}`;
}

function normalizeComparableText(value: string) {
    return (value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
}

function findGuideTimingMatch(tokens: any[], guide: any, cursor: number) {
    const strictTokens = tokenizeGuideForMatch(guide, true);
    if (strictTokens.length) {
      const strictMatch = findTokenWindow(tokens, strictTokens, cursor);
      if (strictMatch) return strictMatch;
    }

    const primaryTokens = tokenizeGuideForMatch(guide, false);
    if (!primaryTokens.length) return null;
    return findTokenWindow(tokens, primaryTokens, cursor);
}

function tokenizeGuideForMatch(guide: any, includeTranslation: boolean) {
    return tokenizeForMatch([
      guide.primary,
      includeTranslation ? guide.translation : "",
      guide.secondary || ""
    ].filter(Boolean).join(" "));
}

function buildTimingTokens(segments: any[]) {
    const tokens: any[] = [];
    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
      const segment = segments[segmentIndex];
      if (/^(instrumental|section|music|silence|nonvocal|non-vocal)$/.test(segment.role || "")) continue;
      if (Array.isArray(segment.words) && segment.words.length) {
        for (const word of segment.words) {
          const normalized = normalizeToken(word.word);
          if (!normalized) continue;
          tokens.push({
            token: normalized,
            original: word.word,
            start: Number.isFinite(word.start) ? word.start : segment.start,
            end: Number.isFinite(word.end) ? word.end : segment.end,
            segmentIndex
          });
        }
        continue;
      }

      const parts = tokenizeWithOriginal(segment.raw || segment.primary || "");
      const span = Math.max(0.001, segment.end - segment.start);
      parts.forEach((part, index) => {
        const start = segment.start + (span * index) / Math.max(1, parts.length);
        const end = segment.start + (span * (index + 1)) / Math.max(1, parts.length);
        tokens.push({ token: part.token, original: part.original, start, end, segmentIndex });
      });
    }
    return tokens.sort((a, b) => a.start - b.start);
}

function findTokenWindow(tokens: any[], targetTokens: any[], cursor: number) {
    const searchStart = Math.max(0, cursor - 4);
    const searchEnd = Math.min(tokens.length, cursor + Math.max(80, targetTokens.length * 18));
    let best = null;

    for (let start = searchStart; start < searchEnd; start += 1) {
      if (!roughTokenMatch(tokens[start].token, targetTokens[0])) continue;
      const candidate: any = scoreTokenWindow(tokens, targetTokens, start);
      if (!best || candidate.score > best.score) best = candidate;
    }

    const minimum = targetTokens.length <= 2 ? 0.72 : 0.58;
    return best && best.score >= minimum ? best : null;
}

function scoreTokenWindow(tokens: any[], targetTokens: any[], start: number) {
    let tokenIndex = start;
    let matches = 0;
    let misses = 0;
    let end = start;
    const maxLookahead = Math.min(tokens.length, start + targetTokens.length * 4 + 18);

    for (const target of targetTokens) {
      let found = -1;
      for (let index = tokenIndex; index < maxLookahead; index += 1) {
        if (roughTokenMatch(tokens[index].token, target)) {
          found = index;
          break;
        }
      }
      if (found >= 0) {
        matches += 1;
        end = found;
        tokenIndex = found + 1;
      } else {
        misses += 1;
      }
    }

    const spanPenalty = Math.max(0, end - start - targetTokens.length) * 0.015;
    const missPenalty = misses * 0.09;
    return {
      start,
      end,
      score: matches / Math.max(1, targetTokens.length) - spanPenalty - missPenalty
    };
}

function tokenizeForMatch(text: string) {
    return tokenizeWithOriginal(text).map((part) => part.token).filter(Boolean);
}

function tokenizeWithOriginal(text: string) {
    const matches = text.match(/[\p{L}\p{N}'’]+/gu) || [];
    return matches
      .map((original) => ({ original, token: normalizeToken(original) }))
      .filter((part) => part.token);
}

function normalizeToken(value: string) {
    return (value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}'’]+/gu, "")
      .replace(/[’]/g, "'");
}

function roughTokenMatch(left: string, right: string) {
    if (!left || !right) return false;
    if (left === right) return true;
    if (left.length >= 5 && right.length >= 5) {
      return left.startsWith(right.slice(0, 5)) || right.startsWith(left.slice(0, 5));
    }
    return false;
}