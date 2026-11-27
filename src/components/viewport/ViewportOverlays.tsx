import React, { useState } from "react";
import {
  Columns3,
  Crosshair,
  Eye,
  Focus,
  Grid2x2,
  Hand,
  HelpCircle,
  Maximize2,
  Minimize2,
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

export interface DroRefs {
  x: React.RefObject<HTMLSpanElement | null>;
  y: React.RefObject<HTMLSpanElement | null>;
  z: React.RefObject<HTMLSpanElement | null>;
  feed: React.RefObject<HTMLSpanElement | null>;
  spindle: React.RefObject<HTMLSpanElement | null>;
  tool: React.RefObject<HTMLSpanElement | null>;
  motion: React.RefObject<HTMLSpanElement | null>;
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
  measureAnchor: { x: number; y: number } | null;
  onClearMeasurePoints: () => void;
  measurementStats: MeasurementStats | null;
  snapHover: ActiveSnapHover | null;
  hoverInfo: HoverInfo | null;
  zoomBox: ZoomBox | null;
  droRefs: DroRefs;
  isViewportMaximized: boolean;
  onToggleMaximizeViewport: () => void;
  onApplyCameraPreset: (preset: CameraPreset | "fit") => void;
}

const DRO_VISIBLE_STORAGE_KEY = "tombo_gcoder_show_dro_v1";

function loadSavedShowDro(): boolean {
  try {
    const raw = window.localStorage.getItem(DRO_VISIBLE_STORAGE_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
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
  measureAnchor,
  onClearMeasurePoints,
  measurementStats,
  snapHover,
  hoverInfo,
  zoomBox,
  droRefs,
  isViewportMaximized,
  onToggleMaximizeViewport,
  onApplyCameraPreset,
}) => {
  const [showDro, setShowDro] = useState<boolean>(() => loadSavedShowDro());
  const [helpOpen, setHelpOpen] = useState(false);

  // 3D画面幅が狭いときはツールバーボタンをアイコンのみへ自動縮小
  const isCompactToolbar = containerWidth < 860;

  const toggleDro = () => {
    setShowDro((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(DRO_VISIBLE_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

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

      {/* 3画面分割モード時の境界線 & ラベル（上2面：XY/XZ + 下メイン3D） */}
      {displayOptions.viewLayout === "triple" && (
        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute top-[34%] left-0 right-0 h-px bg-[#2f333c]" />
          <div className="absolute top-0 bottom-[66%] left-1/2 w-px bg-[#2f333c]" />
          <span className="absolute top-12 left-2.5 px-1.5 py-0.5 rounded bg-[#141519]/80 border border-[#2f333c] text-[10px] font-mono text-[#9cdcfe]">
            XY 上面 (平行)
          </span>
          <span className="absolute top-12 left-[calc(50%+10px)] px-1.5 py-0.5 rounded bg-[#141519]/80 border border-[#2f333c] text-[10px] font-mono text-[#9cdcfe]">
            XZ 正面 (平行)
          </span>
          <span className="absolute top-[calc(34%+8px)] left-2.5 px-1.5 py-0.5 rounded bg-[#141519]/80 border border-[#2f333c] text-[10px] font-mono text-[#9cdcfe]">
            メイン 3D (操作可)
          </span>
        </div>
      )}

      {/* 4面図モード時の境界線 & ラベル（上3面：XY/XZ/YZ + 下メイン3D） */}
      {displayOptions.viewLayout === "quad" && (
        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute top-[32%] left-0 right-0 h-px bg-[#2f333c]" />
          <div className="absolute top-0 bottom-[68%] left-1/3 w-px bg-[#2f333c]" />
          <div className="absolute top-0 bottom-[68%] left-2/3 w-px bg-[#2f333c]" />
          <span className="absolute top-12 left-2.5 px-1.5 py-0.5 rounded bg-[#141519]/80 border border-[#2f333c] text-[10px] font-mono text-[#9cdcfe]">
            XY 上面
          </span>
          <span className="absolute top-12 left-[calc(33.33%+8px)] px-1.5 py-0.5 rounded bg-[#141519]/80 border border-[#2f333c] text-[10px] font-mono text-[#9cdcfe]">
            XZ 正面
          </span>
          <span className="absolute top-12 left-[calc(66.66%+8px)] px-1.5 py-0.5 rounded bg-[#141519]/80 border border-[#2f333c] text-[10px] font-mono text-[#9cdcfe]">
            YZ 側面
          </span>
          <span className="absolute top-[calc(32%+8px)] left-2.5 px-1.5 py-0.5 rounded bg-[#141519]/80 border border-[#2f333c] text-[10px] font-mono text-[#9cdcfe]">
            メイン 3D (操作可)
          </span>
        </div>
      )}

      {/* 上部フローティング HUD：狭い幅でも重ならないフレックス配置 */}
      <div className="pointer-events-none absolute top-2.5 left-2.5 right-2.5 z-20 flex flex-wrap items-center justify-between gap-2">
        {/* 左グループ：AutoCAD操作モード & クイック検証ツール */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 bg-[#1f2126]/90 border border-[#32363f] rounded-md px-1.5 py-1 text-[11px] shadow-md backdrop-blur-md">
          {(
            [
              ["pan", Hand, "移動", "移動 (左/中ドラッグで移動、Shift+ドラッグ/右ドラッグで3D回転)"],
              ["orbit", Rotate3d, "回転", "回転 (左ドラッグで3D回転、中ドラッグで移動)"],
              ["windowZoom", ScanSearch, "窓ズーム", "窓ズーム (左ドラッグで矩形拡大 / Escで解除)"],
            ] as const
          ).map(([mode, Icon, label, title]) => (
            <button
              key={mode}
              onClick={() => onSelectNavMode(mode)}
              className={`flex items-center gap-1 rounded transition-colors ${
                isCompactToolbar ? "p-1.5" : "px-2 py-0.5"
              } ${
                !measureMode && navMode === mode
                  ? "bg-[#0078d4] text-white font-medium shadow-sm"
                  : "text-[#cccccc] hover:bg-[#2f333c]"
              }`}
              title={title}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {!isCompactToolbar && <span>{label}</span>}
            </button>
          ))}

          <div className="w-px h-3.5 bg-[#353944] mx-0.5" />

          <button
            onClick={() =>
              onUpdateDisplayOptions({ showProgramPath: !displayOptions.showProgramPath })
            }
            className={`flex items-center gap-1 rounded transition-colors ${
              isCompactToolbar ? "p-1.5" : "px-2 py-0.5"
            } ${
              displayOptions.showProgramPath
                ? "bg-[#e879f9]/20 text-[#f0abfc] ring-1 ring-[#e879f9]/40"
                : "text-[#8e95a2] hover:text-[#e2e8f0] hover:bg-[#2f333c]"
            }`}
            title="補正前パス (G41/G42 補正前プログラムパスの重ね表示切替)"
          >
            <Scissors className="w-3.5 h-3.5 shrink-0" />
            {!isCompactToolbar && <span>補正前</span>}
          </button>

          <button
            onClick={() =>
              onUpdateDisplayOptions({ showToolWidthFill: !displayOptions.showToolWidthFill })
            }
            className={`flex items-center gap-1 rounded transition-colors ${
              isCompactToolbar ? "p-1.5" : "px-2 py-0.5"
            } ${
              displayOptions.showToolWidthFill
                ? "bg-[#38bdf8]/20 text-[#7dd3fc] ring-1 ring-[#38bdf8]/40"
                : "text-[#8e95a2] hover:text-[#e2e8f0] hover:bg-[#2f333c]"
            }`}
            title="工具径輪郭表示 (T番号の工具径で外周アウトラインを描画)"
          >
            <PaintBucket className="w-3.5 h-3.5 shrink-0" />
            {!isCompactToolbar && <span>工具幅</span>}
          </button>

          <button
            onClick={() =>
              onUpdateDisplayOptions({ traceClipFuture: !displayOptions.traceClipFuture })
            }
            className={`flex items-center gap-1 rounded transition-colors ${
              isCompactToolbar ? "p-1.5" : "px-2 py-0.5"
            } ${
              displayOptions.traceClipFuture
                ? "bg-[#0078d4]/30 text-[#7dd3fc] ring-1 ring-[#38bdf8]/40"
                : "text-[#8e95a2] hover:text-[#e2e8f0] hover:bg-[#2f333c]"
            }`}
            title="軌跡クリップ (現在トレース位置までのみを描画)"
          >
            <Eye className="w-3.5 h-3.5 shrink-0" />
            {!isCompactToolbar && <span>軌跡クリップ</span>}
          </button>

          <div className="w-px h-3.5 bg-[#353944] mx-0.5" />

          <button
            onClick={onToggleMeasureMode}
            className={`flex items-center gap-1 rounded transition-colors ${
              isCompactToolbar ? "p-1.5" : "px-2 py-0.5"
            } ${
              measureMode
                ? "bg-[#ea580c] text-white font-medium shadow-sm"
                : "text-[#cccccc] hover:bg-[#2f333c]"
            }`}
            title="2点間計測 (端点・中点・円弧中心・軌道上スナップ / Escで終了)"
          >
            <Ruler className="w-3.5 h-3.5 shrink-0" />
            {!isCompactToolbar && <span>計測</span>}
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
                if (displayOptions.viewLayout !== "single") {
                  onUpdateDisplayOptions({ viewLayout: "single" });
                }
                onApplyCameraPreset(preset);
              }}
              className="px-1.5 py-0.5 rounded hover:bg-[#2f333c] text-[#cccccc] hover:text-white transition-colors font-mono"
              title={`${label}視点へ切替`}
            >
              {label}
            </button>
          ))}
          <div className="w-px h-3.5 bg-[#353944] mx-0.5" />
          <button
            onClick={() =>
              onUpdateDisplayOptions({
                viewLayout: displayOptions.viewLayout === "triple" ? "single" : "triple",
              })
            }
            className={`rounded flex items-center gap-1 transition-colors ${
              isCompactToolbar ? "p-1" : "px-2 py-0.5"
            } ${
              displayOptions.viewLayout === "triple"
                ? "bg-[#0078d4] text-white"
                : "text-[#cccccc] hover:bg-[#2f333c]"
            }`}
            title="3画面分割表示の切替 (上: XY / XZ、下: メイン3D)"
          >
            <Columns3 className="w-3.5 h-3.5 shrink-0" />
            {!isCompactToolbar && <span>3面</span>}
          </button>
          <button
            onClick={() =>
              onUpdateDisplayOptions({
                viewLayout: displayOptions.viewLayout === "quad" ? "single" : "quad",
              })
            }
            className={`rounded flex items-center gap-1 transition-colors ${
              isCompactToolbar ? "p-1" : "px-2 py-0.5"
            } ${
              displayOptions.viewLayout === "quad"
                ? "bg-[#0078d4] text-white"
                : "text-[#cccccc] hover:bg-[#2f333c]"
            }`}
            title="4面図表示の切替 (上: XY / XZ / YZ、下: メイン3D)"
          >
            <Grid2x2 className="w-3.5 h-3.5 shrink-0" />
            {!isCompactToolbar && <span>4面</span>}
          </button>
          <button
            onClick={() => onApplyCameraPreset("fit")}
            className="p-1 rounded hover:bg-[#2f333c] text-[#cccccc] hover:text-white"
            title="現在の視点方向のまま全体フィット (F / 中Wクリック)"
          >
            <Focus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleMaximizeViewport}
            className={`p-1 rounded transition-colors ${
              isViewportMaximized
                ? "bg-[#0078d4] text-white"
                : "text-[#cccccc] hover:bg-[#2f333c] hover:text-white"
            }`}
            title={isViewportMaximized ? "元のレイアウトへ戻す" : "3Dビューを全画面表示"}
          >
            {isViewportMaximized ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
          <div className="w-px h-3.5 bg-[#353944] mx-0.5" />
          <button
            onClick={toggleDro}
            className={`rounded flex items-center gap-1 transition-colors font-mono ${
              isCompactToolbar ? "p-1" : "px-1.5 py-0.5"
            } ${
              showDro
                ? "bg-[#38bdf8]/20 text-[#7dd3fc]"
                : "text-[#8e95a2] hover:text-white hover:bg-[#2f333c]"
            }`}
            title="実機CNC風ライブ座標 DRO の表示切替"
          >
            <Crosshair className="w-3.5 h-3.5 shrink-0" />
            {!isCompactToolbar && <span>DRO</span>}
          </button>
        </div>
      </div>

      {/* 2点確定時の固定計測ツールチップ（2点目クリック位置にフル情報をそのまま表示） */}
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
                長さ <span className="text-[#fbbf24] text-xs">{measurementStats.dist3d.toFixed(3)} mm</span>
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
              XY <span className="text-[#38bdf8] font-semibold">{measurementStats.distXY.toFixed(3)}</span>mm
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
              Math.max(48, containerHeight - 280),
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
                <span className="text-[#4ade80] font-semibold">
                  {hoverInfo.segment.arcRadius.toFixed(3)} mm
                </span>
              </>
            )}
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

      {/* 左下（トレースバー直上）：実機CNC風 60fps ライブ座標 DRO */}
      <div
        className={`pointer-events-auto absolute bottom-[62px] left-3 z-20 w-48 bg-[#14161b]/88 border border-[#2f3440] rounded-md px-2.5 py-2 shadow-xl backdrop-blur-md font-mono transition-opacity ${
          showDro ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#262a33] pb-1 mb-1.5 text-[10px]">
          <span className="text-[#8e95a2] tracking-wider font-sans font-semibold">
            MACHINE DRO
          </span>
          <span
            ref={droRefs.motion}
            className="px-1.5 py-0 rounded bg-[#094771]/70 text-[#7dd3fc] text-[10px]"
          >
            G00
          </span>
        </div>

        <div className="space-y-0.5 text-[13px] leading-tight tracking-tight">
          <div className="flex items-center justify-between">
            <span className="text-[#f87171] font-bold">X</span>
            <span ref={droRefs.x} className="text-[#f1f5f9] tabular-nums">
              0.000
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#4ade80] font-bold">Y</span>
            <span ref={droRefs.y} className="text-[#f1f5f9] tabular-nums">
              0.000
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#60a5fa] font-bold">Z</span>
            <span ref={droRefs.z} className="text-[#f1f5f9] tabular-nums">
              0.000
            </span>
          </div>
        </div>

        <div className="mt-1.5 pt-1 border-t border-[#262a33] flex items-center justify-between text-[10.5px] text-[#94a3b8]">
          <span ref={droRefs.tool} className="text-[#fbbf24] font-semibold">
            T00
          </span>
          <span ref={droRefs.feed}>F0</span>
          <span ref={droRefs.spindle}>S0</span>
        </div>
      </div>

      {/* 右下（トレースバー直上）：ミニマル ? 操作ヘルプボタン & ポップオーバー */}
      <div
        className="pointer-events-auto absolute bottom-[62px] right-3 z-20"
        onMouseEnter={() => setHelpOpen(true)}
        onMouseLeave={() => setHelpOpen(false)}
      >
        {helpOpen && (
          <div className="absolute bottom-8 right-0 w-72 bg-[#1c1d21]/95 border border-[#32363f] rounded-md shadow-2xl p-2.5 text-[11px] backdrop-blur-md">
            <div className="text-[10.5px] font-semibold text-[#9cdcfe] uppercase tracking-wider border-b border-[#2c2f38] pb-1 mb-1.5">
              ビュー操作 (AutoCAD風) & ショートカット
            </div>
            <div className="grid grid-cols-[118px_1fr] gap-y-1 gap-x-2 text-[10.5px]">
              <span className="font-mono text-[#cbd5e1]">ホイール上下</span>
              <span className="text-[#94a3b8]">カーソル位置へズーム</span>
              <span className="font-mono text-[#cbd5e1]">中 / 左ドラッグ</span>
              <span className="text-[#94a3b8]">平行移動 (パン)</span>
              <span className="font-mono text-[#cbd5e1]">Shift+中 / 右</span>
              <span className="text-[#94a3b8]">3D オービット回転</span>
              <span className="font-mono text-[#cbd5e1]">中Wクリック / F</span>
              <span className="text-[#94a3b8]">全体フィット表示</span>
              <span className="font-mono text-[#cbd5e1]">Space / ← →</span>
              <span className="text-[#94a3b8]">トレース再生 / 1ステップ</span>
              <span className="font-mono text-[#cbd5e1]">Cmd/Ctrl + B/E/J</span>
              <span className="text-[#94a3b8]">サイド / エディタ / 下部開閉</span>
            </div>
          </div>
        )}
        <button
          onClick={() => setHelpOpen((v) => !v)}
          className={`w-7 h-7 rounded-full border flex items-center justify-center transition-colors shadow-md backdrop-blur-sm ${
            helpOpen
              ? "bg-[#0078d4] border-[#38bdf8] text-white"
              : "bg-[#1f2126]/90 border-[#32363f] text-[#8e95a2] hover:text-white hover:border-[#4b5263]"
          }`}
          title="操作ガイド・ショートカットを表示"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </div>
    </>
  );
};
