// Social Export — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// The entry point. Safelight imports dist/index.js (built from this file) and
// calls activate() once with the API, scoped to this extension. It registers
// the Share window, its Library menu item and top-bar button, and takes up the
// sign-ins kept from an earlier launch.

import { initRuntime } from "./rt";
import type { SafelightAPI } from "./safelight";
import { type Deps, createSocialExport } from "./service";

export function activate(host: SafelightAPI, deps?: Deps): void {
  initRuntime(host);
  const social = createSocialExport(host, deps);
  social.register();
  void social.restore();
}
