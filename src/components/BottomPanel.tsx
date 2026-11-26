import React from "react";
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Download,
  FileSpreadsheet,
  Info,
  Variable,
} from "lucide-react";
import {
  type ParseResult,
  type PathSegment,
  compModeLabel,
  formatDuration,
  getToolColor,
  motionTypeLabel,
} from "../types/nc";

export type BottomTab = "cycle" | "problems" | "modal" | "macros";

interface BottomPanelProps {
  activeTab: BottomTab;
  onChangeTab: (tab: BottomTab) => void;
  collapsed: boolean;
  heightPx: number;
  onToggleCollapse: () => void;
  parseResult: ParseResult | null;
  activeSegment: PathSegment | null;
  programFilterLabel?: string | null;
  onJumpToLine: (lineNumber: number) => void;
  onExportCsv: () => void;
  onExportHtml: () => void;
}

export const BottomPanel: React.FC<BottomPanelProps> = ({
  activeTab,
  onChangeTab,
  collapsed,
  heightPx,
  onToggleCollapse,
  parseResult,
  activeSegment,
  programFilterLabel,
  onJumpToLine,
  onExportCsv,
  onExportHtml,
}) => {
  const diagnostics = parseResult?.diagnostics ?? [];
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warnCount = diagnostics.filter((d) => d.severity === "warning").length;
  const macroVars = parseResult?.macroVariables ?? [];
  const ct = parseResult?.cycleTime;
  const bb = parseResult?.boundingBox;

  const totalSec = Math.max(ct?.totalTimeSec ?? 0, 0.001);
  const cutPct = ((ct?.cutTimeSec ?? 0) / totalSec) * 100;
  const rapidPct = ((ct?.rapidTimeSec ?? 0) / totalSec) * 100;
  const tcPct = ((ct?.toolChangeTimeSec ?? 0) / totalSec) * 100;
  const dwellPct = ((ct?.dwellTimeSec ?? 0) / totalSec) * 100;

  return (
    <div
      style={collapsed ? undefined : { height: heightPx }}
      className={`bg-[#181818] border-t border-[#2b2b2b] flex flex-col shrink-0 ${
        collapsed ? "h-8" : ""
      }`}
    >
      {/* タブバー */}
      <div className="h-8 px-3 bg-[#181818] border-b border-[#2b2b2b] flex items-center justify-between text-[11.5px] shrink-0">
        <div className="flex items-center gap-4 h-full">
          <button
            onClick={() => {
              onChangeTab("cycle");
              if (collapsed) onToggleCollapse();
            }}
            className={`h-full flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === "cycle" && !collapsed
                ? "border-[#007acc] text-white"
                : "border-transparent text-[#969696] hover:text-[#cccccc]"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            サイクルタイム & 工具サマリー
          </button>

          <button
            onClick={() => {
              onChangeTab("problems");
              if (collapsed) onToggleCollapse();
            }}
            className={`h-full flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === "problems" && !collapsed
                ? "border-[#007acc] text-white"
                : "border-transparent text-[#969696] hover:text-[#cccccc]"
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            問題・警告
            {(errorCount > 0 || warnCount > 0) && (
              <span
                className={`px-1.5 py-0 rounded-full text-[10px] font-mono ${
                  errorCount > 0
                    ? "bg-[#f87171]/25 text-[#fca5a5]"
                    : "bg-[#fbbf24]/25 text-[#fde68a]"
                }`}
              >
                {errorCount + warnCount}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              onChangeTab("modal");
              if (collapsed) onToggleCollapse();
            }}
            className={`h-full flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === "modal" && !collapsed
                ? "border-[#007acc] text-white"
                : "border-transparent text-[#969696] hover:text-[#cccccc]"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            モーダル状態・座標
          </button>

          <button
            onClick={() => {
              onChangeTab("macros");
              if (collapsed) onToggleCollapse();
            }}
            className={`h-full flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === "macros" && !collapsed
                ? "border-[#007acc] text-white"
                : "border-transparent text-[#969696] hover:text-[#cccccc]"
            }`}
          >
            <Variable className="w-3.5 h-3.5" />
            マクロ変数
            {macroVars.length > 0 && (
              <span className="px-1.5 py-0 rounded-full text-[10px] font-mono bg-[#c084fc]/20 text-[#e9d5ff]">
                {macroVars.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {programFilterLabel && (
            <span className="px-2 py-0.5 rounded bg-[#094771]/70 border border-[#0078d4]/60 text-[10.5px] font-mono text-[#7dd3fc]">
              対象: {programFilterLabel}
            </span>
          )}
          {parseResult && (
            <>
              <button
                onClick={onExportCsv}
                className="px-2 py-0.5 rounded bg-[#2d2d2d] hover:bg-[#3c3c3c] border border-[#3c3c3c] text-[10.5px] text-[#cccccc] flex items-center gap-1"
                title="工具サマリーとサイクルタイムをCSVで保存"
              >
                <FileSpreadsheet className="w-3 h-3 text-[#4ade80]" />
                CSV出力
              </button>
              <button
                onClick={onExportHtml}
                className="px-2 py-0.5 rounded bg-[#2d2d2d] hover:bg-[#3c3c3c] border border-[#3c3c3c] text-[10.5px] text-[#cccccc] flex items-center gap-1"
                title="印刷対応のHTML加工レポートを保存"
              >
                <Download className="w-3 h-3 text-[#38bdf8]" />
                HTMLレポート
              </button>
            </>
          )}
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded hover:bg-[#3c3c3c] text-[#cccccc]"
            title={collapsed ? "パネルを開く" : "パネルを折りたたむ"}
          >
            {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ボディ */}
      {!collapsed && (
        <div className="flex-1 overflow-auto p-3 text-xs">
          {activeTab === "cycle" && ct && (
            <div className="space-y-3">
              <div className="grid grid-cols-5 gap-2.5">
                <div className="bg-[#252526] border border-[#3c3c3c] rounded p-2">
                  <div className="text-[10.5px] text-[#94a3b8]">総サイクルタイム</div>
                  <div className="text-base font-mono font-bold text-[#38bdf8]">
                    {formatDuration(ct.totalTimeSec)}
                  </div>
                </div>
                <div className="bg-[#252526] border border-[#3c3c3c] rounded p-2">
                  <div className="text-[10.5px] text-[#94a3b8]">切削時間 / 距離</div>
                  <div className="font-mono text-[#4ade80] font-semibold">
                    {formatDuration(ct.cutTimeSec)}{" "}
                    <span className="text-[10.5px] text-[#94a3b8]">
                      ({ct.totalCutDistanceMm.toFixed(1)}mm)
                    </span>
                  </div>
                </div>
                <div className="bg-[#252526] border border-[#3c3c3c] rounded p-2">
                  <div className="text-[10.5px] text-[#94a3b8]">早送り時間 / 距離</div>
                  <div className="font-mono text-[#f87171] font-semibold">
                    {formatDuration(ct.rapidTimeSec)}{" "}
                    <span className="text-[10.5px] text-[#94a3b8]">
                      ({ct.totalRapidDistanceMm.toFixed(1)}mm)
                    </span>
                  </div>
                </div>
                <div className="bg-[#252526] border border-[#3c3c3c] rounded p-2">
                  <div className="text-[10.5px] text-[#94a3b8]">工具交換 (ATC)</div>
                  <div className="font-mono text-[#fbbf24] font-semibold">
                    {ct.toolChanges}回 ({formatDuration(ct.toolChangeTimeSec)})
                  </div>
                </div>
                <div className="bg-[#252526] border border-[#3c3c3c] rounded p-2">
                  <div className="text-[10.5px] text-[#94a3b8]">加工範囲 (X × Y × Z)</div>
                  <div className="font-mono text-[11px] text-[#e2e8f0]">
                    {bb?.valid
                      ? `${(bb.max.x - bb.min.x).toFixed(1)} × ${(bb.max.y - bb.min.y).toFixed(1)} × ${(bb.max.z - bb.min.z).toFixed(1)}`
                      : "-"}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="h-2 w-full bg-[#252526] rounded overflow-hidden flex">
                  <div
                    style={{ width: `${cutPct}%` }}
                    className="bg-[#4ade80]"
                    title={`切削 ${cutPct.toFixed(1)}%`}
                  />
                  <div
                    style={{ width: `${rapidPct}%` }}
                    className="bg-[#f87171]"
                    title={`早送り ${rapidPct.toFixed(1)}%`}
                  />
                  <div
                    style={{ width: `${tcPct}%` }}
                    className="bg-[#fbbf24]"
                    title={`ATC ${tcPct.toFixed(1)}%`}
                  />
                  <div
                    style={{ width: `${dwellPct}%` }}
                    className="bg-[#c084fc]"
                    title={`ドウェル ${dwellPct.toFixed(1)}%`}
                  />
                </div>
                <div className="flex items-center gap-4 text-[10px] text-[#8e95a2] font-mono">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-[#4ade80]" /> 切削 {cutPct.toFixed(0)}%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-[#f87171]" /> 早送り{" "}
                    {rapidPct.toFixed(0)}%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-[#fbbf24]" /> ATC {tcPct.toFixed(0)}%
                  </span>
                  {dwellPct > 0.1 && (
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-sm bg-[#c084fc]" /> ドウェル{" "}
                      {dwellPct.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>

              <table className="w-full text-left border-collapse font-mono text-[11.5px]">
                <thead>
                  <tr className="border-b border-[#3c3c3c] text-[#94a3b8] text-[10.5px]">
                    <th className="py-1 pr-3">工具</th>
                    <th className="py-1 pr-3">D番号 / 径</th>
                    <th className="py-1 pr-3 text-right">切削距離</th>
                    <th className="py-1 pr-3 text-right">早送り距離</th>
                    <th className="py-1 pr-3 text-right">切削時間</th>
                    <th className="py-1 pr-3 text-right">合計時間</th>
                    <th className="py-1 pr-3 text-right">最小Z</th>
                    <th className="py-1">コメント</th>
                  </tr>
                </thead>
                <tbody>
                  {ct.tools.map((t) => (
                    <tr
                      key={t.toolNumber}
                      className="border-b border-[#2d2d2d] hover:bg-[#2a2d2e]"
                    >
                      <td className="py-1 pr-3 font-semibold flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: getToolColor(t.toolNumber) }}
                        />
                        T{String(t.toolNumber).padStart(2, "0")}
                      </td>
                      <td className="py-1 pr-3 text-[#cbd5e1]">
                        {t.dNumbers.length > 0
                          ? t.dNumbers.map((d) => `D${String(d).padStart(2, "0")}`).join(",")
                          : "-"}{" "}
                        {t.toolDiameter > 0 ? `(Ø${t.toolDiameter.toFixed(1)})` : ""}
                      </td>
                      <td className="py-1 pr-3 text-right">{t.cutDistanceMm.toFixed(1)} mm</td>
                      <td className="py-1 pr-3 text-right text-[#94a3b8]">
                        {t.rapidDistanceMm.toFixed(1)} mm
                      </td>
                      <td className="py-1 pr-3 text-right text-[#4ade80]">
                        {formatDuration(t.cutTimeSec)}
                      </td>
                      <td className="py-1 pr-3 text-right text-[#38bdf8] font-semibold">
                        {formatDuration(t.totalTimeSec)}
                      </td>
                      <td className="py-1 pr-3 text-right text-[#fbbf24]">
                        {t.minZ.toFixed(2)}
                      </td>
                      <td className="py-1 text-[#858585] font-sans truncate max-w-[240px]">
                        {t.commentHint ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "problems" && (
            <div className="space-y-1">
              {diagnostics.length === 0 ? (
                <div className="text-[#4ade80] py-4 text-center">
                  エラーや警告は検出されませんでした。
                </div>
              ) : (
                diagnostics.map((d, idx) => (
                  <button
                    key={`${d.lineNumber}-${d.code}-${idx}`}
                    onClick={() => onJumpToLine(d.lineNumber)}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-[#2a2d2e] flex items-start gap-2 border border-transparent hover:border-[#3c3c3c]"
                  >
                    {d.severity === "error" ? (
                      <AlertCircle className="w-4 h-4 text-[#f87171] shrink-0 mt-0.5" />
                    ) : d.severity === "warning" ? (
                      <AlertTriangle className="w-4 h-4 text-[#fbbf24] shrink-0 mt-0.5" />
                    ) : (
                      <Info className="w-4 h-4 text-[#38bdf8] shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[#e2e8f0]">{d.message}</div>
                      <div className="text-[10.5px] font-mono text-[#858585]">
                        [{d.code}] 行 {d.lineNumber}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {activeTab === "modal" && (
            <div>
              {activeSegment ? (
                <div className="grid grid-cols-3 gap-3 font-mono text-[11.5px]">
                  <div className="bg-[#252526] border border-[#3c3c3c] rounded p-2.5 space-y-1">
                    <div className="text-[10.5px] text-[#9cdcfe] font-sans font-semibold mb-1">
                      現在ブロック & 座標
                    </div>
                    <div>
                      行番号: <span className="text-white">{activeSegment.lineNumber}</span> (
                      {motionTypeLabel(activeSegment.motionType)})
                    </div>
                    <div>
                      現在位置: <span className="text-[#f87171]">X{activeSegment.end.x.toFixed(3)}</span>{" "}
                      <span className="text-[#4ade80]">Y{activeSegment.end.y.toFixed(3)}</span>{" "}
                      <span className="text-[#60a5fa]">Z{activeSegment.end.z.toFixed(3)}</span>
                    </div>
                    <div>
                      移動量: ΔX{(activeSegment.end.x - activeSegment.start.x).toFixed(3)} ΔY
                      {(activeSegment.end.y - activeSegment.start.y).toFixed(3)} ΔZ
                      {(activeSegment.end.z - activeSegment.start.z).toFixed(3)}
                    </div>
                    <div>
                      距離: {activeSegment.lengthMm.toFixed(3)} mm / 所要:{" "}
                      {activeSegment.durationSec.toFixed(3)} s
                    </div>
                  </div>

                  <div className="bg-[#252526] border border-[#3c3c3c] rounded p-2.5 space-y-1">
                    <div className="text-[10.5px] text-[#9cdcfe] font-sans font-semibold mb-1">
                      有効モーダル Gコード
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        activeSegment.modalState.motionCode,
                        activeSegment.modalState.plane,
                        activeSegment.modalState.distanceMode,
                        activeSegment.modalState.workOffset,
                        activeSegment.modalState.lengthComp,
                        activeSegment.modalState.cannedCycle,
                        activeSegment.modalState.unitMode,
                      ].map((code) => (
                        <span
                          key={code}
                          className="px-1.5 py-0.5 rounded bg-[#094771]/70 text-[#7dd3fc] border border-[#007acc]/50"
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                    <div className="pt-1">
                      径補正:{" "}
                      <span className="text-[#f0abfc]">
                        {compModeLabel(activeSegment.modalState.compMode)}
                      </span>
                    </div>
                  </div>

                  <div className="bg-[#252526] border border-[#3c3c3c] rounded p-2.5 space-y-1">
                    <div className="text-[10.5px] text-[#9cdcfe] font-sans font-semibold mb-1">
                      工具・送り・主軸
                    </div>
                    <div>
                      工具: T{String(activeSegment.modalState.toolNumber).padStart(2, "0")} / H
                      {String(activeSegment.modalState.hNumber).padStart(2, "0")} / D
                      {String(activeSegment.modalState.dNumber).padStart(2, "0")} (Ø
                      {activeSegment.modalState.toolDiameter.toFixed(2)}mm)
                    </div>
                    <div>送り速度: F{activeSegment.modalState.feedRate.toFixed(1)} mm/min</div>
                    <div>主軸回転: S{activeSegment.modalState.spindleSpeed.toFixed(0)} rpm</div>
                    <div>累積時間: {formatDuration(activeSegment.cumulativeTimeSec)}</div>
                  </div>
                </div>
              ) : (
                <div className="text-[#858585] py-4 text-center">
                  ブロックを選択またはトレースを実行するとモーダル状態が表示されます。
                </div>
              )}
            </div>
          )}

          {activeTab === "macros" && (
            <div className="space-y-2">
              <div className="text-[11px] text-[#94a3b8] flex items-center justify-between">
                <span>
                  カスタムマクロB 実行後変数スナップショット（展開実行ブロック数:{" "}
                  <strong className="font-mono text-[#e2e8f0]">
                    {parseResult?.expandedBlockCount ?? 0}
                  </strong>
                  ）
                </span>
              </div>
              {macroVars.length === 0 ? (
                <div className="text-[#858585] py-4 text-center">
                  マクロ変数の代入は検出されていません（上部の「マクロデモ」でカスタムマクロB＋サブプログラムを試せます）。
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2 font-mono text-[11.5px]">
                  {macroVars.map((v) => (
                    <div
                      key={v.number}
                      className="bg-[#252526] border border-[#3c3c3c] rounded px-2.5 py-1.5 flex items-center justify-between"
                    >
                      <div>
                        <span className="text-[#f472b6] font-bold">#{v.number}</span>
                        <span className="ml-1.5 text-[10px] text-[#858585] font-sans">
                          {v.scope}
                        </span>
                      </div>
                      <span className="text-[#e2e8f0]">{v.value.toFixed(4).replace(/\.?0+$/, "")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
