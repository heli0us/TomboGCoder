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
  // VS Code に倣い、再生（デバッグ実行）中はオレンジ系バーに変化
  const barBg = isPlaying
    ? "bg-[#b45309]"
    : errorCount > 0
      ? "bg-[#991b1b]"
      : "bg-[#0078d4]";

  return (
    <footer
      className={`h-6 ${barBg} text-white px-2.5 flex items-center justify-between text-[11px] font-mono shrink-0 transition-colors duration-200 select-none`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {isPlaying && (
          <span className="flex items-center gap-1 bg-black/25 px-1.5 rounded text-[10.5px] font-sans font-semibold">
            <Play className="w-2.5 h-2.5 fill-current" />
            再生中
          </span>
        )}

        <button
          onClick={onOpenProblems}
          className="flex items-center gap-1 hover:bg-white/15 px-1 rounded transition-colors"
          title="問題・警告パネルを開く"
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <span>{errorCount}</span>
          <AlertTriangle className="w-3.5 h-3.5 ml-1" />
          <span>{warnCount}</span>
        </button>

        {activeSegment && (
          <>
            <span className="opacity-50">|</span>
            <span className="text-white/95">
              {activeSegment.programNumber} : 行{activeSegment.lineNumber}
            </span>
            <span className="hidden md:inline">
              X:{activeSegment.end.x.toFixed(3)} Y:{activeSegment.end.y.toFixed(3)} Z:
              {activeSegment.end.z.toFixed(3)}
            </span>
            <span className="hidden lg:inline opacity-50">|</span>
            <span className="hidden lg:inline truncate">
              {activeSegment.modalState.distanceMode} {activeSegment.modalState.workOffset}{" "}
              {activeSegment.modalState.plane} {activeSegment.modalState.motionCode}{" "}
              {compModeLabel(activeSegment.modalState.compMode)}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {activeSegment && (
          <span className="hidden sm:inline">
            T{String(activeSegment.modalState.toolNumber).padStart(2, "0")} D
            {String(activeSegment.modalState.dNumber).padStart(2, "0")}(Ø
            {activeSegment.modalState.toolDiameter.toFixed(1)}) F
            {activeSegment.modalState.feedRate.toFixed(0)} S
            {activeSegment.modalState.spindleSpeed.toFixed(0)}
          </span>
        )}
        <button
          onClick={onOpenCycle}
          className="flex items-center gap-1 bg-black/20 hover:bg-black/35 px-1.5 py-0 rounded font-semibold transition-colors"
          title="総サイクルタイム詳細を開く"
        >
          <Clock className="w-3 h-3" />
          <span>{formatDuration(totalTimeSec)}</span>
        </button>
      </div>
    </footer>
  );
};
