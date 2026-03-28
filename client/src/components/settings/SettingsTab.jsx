import { useState, useEffect, useRef } from "react";
import { useSocket } from "../../context/SocketContext";
import { fetchSettings, fetchDevices, saveSettings } from "../../utils/api";
import { LANGUAGE_OPTIONS, CONTEXT_PRESETS, WHISPER_MODEL_OPTIONS, OLLAMA_MODEL_OPTIONS } from "../../utils/constants";
import { useI18n } from "../../i18n/I18nContext";
import OverlaySettings from "./OverlaySettings";

const selectCls = "bg-white/80 dark:bg-white/5 text-gray-700 dark:text-gray-300 border border-gray-200/50 dark:border-indigo-500/10 px-3 py-2 rounded-xl w-full text-sm outline-none transition-all duration-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 hover:border-gray-300 dark:hover:border-indigo-500/20";
const labelCls = "block text-xs text-gray-400 dark:text-gray-600 mb-1.5 font-medium uppercase tracking-wider";
const hintCls = "text-xs text-gray-400 dark:text-gray-600 mt-1";
const dividerCls = "border-gray-200/50 dark:border-indigo-500/10";
const sectionTitleCls = "text-xs font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider mb-3";

const UI_LANG_OPTIONS = [
  { value: "en", label: "English" },
  { value: "vi", label: "Tiếng Việt" },
];

export default function SettingsModal({ onClose }) {
  const { t, lang, setLang } = useI18n();
  const { dispatch } = useSocket();
  const [activeTab, setActiveTab] = useState("audio");

  const [audioSource, setAudioSource] = useState("mic");
  const [micTargetLanguage, setMicTargetLanguage] = useState("vi");
  const [systemTargetLanguage, setSystemTargetLanguage] = useState("vi");
  const [micWhisperLanguage, setMicWhisperLanguage] = useState("auto");
  const [systemWhisperLanguage, setSystemWhisperLanguage] = useState("auto");
  const [micDeviceIndex, setMicDeviceIndex] = useState("");
  const [systemDeviceIndex, setSystemDeviceIndex] = useState("");
  const [devices, setDevices] = useState([]);
  const [ffmpegAvailable, setFfmpegAvailable] = useState(true);
  const [sonioxApiKey, setSonioxApiKey] = useState("");
  const [transcriptionEngine, setTranscriptionEngine] = useState("soniox");
  const [whisperModel, setWhisperModel] = useState("base");
  const [localTranslationEngine, setLocalTranslationEngine] = useState("none");
  const [ollamaModel, setOllamaModel] = useState("llama3.2");
  const [hfToken, setHfToken] = useState("");
  const [localStatus, setLocalStatus] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [defaultContext, setDefaultContext] = useState("none");
  const [defaultCustomContext, setDefaultCustomContext] = useState("");
  const [setupLog, setSetupLog] = useState([]);
  const [setupRunning, setSetupRunning] = useState(false);
  const [setupDone, setSetupDone] = useState(false);
  const [setupError, setSetupError] = useState(null);
  const setupLogRef = useRef(null);

  useEffect(() => {
    Promise.all([fetchSettings(), fetchDevices()]).then(([settings, devData]) => {
      setDevices(devData.input || []);
      setFfmpegAvailable(devData.ffmpegAvailable !== false);
      setAudioSource(settings.audioSource || "mic");
      const defaultTarget = settings.targetLanguage || "vi";
      setMicTargetLanguage(settings.micTargetLanguage || defaultTarget);
      setSystemTargetLanguage(settings.systemTargetLanguage || defaultTarget);
      setMicWhisperLanguage(settings.micWhisperLanguage || "auto");
      setSystemWhisperLanguage(settings.systemWhisperLanguage || "auto");
      setMicDeviceIndex(settings.micDeviceIndex != null ? String(settings.micDeviceIndex) : "");
      setSystemDeviceIndex(settings.systemDeviceIndex != null ? String(settings.systemDeviceIndex) : "");
      setSonioxApiKey(settings.sonioxApiKey || "");
      setTranscriptionEngine(settings.transcriptionEngine || "soniox");
      setWhisperModel(settings.whisperModel || "base");
      setLocalTranslationEngine(settings.localTranslationEngine || "none");
      const savedModel = settings.ollamaModel || "llama3.2";
      setOllamaModel(OLLAMA_MODEL_OPTIONS.find((o) => o.value === savedModel) ? savedModel : "llama3.2");
      setHfToken(settings.hfToken || "");
      setDefaultContext(settings.defaultContext || "none");
      setDefaultCustomContext(settings.defaultCustomContext || "");
      if (settings.transcriptionEngine === "local-whisper") {
        const wm = settings.whisperModel || "base";
        const om = settings.ollamaModel || "llama3.2";
        fetch(`/api/local/status?whisperModel=${wm}&ollamaModel=${om}`).then((r) => r.json()).then(setLocalStatus).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (setupLogRef.current) setupLogRef.current.scrollTop = setupLogRef.current.scrollHeight;
  }, [setupLog]);

  const fetchStatus = (wm = whisperModel, om = ollamaModel) => {
    setCheckingStatus(true);
    fetch(`/api/local/status?whisperModel=${wm}&ollamaModel=${om}`)
      .then((r) => r.json())
      .then((data) => { setLocalStatus(data); setCheckingStatus(false); })
      .catch(() => { setCheckingStatus(false); });
  };

  const startSetup = () => {
    if (setupRunning) return;
    setSetupLog([]);
    setSetupRunning(true);
    setSetupDone(false);
    setSetupError(null);
    const es = new EventSource("/api/local/diarize-setup");
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.line !== undefined) {
        setSetupLog((prev) => [...prev, data.line]);
      } else if (data.done) {
        setSetupRunning(false);
        setSetupDone(true);
        es.close();
        fetchStatus();
      } else if (data.error) {
        setSetupRunning(false);
        setSetupError(data.error);
        es.close();
      }
    };
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setSetupRunning(false);
        if (!setupDone) setSetupError("Connection lost");
        es.close();
      }
    };
  };

  const handleSave = async () => {
    try {
      await saveSettings({
        audioSource,
        targetLanguage: micTargetLanguage,
        micTargetLanguage,
        systemTargetLanguage,
        micWhisperLanguage,
        systemWhisperLanguage,
        micDeviceIndex: micDeviceIndex ? parseInt(micDeviceIndex) : null,
        systemDeviceIndex: systemDeviceIndex ? parseInt(systemDeviceIndex) : null,
        sonioxApiKey: sonioxApiKey || null,
        transcriptionEngine,
        whisperModel,
        localTranslationEngine,
        ollamaModel,
        hfToken: hfToken || null,
        defaultContext,
        defaultCustomContext: defaultCustomContext || "",
      });
      dispatch({ type: "TOAST", payload: { message: t("saved"), type: "success" } });
      setTimeout(() => dispatch({ type: "TOAST", payload: { message: t("connected"), type: "" } }), 2000);
    } catch {
      dispatch({ type: "TOAST", payload: { message: t("saveFailed"), type: "error" } });
    }
  };

  const showMic = audioSource !== "system";
  const showSystem = audioSource !== "mic";
  const isLocalWhisper = transcriptionEngine === "local-whisper";

  const TABS = [
    { key: "audio",   label: t("settingsTabAudio") },
    { key: "engine",  label: t("settingsTabEngine") },
    { key: "context", label: t("settingsTabContext") },
    { key: "overlay", label: t("settingsTabOverlay") },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div
        className="flex flex-col w-full max-w-[580px] max-h-[88vh] rounded-2xl bg-[#f0f2f8] dark:bg-[#0c0d15] border border-gray-200/80 dark:border-indigo-500/15 shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 pt-4 pb-0">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t("tabSettings")}</h2>
          <div className="flex items-center gap-2">
            <select
              className="bg-transparent text-xs text-gray-500 dark:text-gray-400 border border-gray-200/50 dark:border-indigo-500/10 px-2 py-1 rounded-lg outline-none cursor-pointer hover:border-gray-300 dark:hover:border-indigo-500/20"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
            >
              {UI_LANG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={onClose}
              className="cursor-pointer text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-200/60 dark:hover:bg-white/10 text-base leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab nav */}
        <div className="shrink-0 flex gap-1 px-5 py-3 border-b border-gray-200/60 dark:border-indigo-500/10">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`cursor-pointer px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                activeTab === tab.key
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-white/5"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* ── AUDIO TAB ── */}
          {activeTab === "audio" && (
            <>
              {!ffmpegAvailable && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
                  <strong>{t("ffmpegNotFound")}</strong> {t("ffmpegInstall")}
                  <br /><span className="text-xs opacity-75">{t("ffmpegWindows")}</span>
                </div>
              )}
              {ffmpegAvailable && devices.length === 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 text-sm text-yellow-400">
                  {t("noDevices")}
                </div>
              )}


              <div>
                <label className={labelCls}>{t("audioSource")}</label>
                <select className={`${selectCls} max-w-xs`} value={audioSource} onChange={(e) => setAudioSource(e.target.value)}>
                  <option value="mic">{t("srcMic")}</option>
                  <option value="system">{t("srcSystem")}</option>
                  <option value="both">{t("srcBoth")}</option>
                </select>
              </div>

              {showMic && (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>{t("micDevice")}</label>
                    <select className={selectCls} value={micDeviceIndex} onChange={(e) => setMicDeviceIndex(e.target.value)}>
                      <option value="">{t("none")}</option>
                      {devices.map((d) => (
                        <option key={d.index} value={String(d.index)}>[{d.index}] {d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>{t("sourceLang")}</label>
                    <select className={selectCls} value={micWhisperLanguage} onChange={(e) => setMicWhisperLanguage(e.target.value)}>
                      <option value="auto">{t("autoDetect")}</option>
                      {LANGUAGE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>{t("targetLanguage")}</label>
                    <select className={selectCls} value={micTargetLanguage} onChange={(e) => setMicTargetLanguage(e.target.value)}>
                      {LANGUAGE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {showSystem && (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>{t("systemDevice")}</label>
                    <select className={selectCls} value={systemDeviceIndex} onChange={(e) => setSystemDeviceIndex(e.target.value)}>
                      <option value="">{t("autoDetect")}</option>
                      {devices.map((d) => (
                        <option key={d.index} value={String(d.index)}>[{d.index}] {d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>{t("sourceLang")}</label>
                    <select className={selectCls} value={systemWhisperLanguage} onChange={(e) => setSystemWhisperLanguage(e.target.value)}>
                      <option value="auto">{t("autoDetect")}</option>
                      {LANGUAGE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>{t("targetLanguage")}</label>
                    <select className={selectCls} value={systemTargetLanguage} onChange={(e) => setSystemTargetLanguage(e.target.value)}>
                      {LANGUAGE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── ENGINE TAB ── */}
          {activeTab === "engine" && (
            <>
              {/* Engine selector */}
              <div>
                <label className={labelCls}>{t("sectionEngine")}</label>
                <div className="flex gap-2">
                  {[
                    { value: "soniox", label: t("engineSoniox") },
                    { value: "local-whisper", label: t("engineLocalWhisper") },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setTranscriptionEngine(opt.value);
                        if (opt.value === "local-whisper") {
                          fetchStatus();
                        }
                      }}
                      className={`cursor-pointer px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-200 ${
                        transcriptionEngine === opt.value
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/25"
                          : "bg-white/60 dark:bg-white/5 border-gray-200/50 dark:border-indigo-500/10 text-gray-600 dark:text-gray-400 hover:border-indigo-400"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Soniox */}
              {!isLocalWhisper && (
                <div>
                  <label className={labelCls}>{t("sonioxApiKey")}</label>
                  <input
                    type="password"
                    className={selectCls}
                    value={sonioxApiKey}
                    onChange={(e) => setSonioxApiKey(e.target.value)}
                    placeholder={t("enterApiKey")}
                  />
                  <p className={hintCls}>
                    {t("getApiKey")}{" "}
                    <a href="https://soniox.com" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">soniox.com</a>
                  </p>
                </div>
              )}

              {/* Local Whisper */}
              {isLocalWhisper && (
                <>
                  <div>
                    <label className={labelCls}>{t("whisperModel")}</label>
                    <select className={`${selectCls} max-w-xs`} value={whisperModel} onChange={(e) => { setWhisperModel(e.target.value); fetchStatus(e.target.value, ollamaModel); }}>
                      {WHISPER_MODEL_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <p className={hintCls}>{WHISPER_MODEL_OPTIONS.find((o) => o.value === whisperModel)?.[lang] ?? ""}</p>
                  </div>
                  {checkingStatus ? (
                    <p className="text-xs font-medium text-gray-400 dark:text-gray-500 animate-pulse">⟳ Checking...</p>
                  ) : localStatus && (() => {
                    const ready = localStatus.whisperBuilt && localStatus.modelPresent;
                    const msg = !localStatus.whisperBuilt ? t("whisperNotBuilt") : !localStatus.modelPresent ? t("whisperModelMissing") : t("whisperReady");
                    return (
                      <p className={`text-xs font-medium ${ready ? "text-green-500" : "text-amber-500"}`}>
                        {ready ? "✓ " : "○ "}{msg}
                      </p>
                    );
                  })()}

                  <hr className={dividerCls} />

                  {/* Translation */}
                  <div>
                    <p className={sectionTitleCls}>{t("sectionTranslation")}</p>
                    <div className="space-y-3">
                      <div>
                        <label className={labelCls}>{t("localTranslationEngine")}</label>
                        <select
                          className={`${selectCls} max-w-xs`}
                          value={localTranslationEngine}
                          onChange={(e) => {
                            setLocalTranslationEngine(e.target.value);
                            fetchStatus();
                          }}
                        >
                          <option value="none">{t("none")}</option>
                          <option value="ollama">Ollama</option>
                          <option value="libretranslate">LibreTranslate</option>
                        </select>
                        {checkingStatus ? (
                          <p className="text-xs font-medium mt-1 text-gray-400 dark:text-gray-500 animate-pulse">⟳ Checking...</p>
                        ) : (<>
                          {localStatus && localTranslationEngine === "ollama" && (
                            <p className={`text-xs font-medium mt-1 ${localStatus.ollamaAvailable ? "text-green-500" : "text-amber-500"}`}>
                              {localStatus.ollamaAvailable ? "✓ " : "○ "}{localStatus.ollamaAvailable ? t("ollamaRunning") : t(localStatus.platform === "win32" ? "ollamaNotRunningWin" : "ollamaNotRunning")}
                            </p>
                          )}
                          {localStatus && localTranslationEngine === "libretranslate" && (
                            <p className={`text-xs font-medium mt-1 ${localStatus.libreTranslateAvailable ? "text-green-500" : "text-amber-500"}`}>
                              {localStatus.libreTranslateAvailable ? "✓ " : "○ "}{localStatus.libreTranslateAvailable ? t("libreTranslateOnline") : t("libreTranslateOffline")}
                            </p>
                          )}
                        </>)}
                      </div>
                      {localTranslationEngine === "ollama" && (
                        <div>
                          <label className={labelCls}>{t("ollamaModel")}</label>
                          <select className={`${selectCls} max-w-xs`} value={ollamaModel} onChange={(e) => { setOllamaModel(e.target.value); fetchStatus(whisperModel, e.target.value); }}>
                            {OLLAMA_MODEL_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                          <p className={hintCls}>{OLLAMA_MODEL_OPTIONS.find((o) => o.value === ollamaModel)?.[lang] ?? ""}</p>
                          {checkingStatus ? (
                            <p className="text-xs font-medium mt-1 text-gray-400 dark:text-gray-500 animate-pulse">⟳ Checking...</p>
                          ) : localStatus && localStatus.ollamaAvailable && (
                            <p className={`text-xs font-medium mt-1 ${localStatus.ollamaModelReady ? "text-green-500" : "text-amber-500"}`}>
                              {localStatus.ollamaModelReady ? "✓ " : "○ "}{localStatus.ollamaModelReady ? t("ollamaModelReady") : t("ollamaModelMissing", { model: ollamaModel })}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <hr className={dividerCls} />

                  {/* Diarization */}
                  <div>
                    <p className={sectionTitleCls}>{t("sectionDiarization")}</p>
                    <div className="space-y-3">
                      <p className={hintCls}>{t("diarizationHint")}</p>
                      <div>
                        <label className={labelCls}>{t("hfToken")}</label>
                        <input
                          type="password"
                          className={selectCls}
                          value={hfToken}
                          onChange={(e) => setHfToken(e.target.value)}
                          placeholder={t("hfTokenPlaceholder")}
                        />
                        <p className={hintCls}>
                          {t("hfTokenHint")}{" "}
                          <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                            huggingface.co/settings/tokens
                          </a>
                          {". "}
                          {t("hfTokenModelAccess")}{" "}
                          <a href="https://huggingface.co/pyannote/speaker-diarization-3.1" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                            pyannote/speaker-diarization-3.1
                          </a>
                        </p>
                        {checkingStatus ? (
                          <p className="text-xs mt-1.5 font-medium text-gray-400 dark:text-gray-500 animate-pulse">⟳ Checking...</p>
                        ) : localStatus && (
                          <p className={`text-xs mt-1.5 font-medium ${localStatus.diarizePyReady ? "text-green-500" : "text-amber-500"}`}>
                            {localStatus.diarizePyReady ? "✓ " : "○ "}{localStatus.diarizePyReady ? t("diarizePyReady") : t("diarizePyMissing")}
                          </p>
                        )}
                      </div>

                      {!localStatus?.diarizePyReady && (
                        <div className="space-y-2">
                          <div>
                            <button
                              onClick={startSetup}
                              disabled={setupRunning}
                              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-200 ${
                                setupRunning
                                  ? "opacity-50 cursor-not-allowed bg-white/40 dark:bg-white/5 border-gray-200/50 dark:border-indigo-500/10 text-gray-500"
                                  : "cursor-pointer bg-white/60 dark:bg-white/5 border-gray-200/50 dark:border-indigo-500/10 text-gray-600 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-500"
                              }`}
                            >
                              {setupRunning ? t("diarizeSetupRunning") : t("diarizeSetup")}
                            </button>
                            <p className={`${hintCls} mt-1`}>{t("diarizeSetupHint")}</p>
                          </div>
                          {(setupLog.length > 0 || setupDone || setupError) && (
                            <div
                              ref={setupLogRef}
                              className="bg-black/20 dark:bg-black/40 rounded-xl p-3 max-h-40 overflow-y-auto font-mono text-xs text-gray-500 dark:text-gray-400 space-y-0.5"
                            >
                              {setupLog.map((line, i) => <div key={i}>{line}</div>)}
                              {setupDone && <div className="text-green-500 font-semibold">{t("diarizeSetupDone")}</div>}
                              {setupError && <div className="text-red-400">{t("diarizeSetupError")}: {setupError}</div>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── CONTEXT TAB ── */}
          {activeTab === "context" && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{t("defaultContext")}</label>
                <select
                  className={selectCls}
                  value={defaultContext}
                  onChange={(e) => setDefaultContext(e.target.value)}
                >
                  {CONTEXT_PRESETS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                  ))}
                </select>
                <p className={hintCls}>{t("defaultContextHint")}</p>
              </div>
              {defaultContext === "custom" && (
                <div>
                  <label className={labelCls}>{t("contextCustomLabel")}</label>
                  <textarea
                    className={`${selectCls} resize-none`}
                    rows={4}
                    placeholder={t("contextPlaceholder")}
                    value={defaultCustomContext}
                    onChange={(e) => setDefaultCustomContext(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── OVERLAY TAB ── */}
          {activeTab === "overlay" && <OverlaySettings />}

        </div>

        {/* Sticky footer — always visible */}
        <div className="shrink-0 flex justify-end gap-2 px-5 py-3 border-t border-gray-200/60 dark:border-indigo-500/10">
          <button
            onClick={onClose}
            className="cursor-pointer px-4 py-2 rounded-xl text-sm font-medium border border-gray-200/50 dark:border-indigo-500/10 text-gray-500 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-white/5 transition-all duration-200"
          >
            {t("cancel")}
          </button>
          <button
            onClick={handleSave}
            className="bg-linear-to-r from-indigo-600 to-cyan-500 text-white border-none px-6 py-2 rounded-xl cursor-pointer text-sm font-semibold transition-all duration-200 shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 active:scale-95"
          >
            {t("saveSettings")}
          </button>
        </div>
      </div>
    </div>
  );
}
