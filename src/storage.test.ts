import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import { loadClaudeData } from "./storage.js";

layer(NodeServices.layer)("storage", (it) => {
  it.effect("loads Claude sessions from the projects directory as threads and transcripts", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const claudeHome = yield* fs.makeTempDirectoryScoped({ prefix: "claude-relink-storage-" });
      const projectFolder = path.join(claudeHome, "projects", "-repo-app");
      yield* fs.makeDirectory(projectFolder, { recursive: true });
      yield* fs.writeFileString(
        path.join(projectFolder, "session-1.jsonl"),
        [
          JSON.stringify({ type: "permission-mode", sessionId: "session-1" }),
          JSON.stringify({
            type: "user",
            cwd: "/repo/app",
            sessionId: "session-1",
            message: { role: "user", content: "recover this chat" }
          })
        ].join("\n")
      );

      const data = yield* loadClaudeData({ claudeHome });

      expect(data.threads).toMatchObject([{ id: "session-1", cwd: "/repo/app" }]);
      expect(data.threads[0].updated_at_ms).toBeTypeOf("number");
      expect(data.threads[0].updated_at_ms ?? 0).toBeGreaterThan(0);
      expect(data.transcripts).toMatchObject([
        {
          threadId: "session-1",
          cwdMentions: ["/repo/app"],
          userMessages: ["recover this chat"]
        }
      ]);
      expect(data.transcriptsByThreadId.get("session-1")?.userMessages).toEqual(["recover this chat"]);
    }));

  it.effect("derives the session id from the file name", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const claudeHome = yield* fs.makeTempDirectoryScoped({ prefix: "claude-relink-name-" });
      const projectFolder = path.join(claudeHome, "projects", "-repo-app");
      yield* fs.makeDirectory(projectFolder, { recursive: true });
      const sessionId = "019abcde-f012-3456-789a-bcdef0123456";
      yield* fs.writeFileString(
        path.join(projectFolder, `${sessionId}.jsonl`),
        JSON.stringify({
          type: "user",
          cwd: "/repo/app",
          sessionId: "inner-id-should-be-ignored",
          message: { role: "user", content: "hello" }
        })
      );

      const data = yield* loadClaudeData({ claudeHome });

      expect(data.threads[0]?.id).toBe(sessionId);
    }));

  it.effect("excludes sub-agent transcripts nested under subagents/", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const claudeHome = yield* fs.makeTempDirectoryScoped({ prefix: "claude-relink-agents-" });
      const projectFolder = path.join(claudeHome, "projects", "-repo-app");
      const subagentsDir = path.join(projectFolder, "9f1c-parent-session", "subagents");
      yield* fs.makeDirectory(subagentsDir, { recursive: true });

      yield* fs.writeFileString(
        path.join(projectFolder, "main-session.jsonl"),
        JSON.stringify({ type: "user", cwd: "/repo/app", sessionId: "main-session", message: { role: "user", content: "real user chat" } })
      );
      yield* fs.writeFileString(
        path.join(subagentsDir, "agent-abc123.jsonl"),
        JSON.stringify({ type: "user", cwd: "/repo/app", sessionId: "agent-abc123", isSidechain: true, message: { role: "user", content: "dispatched sub-agent task" } })
      );

      const data = yield* loadClaudeData({ claudeHome });

      expect(data.threads.map((thread) => thread.id)).toEqual(["main-session"]);
    }));

  it.effect("returns no sessions when the projects directory is missing", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const claudeHome = yield* fs.makeTempDirectoryScoped({ prefix: "claude-relink-empty-" });

      const data = yield* loadClaudeData({ claudeHome });

      expect(data.threads).toEqual([]);
      expect(data.transcripts).toEqual([]);
    }));
});
