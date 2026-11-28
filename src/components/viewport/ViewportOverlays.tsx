import React, { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
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
  RotateCcw,
  Ruler,
  ScanSearch,
  Scissors,
} from "lucide-react";
import type { CameraPreset, DisplayOptions } from "../../types/nc";
import type { SnapPoint } from "../../utils/toolpathGeometry";
import {
  PANE_ANGLE_OPTIONS,
  type PaneViewAngle,
  type ViewPaneId,
  paneAngleShortLabel,
} from "../../utils/viewportCameras";
import { type DroRefs, MachineDroPanel } from "./MachineDroPanel";
import {
  type ActiveSnapHover,
  type HoverInfo,
  type MeasurementStats,
  ViewportTooltips,
} from "./ViewportTooltips";

export type { ActiveSnapHover, DroRefs, HoverInfo, MeasurementStats };

export type NavMode = "pan" | "orbit" | "windowZoom";

export interface ZoomBox {
  paneId: ViewPaneId;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface ViewportOverlaysProps {
  containerWidth: number;
  containerHeight: number;
  displayOptions: DisplayOptions;
  onUpdateDisplayOptions: (patch: Partial<DisplayOptions>) => void;
  paneAngles: Record<ViewPaneId, PaneViewAngle>;
  onSelectPaneAngle: (paneId: ViewPaneId, action: Exclude<PaneViewAngle, "custom"> | "fit") => void;
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
  onResetViews: () => void;
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
  paneAngles,
  onSelectPaneAngle,
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
  onResetViews,
}) => {
  const [showDro, setShowDro] = useState<boolean>(() => loadSavedShowDro());
  const [helpOpen, setHelpOpen] = useState(false);
  const [openAngleMenuPane, setOpenAngleMenuPane] = useState<ViewPaneId | null>(null);

  useEffect(() => {
    if (!openAngleMenuPane) return;
    const onPointerDown = () => setOpenAngleMenuPane(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenAngleMenuPane(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openAngleMenuPane]);

  const visiblePaneBadges: Array<{ id: ViewPaneId; style: React.CSSProperties }> =
    displayOptions.viewLayout === "single"
      ? [{ id: "main", style: { top: 48, left: 10 } }]
      : displayOptions.viewLayout === "triple"
        ? [
            { id: "sub1", style: { top: 48, left: 10 } },
            { id: "sub2", style: { top: 48, left: "calc(50% + 10px)" } },
            { id: "main", style: { top: "calc(34% + 8px)", left: 10 } },
          ]
        : [
            { id: "sub1", style: { top: 48, left: 10 } },
            { id: "sub2", style: { top: 48, left: "calc(33.333% + 8px)" } },
            { id: "sub3", style: { top: 48, left: "calc(66.666% + 8px)" } },
            { id: "main", style: { top: "calc(32% + 8px)", left: 10 } },
          ];

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

      {/* 3画面 / 4面図モード時の境界線 */}
      {displayOptions.viewLayout === "triple" && (
        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute top-[34%] left-0 right-0 h-px bg-[#2f333c]" />
          <div className="absolute top-0 bottom-[66%] left-1/2 w-px bg-[#2f333c]" />
        </div>
      )}
      {displayOptions.viewLayout === "quad" && (
        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute top-[32%] left-0 right-0 h-px bg-[#2f333c]" />
          <div className="absolute top-0 bottom-[68%] left-1/3 w-px bg-[#2f333c]" />
          <div className="absolute top-0 bottom-[68%] left-2/3 w-px bg-[#2f333c]" />
        </div>
      )}

      {/* 各ビュー左上の個別角度切替バッジ & ドロップダウン */}
      <div
        className={`pointer-events-none absolute inset-0 ${
          openAngleMenuPane ? "z-30" : "z-[15]"
        }`}
      >
        {visiblePaneBadges.map(({ id, style }) => {
          const angle = paneAngles[id];
          const isMenuOpen = openAngleMenuPane === id;
          const alignRight = id === "sub3" && containerWidth < 760;

          return (
            <div
              key={id}
              style={style}
              className="pointer-events-auto absolute"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setOpenAngleMenuPane((cur) => (cur === id ? null : id))}
                className={`px-2 py-0.5 rounded border text-[10.5px] font-mono flex items-center gap-1 transition-colors shadow-sm backdrop-blur-md ${
                  isMenuOpen
                    ? "bg-[#11263a]/90 border-[#38bdf8]/70 text-[#e0f2fe]"
                    : "bg-[#141519]/82 border-[#2f333c] text-[#9cdcfe] hover:border-[#4b5563] hover:text-white"
                }`}
                title="ビューの角度を切替"
              >
                {angle === "custom" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] shrink-0" />
                )}
                <span>{paneAngleShortLabel(angle)}</span>
                <ChevronDown className="w-3 h-3 opacity-75 shrink-0" />
              </button>

              {isMenuOpen && (
                <div
                  className={`absolute top-full mt-1 z-40 w-40 bg-[#1f2126]/98 border border-[#3a3f4b] rounded-md shadow-2xl py-1 text-[11px] backdrop-blur-md ${
                    alignRight ? "right-0" : "left-0"
                  }`}
                >
                  {PANE_ANGLE_OPTIONS.map((opt) => {
                    const selected = angle === opt.angle;
                    return (
                      <button
                        key={opt.angle}
                        onClick={() => {
                          onSelectPaneAngle(id, opt.angle);
                          setOpenAngleMenuPane(null);
                        }}
                        className={`w-full text-left px-2.5 py-1 flex items-center justify-between gap-2 transition-colors ${
                          selected
                            ? "bg-[#094771]/80 text-white font-medium"
                            : "text-[#cbd5e1] hover:bg-[#2a2e38] hover:text-white"
                        }`}
                      >
                        <span className="font-mono text-[10.5px]">{opt.label}</span>
                        {selected && <Check className="w-3 h-3 text-[#38bdf8] shrink-0" />}
                      </button>
                    );
                  })}
                  <div className="my-1 border-t border-[#32363f]" />
                  <button
                    onClick={() => {
                      onSelectPaneAngle(id, "fit");
                      setOpenAngleMenuPane(null);
                    }}
                    className="w-full text-left px-2.5 py-1 flex items-center gap-1.5 text-[#7dd3fc] hover:bg-[#2a2e38] transition-colors"
                  >
                    <Focus className="w-3 h-3 shrink-0" />
                    <span>全体フィット (角度維持)</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

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
            title="2点間計測 (M で切替 / 端点・中点・円弧中心・軌道上スナップ / Escで終了)"
          >
            <Ruler className="w-3.5 h-3.5 shrink-0" />
            {!isCompactToolbar && <span>計測</span>}
          </button>

          {measureMode && displayOptions.showToolWidthFill && (
            <button
              onClick={() =>
                onUpdateDisplayOptions({ snapToolOutline: !displayOptions.snapToolOutline })
              }
              className={`rounded px-1.5 py-0.5 text-[10.5px] transition-colors ${
                displayOptions.snapToolOutline
                  ? "bg-[#a78bfa]/25 text-[#ddd6fe] ring-1 ring-[#a78bfa]/50"
                  : "text-[#8e95a2] hover:text-[#e2e8f0] hover:bg-[#2f333c]"
              }`}
              title="工具外径（外周輪郭線）への計測スナップを ON/OFF"
            >
              外径スナップ
            </button>
          )}
        </div>

        {/* 右グループ：分割レイアウト・フィット・リセット・全画面・DRO */}
        <div className="pointer-events-auto flex items-center gap-0.5 bg-[#1f2126]/90 border border-[#32363f] rounded-md px-1.5 py-1 text-[11px] shadow-md backdrop-blur-md">
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
          <div className="w-px h-3.5 bg-[#353944] mx-0.5" />
          <button
            onClick={() => onApplyCameraPreset("fit")}
            className="p-1 rounded hover:bg-[#2f333c] text-[#cccccc] hover:text-white"
            title="現在の視点方向のまま全体フィット (F / 中Wクリック)"
          >
            <Focus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onResetViews}
            className="p-1 rounded hover:bg-[#2f333c] text-[#cccccc] hover:text-white"
            title="全ビューの角度・位置をデフォルト (ISO / XY / XZ / YZ) へリセット"
          >
            <RotateCcw className="w-3.5 h-3.5" />
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

      <ViewportTooltips
        containerWidth={containerWidth}
        containerHeight={containerHeight}
        showToolWidthFill={displayOptions.showToolWidthFill}
        measureMode={measureMode}
        measurePoints={measurePoints}
        measureAnchor={measureAnchor}
        measurementStats={measurementStats}
        snapHover={snapHover}
        hoverInfo={hoverInfo}
        onClearMeasurePoints={onClearMeasurePoints}
      />

      <MachineDroPanel visible={showDro} droRefs={droRefs} />

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
              <span className="font-mono text-[#cbd5e1]">M / Esc</span>
              <span className="text-[#94a3b8]">2点間計測 ON/OFF / 終了</span>
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
