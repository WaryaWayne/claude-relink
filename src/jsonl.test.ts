import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import { parseClaudeSession, parseClaudeSessionBody } from "./jsonl.js";

layer(NodeServices.layer)("claude session parsing", (it) => {
  it.effect("extracts session id, cwd, and the first real user message from disk", () =>
    Effect.gen(function*() {
      const filePath = yield* writeTranscript([
        JSON.stringify({ type: "permission-mode", sessionId: "abc-123" }),
        JSON.stringify({ type: "file-history-snapshot" }),
        JSON.stringify({
          type: "user",
          cwd: "/repo/app",
          sessionId: "abc-123",
          message: { role: "user", content: "please recover this chat" }
        }),
        JSON.stringify({
          type: "assistant",
          cwd: "/repo/app",
          sessionId: "abc-123",
          message: { role: "assistant", content: [{ type: "text", text: "on it" }] }
        })
      ]);

      const transcript = yield* parseClaudeSession(filePath);

      expect(transcript).toMatchObject({
        filePath,
        threadId: "abc-123",
        cwdMentions: ["/repo/app"],
        userMessages: ["please recover this chat"]
      });
    }));

  it.effect("reads array content user messages and skips tool_result turns", () =>
    Effect.gen(function*() {
      const transcript = parseClaudeSessionBody(
        "/tmp/session.jsonl",
        [
          JSON.stringify({
            type: "user",
            cwd: "/repo/app",
            sessionId: "s1",
            message: { role: "user", content: [{ type: "tool_result", content: "command stdout" }] }
          }),
          JSON.stringify({
            type: "user",
            cwd: "/repo/app",
            sessionId: "s1",
            message: { role: "user", content: [{ type: "text", text: "the real prompt" }] }
          })
        ].join("\n")
      );

      expect(transcript.userMessages).toEqual(["the real prompt"]);
      expect(transcript.threadId).toBe("s1");
      expect(transcript.cwdMentions).toEqual(["/repo/app"]);
    }));

  it.effect("skips meta and synthetic-wrapper user messages", () =>
    Effect.gen(function*() {
      const transcript = parseClaudeSessionBody(
        "/tmp/session.jsonl",
        [
          JSON.stringify({
            type: "user",
            cwd: "/repo/app",
            sessionId: "s1",
            isMeta: true,
            message: { role: "user", content: "meta bookkeeping note" }
          }),
          JSON.stringify({
            type: "user",
            cwd: "/repo/app",
            sessionId: "s1",
            message: { role: "user", content: "<command-name>/loop</command-name>" }
          }),
          JSON.stringify({
            type: "user",
            cwd: "/repo/app",
            sessionId: "s1",
            message: { role: "user", content: "the actual question" }
          })
        ].join("\n")
      );

      expect(transcript.userMessages).toEqual(["the actual question"]);
    }));
});

function writeTranscript(lines: string[]) {
  return Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "claude-relink-jsonl-" });
    const filePath = path.join(dir, "session.jsonl");
    yield* fs.writeFileString(filePath, lines.join("\n"));
    return filePath;
  });
}
