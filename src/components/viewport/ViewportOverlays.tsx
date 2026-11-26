import React from "react";
import {
  Eye,
  Grid2x2,
  Hand,
  Maximize2,
  PaintBucket,
  Rotate3d,
  Ruler,
  ScanSearch,
  Scissors,
  X,
} from "lucide-react";
import {
  type CameraPreset,
  type DisplayOptions,
  type PathSegment,
  type Point3,
  compModeLabel,
  motionTypeLabel,
} from "../../types/nc";
import { type SnapPoint, snapKindLabel } from "../../utils/toolpathGeometry";

export type NavMode = "pan" | "orbit" | "windowZoom";

export interface HoverInfo {
  segment: PathSegment;
  x: number;
  y: number;
}

export interface ActiveSnapHover {
  snap: SnapPoint;
  x: number;
  y: number;
}

export interface ZoomBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface MeasurementStats {
  a: Point3;
  b: Point3;
  dx: number;
  dy: number;
  dz: number;
  dist3d: number;
  distXY: number;
  angleDeg: number;
}

interface ViewportOverlaysProps {
  containerWidth: number;
  containerHeight: number;
  displayOptions: DisplayOptions;
  onUpdateDisplayOptions: (patch: Partial<DisplayOptions>) => void;
  navMode: NavMode;
  onSelectNavMode: (mode: NavMode) => void;
  measureMode: boolean;
  onToggleMeasureMode: () => void;
  measurePoints: SnapPoint[];
  onClearMeasurePoints: () => void;
  measurementStats: MeasurementStats | null;
  snapHover: ActiveSnapHover | null;
  hoverInfo: HoverInfo | null;
  zoomBox: ZoomBox | null;
  onApplyCameraPreset: (preset: CameraPreset | "fit") => void;
}

export const ViewportOverlays: React.FC<ViewportOverlaysProps> = ({
  containerWidth,
  containerHeight,
  displayOptions,
  onUpdateDisplayOptions,
  navMode,
  onSelectNavMode,
  measureMode,
  onToggleMeasureMode,
  measurePoints,
  onClearMeasurePoints,
  measurementStats,
  snapHover,
  hoverInfo,
  zoomBox,
  onApplyCameraPreset,
}) => {
  return (
    <>
      {/* 窓ズーム選択矩形 */}
      {zoomBox && (
        <div
          className="pointer-events-none absolute z-30 border border-[#38bdf8] bg-[#38bdf8]/15 shadow-[0_0_0_1px_rgba(56,189,248,0.2)]"
          style={{
            left: Math.min(zoomBox.x0, zoomBox.x1),
            top: Math.min(zoomBox.y0, zoomBox.y1),
            width: Math.abs(zoomBox.x1 - zoomBox.x0),
            height: Math.abs(zoomBox.y1 - zoomBox.y0),
          }}
        />
      )}

      {/* 4面図モード時の境界線 & ラベル */}
      {displayOptions.quadView && (
        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#2f333c]" />
          <div className="absolute top-1/2 left-0 right-0 h-px bg-[#2f333c]" />
          <span className="absolute top-12 left-2.5 px-1.5 py-0.5 rounded bg-[#141519]/80 border border-[#2f333c] text-[10px] font-mono text-[#9cdcfe]">
            XY 上面 (平行)
          </span>
          <span className="absolute top-12 left-[calc(50%+10px)] px-1.5 py-0.5 rounded bg-[#141519]/80 border border-[#2f333c] text-[10px] font-mono text-[#9cdcfe]">
            ISO 3D (操作可)
          </span>
          <span className="absolute top-[calc(50%+8px)] left-2.5 px-1.5 py-0.5 rounded bg-[#141519]/80 border border-[#2f333c] text-[10px] font-mono text-[#9cdcfe]">
            XZ 正面 (平行)
          </span>
          <span className="absolute top-[calc(50%+8px)] left-[calc(50%+10px)] px-1.5 py-0.5 rounded bg-[#141519]/80 border border-[#2f333c] text-[10px] font-mono text-[#9cdcfe]">
            YZ 側面 (平行)
          </span>
        </div>
      )}

      {/* 上部フローティング HUD：狭い幅でも重ならないフレックス配置 */}
      <div className="pointer-events-none absolute top-2.5 left-2.5 right-2.5 z-20 flex flex-wrap items-center justify-between gap-2">
        {/* 左グループ：AutoCAD操作モード & クイック検証ツール */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 bg-[#1f2126]/90 border border-[#32363f] rounded-md px-1.5 py-1 text-[11px] shadow-md backdrop-blur-md">
          {(
            [
              ["pan", Hand, "移動", "左/中ドラッグで移動、Shift+ドラッグ/右ドラッグで3D回転"],
              ["orbit", Rotate3d, "回転", "左ドラッグで3D回転、中ドラッグで移動"],
              ["windowZoom", ScanSearch, "窓ズーム", "左ドラッグで矩形拡大 (Escで解除)"],
            ] as const
          ).map(([mode, Icon, label, title]) => (
            <button
              key={mode}
              onClick={() => onSelectNavMode(mode)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
                !measureMode && navMode === mode
                  ? "bg-[#0078d4] text-white font-medium shadow-sm"
                  : "text-[#cccccc] hover:bg-[#2f333c]"
              }`}
              title={title}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}

          <div className="w-px h-3.5 bg-[#353944] mx-0.5" />

          <button
            onClick={() =>
              onUpdateDisplayOptions({ showProgramPath: !displayOptions.showProgramPath })
            }
            className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
              displayOptions.showProgramPath
                ? "bg-[#e879f9]/20 text-[#f0abfc] ring-1 ring-[#e879f9]/40"
                : "text-[#8e95a2] hover:text-[#e2e8f0] hover:bg-[#2f333c]"
            }`}
            title="G41/G42 補正前プログラムパスの重ね表示切替"
          >
            <Scissors className="w-3 h-3" />
            補正前
          </button>

          <button
            onClick={() =>
              onUpdateDisplayOptions({ showToolWidthFill: !displayOptions.showToolWidthFill })
            }
            className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
              displayOptions.showToolWidthFill
                ? "bg-[#38bdf8]/20 text-[#7dd3fc] ring-1 ring-[#38bdf8]/40"
                : "text-[#8e95a2] hover:text-[#e2e8f0] hover:bg-[#2f333c]"
            }`}
            title="T番号の工具径幅で切削軌跡を塗りつぶし（削り残し・干渉確認）"
          >
            <PaintBucket className="w-3 h-3" />
            工具幅
          </button>

          <button
            onClick={() =>
              onUpdateDisplayOptions({ traceClipFuture: !displayOptions.traceClipFuture })
            }
            className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
              displayOptions.traceClipFuture
                ? "bg-[#0078d4]/30 text-[#7dd3fc] ring-1 ring-[#38bdf8]/40"
                : "text-[#8e95a2] hover:text-[#e2e8f0] hover:bg-[#2f333c]"
            }`}
            title="現在トレース位置までのみを描画"
          >
            <Eye className="w-3 h-3" />
            軌跡クリップ
          </button>

          <div className="w-px h-3.5 bg-[#353944] mx-0.5" />

          <button
            onClick={onToggleMeasureMode}
            className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
              measureMode
                ? "bg-[#ea580c] text-white font-medium shadow-sm"
                : "text-[#cccccc] hover:bg-[#2f333c]"
            }`}
            title="端点・中点・円弧中心スナップによる2点間距離計測 (Escで終了)"
          >
            <Ruler className="w-3 h-3" />
            計測
          </button>
        </div>

        {/* 右グループ：視点プリセット & 4面図 */}
        <div className="pointer-events-auto flex items-center gap-0.5 bg-[#1f2126]/90 border border-[#32363f] rounded-md px-1.5 py-1 text-[11px] shadow-md backdrop-blur-md">
          {(
            [
              ["iso", "ISO"],
              ["top", "XY"],
              ["front", "XZ"],
              ["right", "YZ"],
            ] as const
          ).map(([preset, label]) => (
            <button
              key={preset}
              onClick={() => {
                if (displayOptions.quadView) {
                  onUpdateDisplayOptions({ quadView: false });
                }
                onApplyCameraPreset(preset);
              }}
              className="px-2 py-0.5 rounded hover:bg-[#2f333c] text-[#cccccc] hover:text-white transition-colors font-mono"
              title={`${label}視点へ切替`}
            >
              {label}
            </button>
          ))}
          <div className="w-px h-3.5 bg-[#353944] mx-0.5" />
          <button
            onClick={() => onUpdateDisplayOptions({ quadView: !displayOptions.quadView })}
            className={`px-2 py-0.5 rounded flex items-center gap-1 transition-colors ${
              displayOptions.quadView
                ? "bg-[#0078d4] text-white"
                : "text-[#cccccc] hover:bg-[#2f333c]"
            }`}
            title="4面図表示の切替 (XY / XZ / YZ / ISO)"
          >
            <Grid2x2 className="w-3.5 h-3.5" />
            4面
          </button>
          <button
            onClick={() => onApplyCameraPreset("fit")}
            className="p-1 rounded hover:bg-[#2f333c] text-[#cccccc] hover:text-white"
            title="全体フィット (F / 中Wクリック)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 計測モード結果パネル */}
      {measureMode && (
        <div className="absolute top-14 left-2.5 z-20 w-72 bg-[#1c1d21]/95 border border-[#ea580c] rounded-md shadow-xl p-2.5 text-[11px] font-mono backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-[#32363f] pb-1.5 mb-1.5">
            <span className="text-[#fb923c] font-bold flex items-center gap-1.5">
              <Ruler className="w-3.5 h-3.5" /> スナップ2点間計測
            </span>
            <button
              onClick={onToggleMeasureMode}
              className="text-[#94a3b8] hover:text-white"
              title="計測終了 (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {measurePoints.length === 0 && (
            <div className="text-[#94a3b8] font-sans leading-relaxed">
              パス上の端点（黄）・中点（青）・円弧中心（緑）をクリックして1点目を選択してください。
            </div>
          )}
          {measurePoints.length === 1 && (
            <div className="space-y-1">
              <div className="text-[#cbd5e1]">
                P1 ({snapKindLabel(measurePoints[0].kind)}):{" "}
                {measurePoints[0].pos.x.toFixed(3)}, {measurePoints[0].pos.y.toFixed(3)},{" "}
                {measurePoints[0].pos.z.toFixed(3)}
              </div>
              <div className="text-[#fb923c] font-sans">2点目をクリックしてください...</div>
            </div>
          )}
          {measurementStats && (
            <div className="space-y-1 text-[11px]">
              <div className="text-[#e2e8f0] text-xs font-bold">
                3D距離:{" "}
                <span className="text-[#fbbf24]">{measurementStats.dist3d.toFixed(3)} mm</span>
              </div>
              <div className="text-[#cbd5e1]">
                XY平面:{" "}
                <span className="text-[#38bdf8]">{measurementStats.distXY.toFixed(3)} mm</span> (
                {measurementStats.angleDeg.toFixed(2)}°)
              </div>
              <div className="text-[#94a3b8]">
                ΔX: {measurementStats.dx.toFixed(3)} / ΔY: {measurementStats.dy.toFixed(3)} / ΔZ:{" "}
                {measurementStats.dz.toFixed(3)}
              </div>
              <div className="text-[10px] text-[#64748b] pt-1 border-t border-[#2f333c]">
                P1 ({measurementStats.a.x.toFixed(2)}, {measurementStats.a.y.toFixed(2)},{" "}
                {measurementStats.a.z.toFixed(2)}) → P2 ({measurementStats.b.x.toFixed(2)},{" "}
                {measurementStats.b.y.toFixed(2)}, {measurementStats.b.z.toFixed(2)})
              </div>
              <button
                onClick={onClearMeasurePoints}
                className="mt-1 text-[10.5px] text-[#38bdf8] hover:underline font-sans"
              >
                クリアして再計測
              </button>
            </div>
          )}
        </div>
      )}

      {/* スナップカーソルバッジ */}
      {measureMode && snapHover && (
        <div
          className="pointer-events-none absolute z-30 bg-[#1c1d21]/95 border border-[#facc15] rounded px-2 py-0.5 text-[10.5px] font-mono text-[#fef08a] shadow-lg"
          style={{
            left: Math.min(snapHover.x + 12, Math.max(12, containerWidth - 220)),
            top: Math.max(12, snapHover.y - 28),
          }}
        >
          [{snapKindLabel(snapHover.snap.kind)}] X{snapHover.snap.pos.x.toFixed(2)} Y
          {snapHover.snap.pos.y.toFixed(2)} Z{snapHover.snap.pos.z.toFixed(2)}
        </div>
      )}

      {/* マウスホバー・ナビゲーション ツールチップ（画面端クランプ付き） */}
      {!measureMode && hoverInfo && (
        <div
          className="pointer-events-none absolute z-30 w-72 bg-[#1c1d21]/95 border border-[#38bdf8]/75 rounded-md shadow-2xl p-2.5 text-[11px] font-mono text-[#e2e8f0] backdrop-blur-md"
          style={{
            left: Math.min(hoverInfo.x + 16, Math.max(12, containerWidth - 300)),
            top: Math.min(
              Math.max(48, hoverInfo.y - 16),
              Math.max(48, containerHeight - 235),
            ),
          }}
        >
          <div className="flex items-center justify-between border-b border-[#32363f] pb-1 mb-1.5">
            <span className="text-[#38bdf8] font-bold">
              行 {hoverInfo.segment.lineNumber} — {motionTypeLabel(hoverInfo.segment.motionType)}
            </span>
            <span className="text-[#fbbf24]">
              T{String(hoverInfo.segment.toolNumber).padStart(2, "0")}
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
            {hoverInfo.segment.arcRadius !== null && (
              <>
                <span className="text-[#94a3b8]">円弧半径 R:</span>
                <span className="text-[#4ade80]">{hoverInfo.segment.arcRadius.toFixed(3)} mm</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* 右下（トレースバー直上）：AutoCAD風 操作ガイド */}
      <div className="pointer-events-none absolute bottom-[62px] right-3 z-20 bg-[#181a1f]/80 border border-[#2f333c] rounded px-2 py-0.5 text-[10px] text-[#8e95a2] backdrop-blur-sm">
        ホイール: カーソルズーム ｜ 中/左ドラッグ: 移動 ｜ Shift+中/右ドラッグ: 3D回転 ｜ 中Wクリック: 全体
      </div>
    </>
  );
};
