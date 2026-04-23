import { useRef, useEffect, useState, memo } from "react";
import { useSession } from "../../context/SocketContext";
import { useI18n } from "../../i18n/I18nContext";
import { getSpeakerIndex } from "../../utils/speakerColors";
import Utterance from "./Utterance";

export default function Transcript({ utterances, speakerColorMap, speakerAliases, partialResults }) {
  const { selectedSessionId } = useSession();
  const { t } = useI18n();
  const ref = useRef(null);
  const isAtBottom = useRef(true);
  const [showJumpBtn, setShowJumpBtn] = useState(false);
  const partialEntries = Object.entries(partialResults);
  const hasContent = utterances.length > 0 || partialEntries.some(([, p]) => p.originalText);

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    isAtBottom.current = atBottom;
    if (atBottom) setShowJumpBtn(false);
  }

  useEffect(() => {
    if (!ref.current) return;
    if (isAtBottom.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    } else {
      setShowJumpBtn(true);
    }
  }, [utterances.length, partialResults]);

  function jumpToBottom() {
    if (!ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
    isAtBottom.current = true;
    setShowJumpBtn(false);
  }

  return (
    <div
      className="relative flex-1 overflow-y-auto p-4 bg-white/60 dark:bg-[#0b0d18]/60 backdrop-blur-md rounded-2xl border border-gray-200/50 dark:border-indigo-500/10 mt-2 shadow-sm"
      ref={ref}
      onScroll={handleScroll}
    >
      {!hasContent ? (
        <div className="text-gray-300 dark:text-gray-700 text-center py-15 text-sm">
          {selectedSessionId ? t("pressResume") : t("pressStart")}
        </div>
      ) : (
        <>
          {utterances.map((u, i) => (
            <Utterance
              key={u._clientId || u.id || i}
              data={u}
              speakerColorMap={speakerColorMap}
              speakerName={u.speaker && speakerAliases?.[u.speaker] ? speakerAliases[u.speaker] : undefined}
            />
          ))}
          {partialEntries.map(([source, data]) =>
            data.originalText ? (
              <PartialUtterance key={source} data={data} speakerColorMap={speakerColorMap} />
            ) : null
          )}
        </>
      )}
      {showJumpBtn && (
        <button
          onClick={jumpToBottom}
          className="sticky bottom-2 left-full -translate-x-full flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500 text-white text-xs font-medium shadow-lg hover:bg-indigo-600 hover:scale-105 hover:shadow-xl active:scale-95 transition-all duration-150 cursor-pointer"
        >
          ↓ {t("newMessages")}
        </button>
      )}
    </div>
  );
}

const PartialUtterance = memo(function PartialUtterance({ data, speakerColorMap }) {
  const { t } = useI18n();
  const idx = getSpeakerIndex(data.speaker, speakerColorMap);
  const speaker = data.speaker ? `${t("speaker")} ${idx + 1}` : t("speaker");

  return (
    <div className={`speaker-${idx} p-3 mb-1.5 rounded-xl bg-gray-50/80 dark:bg-white/3 border-l-3 border-l-(--speaker-color,#444) animate-pulse opacity-70`}>
      <div className="flex items-center gap-2 mb-1.5 text-xs">
        <span className="font-bold text-(--speaker-color,#60a5fa)">{speaker}</span>
        {data.source && data.source !== "mic" && (
          <span className="bg-gray-100/80 dark:bg-white/5 text-gray-400 dark:text-gray-600 px-2 py-px rounded-full text-[0.68rem] font-medium">
            {data.source.toUpperCase()}
          </span>
        )}
      </div>
      <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-1">{data.originalText}</div>
      {data.translatedText && (
        <div className="text-sm text-(--speaker-color,#4ade80) opacity-85 leading-relaxed pl-3 border-l-2 border-l-(--speaker-color,#4ade80) mt-1">
          {data.translatedText}
        </div>
      )}
    </div>
  );
});
