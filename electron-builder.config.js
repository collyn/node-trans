/**
 * @type {import('electron-builder').Configuration}
 */
export default {
  appId: "com.nodetrans.app",
  productName: "Node Trans",
  npmRebuild: false,
  afterPack: "./scripts/afterPack.js",
  directories: {
    output: "release",
    buildResources: "build",
  },
  files: [
    "dist/**/*",
    "src/**/*",
    "electron/**/*",
    "package.json",
    "!node_modules/**/{test,tests,__tests__,spec,specs}/**",
    "!node_modules/**/*.map",
    "!node_modules/**/*.ts",
    "!node_modules/**/*.d.ts",
    "!node_modules/**/README*",
    "!node_modules/**/CHANGELOG*",
    "!node_modules/**/LICENSE*",
    "!node_modules/**/{example,examples,doc,docs}/**",
    "!node_modules/**/.eslint*",
    "!node_modules/**/.prettier*",
    "!node_modules/**/{.github,.vscode}/**",
  ],
  asarUnpack: ["**/better-sqlite3/**", "**/nodejs-whisper/**", "src/local/*.py"],

  icon: "build/icon",
  publish: {
    provider: "github",
    owner: "thainph",
    repo: "node-trans",
  },
  mac: {
    target: ["dmg", "zip"],
    category: "public.app-category.productivity",
    hardenedRuntime: true,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    extraResources: [
      { from: "ffmpeg-bin/mac", to: "ffmpeg", filter: ["**/*"] },
      { from: "audiocap-bin/mac", to: "audiocap", filter: ["**/*"] },
    ],
    extendInfo: {
      NSMicrophoneUsageDescription:
        "Node Trans needs microphone access to capture and translate audio.",
      NSScreenCaptureUsageDescription:
        "Node Trans needs screen recording permission to capture system audio for translation.",
    },
  },
  win: {
    target: [
      { target: "nsis", arch: ["x64"] },
      { target: "portable", arch: ["x64"] },
    ],
    extraResources: [
      { from: "ffmpeg-bin/win", to: "ffmpeg", filter: ["**/*"] },
      { from: "audiocap-bin/win", to: "audiocap", filter: ["**/*"] },
    ],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  linux: {
    target: [
      { target: "AppImage", arch: ["x64"] },
      { target: "deb", arch: ["x64"] },
    ],
    category: "Audio;AudioVideo",
  },
};

