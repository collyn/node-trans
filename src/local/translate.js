const LANG_NAMES = {
  vi: "Vietnamese", en: "English", ja: "Japanese", ko: "Korean",
  zh: "Chinese", fr: "French", es: "Spanish", de: "German",
  pt: "Portuguese", ru: "Russian", ar: "Arabic", hi: "Hindi",
  th: "Thai", id: "Indonesian", ms: "Malay", tl: "Filipino",
  it: "Italian", nl: "Dutch", pl: "Polish", tr: "Turkish",
  uk: "Ukrainian", cs: "Czech", sv: "Swedish", da: "Danish",
  fi: "Finnish", no: "Norwegian", el: "Greek", he: "Hebrew",
  ro: "Romanian", hu: "Hungarian", bg: "Bulgarian",
};

/**
 * Translate text using a local translation service (Ollama or LibreTranslate).
 * Returns { translated, lang } — translated is empty string on failure or when disabled.
 */
import { createLogger } from "../logger.js";
const log = createLogger("translate");

export async function translateText(text, sourceLang, settings) {
  const { localTranslationEngine, ollamaBaseUrl, ollamaModel, libreTranslateUrl, targetLanguage, context } = settings;

  if (!text || !localTranslationEngine || localTranslationEngine === "none") {
    return { translated: "", lang: null };
  }

  const targetLangName = LANG_NAMES[targetLanguage] || targetLanguage;

  try {
    if (localTranslationEngine === "ollama") {
      const res = await fetch(`${ollamaBaseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel,
          prompt: `${context ? `[Context: ${context.slice(0, 200).replace(/\n/g, " ")}]\n\n` : ""}Translate the following text to ${targetLangName}. Reply with only the translation, no explanation:\n\n${text}`,
          stream: false,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const data = await res.json();
      return { translated: (data.response || "").trim(), lang: targetLanguage };
    }

    if (localTranslationEngine === "libretranslate") {
      const res = await fetch(`${libreTranslateUrl}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: text,
          source: sourceLang || "auto",
          target: targetLanguage,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`LibreTranslate HTTP ${res.status}`);
      const data = await res.json();
      return { translated: data.translatedText || "", lang: targetLanguage };
    }
  } catch (err) {
    // Translation failure is non-fatal — log and return empty
    log.warn(`${localTranslationEngine} error: ${err.message}`);
  }

  return { translated: "", lang: null };
}

/**
 * Pre-load the Ollama model so the first translation doesn't time out.
 * Fire-and-forget — errors are swallowed.
 */
export async function warmUpOllama(baseUrl, model) {
  try {
    log.info(`Warming up Ollama model '${model}'...`);
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: "hi", stream: false }),
      signal: AbortSignal.timeout(120_000),
    });
    if (res.ok) {
      log.info(`Ollama model '${model}' warmed up successfully`);
    } else {
      log.warn(`Ollama warm-up returned HTTP ${res.status}`);
    }
  } catch (err) {
    log.warn(`Ollama warm-up failed: ${err.message}`);
  }
}
