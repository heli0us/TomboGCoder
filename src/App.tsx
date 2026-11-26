import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bug, Layers, Settings, Wrench } from "lucide-react";
import { NcEditor } from "./components/NcEditor";
import { ToolpathViewport } from "./components/ToolpathViewport";
import { Sidebar, type SidebarTab } from "./components/Sidebar";
import { BottomPanel, type BottomTab } from "./components/BottomPanel";
import { TopBar } from "./components/TopBar";
import { StatusBar } from "./components/StatusBar";
import {
  exportReportFile,
  getMacroSampleNc,
  getSampleNc,
  isTauriRuntime,
  onNcFileChanged,
  openNcFileDialog,
  parseNcProgram,
  readNcFileByPath,
  saveNcFile,
  startWatchFile,
  stopWatchFile,
} from "./services/ncApi";
import { buildCsvReport, buildHtmlReport } from "./utils/reportGenerator";
import { buildFilteredParseResult } from "./utils/filterResult";
import {
  type AutoBreakConfig,
  type CameraPreset,
  DEFAULT_AUTO_BREAK,
  DEFAULT_DISPLAY_OPTIONS,
  DEFAULT_MACHINE_CONFIG,
  type DisplayOptions,
  type MachineConfig,
  type ParseResult,
  type ToolPreset,
  type ToolSpec,
} from "./types/nc";

const TOOL_PRESETS_STORAGE_KEY = "tombo_gcoder_tool_presets_v2";
const PLAYBACK_SPEED_STORAGE_KEY = "tombo_gcoder_playback_speed_v1";

function loadSavedPlaybackSpeed(): number {
  try {
    const raw = window.localStorage.getItem(PLAYBACK_SPEED_STORAGE_KEY);
    if (!raw) return 30;
    const val = Number(raw);
    return Number.isFinite(val) && val > 0 ? val : 30;
  } catch {
    return 30;
  }
}

function loadSavedToolPresets(): ToolPreset[] {
  try {
    const raw = window.localStorage.getItem(TOOL_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p) => p && typeof p.tools === "object") : [];
  } catch {
    return [];
  }
}

export function App() {
  const [source, setSource] = useState<string>("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("sample_plate.nc");
  const [encoding, setEncoding] = useState<string>("UTF-8");
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [watchExternal, setWatchExternal] = useState<boolean>(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [machineConfig, setMachineConfig] = useState<MachineConfig>(DEFAULT_MACHINE_CONFIG);
  const [customToolPresets, setCustomToolPresets] = useState<ToolPreset[]>(() =>
    loadSavedToolPresets(),
  );
  const [activePresetId, setActivePresetId] = useState<string>("builtin-standard-mag");
  const [displayOptions, setDisplayOptions] = useState<DisplayOptions>(DEFAULT_DISPLAY_OPTIONS);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState<boolean>(false);

  const [breakpoints, setBreakpoints] = useState<number[]>([]);
  const [autoBreak, setAutoBreak] = useState<AutoBreakConfig>(DEFAULT_AUTO_BREAK);
  const [breakReason, setBreakReason] = useState<string | null>(null);

  // VS Code レイアウト（全ペイン開閉＆リサイズ対応）
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("filter");
  const [sidebarWidth, setSidebarWidth] = useState<number>(264);
  const [editorOpen, setEditorOpen] = useState<boolean>(true);
  const [bottomTab, setBottomTab] = useState<BottomTab>("cycle");
  const [bottomCollapsed, setBottomCollapsed] = useState<boolean>(false);
  const [bottomHeight, setBottomHeight] = useState<number>(224);
  const [editorRatio, setEditorRatio] = useState<number>(0.34);

  // トレース再生状態（デフォルト 30x、変更値はローカル記憶）
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(() => loadSavedPlaybackSpeed());

  const handleChangePlaybackSpeed = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
    try {
      window.localStorage.setItem(PLAYBACK_SPEED_STORAGE_KEY, String(speed));
    } catch {
      // ignore
    }
  }, []);
  const [cameraCommand, setCameraCommand] = useState<{
    preset: CameraPreset | "fit";
    seq: number;
  } | null>(null);

  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const dragModeRef = useRef<null | "sidebar" | "editor" | "bottom">(null);
  // 全画面切替前のペイン状態を退避
  const prevLayoutRef = useRef<{
    sidebarOpen: boolean;
    editorOpen: boolean;
    bottomCollapsed: boolean;
  }>({ sidebarOpen: true, editorOpen: true, bottomCollapsed: false });

  const isViewportMaximized = !sidebarOpen && !editorOpen && bottomCollapsed;

  const handleToggleMaximizeViewport = useCallback(() => {
    if (!sidebarOpen && !editorOpen && bottomCollapsed) {
      // 元に戻す
      const prev = prevLayoutRef.current;
      setSidebarOpen(prev.sidebarOpen);
      setEditorOpen(prev.editorOpen);
      setBottomCollapsed(prev.bottomCollapsed);
    } else {
      // 現在状態を退避して3D全画面化
      prevLayoutRef.current = { sidebarOpen, editorOpen, bottomCollapsed };
      setSidebarOpen(false);
      setEditorOpen(false);
      setBottomCollapsed(true);
    }
  }, [sidebarOpen, editorOpen, bottomCollapsed]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((cur) => (cur === msg ? null : cur));
    }, 3200);
  }, []);

  // 初回サンプル読込
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isTauriRuntime()) {
        setParseError(
          "このアプリは Tauri デスクトップ環境（npm run tauri dev）で実行してください。",
        );
        return;
      }
      try {
        const sample = await getSampleNc();
        if (!cancelled) {
          setSource(sample);
          setFileName("sample_plate.nc (デモ)");
          setFilePath(null);
          setIsDirty(false);
        }
      } catch (err) {
        if (!cancelled) setParseError(`サンプル読込エラー: ${String(err)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 外部エディタ変更監視
  useEffect(() => {
    if (!isTauriRuntime()) return;
    if (!filePath || !watchExternal) {
      stopWatchFile().catch(() => {});
      return;
    }

    let unlisten: (() => void) | null = null;
    let active = true;

    (async () => {
      try {
        await startWatchFile(filePath);
        unlisten = await onNcFileChanged(async (changedPath) => {
          if (!active || changedPath !== filePath) return;
          try {
            const reloaded = await readNcFileByPath(changedPath);
            if (!active) return;
            setSource(reloaded.content);
            setEncoding(reloaded.encoding);
            setIsDirty(false);
            showToast(`外部更新を検知して再読込しました: ${reloaded.fileName}`);
          } catch (err) {
            setParseError(`自動リロード失敗: ${String(err)}`);
          }
        });
      } catch (err) {
        setParseError(`ファイル監視開始エラー: ${String(err)}`);
      }
    })();

    return () => {
      active = false;
      unlisten?.();
      stopWatchFile().catch(() => {});
    };
  }, [filePath, watchExternal, showToast]);

  // デバウンス付き Rust NC解析
  useEffect(() => {
    if (!source || !isTauriRuntime()) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsParsing(true);
      try {
        const res = await parseNcProgram(source, machineConfig, filePath);
        if (!cancelled) {
          setParseResult(res);
          setParseError(null);
          setActiveSegmentIndex((prev) => {
            const maxIdx = Math.max(0, res.compensatedSegments.length - 1);
            return prev === 0 ? maxIdx : Math.min(prev, maxIdx);
          });
        }
      } catch (err) {
        if (!cancelled) setParseError(`NC解析エラー: ${String(err)}`);
      } finally {
        if (!cancelled) setIsParsing(false);
      }
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source, machineConfig, filePath]);

  // サイドバー幅 / エディタ幅 / ボトムパネル高さの統合ドラッグリサイズ
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const mode = dragModeRef.current;
      if (!mode) return;
      if (mode === "sidebar") {
        setSidebarWidth(Math.min(420, Math.max(210, e.clientX - 48)));
      } else if (mode === "editor" && splitContainerRef.current) {
        const rect = splitContainerRef.current.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / Math.max(1, rect.width);
        setEditorRatio(Math.min(0.68, Math.max(0.18, ratio)));
      } else if (mode === "bottom") {
        // 最下部ステータスバー (24px) を除いた下端からの高さ
        const nextH = window.innerHeight - 24 - e.clientY;
        setBottomHeight(Math.min(460, Math.max(120, nextH)));
      }
    };
    const onUp = () => {
      if (dragModeRef.current) {
        dragModeRef.current = null;
        document.body.style.cursor = "";
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const handleOpenFile = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      const file = await openNcFileDialog();
      if (!file) return;
      setIsPlaying(false);
      setBreakReason(null);
      setBreakpoints([]);
      setDisplayOptions((prev) => ({
        ...prev,
        hiddenPrograms: [],
        hiddenTools: [],
        hiddenDNumbers: [],
      }));
      setSource(file.content);
      setFilePath(file.path);
      setFileName(file.fileName);
      setEncoding(file.encoding);
      setIsDirty(false);
      setActiveSegmentIndex(0);
      setCameraCommand((c) => ({ preset: "fit", seq: (c?.seq ?? 0) + 1 }));
    } catch (err) {
      setParseError(`ファイルを開けませんでした: ${String(err)}`);
    }
  }, []);

  const handleSaveFile = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      const savedPath = await saveNcFile(source, filePath, false);
      if (savedPath) {
        setFilePath(savedPath);
        const name = savedPath.split(/[\\/]/).pop() ?? "program.nc";
        setFileName(name);
        setIsDirty(false);
        showToast(`保存しました: ${name}`);
      }
    } catch (err) {
      setParseError(`保存エラー: ${String(err)}`);
    }
  }, [source, filePath, showToast]);

  const handleLoadSample = useCallback(async (mode: "plate" | "macro") => {
    if (!isTauriRuntime()) return;
    const sample = mode === "plate" ? await getSampleNc() : await getMacroSampleNc();
    setIsPlaying(false);
    setBreakReason(null);
    setBreakpoints([]);
    setDisplayOptions((prev) => ({
      ...prev,
      hiddenPrograms: [],
      hiddenTools: [],
      hiddenDNumbers: [],
    }));
    setSource(sample);
    setFilePath(null);
    setFileName(mode === "plate" ? "sample_plate.nc (デモ)" : "sample_macro_b.nc (マクロデモ)");
    setEncoding("UTF-8");
    setIsDirty(false);
    setActiveSegmentIndex(0);
    if (mode === "macro") {
      setBottomTab("macros");
      setBottomCollapsed(false);
    }
    setCameraCommand((c) => ({ preset: "iso", seq: (c?.seq ?? 0) + 1 }));
  }, []);

  // チェック中の O番号だけで再集計したアクティブ結果（再生・加工時間・範囲・レポートすべてに連動）
  const effectiveResult = useMemo(
    () => buildFilteredParseResult(parseResult, displayOptions.hiddenPrograms),
    [parseResult, displayOptions.hiddenPrograms],
  );

  // O番号チェック切替時は安全に再生停止し、新セグメント範囲へクランプ
  useEffect(() => {
    if (!effectiveResult) return;
    setIsPlaying(false);
    setBreakReason(null);
    const maxIdx = Math.max(0, effectiveResult.compensatedSegments.length - 1);
    setActiveSegmentIndex(maxIdx);
    // 絞り込み時は対象O番号へカメラフィット
    if (displayOptions.hiddenPrograms.length > 0 && effectiveResult.boundingBox.valid) {
      setCameraCommand((c) => ({ preset: "fit", seq: (c?.seq ?? 0) + 1 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayOptions.hiddenPrograms]);

  const handleTogglePlay = useCallback(() => {
    if (!effectiveResult || effectiveResult.compensatedSegments.length === 0) return;
    setBreakReason(null);
    setIsPlaying((playing) => {
      if (!playing && activeSegmentIndex >= effectiveResult.compensatedSegments.length - 1) {
        setActiveSegmentIndex(0);
      }
      return !playing;
    });
  }, [effectiveResult, activeSegmentIndex]);

  const handleToggleBreakpoint = useCallback((lineNumber: number) => {
    setBreakpoints((prev) =>
      prev.includes(lineNumber) ? prev.filter((l) => l !== lineNumber) : [...prev, lineNumber],
    );
  }, []);

  const handleApplyToolPreset = useCallback(
    (preset: ToolPreset) => {
      setActivePresetId(preset.id);
      const nextTools: Record<number, ToolSpec> = {};
      const nextDiameters: Record<number, number> = {};
      for (const [k, spec] of Object.entries(preset.tools)) {
        const tn = Number(k);
        if (tn > 0) {
          nextTools[tn] = { ...spec };
          nextDiameters[tn] = spec.diameter;
        }
      }
      if (preset.diameters) {
        for (const [k, d] of Object.entries(preset.diameters)) {
          const dn = Number(k);
          if (dn > 0) nextDiameters[dn] = d;
        }
      }
      setMachineConfig((prev) => ({
        ...prev,
        autoExtractDiameter: false,
        tools: nextTools,
        toolDiameters: nextDiameters,
      }));
      showToast(`T番号工具プリセットを適用しました: ${preset.name}`);
    },
    [showToast],
  );

  const handleSaveToolPreset = useCallback(
    (name: string) => {
      const snapshotTools: Record<number, ToolSpec> = { ...machineConfig.tools };
      if (machineConfig.autoExtractDiameter && parseResult?.extractedTools) {
        for (const [k, v] of Object.entries(parseResult.extractedTools)) {
          const kn = Number(k);
          if (kn > 0) snapshotTools[kn] = { ...v };
        }
      }
      const existing = customToolPresets.find((p) => p.name === name);
      const id = existing ? existing.id : `custom-${Date.now()}`;
      const nextPreset: ToolPreset = {
        id,
        name,
        tools: snapshotTools,
        diameters: { ...machineConfig.toolDiameters },
      };
      const updated = existing
        ? customToolPresets.map((p) => (p.id === id ? nextPreset : p))
        : [...customToolPresets, nextPreset];
      setCustomToolPresets(updated);
      setActivePresetId(id);
      try {
        window.localStorage.setItem(TOOL_PRESETS_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      showToast(`T番号工具プリセットを保存しました: ${name}`);
    },
    [machineConfig, parseResult, customToolPresets, showToast],
  );

  const handleDeleteToolPreset = useCallback(
    (id: string) => {
      const updated = customToolPresets.filter((p) => p.id !== id);
      setCustomToolPresets(updated);
      if (activePresetId === id) setActivePresetId("custom-unsaved");
      try {
        window.localStorage.setItem(TOOL_PRESETS_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      showToast("カスタムプリセットを削除しました");
    },
    [customToolPresets, activePresetId, showToast],
  );

  const handleExportCsv = useCallback(async () => {
    if (!effectiveResult || !isTauriRuntime()) return;
    try {
      const csv = buildCsvReport(fileName, machineConfig, effectiveResult);
      const base = fileName.replace(/\.[^.]+$/, "").replace(/\s*\(.*\)$/, "");
      const saved = await exportReportFile(`${base}_report.csv`, csv, "csv");
      if (saved) showToast("CSVレポートを保存しました");
    } catch (err) {
      setParseError(`CSV出力エラー: ${String(err)}`);
    }
  }, [effectiveResult, fileName, machineConfig, showToast]);

  const handleExportHtml = useCallback(async () => {
    if (!effectiveResult || !isTauriRuntime()) return;
    try {
      const html = buildHtmlReport(fileName, machineConfig, effectiveResult);
      const base = fileName.replace(/\.[^.]+$/, "").replace(/\s*\(.*\)$/, "");
      const saved = await exportReportFile(`${base}_report.html`, html, "html");
      if (saved) showToast("HTMLレポートを保存しました");
    } catch (err) {
      setParseError(`HTML出力エラー: ${String(err)}`);
    }
  }, [effectiveResult, fileName, machineConfig, showToast]);

  // グローバルキーボードショートカット
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        handleOpenFile();
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSaveFile();
        return;
      }
      if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
        return;
      }
      if (mod && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setEditorOpen((v) => !v);
        return;
      }
      if (mod && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setBottomCollapsed((v) => !v);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.closest(".cm-editor"))
      ) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setIsPlaying(false);
        setBreakReason(null);
        setActiveSegmentIndex((prev) =>
          Math.min(Math.max(0, (effectiveResult?.compensatedSegments.length ?? 1) - 1), prev + 1),
        );
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIsPlaying(false);
        setBreakReason(null);
        setActiveSegmentIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key.toLowerCase() === "f") {
        setCameraCommand((c) => ({ preset: "fit", seq: (c?.seq ?? 0) + 1 }));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleOpenFile, handleSaveFile, handleTogglePlay, effectiveResult]);

  const jumpToLine = useCallback(
    (lineNumber: number) => {
      if (!effectiveResult) return;
      const segs = effectiveResult.compensatedSegments;
      const exactIdx = segs.findIndex((s) => s.lineNumber === lineNumber);
      if (exactIdx >= 0) {
        setIsPlaying(false);
        setBreakReason(null);
        setActiveSegmentIndex(exactIdx);
        return;
      }
      let nearestIdx = -1;
      for (let i = 0; i < segs.length; i++) {
        if (segs[i].lineNumber <= lineNumber) nearestIdx = i;
        else break;
      }
      if (nearestIdx >= 0) {
        setIsPlaying(false);
        setBreakReason(null);
        setActiveSegmentIndex(nearestIdx);
      }
    },
    [effectiveResult],
  );

  const handleActivityClick = (tab: SidebarTab) => {
    if (sidebarOpen && sidebarTab === tab) {
      setSidebarOpen(false);
    } else {
      setSidebarTab(tab);
      setSidebarOpen(true);
    }
  };

  const activeSegment = effectiveResult?.compensatedSegments[activeSegmentIndex] ?? null;
  const errorCount =
    effectiveResult?.diagnostics.filter((d) => d.severity === "error").length ?? 0;
  const warnCount =
    effectiveResult?.diagnostics.filter((d) => d.severity === "warning").length ?? 0;

  const programFilterLabel = useMemo(() => {
    if (!parseResult || displayOptions.hiddenPrograms.length === 0) return null;
    const activeProgs = effectiveResult?.detectedPrograms ?? [];
    if (activeProgs.length === 0) return "なし";
    if (activeProgs.length <= 3) return activeProgs.join(", ");
    return `${activeProgs.slice(0, 2).join(", ")} 他${activeProgs.length - 2}件`;
  }, [parseResult, effectiveResult, displayOptions.hiddenPrograms]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1f1f1f] text-[#cccccc] overflow-hidden">
      <TopBar
        fileName={fileName}
        filePath={filePath}
        encoding={encoding}
        isDirty={isDirty}
        isParsing={isParsing}
        watchExternal={watchExternal}
        profileName={machineConfig.profileName}
        sidebarOpen={sidebarOpen}
        editorOpen={editorOpen}
        bottomOpen={!bottomCollapsed}
        onOpenFile={handleOpenFile}
        onSaveFile={handleSaveFile}
        onLoadSample={handleLoadSample}
        onToggleWatchExternal={() => setWatchExternal((v) => !v)}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onToggleEditor={() => setEditorOpen((v) => !v)}
        onToggleBottom={() => setBottomCollapsed((v) => !v)}
      />

      {parseError && (
        <div className="bg-[#5a1d1d] border-b border-[#be1100] px-3 py-1.5 text-xs text-[#fecaca] flex items-center justify-between">
          <span>{parseError}</span>
          <button onClick={() => setParseError(null)} className="underline ml-4">
            閉じる
          </button>
        </div>
      )}

      {toastMsg && (
        <div className="fixed top-11 right-4 z-50 bg-[#0078d4] text-white text-xs px-3 py-1.5 rounded-md shadow-xl border border-[#38bdf8]/50">
          {toastMsg}
        </div>
      )}

      {/* メインボディ */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* 左：VS Code アクティビティバー (48px) */}
        <aside className="w-12 bg-[#181818] border-r border-[#2b2b2b] flex flex-col items-center py-2 gap-1 shrink-0">
          {(
            [
              ["filter", Layers, "表示フィルタ・O番号・Zスライス (Cmd/Ctrl+B)"],
              ["tools", Wrench, "工具マガジン (T番号プリセット) & 径補正 (D)"],
              ["debug", Bug, "ブレイクポイント & 自動停止条件"],
              ["machine", Settings, "機械パラメータ (サイクルタイム)"],
            ] as const
          ).map(([tab, Icon, title]) => {
            const active = sidebarOpen && sidebarTab === tab;
            return (
              <button
                key={tab}
                onClick={() => handleActivityClick(tab)}
                title={title}
                className={`relative w-12 h-11 flex items-center justify-center transition-colors ${
                  active ? "text-white" : "text-[#7d7d7d] hover:text-[#cccccc]"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-[#0078d4]" />
                )}
                <Icon className="w-5 h-5" />
                {tab === "debug" && breakpoints.length > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#ef4444]" />
                )}
              </button>
            );
          })}
        </aside>

        {/* 左サイドバー + リサイズハンドル */}
        {sidebarOpen && (
          <>
            <div style={{ width: sidebarWidth }} className="shrink-0 h-full">
              <Sidebar
                activeTab={sidebarTab}
                parseResult={parseResult}
                displayOptions={displayOptions}
                onUpdateDisplayOptions={(patch) =>
                  setDisplayOptions((prev) => ({ ...prev, ...patch }))
                }
                onFocusProgram={(prog) => {
                  showToast(`${prog} を単独表示しました（再生・加工時間も連動）`);
                }}
                machineConfig={machineConfig}
                onUpdateMachineConfig={(cfg) => {
                  setMachineConfig(cfg);
                  setActivePresetId("custom-unsaved");
                }}
                customToolPresets={customToolPresets}
                activePresetId={activePresetId}
                onApplyToolPreset={handleApplyToolPreset}
                onSaveToolPreset={handleSaveToolPreset}
                onDeleteToolPreset={handleDeleteToolPreset}
                breakpoints={breakpoints}
                onToggleBreakpoint={handleToggleBreakpoint}
                onClearBreakpoints={() => setBreakpoints([])}
                onJumpToLine={jumpToLine}
                autoBreak={autoBreak}
                onUpdateAutoBreak={(patch) => setAutoBreak((prev) => ({ ...prev, ...patch }))}
              />
            </div>
            <div
              onMouseDown={() => {
                dragModeRef.current = "sidebar";
                document.body.style.cursor = "col-resize";
              }}
              className="w-1 bg-transparent hover:bg-[#0078d4] cursor-col-resize transition-colors shrink-0 -ml-0.5 z-10"
              title="ドラッグしてサイドバー幅を調整"
            />
          </>
        )}

        {/* 右メインワークスペース */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <div ref={splitContainerRef} className="flex-1 flex min-h-0 overflow-hidden">
            {/* 左ペイン：NCコードエディタ（ワンクリックで折りたたみ可能） */}
            {editorOpen && (
              <>
                <div
                  style={{ width: `${editorRatio * 100}%` }}
                  className="h-full flex flex-col min-w-[200px] border-r border-[#2b2b2b]"
                >
                  <div className="h-8 bg-[#181818] border-b border-[#2b2b2b] px-3 flex items-center justify-between text-[11.5px] shrink-0">
                    <span className="font-mono text-[#e2e8f0] truncate">{fileName}</span>
                    <span className="text-[10.5px] text-[#787878] font-mono">
                      {parseResult?.lineCount ?? 0} 行
                      {parseResult && parseResult.expandedBlockCount > parseResult.lineCount
                        ? ` → 展開 ${parseResult.expandedBlockCount}`
                        : ""}
                    </span>
                  </div>
                  <div className="flex-1 min-h-0">
                    <NcEditor
                      value={source}
                      onChange={(val) => {
                        setSource(val);
                        setIsDirty(true);
                      }}
                      activeLine={activeSegment?.lineNumber ?? null}
                      diagnostics={effectiveResult?.diagnostics ?? []}
                      breakpoints={breakpoints}
                      onToggleBreakpoint={handleToggleBreakpoint}
                      onLineClick={jumpToLine}
                    />
                  </div>
                </div>

                {/* エディタ幅リサイズハンドル */}
                <div
                  onMouseDown={() => {
                    dragModeRef.current = "editor";
                    document.body.style.cursor = "col-resize";
                  }}
                  className="w-1 bg-transparent hover:bg-[#0078d4] cursor-col-resize transition-colors shrink-0 -ml-0.5 z-10"
                  title="ドラッグしてエディタ幅を調整"
                />
              </>
            )}

            {/* 右ペイン：3D/2D ツールパスビューポート */}
            <div className="flex-1 h-full min-w-[280px]">
              <ToolpathViewport
                programSegments={effectiveResult?.programSegments ?? []}
                compensatedSegments={effectiveResult?.compensatedSegments ?? []}
                diagnostics={effectiveResult?.diagnostics ?? []}
                boundingBox={
                  effectiveResult?.boundingBox ?? {
                    min: { x: 0, y: 0, z: 0 },
                    max: { x: 100, y: 100, z: 50 },
                    valid: false,
                  }
                }
                displayOptions={displayOptions}
                onUpdateDisplayOptions={(patch) =>
                  setDisplayOptions((prev) => ({ ...prev, ...patch }))
                }
                activeSegmentIndex={activeSegmentIndex}
                onSelectSegmentIndex={(idx, keepPlaying) => {
                  if (!keepPlaying) {
                    setIsPlaying(false);
                    setBreakReason(null);
                  }
                  setActiveSegmentIndex(idx);
                }}
                isPlaying={isPlaying}
                onTogglePlay={handleTogglePlay}
                onStopPlay={() => setIsPlaying(false)}
                playbackSpeed={playbackSpeed}
                onChangePlaybackSpeed={handleChangePlaybackSpeed}
                breakpoints={breakpoints}
                autoBreak={autoBreak}
                breakReason={breakReason}
                onBreakHit={(idx, reason) => {
                  setIsPlaying(false);
                  setBreakReason(reason);
                  setActiveSegmentIndex(idx);
                }}
                isViewportMaximized={isViewportMaximized}
                onToggleMaximizeViewport={handleToggleMaximizeViewport}
                cameraCommand={cameraCommand}
              />
            </div>
          </div>

          {/* ボトムパネル高さリサイズハンドル */}
          {!bottomCollapsed && (
            <div
              onMouseDown={() => {
                dragModeRef.current = "bottom";
                document.body.style.cursor = "row-resize";
              }}
              className="h-1 bg-transparent hover:bg-[#0078d4] cursor-row-resize transition-colors shrink-0 -mb-0.5 z-10"
              title="ドラッグして下部パネルの高さを調整"
            />
          )}

          <BottomPanel
            activeTab={bottomTab}
            onChangeTab={setBottomTab}
            collapsed={bottomCollapsed}
            heightPx={bottomHeight}
            onToggleCollapse={() => setBottomCollapsed((v) => !v)}
            parseResult={effectiveResult}
            activeSegment={activeSegment}
            programFilterLabel={programFilterLabel}
            onJumpToLine={jumpToLine}
            onExportCsv={handleExportCsv}
            onExportHtml={handleExportHtml}
          />
        </div>
      </div>

      <StatusBar
        isPlaying={isPlaying}
        errorCount={errorCount}
        warnCount={warnCount}
        activeSegment={activeSegment}
        totalTimeSec={effectiveResult?.cycleTime.totalTimeSec ?? 0}
        onOpenProblems={() => {
          setBottomTab("problems");
          setBottomCollapsed(false);
        }}
        onOpenCycle={() => {
          setBottomTab("cycle");
          setBottomCollapsed(false);
        }}
      />
    </div>
  );
}

export default App;
