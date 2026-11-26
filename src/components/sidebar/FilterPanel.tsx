import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { type DisplayOptions, type ParseResult, formatDuration, getToolColor } from "../../types/nc";
import { computeProgramStats } from "../../utils/filterResult";

interface FilterPanelProps {
  parseResult: ParseResult | null;
  displayOptions: DisplayOptions;
  onUpdateDisplayOptions: (patch: Partial<DisplayOptions>) => void;
  onFocusProgram?: (prog: string, firstLine: number) => void;
}

interface AccordionSectionProps {
  title: string;
  badge?: string | number;
  open: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  badge,
  open,
  onToggle,
  actions,
  children,
}) => (
  <section className="border-b border-[#2b2b2b] pb-2.5 last:border-b-0">
    <div className="flex items-center justify-between gap-1 py-1">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-[10.5px] font-semibold text-[#b4b4b4] hover:text-white uppercase tracking-wider min-w-0 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-[#858585] shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[#858585] shrink-0" />
        )}
        <span className="truncate">{title}</span>
        {badge !== undefined && (
          <span className="ml-1 px-1.5 py-0 rounded-full bg-[#262629] text-[10px] font-mono text-[#9cdcfe]">
            {badge}
          </span>
        )}
      </button>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
    {open && <div className="mt-1.5">{children}</div>}
  </section>
);

const TOGGLE_ITEMS: ReadonlyArray<{
  key: keyof Pick<
    DisplayOptions,
    | "showCompensatedPath"
    | "showProgramPath"
    | "showToolWidthFill"
    | "showRapid"
    | "showToolModel"
    | "quadView"
    | "showGrid"
    | "showBoundingBox"
    | "colorByTool"
    | "traceClipFuture"
  >;
  label: string;
  title: string;
  accent?: string;
}> = [
  { key: "showCompensatedPath", label: "補正後パス", title: "実工具中心パスを表示" },
  { key: "showProgramPath", label: "補正前比較", title: "G41/G42 補正前パスを重ね表示", accent: "#e879f9" },
  { key: "showToolWidthFill", label: "工具幅塗潰", title: "T工具径の幅で切削領域を塗りつぶし" },
  { key: "showRapid", label: "早送り G00", title: "早送りパス (G00) を表示", accent: "#f87171" },
  { key: "showToolModel", label: "3D工具", title: "現在位置に3D工具モデルを表示" },
  { key: "quadView", label: "4面図", title: "XY / XZ / YZ / ISO 同時表示" },
  { key: "showGrid", label: "グリッド", title: "XY基準グリッドを表示" },
  { key: "showBoundingBox", label: "加工範囲枠", title: "XYZバウンディングボックスを表示", accent: "#fbbf24" },
  { key: "colorByTool", label: "工具別色分", title: "工具番号 (T) ごとに色を分ける", accent: "#4ade80" },
  { key: "traceClipFuture", label: "軌跡クリップ", title: "現在トレース位置までのみ描画" },
];

export const FilterPanel: React.FC<FilterPanelProps> = ({
  parseResult,
  displayOptions,
  onUpdateDisplayOptions,
  onFocusProgram,
}) => {
  const [openDraw, setOpenDraw] = useState(true);
  const [openPrograms, setOpenPrograms] = useState(true);
  const [openTools, setOpenTools] = useState(true);
  const [openDNums, setOpenDNums] = useState(false);
  const [openZSlice, setOpenZSlice] = useState(false);

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
    <div className="space-y-2">
      {/* 1. 描画オプション（2列コンパクトトグルチップ） */}
      <AccordionSection
        title="描画オプション"
        open={openDraw}
        onToggle={() => setOpenDraw((v) => !v)}
      >
        <div className="grid grid-cols-2 gap-1.5">
          {TOGGLE_ITEMS.map(({ key, label, title, accent }) => {
            const active = displayOptions[key];
            const dotColor = accent ?? "#38bdf8";
            return (
              <button
                key={key}
                onClick={() => onUpdateDisplayOptions({ [key]: !active })}
                title={title}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-left text-[11px] transition-all ${
                  active
                    ? "bg-[#222832] border-[#0078d4]/65 text-[#f1f5f9] shadow-xs"
                    : "bg-[#1c1c1e] border-[#2a2a2d] text-[#7c828d] hover:text-[#cccccc] hover:border-[#3c3c40]"
                }`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0 transition-opacity"
                  style={{
                    backgroundColor: active ? dotColor : "#4b5563",
                    opacity: active ? 1 : 0.45,
                  }}
                />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
      </AccordionSection>

      {/* 2. プログラム番号 (O番号) */}
      {parseResult && parseResult.detectedPrograms.length > 0 && (
        <AccordionSection
          title="プログラム番号 (O)"
          badge={parseResult.detectedPrograms.length}
          open={openPrograms}
          onToggle={() => setOpenPrograms((v) => !v)}
          actions={
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
          }
        >
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
        </AccordionSection>
      )}

      {/* 3. 工具番号 (T) */}
      <AccordionSection
        title="工具番号 (T)"
        badge={parseResult?.detectedTools.length ?? 0}
        open={openTools}
        onToggle={() => setOpenTools((v) => !v)}
        actions={
          displayOptions.hiddenTools.length > 0 ? (
            <button
              onClick={() => onUpdateDisplayOptions({ hiddenTools: [] })}
              className="text-[10.5px] text-[#38bdf8] hover:underline"
            >
              全表示
            </button>
          ) : undefined
        }
      >
        {parseResult && parseResult.detectedTools.length > 0 ? (
          <div className="space-y-1 max-h-48 overflow-y-auto pr-0.5">
            {parseResult.detectedTools.map((t) => {
              const visible = !displayOptions.hiddenTools.includes(t);
              const tSummary = parseResult.cycleTime.tools.find((x) => x.toolNumber === t);
              return (
                <label
                  key={t}
                  className={`flex items-center justify-between py-1 px-2 rounded border cursor-pointer transition-colors ${
                    visible
                      ? "bg-[#1e1e1e] border-[#2c2c2e] hover:border-[#424246]"
                      : "bg-[#19191b] border-[#242426] opacity-55 hover:opacity-85"
                  }`}
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
          <p className="text-[11px] text-[#787878] px-1">工具番号 (T) は検出されていません</p>
        )}
      </AccordionSection>

      {/* 4. 径補正番号 (D) */}
      {parseResult && parseResult.detectedDNumbers.length > 0 && (
        <AccordionSection
          title="径補正番号 (D)"
          badge={parseResult.detectedDNumbers.length}
          open={openDNums}
          onToggle={() => setOpenDNums((v) => !v)}
        >
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
        </AccordionSection>
      )}

      {/* 5. Z高さスライス */}
      <AccordionSection
        title="Z高さスライス"
        badge={displayOptions.zSliceEnabled ? "ON" : undefined}
        open={openZSlice || displayOptions.zSliceEnabled}
        onToggle={() => setOpenZSlice((v) => !v)}
        actions={
          <input
            type="checkbox"
            checked={displayOptions.zSliceEnabled}
            onChange={(e) => {
              const enabled = e.target.checked;
              if (enabled) setOpenZSlice(true);
              onUpdateDisplayOptions({
                zSliceEnabled: enabled,
                zSliceMin: enabled ? zMinBound : displayOptions.zSliceMin,
                zSliceMax: enabled ? zMaxBound : displayOptions.zSliceMax,
              });
            }}
            className="accent-[#0078d4] cursor-pointer"
            title="Z高さスライス表示を有効化"
          />
        }
      >
        <div className="bg-[#1e1e1e] border border-[#2f2f32] rounded-md p-2.5 space-y-2 font-mono text-[11px]">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-0.5">
              <span className="text-[10px] text-[#8e95a2]">Z下限 (mm)</span>
              <input
                type="number"
                step={1}
                disabled={!displayOptions.zSliceEnabled}
                value={displayOptions.zSliceMin}
                onChange={(e) =>
                  onUpdateDisplayOptions({ zSliceMin: parseFloat(e.target.value) || 0 })
                }
                className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-1.5 py-0.5 text-right text-white disabled:opacity-45 focus:outline-none focus:border-[#0078d4]"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] text-[#8e95a2]">Z上限 (mm)</span>
              <input
                type="number"
                step={1}
                disabled={!displayOptions.zSliceEnabled}
                value={displayOptions.zSliceMax}
                onChange={(e) =>
                  onUpdateDisplayOptions({ zSliceMax: parseFloat(e.target.value) || 0 })
                }
                className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-1.5 py-0.5 text-right text-white disabled:opacity-45 focus:outline-none focus:border-[#0078d4]"
              />
            </label>
          </div>
          <input
            type="range"
            min={zMinBound}
            max={zMaxBound}
            step={0.5}
            disabled={!displayOptions.zSliceEnabled}
            value={displayOptions.zSliceMax}
            onChange={(e) =>
              onUpdateDisplayOptions({ zSliceMax: parseFloat(e.target.value) })
            }
            className="w-full accent-[#38bdf8] h-1.5 disabled:opacity-40"
            title="Z上限スライダー"
          />
        </div>
      </AccordionSection>
    </div>
  );
};
