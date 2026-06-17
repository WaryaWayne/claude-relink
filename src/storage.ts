import { Effect, FileSystem, Option, Path } from "effect";

import { parseClaudeSession } from "./jsonl.js";
import { getClaudePaths } from "./paths.js";
import type { LoadedClaudeData, ThreadRow, TranscriptMetadata } from "./types.js";

export type LoadOptions = {
  claudeHome?: string;
};

type LoadedSession = {
  thread: ThreadRow;
  transcript: TranscriptMetadata;
};

const READ_CONCURRENCY = 16;

export const loadClaudeData = Effect.fn("Storage.loadClaudeData")(function*(options: LoadOptions = {}) {
  const paths = getClaudePaths(options.claudeHome);
  const sessions = yield* readSessions(paths.projectsDir);

  const threads = sessions.map((session) => session.thread);
  const transcripts = sessions.map((session) => session.transcript);
  const transcriptsByThreadId = new Map<string, TranscriptMetadata>();

  for (const transcript of transcripts) {
    if (transcript.threadId) {
      transcriptsByThreadId.set(transcript.threadId, transcript);
    }
  }

  return {
    paths,
    threads,
    transcripts,
    transcriptsByThreadId
  } satisfies LoadedClaudeData;
});

const readSessions = Effect.fn("Storage.readSessions")(function*(projectsDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const exists = yield* fs.exists(projectsDir);
  if (!exists) {
    return [];
  }

  const entries = yield* fs.readDirectory(projectsDir, { recursive: true });
  const sessionFiles = entries
    .filter(isUserSessionEntry)
    .map((entry) => path.join(projectsDir, entry));

  const loaded = yield* Effect.forEach(
    sessionFiles,
    (filePath) => loadSession(filePath).pipe(Effect.catch(() => Effect.succeed(null))),
    { concurrency: READ_CONCURRENCY }
  );

  return loaded.filter((session): session is LoadedSession => session !== null);
});

const loadSession = Effect.fn("Storage.loadSession")(function*(filePath: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const transcript = yield* parseClaudeSession(filePath);
  const info = yield* fs.stat(filePath);
  const sortTime = Option.match(info.mtime, {
    onNone: () => 0,
    onSome: (mtime) => mtime.getTime()
  });

  // The session id is the file name; resume with `claude --resume <id>`.
  const id = sessionIdFromPath(path, filePath);
  const cwd = transcript.cwdMentions[0] ?? null;

  const session: LoadedSession = {
    thread: makeThreadRow({ id, cwd, sortTime }),
    transcript: { ...transcript, threadId: id }
  };

  return session;
});

// A real, user-started chat is a direct child of a project folder:
//   ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
// Claude Code sub-agent transcripts (and their workflow journals) live deeper,
// under `<session-id>/subagents/...` with `agent-`/`wf_` names. Users never resume
// those, so we keep only the top-level session files.
function isUserSessionEntry(entry: string): boolean {
  if (!entry.endsWith(".jsonl")) {
    return false;
  }

  const segments = entry.split(/[\\/]/).filter(Boolean);
  if (segments.length !== 2) {
    return false;
  }

  return !segments[1].startsWith("agent-");
}

function sessionIdFromPath(path: Path.Path, filePath: string): string {
  const base = path.basename(filePath);
  return base.endsWith(".jsonl") ? base.slice(0, -".jsonl".length) : base;
}

function makeThreadRow(input: { id: string; cwd: string | null; sortTime: number }): ThreadRow {
  return {
    id: input.id,
    rollout_path: null,
    created_at: null,
    updated_at: null,
    created_at_ms: null,
    updated_at_ms: input.sortTime,
    source: null,
    thread_source: null,
    has_user_event: null,
    cwd: input.cwd,
    title: null,
    preview: null,
    first_user_message: null,
    git_sha: null,
    git_branch: null,
    git_origin_url: null,
    archived: null
  };
}
