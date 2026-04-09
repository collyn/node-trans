/**
 * Build audiocap binaries for native system audio capture.
 * - macOS: Swift + ScreenCaptureKit
 * - Windows: C# (.NET) + WASAPI loopback (cross-compiled from macOS)
 */
import { execFileSync } from "child_process";
import { cpSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// ─── macOS (Swift + ScreenCaptureKit) ─────────────────────

function buildMac() {
  const SWIFT_DIR = path.join(ROOT, "swift-audiocap");
  const OUT_DIR = path.join(ROOT, "audiocap-bin", "mac");

  if (process.platform !== "darwin") {
    console.log("[mac] Skipping (not on macOS)");
    return;
  }

  try {
    execFileSync("swift", ["--version"], { stdio: "pipe" });
  } catch {
    console.warn("[mac] Swift toolchain not found, skipping macOS build");
    return;
  }

  console.log("[mac] Building audiocap (ScreenCaptureKit)...");

  try {
    execFileSync("swift", [
      "build", "-c", "release",
      "--package-path", SWIFT_DIR,
      "--arch", "arm64", "--arch", "x86_64",
    ], { stdio: "inherit" });
  } catch {
    console.log("[mac] Universal build failed, building for current architecture...");
    execFileSync("swift", [
      "build", "-c", "release",
      "--package-path", SWIFT_DIR,
    ], { stdio: "inherit" });
  }

  const universalBin = path.join(SWIFT_DIR, ".build", "apple", "Products", "Release", "audiocap");
  const singleArchBin = path.join(SWIFT_DIR, ".build", "release", "audiocap");
  const builtBin = existsSync(universalBin) ? universalBin : singleArchBin;
  if (!existsSync(builtBin)) {
    console.error("[mac] Build succeeded but binary not found");
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  cpSync(builtBin, path.join(OUT_DIR, "audiocap"));
  console.log("[mac] audiocap binary copied to", OUT_DIR);
}

// ─── Windows (C# .NET + WASAPI loopback) ─────────────────

function buildWin() {
  const DOTNET_DIR = path.join(ROOT, "wasapi-audiocap");
  const OUT_DIR = path.join(ROOT, "audiocap-bin", "win");

  let dotnetAvailable = false;
  try {
    execFileSync("dotnet", ["--version"], { stdio: "pipe" });
    dotnetAvailable = true;
  } catch {}

  if (!dotnetAvailable) {
    console.warn("[win] .NET SDK not found, skipping Windows build. Install with: brew install dotnet-sdk");
    return;
  }

  if (!existsSync(path.join(DOTNET_DIR, "audiocap.csproj"))) {
    console.warn("[win] wasapi-audiocap project not found, skipping");
    return;
  }

  console.log("[win] Building audiocap.exe (WASAPI loopback)...");

  execFileSync("dotnet", [
    "publish", "-c", "Release",
    "-r", "win-x64",
    "--self-contained",
    "-p:PublishSingleFile=true",
    "-p:PublishTrimmed=true",
    "-p:IncludeNativeLibrariesForSelfExtract=true",
  ], { stdio: "inherit", cwd: DOTNET_DIR });

  const builtExe = path.join(DOTNET_DIR, "bin", "Release", "net8.0", "win-x64", "publish", "audiocap.exe");
  if (!existsSync(builtExe)) {
    console.error("[win] Build succeeded but audiocap.exe not found");
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  cpSync(builtExe, path.join(OUT_DIR, "audiocap.exe"));
  console.log("[win] audiocap.exe copied to", OUT_DIR);
}

// ─── Run ──────────────────────────────────────────────────

buildMac();
buildWin();
