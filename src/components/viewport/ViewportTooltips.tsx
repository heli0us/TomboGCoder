import React from "react";
import { Ruler, X } from "lucide-react";
import {
  type PathSegment,
  type Point3,
  compModeLabel,
  motionTypeLabel,
} from "../../types/nc";
import { type OutlineRole, type SnapPoint, snapKindLabel } from "../../utils/toolpathGeometry";

export interface HoverInfo {
  segment: PathSegment;
  hitRole: "center" | OutlineRole;
  x: number;
  y: number;
}

export interface ActiveSnapHover {
  snap: SnapPoint;
  x: number;
  y: number;
}

export interface MeasurementStats {
  a: Point3;
  b: Point3;
  dx: number;
  dy: number;
  dz: number;
  dist3d: number;
  distXY: number;
  angleDeg: number;
}

interface ViewportTooltipsProps {
  containerWidth: number;
  containerHeight: number;
  showToolWidthFill: boolean;
  measureMode: boolean;
  measurePoints: SnapPoint[];
  measureAnchor: { x: number; y: number } | null;
  measurementStats: MeasurementStats | null;
  snapHover: ActiveSnapHover | null;
  hoverInfo: HoverInfo | null;
  onClearMeasurePoints: () => void;
}

export const ViewportTooltips: React.FC<ViewportTooltipsProps> = ({
  containerWidth,
  containerHeight,
  showToolWidthFill,
  measureMode,
  measurePoints,
  measureAnchor,
  measurementStats,
  snapHover,
  hoverInfo,
  onClearMeasurePoints,
}) => {
  return (
    <>
      {/* 2点確定時の固定計測ツールチップ（2点目クリック位置にフル情報を表示） */}
      {measureMode && measurementStats && measureAnchor && (() => {
        const boxW = 290;
        const boxH = 104;
        const p1Kind = snapKindLabel(measurePoints[0].kind);
        const p2Kind = snapKindLabel(measurePoints[1].kind);
        return (
          <div
            className="pointer-events-auto absolute z-30 w-[290px] bg-[#1c1d21]/95 border border-[#f97316] rounded-md px-2.5 py-1.5 text-[10.5px] font-mono shadow-2xl backdrop-blur-md space-y-1"
            style={{
              left: Math.min(measureAnchor.x + 14, Math.max(12, containerWidth - boxW - 12)),
              top: Math.max(
                48,
                Math.min(measureAnchor.y - boxH - 8, containerHeight - boxH - 64),
              ),
            }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[#32363f] pb-1">
              <span className="text-[#fb923c] font-bold flex items-center gap-1 text-[11px]">
                <Ruler className="w-3 h-3" />
                長さ{" "}
                <span className="text-[#fbbf24] text-xs">
                  {measurementStats.dist3d.toFixed(3)} mm
                </span>
              </span>
              <button
                onClick={onClearMeasurePoints}
                className="text-[#8e95a2] hover:text-white p-0.5 rounded hover:bg-[#2f333c]"
                title="計測点を解除（余白クリックでも解除できます）"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="text-[#e2e8f0] flex items-center gap-2.5">
              <span>
                <span className="text-[#f87171]">ΔX</span> {measurementStats.dx.toFixed(3)}
              </span>
              <span>
                <span className="text-[#4ade80]">ΔY</span> {measurementStats.dy.toFixed(3)}
              </span>
              <span>
                <span className="text-[#60a5fa]">ΔZ</span> {measurementStats.dz.toFixed(3)}
              </span>
            </div>
            <div className="text-[#cbd5e1] text-[10px]">
              XY{" "}
              <span className="text-[#38bdf8] font-semibold">
                {measurementStats.distXY.toFixed(3)}
              </span>
              mm
              <span className="text-[#6e7681] mx-1.5">|</span>
              角度 <span className="text-[#fef08a]">{measurementStats.angleDeg.toFixed(2)}°</span>
            </div>
            <div className="text-[9.5px] text-[#94a3b8] border-t border-[#2a2d36] pt-1 space-y-0.5 leading-tight">
              <div className="truncate">
                P1[{p1Kind}] X{measurementStats.a.x.toFixed(3)} Y{measurementStats.a.y.toFixed(3)} Z
                {measurementStats.a.z.toFixed(3)}
              </div>
              <div className="truncate">
                P2[{p2Kind}] X{measurementStats.b.x.toFixed(3)} Y{measurementStats.b.y.toFixed(3)} Z
                {measurementStats.b.z.toFixed(3)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* スナップカーソルバッジ（1点目選択中は ΔX/ΔY/ΔZ・距離・角度をライブ表示） */}
      {measureMode && snapHover && measurePoints.length < 2 && (() => {
        const p1 = measurePoints.length === 1 ? measurePoints[0].pos : null;
        const p2 = snapHover.snap.pos;
        const dx = p1 ? p2.x - p1.x : 0;
        const dy = p1 ? p2.y - p1.y : 0;
        const dz = p1 ? p2.z - p1.z : 0;
        const dist3d = p1 ? Math.hypot(dx, dy, dz) : 0;
        const distXY = p1 ? Math.hypot(dx, dy) : 0;
        const angleDeg = p1 ? (Math.atan2(dy, dx) * 180) / Math.PI : 0;
        const boxW = p1 ? 264 : 225;
        const boxH = p1 ? 74 : 28;
        return (
          <div
            className="pointer-events-none absolute z-30 bg-[#1c1d21]/95 border border-[#facc15] rounded-md px-2.5 py-1 text-[10.5px] font-mono shadow-xl backdrop-blur-md space-y-0.5"
            style={{
              left: Math.min(snapHover.x + 14, Math.max(12, containerWidth - boxW - 12)),
              top: Math.max(12, Math.min(snapHover.y - boxH - 8, containerHeight - boxH - 12)),
            }}
          >
            <div className="text-[#fef08a]">
              [{snapKindLabel(snapHover.snap.kind)}] X{p2.x.toFixed(3)} Y{p2.y.toFixed(3)} Z
              {p2.z.toFixed(3)}
            </div>
            {p1 && (
              <>
                <div className="text-[#e2e8f0] border-t border-[#32363f] pt-0.5 flex items-center gap-2">
                  <span>
                    <span className="text-[#f87171]">ΔX</span> {dx.toFixed(3)}
                  </span>
                  <span>
                    <span className="text-[#4ade80]">ΔY</span> {dy.toFixed(3)}
                  </span>
                  <span>
                    <span className="text-[#60a5fa]">ΔZ</span> {dz.toFixed(3)}
                  </span>
                </div>
                <div className="text-[#cbd5e1] text-[10px]">
                  長さ <span className="text-[#fbbf24] font-semibold">{dist3d.toFixed(3)}</span>mm
                  <span className="text-[#6e7681] mx-1">|</span>
                  XY <span className="text-[#38bdf8]">{distXY.toFixed(3)}</span>mm (
                  {angleDeg.toFixed(1)}°)
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* マウスホバー・ナビゲーション ツールチップ（画面端クランプ付き） */}
      {!measureMode && hoverInfo && (
        <div
          className="pointer-events-none absolute z-30 w-80 bg-[#1c1d21]/95 border border-[#38bdf8]/75 rounded-md shadow-2xl p-2.5 text-[11px] font-mono text-[#e2e8f0] backdrop-blur-md"
          style={{
            left: Math.min(hoverInfo.x + 16, Math.max(12, containerWidth - 332)),
            top: Math.min(
              Math.max(48, hoverInfo.y - 16),
              Math.max(48, containerHeight - 320),
            ),
          }}
        >
          <div className="flex items-center justify-between border-b border-[#32363f] pb-1 mb-1.5">
            <span className="text-[#38bdf8] font-bold">
              行 {hoverInfo.segment.lineNumber} — {motionTypeLabel(hoverInfo.segment.motionType)}
            </span>
            <span className="text-[#fbbf24]">
              T{String(hoverInfo.segment.toolNumber).padStart(2, "0")}
              {hoverInfo.segment.modalState.toolDiameter > 0
                ? ` (Ø${hoverInfo.segment.modalState.toolDiameter})`
                : ""}
            </span>
          </div>
          <div className="text-[#9cdcfe] truncate mb-1.5 bg-[#252830] px-1.5 py-0.5 rounded text-[10.5px]">
            {hoverInfo.segment.rawLine.trim()}
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10.5px]">
            <span className="text-[#94a3b8]">プログラム:</span>
            <span className="text-[#dcdcaa]">{hoverInfo.segment.programNumber}</span>
            <span className="text-[#94a3b8]">始点:</span>
            <span>
              {hoverInfo.segment.start.x.toFixed(2)}, {hoverInfo.segment.start.y.toFixed(2)},{" "}
              {hoverInfo.segment.start.z.toFixed(2)}
            </span>
            <span className="text-[#94a3b8]">終点:</span>
            <span>
              {hoverInfo.segment.end.x.toFixed(2)}, {hoverInfo.segment.end.y.toFixed(2)},{" "}
              {hoverInfo.segment.end.z.toFixed(2)}
            </span>
            <span className="text-[#94a3b8]">距離 / 時間:</span>
            <span>
              {hoverInfo.segment.lengthMm.toFixed(2)}mm / {hoverInfo.segment.durationSec.toFixed(2)}s
            </span>
            <span className="text-[#94a3b8]">径補正 / D:</span>
            <span>
              {compModeLabel(hoverInfo.segment.compMode)} (D
              {String(hoverInfo.segment.dNumber).padStart(2, "0")})
            </span>
            <span className="text-[#94a3b8]">送り / 回転:</span>
            <span>
              F{hoverInfo.segment.feedRate.toFixed(0)} / S{hoverInfo.segment.spindleSpeed.toFixed(0)}
            </span>
            {hoverInfo.segment.arcRadius !== null && (() => {
              const arcR = hoverInfo.segment.arcRadius;
              const arcD = arcR * 2;
              const toolDia = hoverInfo.segment.modalState.toolDiameter;
              const outerD = arcD + toolDia;
              const outerR = outerD * 0.5;
              const innerD = arcD - toolDia;
              const innerR = innerD * 0.5;
              const hitRole = hoverInfo.hitRole;
              return (
                <div className="col-span-2 mt-1 pt-1 border-t border-[#2a2e38] space-y-0.5">
                  <div
                    className={`flex items-center justify-between px-1.5 py-0.5 rounded ${
                      hitRole === "center" ? "bg-white/10" : ""
                    }`}
                  >
                    <span className="text-[#cbd5e1] flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-white shrink-0" />
                      円弧 R / Ø
                    </span>
                    <span className="text-white font-semibold">
                      R{arcR.toFixed(3)} / Ø{arcD.toFixed(3)}
                    </span>
                  </div>
                  {showToolWidthFill && toolDia > 0 && (
                    <>
                      <div
                        className={`flex items-center justify-between px-1.5 py-0.5 rounded ${
                          hitRole === "outer"
                            ? "bg-[#38bdf8]/20 ring-1 ring-[#38bdf8]/60"
                            : ""
                        }`}
                      >
                        <span className="text-[#7dd3fc] flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#38bdf8] shrink-0" />
                          工具込 外径
                        </span>
                        <span className="text-[#38bdf8] font-semibold">
                          Ø{outerD.toFixed(3)}{" "}
                          <span className="text-[#94a3b8] font-normal">(R{outerR.toFixed(3)})</span>
                        </span>
                      </div>
                      <div
                        className={`flex items-center justify-between px-1.5 py-0.5 rounded ${
                          hitRole === "inner"
                            ? "bg-[#c084fc]/20 ring-1 ring-[#c084fc]/60"
                            : ""
                        }`}
                      >
                        <span className="text-[#d8b4fe] flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#c084fc] shrink-0" />
                          工具込 内径
                        </span>
                        <span className="text-[#c084fc] font-semibold">
                          {innerD > 1e-4 ? (
                            <>
                              Ø{innerD.toFixed(3)}{" "}
                              <span className="text-[#94a3b8] font-normal">
                                (R{innerR.toFixed(3)})
                              </span>
                            </>
                          ) : (
                            <span className="text-[#787878] font-normal">— (中心削切)</span>
                          )}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
            {hoverInfo.segment.arcCenter && (
              <>
                <span className="text-[#94a3b8]">円中心 (XYZ):</span>
                <span className="text-[#facc15]">
                  {hoverInfo.segment.arcCenter.x.toFixed(3)},{" "}
                  {hoverInfo.segment.arcCenter.y.toFixed(3)},{" "}
                  {hoverInfo.segment.arcCenter.z.toFixed(3)}
                </span>
                <span className="text-[#94a3b8]">中心増分 (IJK):</span>
                <span className="text-[#fde047]">
                  I{(hoverInfo.segment.arcCenter.x - hoverInfo.segment.start.x).toFixed(3)} J
                  {(hoverInfo.segment.arcCenter.y - hoverInfo.segment.start.y).toFixed(3)}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};
