import React from "react";
import { AlertCircle, AlertTriangle, Clock, Play } from "lucide-react";
import { type PathSegment, compModeLabel, formatDuration } from "../types/nc";

interface StatusBarProps {
  isPlaying: boolean;
  errorCount: number;
  warnCount: number;
  activeSegment: PathSegment | null;
  totalTimeSec: number;
  onOpenProblems: () => void;
  onOpenCycle: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  isPlaying,
  errorCount,
  warnCount,
  activeSegment,
  totalTimeSec,
  onOpenProblems,
  onOpenCycle,
}) => {
  // 左端ステータスチップのみ状態カラーを表示（バー全体は落ち着いたダークに統一）
  const badgeStyle = isPlaying
    ? "bg-[#c2410c] text-white"
    : errorCount > 0
      ? "bg-[#b91c1c] text-white"
      : "bg-[#0078d4] text-white";

  const badgeLabel = isPlaying ? "再生中" : errorCount > 0 ? "エラー" : "READY";

  return (
    <footer className="h-6 bg-[#181818] border-t border-[#2b2b2b] text-[#9ca3af] pr-2.5 flex items-center justify-between text-[11px] font-mono shrink-0 select-none">
      <div className="flex items-center gap-2.5 min-w-0 h-full">
        {/* 左端アクセントバッジ */}
        <span
          className={`h-full px-2.5 flex items-center gap-1 text-[10.5px] font-sans font-semibold tracking-wide shrink-0 transition-colors duration-200 ${badgeStyle}`}
        >
          {isPlaying && <Play className="w-2.5 h-2.5 fill-current" />}
          {badgeLabel}
        </span>

        {/* 問題・警告カウンタ */}
        <button
          onClick={onOpenProblems}
          className="flex items-center gap-1 hover:bg-[#2a2d2e] px-1.5 py-0.5 rounded transition-colors"
          title="問題・警告パネルを開く"
        >
          <span
            className={`flex items-center gap-1 ${
              errorCount > 0 ? "text-[#f87171] font-semibold" : "text-[#787878]"
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{errorCount}</span>
          </span>
          <span
            className={`flex items-center gap-1 ml-1 ${
              warnCount > 0 ? "text-[#fbbf24] font-semibold" : "text-[#787878]"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{warnCount}</span>
          </span>
        </button>

        {activeSegment && (
          <>
            <span className="text-[#333740]">|</span>
            <span className="text-[#dcdcaa]">
              {activeSegment.programNumber}
              <span className="text-[#6e7681]"> : </span>
              <span className="text-[#cbd5e1]">L{activeSegment.lineNumber}</span>
            </span>
            <span className="hidden md:inline text-[#d4d4d4]">
              X:{activeSegment.end.x.toFixed(3)} Y:{activeSegment.end.y.toFixed(3)} Z:
              {activeSegment.end.z.toFixed(3)}
            </span>
            <span className="hidden lg:inline text-[#333740]">|</span>
            <span className="hidden lg:inline truncate text-[#8e95a2]">
              {activeSegment.modalState.distanceMode} {activeSegment.modalState.workOffset}{" "}
              {activeSegment.modalState.plane} {activeSegment.modalState.motionCode}{" "}
              {compModeLabel(activeSegment.modalState.compMode)}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {activeSegment && (
          <span className="hidden sm:inline text-[#94a3b8]">
            <span className="text-[#fbbf24]">
              T{String(activeSegment.modalState.toolNumber).padStart(2, "0")}
            </span>{" "}
            D{String(activeSegment.modalState.dNumber).padStart(2, "0")}(Ø
            {activeSegment.modalState.toolDiameter.toFixed(1)}) F
            {activeSegment.modalState.feedRate.toFixed(0)} S
            {activeSegment.modalState.spindleSpeed.toFixed(0)}
          </span>
        )}
        <button
          onClick={onOpenCycle}
          className="flex items-center gap-1 bg-[#222226] hover:bg-[#2d2d32] border border-[#30323a] text-[#38bdf8] px-1.5 py-0 rounded font-semibold transition-colors"
          title="総サイクルタイム詳細を開く"
        >
          <Clock className="w-3 h-3" />
          <span>{formatDuration(totalTimeSec)}</span>
        </button>
      </div>
    </footer>
  );
};
