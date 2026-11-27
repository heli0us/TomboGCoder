import React from "react";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  FastForward,
  Pause,
  Play,
} from "lucide-react";
import { type PathSegment, formatDuration } from "../../types/nc";

interface TraceBarProps {
  totalSteps: number;
  activeSegmentIndex: number;
  currentSegment: PathSegment | null;
  isPlaying: boolean;
  playbackSpeed: number;
  skipToolChangeTime: boolean;
  breakReason: string | null;
  liveTimeTextRef: React.RefObject<HTMLSpanElement | null>;
  onSelectSegmentIndex: (idx: number, keepPlaying?: boolean) => void;
  onTogglePlay: () => void;
  onChangePlaybackSpeed: (speed: number) => void;
  onToggleSkipToolChangeTime: () => void;
}

export const TraceBar: React.FC<TraceBarProps> = ({
  totalSteps,
  activeSegmentIndex,
  currentSegment,
  isPlaying,
  playbackSpeed,
  skipToolChangeTime,
  breakReason,
  liveTimeTextRef,
  onSelectSegmentIndex,
  onTogglePlay,
  onChangePlaybackSpeed,
  onToggleSkipToolChangeTime,
}) => {
  return (
    <div className="absolute bottom-3 left-3 right-3 z-20 bg-[#1f2126]/95 border border-[#32363f] rounded-lg px-3 py-2 shadow-xl backdrop-blur-md flex flex-col gap-1.5">
      {breakReason && (
        <div className="flex items-center gap-1.5 text-[11px] text-[#fca5a5] bg-[#7f1d1d]/40 border border-[#ef4444]/60 rounded px-2 py-0.5">
          <span className="w-2 h-2 rounded-full bg-[#ef4444] animate-pulse" />
          <span>ブレイク停止: {breakReason}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* ステップ / 再生ボタン */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onSelectSegmentIndex(0, false)}
            disabled={totalSteps === 0}
            className="p-1 rounded hover:bg-[#2f333c] text-[#cccccc] disabled:opacity-35 transition-colors"
            title="加工終了後 (全景 0) へ戻す (Esc)"
          >
            <ChevronFirst className="w-4 h-4" />
          </button>
          <button
            onClick={() => onSelectSegmentIndex(Math.max(0, activeSegmentIndex - 1), false)}
            disabled={totalSteps === 0 || activeSegmentIndex <= 0}
            className="p-1 rounded hover:bg-[#2f333c] text-[#cccccc] disabled:opacity-35 transition-colors"
            title="1ブロック戻る (←)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onTogglePlay}
            disabled={totalSteps === 0}
            className={`px-3 py-1 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors shadow-sm ${
              isPlaying
                ? "bg-[#c2410c] hover:bg-[#ea580c] text-white"
                : "bg-[#0078d4] hover:bg-[#1a8ad4] text-white"
            } disabled:opacity-35`}
            title="実時間トレース再生 / 一時停止 (Space)"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isPlaying ? "停止" : "再生"}
          </button>
          <button
            onClick={() =>
              onSelectSegmentIndex(Math.min(totalSteps, activeSegmentIndex + 1), false)
            }
            disabled={totalSteps === 0 || activeSegmentIndex >= totalSteps}
            className="p-1 rounded hover:bg-[#2f333c] text-[#cccccc] disabled:opacity-35 transition-colors"
            title="1ブロック進む (→)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => onSelectSegmentIndex(totalSteps, false)}
            disabled={totalSteps === 0}
            className="p-1 rounded hover:bg-[#2f333c] text-[#cccccc] disabled:opacity-35 transition-colors"
            title="最終ブロックへ"
          >
            <ChevronLast className="w-4 h-4" />
          </button>
        </div>

        {/* 速度セレクタ */}
        <select
          value={playbackSpeed}
          onChange={(e) => onChangePlaybackSpeed(Number(e.target.value))}
          className="bg-[#16171b] border border-[#32363f] rounded px-1.5 py-0.5 text-[11px] text-[#e2e8f0] focus:outline-none focus:border-[#0078d4]"
          title="再生速度（1x = 実機加工時間そのまま）"
        >
          <option value={0.25}>0.25x (スロー)</option>
          <option value={0.5}>0.5x</option>
          <option value={1}>1x (実機速度)</option>
          <option value={2}>2x</option>
          <option value={5}>5x</option>
          <option value={10}>10x</option>
          <option value={30}>30x (高速)</option>
          <option value={100}>100x (超高速)</option>
        </select>

        {/* 工具交換 (ATC) 待ち時間スキップトグル */}
        <button
          onClick={onToggleSkipToolChangeTime}
          className={`px-2 py-0.5 rounded border text-[10.5px] flex items-center gap-1 shrink-0 transition-colors ${
            skipToolChangeTime
              ? "bg-[#094771] border-[#0078d4] text-[#7dd3fc]"
              : "bg-[#16171b] border-[#32363f] text-[#8e95a2] hover:text-white"
          }`}
          title="ONにするとトレース再生中の工具交換(M06)待ち時間をスキップします（サイクルタイム集計には影響しません）"
        >
          <FastForward className="w-3 h-3" />
          <span>ATCスキップ</span>
        </button>

        {/* シークバー (0=加工終了後の全景, 1..N=加工開始〜各ブロック) */}
        <input
          type="range"
          min={0}
          max={totalSteps}
          value={Math.min(activeSegmentIndex, totalSteps)}
          onChange={(e) => onSelectSegmentIndex(Number(e.target.value), false)}
          disabled={totalSteps === 0}
          className="flex-1 accent-[#38bdf8] h-1.5 cursor-pointer"
        />

        {/* ステップ & リアルタイム経過時間 */}
        <div className="text-[11px] font-mono text-[#cbd5e1] whitespace-nowrap min-w-[164px] text-right">
          <span>
            {activeSegmentIndex === 0
              ? `0 / ${totalSteps} (完了)`
              : `${activeSegmentIndex} / ${totalSteps}`}
          </span>
          <span className="text-[#4b5563] mx-1.5">|</span>
          <span ref={liveTimeTextRef} className="text-[#38bdf8] font-semibold">
            {formatDuration(currentSegment?.cumulativeTimeSec ?? 0)}
          </span>
        </div>
      </div>
    </div>
  );
};
