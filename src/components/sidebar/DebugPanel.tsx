import React from "react";
import { Trash2 } from "lucide-react";
import type { AutoBreakConfig } from "../../types/nc";

interface DebugPanelProps {
  breakpoints: number[];
  onToggleBreakpoint: (lineNumber: number) => void;
  onClearBreakpoints: () => void;
  onJumpToLine: (lineNumber: number) => void;
  autoBreak: AutoBreakConfig;
  onUpdateAutoBreak: (patch: Partial<AutoBreakConfig>) => void;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({
  breakpoints,
  onToggleBreakpoint,
  onClearBreakpoints,
  onJumpToLine,
  autoBreak,
  onUpdateAutoBreak,
}) => {
  return (
    <div className="space-y-4">
      <div className="text-[11px] text-[#8e95a2] leading-relaxed bg-[#1e1e1e] border border-[#2f2f32] rounded-md p-2.5">
        エディタ行番号の左余白をクリックすると赤丸ブレイクポイントを設定できます。自動トレース再生中に条件または行に到達すると一時停止します。
      </div>

      <section className="space-y-1">
        <div className="text-[10.5px] font-semibold text-[#9cdcfe] uppercase tracking-wider mb-1.5">
          条件付き自動ブレイク
        </div>
        {(
          [
            ["onM00", "M00 (プログラムストップ) で自動停止"],
            ["onToolChange", "工具交換 (M06 / T変更) で自動停止"],
            ["onZPlunge", "Zマイナス突入 (ワーク切込) で自動停止"],
            ["onCompChange", "径補正 (G41/G42/G40) 切替で自動停止"],
            ["onErrorLine", "エラー検出行で自動停止"],
          ] as const
        ).map(([key, label]) => (
          <label
            key={key}
            className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-[#2a2d2e] cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={autoBreak[key]}
              onChange={(e) => onUpdateAutoBreak({ [key]: e.target.checked })}
              className="accent-[#ef4444]"
            />
            <span>{label}</span>
          </label>
        ))}
      </section>

      <section className="space-y-1.5 pt-3 border-t border-[#2b2b2b]">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-semibold text-[#9cdcfe] uppercase tracking-wider">
            行ブレイクポイント ({breakpoints.length})
          </span>
          {breakpoints.length > 0 && (
            <button
              onClick={onClearBreakpoints}
              className="text-[10.5px] text-[#f87171] hover:underline"
            >
              すべて解除
            </button>
          )}
        </div>

        {breakpoints.length === 0 ? (
          <p className="text-[11px] text-[#787878]">設定された行ブレイクはありません</p>
        ) : (
          <div className="space-y-1">
            {[...breakpoints]
              .sort((a, b) => a - b)
              .map((lineNo) => (
                <div
                  key={lineNo}
                  className="flex items-center justify-between px-2 py-1 rounded bg-[#1e1e1e] border border-[#2c2c2e] hover:border-[#424246]"
                >
                  <button
                    onClick={() => onJumpToLine(lineNo)}
                    className="flex items-center gap-2 font-mono text-[#e2e8f0] hover:text-[#38bdf8]"
                  >
                    <span className="w-2 h-2 rounded-full bg-[#ef4444]" />
                    <span>行 {lineNo}</span>
                  </button>
                  <button
                    onClick={() => onToggleBreakpoint(lineNo)}
                    className="text-[#858585] hover:text-[#f87171]"
                    title="解除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  );
};
