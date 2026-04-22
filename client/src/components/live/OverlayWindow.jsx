import { useRef, useEffect, useState } from "react";
import { useSocketActions, useTranscript, useUI } from "../../context/SocketContext";
import useDraggable from "../../hooks/useDraggable";

export default function OverlayWindow() {
  const { dispatch } = useSocketActions();
  const { utterances, partialResults } = useTranscript();
  const { overlaySettings: s } = useUI();
  const { position, isDragging, dragRef, dragHandlers } = useDraggable({
    x: window.innerWidth / 2 - 250,
    y: window.innerHeight - 260,
  });
  const scrollRef = useRef(null);
  const isAtBottom = useRef(true);
  const [showJumpBtn, setShowJumpBtn] = useState(false);

  const finalOn = s.finalContent !== "off";
  const partialOn = s.partialContent !== "off";
  const finalTranslated = s.finalContent === "translated" || s.finalContent === "both";
  const finalOriginal = s.finalContent === "original" || s.finalContent === "both";
  const partialTranslated = s.partialContent === "translated" || s.partialContent === "both";
  const partialOriginal = s.partialContent === "original" || s.partialContent === "both";

  const partialEntries = Object.entries(partialResults);
  const visibleUtterances = finalOn ? utterances.slice(-s.maxLines) : [];
  const visiblePartials = partialOn ? partialEntries.filter(([, p]) => p.translatedText || p.originalText) : [];

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    isAtBottom.current = atBottom;
    if (atBottom) setShowJumpBtn(false);
  }

  function jumpToBottom() {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    isAtBottom.current = true;
    setShowJumpBtn(false);
  }

  useEffect(() => {
    if (!scrollRef.current) return;
    if (isAtBottom.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    } else {
      setShowJumpBtn(true);
    }
  }, [utterances.length, partialResults]);

  const isDark = s.bgColor === "dark";
  const bg = isDark
    ? `rgba(0, 0, 0, ${s.opacity})`
    : `rgba(255, 255, 255, ${s.opacity})`;
  const defaultTextColor = isDark ? "#fff" : "#1a1a1a";
  const mutedColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
  const translatedColor = s.translatedColor || defaultTextColor;
  const originalColor = s.originalColor || mutedColor;

  return (
    <div
      ref={dragRef}
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 9999,
        width: 500,
        maxWidth: "90vw",
        background: bg,
        color: defaultTextColor,
        backdropFilter: "blur(12px)",
        borderRadius: 14,
        border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.1)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        fontSize: `${s.scale}rem`,
        fontFamily: s.fontFamily,
        textAlign: s.textAlign,
        touchAction: "none",
      }}
      {...dragHandlers}
    >
      {/* Title bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.06)",
          fontSize: "0.7rem",
          color: mutedColor,
        }}
      >
        <span>Node Trans</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: "TOGGLE_OVERLAY" });
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            background: "none",
            border: "none",
            color: mutedColor,
            cursor: "pointer",
            fontSize: "1rem",
            lineHeight: 1,
            padding: "0 2px",
          }}
        >
          &times;
        </button>
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        style={{
          position: "relative",
          padding: "8px 12px",
          maxHeight: 200,
          overflowY: "auto",
          overflowX: "hidden",
        }}
        onScroll={handleScroll}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {visibleUtterances.length === 0 && visiblePartials.length === 0 && (
          <div style={{ color: mutedColor, fontSize: "0.85em", padding: "8px 0" }}>
            ...
          </div>
        )}
        {visibleUtterances.map((u, i) => {
          const translation = u.translatedText || u.translated_text;
          const original = u.originalText || u.original_text;
          return (
            <div key={i} style={{ marginBottom: 6, lineHeight: 1.5 }}>
              {finalTranslated && translation && (
                <div style={{ fontWeight: 500, color: translatedColor, fontSize: `${s.translatedFontSize}em` }}>
                  {translation}
                </div>
              )}
              {finalOriginal && original && (
                <div style={{ fontSize: `${s.originalFontSize}em`, color: originalColor }}>
                  {original}
                </div>
              )}
            </div>
          );
        })}
        {visiblePartials.map(([source, data]) => (
          <div key={source} style={{ marginBottom: 6, lineHeight: 1.5, opacity: 0.7 }}>
            {partialTranslated && data.translatedText && (
              <div style={{ fontWeight: 500, fontStyle: "italic", color: translatedColor, fontSize: `${s.translatedFontSize}em` }}>
                {data.translatedText}
              </div>
            )}
            {partialOriginal && data.originalText && (
              <div style={{ fontSize: `${s.originalFontSize}em`, color: originalColor, fontStyle: "italic" }}>
                {data.originalText}
              </div>
            )}
          </div>
        ))}
        {showJumpBtn && (
          <button
            onClick={jumpToBottom}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(79,70,229,1)";
              e.currentTarget.style.transform = "scale(1.07)";
              e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(99,102,241,0.9)";
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.95)"; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1.07)"; }}
            style={{
              position: "sticky",
              bottom: 4,
              float: "right",
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 10px",
              borderRadius: 999,
              border: "none",
              background: "rgba(99,102,241,0.9)",
              color: "#fff",
              fontSize: "0.7rem",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
              transition: "background 0.15s, transform 0.1s, box-shadow 0.15s",
            }}
          >
            ↓ New
          </button>
        )}
      </div>
    </div>
  );
}
