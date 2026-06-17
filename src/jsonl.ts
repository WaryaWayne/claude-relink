import { Effect, FileSystem } from "effect";

import { isSyntheticContextText } from "./preview.js";
import type { TranscriptMetadata } from "./types.js";

type JsonObject = Record<string, unknown>;

export const parseClaudeSession = Effect.fn("Jsonl.parseClaudeSession")(function*(filePath: string) {
  const fs = yield* FileSystem.FileSystem;
  const body = yield* fs.readFileString(filePath);
  return parseClaudeSessionBody(filePath, body);
});

// We only need the session id, the working directory, and the first real user
// message. All three live near the top of the transcript, so we stop parsing as
// soon as we have them instead of walking multi-megabyte files to the end.
export function parseClaudeSessionBody(filePath: string, body: string): TranscriptMetadata {
  const metadata: TranscriptMetadata = {
    filePath,
    threadId: null,
    cwdMentions: [],
    userMessages: [],
    eventMessages: []
  };

  for (const line of body.split(/\r?\n/)) {
    if (line.trim() === "") {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (!isObject(parsed)) {
      continue;
    }

    extractThreadId(parsed, metadata);
    extractCwd(parsed, metadata);
    extractUserMessage(parsed, metadata);

    if (metadata.threadId && metadata.cwdMentions.length > 0 && metadata.userMessages.length > 0) {
      break;
    }
  }

  metadata.cwdMentions = uniqueNonBlank(metadata.cwdMentions);
  metadata.userMessages = uniqueNonBlank(metadata.userMessages);

  return metadata;
}

function extractThreadId(parsed: JsonObject, metadata: TranscriptMetadata): void {
  if (metadata.threadId) {
    return;
  }

  const sessionId = parsed.sessionId;
  if (typeof sessionId === "string" && sessionId.trim() !== "") {
    metadata.threadId = sessionId;
  }
}

function extractCwd(parsed: JsonObject, metadata: TranscriptMetadata): void {
  const cwd = parsed.cwd;
  if (typeof cwd === "string" && cwd.trim() !== "") {
    metadata.cwdMentions.push(cwd);
  }
}

function extractUserMessage(parsed: JsonObject, metadata: TranscriptMetadata): void {
  if (parsed.type !== "user" || parsed.isMeta === true || parsed.isSidechain === true) {
    return;
  }

  const text = extractUserText(parsed.message);
  if (text && !isSyntheticContextText(text)) {
    metadata.userMessages.push(text);
  }
}

function extractUserText(message: unknown): string | null {
  if (!isObject(message)) {
    return null;
  }

  const content = message.content;
  if (typeof content === "string") {
    return content.trim() === "" ? null : content;
  }

  if (Array.isArray(content)) {
    for (const block of content) {
      if (
        isObject(block) &&
        block.type === "text" &&
        typeof block.text === "string" &&
        block.text.trim() !== ""
      ) {
        return block.text;
      }
    }
  }

  return null;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function uniqueNonBlank(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
