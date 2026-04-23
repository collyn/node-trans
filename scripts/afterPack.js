/**
 * electron-builder afterPack hook for Linux.
 *
 * Ubuntu 23.10+ and other modern distros block unprivileged user namespaces
 * via AppArmor, AND AppImage's FUSE mount cannot have SUID binaries.
 * This means neither sandbox mode works out of the box.
 *
 * Solution: wrap the Electron binary with a shell script that passes
 * --no-sandbox automatically, so users don't have to remember it.
 */

import fs from "fs";
import path from "path";

export default async function afterPack(context) {
  if (context.electronPlatformName !== "linux") return;

  const appOutDir = context.appOutDir;

  // 1. Remove chrome-sandbox (unusable in AppImage / non-root installs)
  const chromeSandbox = path.join(appOutDir, "chrome-sandbox");
  if (fs.existsSync(chromeSandbox)) {
    fs.unlinkSync(chromeSandbox);
    console.log("[afterPack] Removed chrome-sandbox");
  }

  // 2. Wrap the main binary so --no-sandbox is always passed
  const execName = context.packager.executableName;
  const execPath = path.join(appOutDir, execName);
  const binPath = path.join(appOutDir, `${execName}.bin`);

  if (fs.existsSync(execPath)) {
    // Rename the real binary
    fs.renameSync(execPath, binPath);

    // Create a wrapper script in its place
    const wrapper = `#!/bin/bash
exec "$(dirname "$(readlink -f "$0")")/${execName}.bin" --no-sandbox "$@"
`;
    fs.writeFileSync(execPath, wrapper, { mode: 0o755 });
    console.log(`[afterPack] Created --no-sandbox wrapper for '${execName}'`);
  }
}
