// Social Export — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// The folder files are saved into for uploading by hand. It is picked once
// and kept across launches; a name already there gets " (2)", " (3)" and so
// on, so nothing is overwritten.

import { SETTINGS } from "./config";
import type { SafelightAPI } from "./safelight";

const PICKER_ID = "social-export";
const PROBLEMS = {
  gone: "The folder for shared photos isn't there any more. Choose another.",
  unwritable: "Safelight can't write into the folder for shared photos. Choose another.",
  unknown: "Choose a folder for shared photos.",
} as const;

export interface SavedFiles {
  /** The names written, in order. */
  names: string[];
  /** The first file's path on disk, where the desktop app knows it. */
  firstPath: string | null;
  folderName: string;
}

/** The names in `folder`, lower-cased: Windows and macOS treat names that
 *  differ only by case as one. Listed, not probed: core's desktop folder
 *  handle answers getFileHandle for a name that isn't there. */
async function namesIn(folder: FileSystemDirectoryHandle): Promise<Set<string>> {
  const names = new Set<string>();
  for await (const name of folder.keys()) names.add(name.toLowerCase());
  return names;
}

/** `name`, or the first "name (n).ext" not in `taken`, which it joins. */
export function freeName(taken: Set<string>, name: string): string {
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base} (${n})${ext}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

export function createSaver(api: SafelightAPI) {
  const token = () => api.settings.get<string | null>(SETTINGS.folder, null);

  /** Ask for a folder (another one, when one is kept); null when cancelled. */
  async function choose(): Promise<FileSystemDirectoryHandle | null> {
    const previous = token();
    const picked = await api.project.pickKeptDirectory(PICKER_ID, previous);
    if (!picked) return null;
    api.settings.set(SETTINGS.folder, picked.token);
    if (previous && previous !== picked.token) await api.project.forgetKeptDirectory(previous).catch(() => {});
    return picked.folder;
  }

  /** The kept folder, or a newly chosen one; null when the person cancels. */
  async function folder(): Promise<FileSystemDirectoryHandle | null> {
    const kept = token();
    if (kept) {
      const opened = await api.project.openKeptDirectory(kept);
      if ("folder" in opened) return opened.folder;
      await api.ui.alertDialog({ title: "Folder for shared photos", message: PROBLEMS[opened.problem] });
    }
    return choose();
  }

  /** The kept folder's name, for showing; null when none is kept or it can't be opened. */
  async function folderName(): Promise<string | null> {
    const kept = token();
    if (!kept) return null;
    const opened = await api.project.openKeptDirectory(kept).catch(() => null);
    return opened && "folder" in opened ? opened.folder.name : null;
  }

  /** Write the files; null when the person cancels choosing a folder. */
  async function save(files: { name: string; blob: Blob }[]): Promise<SavedFiles | null> {
    const dir = await folder();
    if (!dir) return null;
    const names: string[] = [];
    const taken = await namesIn(dir);
    for (const file of files) {
      const name = freeName(taken, file.name);
      const handle = await dir.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      try {
        await writable.write(file.blob);
      } finally {
        await writable.close();
      }
      names.push(name);
    }
    const root = api.project.pathOf(dir);
    const sep = root?.includes("\\") ? "\\" : "/";
    return { names, firstPath: root && names[0] ? `${root.replace(/[\\/]+$/, "")}${sep}${names[0]}` : root, folderName: dir.name };
  }

  return { save, choose, folderName };
}

export type Saver = ReturnType<typeof createSaver>;
