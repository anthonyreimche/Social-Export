// Social Export — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// Sign-in tokens: kept encrypted by the OS keychain (api.secrets) where there
// is one, else in memory until Safelight closes.

import type { SafelightAPI } from "./safelight";

export interface AccountState {
  status: "signed-out" | "signing-in" | "signed-in";
  /** The account's name, as the service shows it: "@me.bsky.social". */
  name: string;
  /** Why the person was signed out, or what went wrong signing in. */
  message: string | null;
  /** The sign-in outlasts this session. */
  remembered: boolean;
}

export const SIGNED_OUT: AccountState = { status: "signed-out", name: "", message: null, remembered: true };

export function createVault(secrets: SafelightAPI["secrets"]) {
  const memory = new Map<string, string>();
  let keychain: Promise<boolean> | null = null;
  const available = () => (keychain ??= secrets.available().catch(() => false));

  return {
    available,
    async get(key: string): Promise<string | null> {
      if (memory.has(key)) return memory.get(key) ?? null;
      return (await available()) ? secrets.get(key).catch(() => null) : null;
    },
    /** Keep `value`; resolves with whether it outlasts the session. */
    async set(key: string, value: string): Promise<boolean> {
      if (await available()) {
        try {
          await secrets.set(key, value);
          memory.delete(key);
          return true;
        } catch {
          // The keychain refused: keep it for the session.
        }
      }
      memory.set(key, value);
      return false;
    },
    async delete(key: string): Promise<void> {
      memory.delete(key);
      if (await available()) await secrets.delete(key).catch(() => {});
    },
  };
}

export type Vault = ReturnType<typeof createVault>;
