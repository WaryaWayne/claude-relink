import os from "node:os";

import type { ClaudePaths } from "./types.js";

const PATH_SEPARATOR = "/";

function expandHome(input: string): string {
  if (input === "~") {
    return os.homedir();
  }

  if (input.startsWith("~/")) {
    return joinFsPath(os.homedir(), input.slice(2));
  }

  return input;
}

export function normalizeFsPath(input: string): string {
  const expanded = expandHome(input);
  return normalizePath(isAbsoluteFsPath(expanded) ? expanded : `${process.cwd()}${PATH_SEPARATOR}${expanded}`);
}

function joinFsPath(...segments: string[]): string {
  if (segments.length === 0) {
    return ".";
  }

  return normalizePath(segments.join(PATH_SEPARATOR));
}

export function isAbsoluteFsPath(input: string): boolean {
  return input.startsWith(PATH_SEPARATOR);
}

export function relativeFsPath(fromInput: string, toInput: string): string {
  const from = normalizeFsPath(fromInput);
  const to = normalizeFsPath(toInput);
  if (from === to) {
    return "";
  }

  const fromSegments = splitPathSegments(from);
  const toSegments = splitPathSegments(to);
  let commonSegments = 0;

  while (
    commonSegments < fromSegments.length &&
    commonSegments < toSegments.length &&
    fromSegments[commonSegments] === toSegments[commonSegments]
  ) {
    commonSegments += 1;
  }

  return [
    ...Array.from({ length: fromSegments.length - commonSegments }, () => ".."),
    ...toSegments.slice(commonSegments)
  ].join(PATH_SEPARATOR);
}

export function basenameFsPath(input: string): string {
  const segments = splitPathSegments(normalizeFsPath(input));
  return segments[segments.length - 1] ?? "";
}

export function getClaudePaths(claudeHomeInput = "~/.claude"): ClaudePaths {
  const claudeHome = normalizeFsPath(claudeHomeInput);

  return {
    claudeHome,
    projectsDir: joinFsPath(claudeHome, "projects")
  };
}

function normalizePath(input: string): string {
  const isAbsolute = isAbsoluteFsPath(input);
  const segments: string[] = [];

  for (const segment of input.split(PATH_SEPARATOR)) {
    if (segment === "" || segment === ".") {
      continue;
    }

    if (segment === "..") {
      const previousSegment = segments[segments.length - 1];
      if (previousSegment && previousSegment !== "..") {
        segments.pop();
      } else if (!isAbsolute) {
        segments.push(segment);
      }
      continue;
    }

    segments.push(segment);
  }

  const normalized = segments.join(PATH_SEPARATOR);
  return isAbsolute ? `${PATH_SEPARATOR}${normalized}` : normalized || ".";
}

function splitPathSegments(input: string): string[] {
  return input.split(PATH_SEPARATOR).filter(Boolean);
}
