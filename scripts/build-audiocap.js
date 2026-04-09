/**
 * Build the audiocap Swift binary (macOS only).
 * Compiles ScreenCaptureKit-based system audio capture tool.
 */
import { execFileSync } from "child_process";
import { cpSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SWIFT_DIR = path.join(ROOT, "swift-audiocap");
const OUT_DIR = path.join(ROOT, "audiocap-bin", "mac");

if (process.platform !== "darwin") {
  console.log("Skipping audiocap build (macOS only)");
  process.exit(0);
}

// Check Swift toolchain
try {
  execFileSync("swift", ["--version"], { stdio: "pipe" });
} catch {
  console.error("Swift toolchain not found. Install Xcode or Command Line Tools.");
  process.exit(1);
}

console.log("Building audiocap (ScreenCaptureKit system audio capture)...");

try {
  execFileSync("swift", [
    "build",
    "-c", "release",
    "--package-path", SWIFT_DIR,
    "--arch", "arm64",
    "--arch", "x86_64",
  ], { stdio: "inherit" });
} catch {
  // Fallback: build for current architecture only (older Xcode)
  console.log("Universal build failed, building for current architecture...");
  execFileSync("swift", [
    "build",
    "-c", "release",
    "--package-path", SWIFT_DIR,
  ], { stdio: "inherit" });
}

// Universal build outputs to .build/apple/Products/Release/, single-arch to .build/release/
const universalBin = path.join(SWIFT_DIR, ".build", "apple", "Products", "Release", "audiocap");
const singleArchBin = path.join(SWIFT_DIR, ".build", "release", "audiocap");
const builtBin = existsSync(universalBin) ? universalBin : singleArchBin;
if (!existsSync(builtBin)) {
  console.error("Build succeeded but binary not found");
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
cpSync(builtBin, path.join(OUT_DIR, "audiocap"));
console.log("audiocap binary copied to", OUT_DIR);
