import React, { useMemo } from "react";
import { type DisplayOptions, type ParseResult, formatDuration, getToolColor } from "../../types/nc";
import { computeProgramStats } from "../../utils/filterResult";

interface FilterPanelProps {
  parseResult: ParseResult | null;
  displayOptions: DisplayOptions;
  onUpdateDisplayOptions: (patch: Partial<DisplayOptions>) => void;
  onFocusProgram?: (prog: string, firstLine: number) => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  parseResult,
  displayOptions,
  onUpdateDisplayOptions,
  onFocusProgram,
}) => {
  const programStats = useMemo(() => computeProgramStats(parseResult), [parseResult]);

  const toggleProgramVisibility = (prog: string) => {
    const exists = displayOptions.hiddenPrograms.includes(prog);
    onUpdateDisplayOptions({
      hiddenPrograms: exists
        ? displayOptions.hiddenPrograms.filter((p) => p !== prog)
        : [...displayOptions.hiddenPrograms, prog],
    });
  };

  const soloProgram = (prog: string) => {
    const all = parseResult?.detectedPrograms ?? [];
    onUpdateDisplayOptions({
      hiddenPrograms: all.filter((p) => p !== prog),
    });
    const stat = programStats.get(prog);
    if (stat) {
      onFocusProgram?.(prog, stat.firstLine);
    }
  };

  const toggleToolVisibility = (toolNum: number) => {
    const exists = displayOptions.hiddenTools.includes(toolNum);
    onUpdateDisplayOptions({
      hiddenTools: exists
        ? displayOptions.hiddenTools.filter((t) => t !== toolNum)
        : [...displayOptions.hiddenTools, toolNum],
    });
  };

  const toggleDVisibility = (dNum: number) => {
    const exists = displayOptions.hiddenDNumbers.includes(dNum);
    onUpdateDisplayOptions({
      hiddenDNumbers: exists
        ? displayOptions.hiddenDNumbers.filter((d) => d !== dNum)
        : [...displayOptions.hiddenDNumbers, dNum],
    });
  };

  const zMinBound = parseResult?.boundingBox.valid
    ? Math.floor(parseResult.boundingBox.min.z) - 5
    : -50;
  const zMaxBound = parseResult?.boundingBox.valid
    ? Math.ceil(parseResult.boundingBox.max.z) + 5
    : 100;

  return (
    <div className="space-y-4">
      <section className="space-y-1">
        <div className="text-[10.5px] font-semibold text-[#9cdcfe] uppercase tracking-wider mb-1.5">
          描画オプション
        </div>
        {(
          [
            ["showCompensatedPath", "補正後パス (実工具中心)"],
            ["showProgramPath", "補正前パス (G41/G42比較)"],
            ["showToolWidthFill", "工具径塗りつぶし (削り残し確認)"],
            ["showRapid", "早送りパス (G00)"],
            ["showToolModel", "3D工具モデル表示"],
            ["quadView", "4面図同時表示 (XY/XZ/YZ/ISO)"],
            ["showGrid", "XYグリッド表示"],
            ["showBoundingBox", "加工範囲ボックス (XYZ)"],
            ["colorByTool", "工具番号 (T) ごとに色分け"],
            ["traceClipFuture", "現在トレース位置まで描画"],
          ] as const
        ).map(([key, label]) => (
          <label
            key={key}
            className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-[#2a2d2e] cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={displayOptions[key]}
              onChange={(e) => onUpdateDisplayOptions({ [key]: e.target.checked })}
              className="accent-[#0078d4]"
            />
            <span className="text-[#d4d4d4]">{label}</span>
          </label>
        ))}
      </section>

      {/* Z高さスライスフィルタ */}
      <section className="space-y-2 pt-3 border-t border-[#2b2b2b]">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-[10.5px] font-semibold text-[#9cdcfe] uppercase tracking-wider">
            Z高さスライス表示
          </span>
          <input
            type="checkbox"
            checked={displayOptions.zSliceEnabled}
            onChange={(e) => {
              const enabled = e.target.checked;
              onUpdateDisplayOptions({
                zSliceEnabled: enabled,
                zSliceMin: enabled ? zMinBound : displayOptions.zSliceMin,
                zSliceMax: enabled ? zMaxBound : displayOptions.zSliceMax,
              });
            }}
            className="accent-[#0078d4]"
          />
        </label>
        {displayOptions.zSliceEnabled && (
          <div className="bg-[#1e1e1e] border border-[#2f2f32] rounded-md p-2.5 space-y-2 font-mono text-[11px]">
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-0.5">
                <span className="text-[10px] text-[#8e95a2]">Z下限 (mm)</span>
                <input
                  type="number"
                  step={1}
                  value={displayOptions.zSliceMin}
                  onChange={(e) =>
                    onUpdateDisplayOptions({ zSliceMin: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-1.5 py-0.5 text-right text-white focus:outline-none focus:border-[#0078d4]"
                />
              </label>
              <label className="space-y-0.5">
                <span className="text-[10px] text-[#8e95a2]">Z上限 (mm)</span>
                <input
                  type="number"
                  step={1}
                  value={displayOptions.zSliceMax}
                  onChange={(e) =>
                    onUpdateDisplayOptions({ zSliceMax: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-1.5 py-0.5 text-right text-white focus:outline-none focus:border-[#0078d4]"
                />
              </label>
            </div>
            <input
              type="range"
              min={zMinBound}
              max={zMaxBound}
              step={0.5}
              value={displayOptions.zSliceMax}
              onChange={(e) =>
                onUpdateDisplayOptions({ zSliceMax: parseFloat(e.target.value) })
              }
              className="w-full accent-[#38bdf8] h-1.5"
              title="Z上限スライダー"
            />
          </div>
        )}
      </section>

      {/* プログラム番号 (O番号) フィルタ */}
      {parseResult && parseResult.detectedPrograms.length > 0 && (
        <section className="space-y-1.5 pt-3 border-t border-[#2b2b2b]">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-semibold text-[#9cdcfe] uppercase tracking-wider">
              プログラム番号 (O番号) ({parseResult.detectedPrograms.length})
            </span>
            <div className="flex items-center gap-2 text-[10.5px]">
              {displayOptions.hiddenPrograms.length > 0 && (
                <button
                  onClick={() => onUpdateDisplayOptions({ hiddenPrograms: [] })}
                  className="text-[#38bdf8] hover:underline"
                >
                  全表示
                </button>
              )}
              {displayOptions.hiddenPrograms.length < parseResult.detectedPrograms.length && (
                <button
                  onClick={() =>
                    onUpdateDisplayOptions({
                      hiddenPrograms: [...parseResult.detectedPrograms],
                    })
                  }
                  className="text-[#8e95a2] hover:text-white"
                >
                  全解除
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1 max-h-52 overflow-y-auto pr-0.5">
            {parseResult.detectedPrograms.map((prog) => {
              const visible = !displayOptions.hiddenPrograms.includes(prog);
              const stat = programStats.get(prog);
              const count = stat?.count ?? 0;
              const timeSec = stat?.timeSec ?? 0;
              return (
                <div
                  key={prog}
                  className={`group flex items-center justify-between py-1 px-2 rounded border transition-colors ${
                    visible
                      ? "bg-[#1e1e1e] border-[#2c2c2e] hover:border-[#424246]"
                      : "bg-[#19191b] border-[#242426] opacity-55 hover:opacity-85"
                  }`}
                >
                  <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => toggleProgramVisibility(prog)}
                      className="accent-[#0078d4]"
                    />
                    <span className="font-mono font-semibold text-[#dcdcaa]">{prog}</span>
                    <span className="text-[10px] font-mono text-[#6e7681]">({count})</span>
                  </label>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-mono text-[#38bdf8]">
                      {formatDuration(timeSec)}
                    </span>
                    {parseResult.detectedPrograms.length > 1 && (
                      <button
                        onClick={() => soloProgram(prog)}
                        className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded bg-[#094771] hover:bg-[#0078d4] text-white transition-opacity"
                        title={`${prog} のみ単独ロード（再生・加工時間・視点フィット）`}
                      >
                        のみ
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 工具番号 (T) フィルタ */}
      <section className="space-y-1.5 pt-3 border-t border-[#2b2b2b]">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-semibold text-[#9cdcfe] uppercase tracking-wider">
            工具番号 (T) フィルタ
          </span>
          {displayOptions.hiddenTools.length > 0 && (
            <button
              onClick={() => onUpdateDisplayOptions({ hiddenTools: [] })}
              className="text-[10.5px] text-[#38bdf8] hover:underline"
            >
              すべて表示
            </button>
          )}
        </div>
        {parseResult && parseResult.detectedTools.length > 0 ? (
          <div className="space-y-1">
            {parseResult.detectedTools.map((t) => {
              const visible = !displayOptions.hiddenTools.includes(t);
              const tSummary = parseResult.cycleTime.tools.find((x) => x.toolNumber === t);
              return (
                <label
                  key={t}
                  className="flex items-center justify-between py-1 px-2 rounded bg-[#1e1e1e] border border-[#2c2c2e] hover:border-[#424246] cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => toggleToolVisibility(t)}
                      className="accent-[#0078d4]"
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: getToolColor(t) }}
                    />
                    <span className="font-mono font-semibold text-[#e2e8f0]">
                      T{String(t).padStart(2, "0")}
                    </span>
                    {tSummary?.commentHint && (
                      <span className="text-[10px] text-[#858585] truncate">
                        {tSummary.commentHint}
                      </span>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-[#787878]">工具番号 (T) は検出されていません</p>
        )}
      </section>

      {/* 径補正番号 (D) フィルタ */}
      {parseResult && parseResult.detectedDNumbers.length > 0 && (
        <section className="space-y-1.5 pt-3 border-t border-[#2b2b2b]">
          <div className="text-[10.5px] font-semibold text-[#9cdcfe] uppercase tracking-wider">
            径補正番号 (D) フィルタ
          </div>
          <div className="flex flex-wrap gap-1.5">
            {parseResult.detectedDNumbers.map((d) => {
              const visible = !displayOptions.hiddenDNumbers.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => toggleDVisibility(d)}
                  className={`px-2 py-0.5 rounded font-mono text-[11px] border transition-colors ${
                    visible
                      ? "bg-[#094771] border-[#0078d4] text-white"
                      : "bg-[#1e1e1e] border-[#323233] text-[#6e7681]"
                  }`}
                >
                  D{String(d).padStart(2, "0")}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
