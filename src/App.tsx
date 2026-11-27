import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Bug, Layers, Search, Settings, Wand2 } from "lucide-react";
import { NcEditor, type EditorSelectionInfo, type NcEditorHandle } from "./components/NcEditor";
import { ToolpathViewport } from "./components/ToolpathViewport";
import { Sidebar, type SidebarTab } from "./components/Sidebar";
import { BottomPanel, type BottomTab } from "./components/BottomPanel";
import { TopBar, type RecentFileEntry } from "./components/TopBar";
import { StatusBar } from "./components/StatusBar";
import {
  DragHoverOverlay,
  DropActionModal,
  UnsavedChangesModal,
} from "./components/FileActionModals";
import { HelpModal } from "./components/HelpModals";
import { UpdateModal, type UpdateModalState } from "./components/UpdateModal";
import { WelcomeScreen } from "./components/WelcomeScreen";
import {
  checkForAppUpdate,
  installAppUpdate,
  type AppUpdateInfo,
  type UpdateDownloadProgress,
} from "./services/updater";
import {
  exportJsonFile,
  exportReportFile,
  isTauriRuntime,
  onNcFileChanged,
  openJsonFileDialog,
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
  applyReplaceRulesToText,
  parseImportedReplaceBatches,
  repairReplaceBatches,
} from "./utils/replaceEngine";
import {
  BUILTIN_MACHINE_PROFILES,
  type AutoBreakConfig,
  type CameraPreset,
  DEFAULT_AUTO_BREAK,
  DEFAULT_DISPLAY_OPTIONS,
  DEFAULT_MACHINE_CONFIG,
  DEFAULT_NC_SNIPPETS,
  DEFAULT_REPLACE_BATCHES,
  type DisplayOptions,
  type FileReadResult,
  type MachineConfig,
  type MachineProfile,
  type NcSnippet,
  type ParseResult,
  type ReplaceBatch,
  type ReplaceRule,
} from "./types/nc";

const MACHINE_PROFILES_STORAGE_KEY = "tombo_gcoder_machine_profiles_v1";
const ACTIVE_MACHINE_ID_STORAGE_KEY = "tombo_gcoder_active_machine_id_v1";
const PLAYBACK_SPEED_STORAGE_KEY = "tombo_gcoder_playback_speed_v1";
const SKIP_ATC_STORAGE_KEY = "tombo_gcoder_skip_atc_v1";
const EDITOR_FONT_SIZE_STORAGE_KEY = "tombo_gcoder_editor_font_size_v1";
const REPLACE_BATCHES_STORAGE_KEY = "tombo_gcoder_replace_batches_v1";
const NC_SNIPPETS_STORAGE_KEY = "tombo_gcoder_nc_snippets_v1";
const DISPLAY_OPTIONS_STORAGE_KEY = "tombo_gcoder_display_options_v1";
const AUTO_BREAK_STORAGE_KEY = "tombo_gcoder_auto_break_v1";
const UI_LAYOUT_STORAGE_KEY = "tombo_gcoder_ui_layout_v1";
const RECENT_FILES_STORAGE_KEY = "tombo_gcoder_recent_files_v1";
const MAX_RECENT_FILES = 8;

interface SavedUiLayout {
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  sidebarWidth: number;
  editorOpen: boolean;
  editorRatio: number;
  bottomCollapsed: boolean;
  bottomTab: BottomTab;
  bottomHeight: number;
}

const DEFAULT_UI_LAYOUT: SavedUiLayout = {
  sidebarOpen: true,
  sidebarTab: "filter",
  sidebarWidth: 264,
  editorOpen: true,
  editorRatio: 0.34,
  bottomCollapsed: false,
  bottomTab: "cycle",
  bottomHeight: 224,
};

function loadSavedUiLayout(): SavedUiLayout {
  try {
    const raw = window.localStorage.getItem(UI_LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_UI_LAYOUT;
    const p = JSON.parse(raw) as Partial<SavedUiLayout> & { sidebarTab?: string };
    return {
      sidebarOpen: typeof p.sidebarOpen === "boolean" ? p.sidebarOpen : DEFAULT_UI_LAYOUT.sidebarOpen,
      sidebarTab:
        p.sidebarTab === "filter" ||
        p.sidebarTab === "machine" ||
        p.sidebarTab === "edit" ||
        p.sidebarTab === "debug"
          ? p.sidebarTab
          : p.sidebarTab === "tools"
            ? "machine"
            : DEFAULT_UI_LAYOUT.sidebarTab,
      sidebarWidth:
        typeof p.sidebarWidth === "number"
          ? Math.min(420, Math.max(210, p.sidebarWidth))
          : DEFAULT_UI_LAYOUT.sidebarWidth,
      editorOpen: typeof p.editorOpen === "boolean" ? p.editorOpen : DEFAULT_UI_LAYOUT.editorOpen,
      editorRatio:
        typeof p.editorRatio === "number"
          ? Math.min(0.68, Math.max(0.18, p.editorRatio))
          : DEFAULT_UI_LAYOUT.editorRatio,
      bottomCollapsed:
        typeof p.bottomCollapsed === "boolean"
          ? p.bottomCollapsed
          : DEFAULT_UI_LAYOUT.bottomCollapsed,
      bottomTab:
        p.bottomTab === "cycle" ||
        p.bottomTab === "problems" ||
        p.bottomTab === "modal" ||
        p.bottomTab === "macros"
          ? p.bottomTab
          : DEFAULT_UI_LAYOUT.bottomTab,
      bottomHeight:
        typeof p.bottomHeight === "number"
          ? Math.min(460, Math.max(120, p.bottomHeight))
          : DEFAULT_UI_LAYOUT.bottomHeight,
    };
  } catch {
    return DEFAULT_UI_LAYOUT;
  }
}

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

function cloneMachineConfig(cfg: MachineConfig): MachineConfig {
  return {
    ...DEFAULT_MACHINE_CONFIG,
    ...cfg,
    tools: Object.fromEntries(
      Object.entries(cfg.tools ?? {}).map(([k, v]) => [Number(k), { ...v }]),
    ),
    toolDiameters: { ...(cfg.toolDiameters ?? {}) },
    toolLengths: { ...(cfg.toolLengths ?? {}) },
    workOffsets: Object.fromEntries(
      Object.entries(cfg.workOffsets ?? DEFAULT_MACHINE_CONFIG.workOffsets).map(([k, v]) => [
        k,
        { ...v },
      ]),
    ),
    subprogramDirs: Array.isArray(cfg.subprogramDirs) ? [...cfg.subprogramDirs] : [],
    simReplaceRules: Array.isArray(cfg.simReplaceRules)
      ? cfg.simReplaceRules.map((r) => ({ ...r }))
      : [],
  };
}

function loadSavedMachineProfiles(): MachineProfile[] {
  const builtins = BUILTIN_MACHINE_PROFILES.map((p) => ({
    ...p,
    config: cloneMachineConfig(p.config),
  }));
  try {
    const raw = window.localStorage.getItem(MACHINE_PROFILES_STORAGE_KEY);
    if (!raw) return builtins;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return builtins;

    const savedValid: MachineProfile[] = parsed
      .filter(
        (p): p is MachineProfile =>
          Boolean(p && typeof p.id === "string" && p.config && typeof p.config === "object"),
      )
      .map((p) => ({
        id: p.id,
        builtin: Boolean(p.builtin),
        config: cloneMachineConfig(p.config),
      }));

    if (savedValid.length === 0) return builtins;

    // 不足している内蔵プロファイルがあれば補完する
    const savedIds = new Set(savedValid.map((p) => p.id));
    const missingBuiltins = builtins.filter((b) => !savedIds.has(b.id));
    return [...missingBuiltins, ...savedValid];
  } catch {
    return builtins;
  }
}

function loadSavedActiveMachineId(profiles: MachineProfile[]): string {
  try {
    const raw = window.localStorage.getItem(ACTIVE_MACHINE_ID_STORAGE_KEY);
    if (raw && profiles.some((p) => p.id === raw)) return raw;
  } catch {
    // ignore
  }
  return profiles[0]?.id ?? BUILTIN_MACHINE_PROFILES[0].id;
}

function sanitizeFileName(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|\s]+/g, "_");
  return cleaned || "machine";
}

function loadSavedDisplayOptions(): DisplayOptions {
  try {
    const raw = window.localStorage.getItem(DISPLAY_OPTIONS_STORAGE_KEY);
    if (!raw) return DEFAULT_DISPLAY_OPTIONS;
    const p = JSON.parse(raw) as Partial<DisplayOptions>;
    return {
      ...DEFAULT_DISPLAY_OPTIONS,
      showRapid: typeof p.showRapid === "boolean" ? p.showRapid : DEFAULT_DISPLAY_OPTIONS.showRapid,
      showProgramPath:
        typeof p.showProgramPath === "boolean"
          ? p.showProgramPath
          : DEFAULT_DISPLAY_OPTIONS.showProgramPath,
      showCompensatedPath:
        typeof p.showCompensatedPath === "boolean"
          ? p.showCompensatedPath
          : DEFAULT_DISPLAY_OPTIONS.showCompensatedPath,
      showToolModel:
        typeof p.showToolModel === "boolean"
          ? p.showToolModel
          : DEFAULT_DISPLAY_OPTIONS.showToolModel,
      showToolWidthFill:
        typeof p.showToolWidthFill === "boolean"
          ? p.showToolWidthFill
          : DEFAULT_DISPLAY_OPTIONS.showToolWidthFill,
      showGrid: typeof p.showGrid === "boolean" ? p.showGrid : DEFAULT_DISPLAY_OPTIONS.showGrid,
      showBoundingBox:
        typeof p.showBoundingBox === "boolean"
          ? p.showBoundingBox
          : DEFAULT_DISPLAY_OPTIONS.showBoundingBox,
      colorByTool:
        typeof p.colorByTool === "boolean" ? p.colorByTool : DEFAULT_DISPLAY_OPTIONS.colorByTool,
      traceClipFuture:
        typeof p.traceClipFuture === "boolean"
          ? p.traceClipFuture
          : DEFAULT_DISPLAY_OPTIONS.traceClipFuture,
      viewLayout:
        p.viewLayout === "single" || p.viewLayout === "triple" || p.viewLayout === "quad"
          ? p.viewLayout
          : DEFAULT_DISPLAY_OPTIONS.viewLayout,
      stock:
        p.stock && typeof p.stock === "object"
          ? { ...DEFAULT_DISPLAY_OPTIONS.stock, ...p.stock }
          : DEFAULT_DISPLAY_OPTIONS.stock,
      // ファイル固有フィルタ（O/T/D非表示・Zスライス）は毎回クリーン開始
      zSliceEnabled: false,
      hiddenTools: [],
      hiddenDNumbers: [],
      hiddenPrograms: [],
    };
  } catch {
    return DEFAULT_DISPLAY_OPTIONS;
  }
}

function loadSavedAutoBreak(): AutoBreakConfig {
  try {
    const raw = window.localStorage.getItem(AUTO_BREAK_STORAGE_KEY);
    if (!raw) return DEFAULT_AUTO_BREAK;
    const p = JSON.parse(raw) as Partial<AutoBreakConfig>;
    return {
      onToolChange:
        typeof p.onToolChange === "boolean" ? p.onToolChange : DEFAULT_AUTO_BREAK.onToolChange,
      onM00: typeof p.onM00 === "boolean" ? p.onM00 : DEFAULT_AUTO_BREAK.onM00,
      onZPlunge: typeof p.onZPlunge === "boolean" ? p.onZPlunge : DEFAULT_AUTO_BREAK.onZPlunge,
      onCompChange:
        typeof p.onCompChange === "boolean" ? p.onCompChange : DEFAULT_AUTO_BREAK.onCompChange,
      onErrorLine:
        typeof p.onErrorLine === "boolean" ? p.onErrorLine : DEFAULT_AUTO_BREAK.onErrorLine,
    };
  } catch {
    return DEFAULT_AUTO_BREAK;
  }
}

function loadSavedReplaceBatches(): ReplaceBatch[] {
  try {
    const raw = window.localStorage.getItem(REPLACE_BATCHES_STORAGE_KEY);
    if (!raw) return DEFAULT_REPLACE_BATCHES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0
      ? repairReplaceBatches(parsed)
      : DEFAULT_REPLACE_BATCHES;
  } catch {
    return DEFAULT_REPLACE_BATCHES;
  }
}

function loadSavedNcSnippets(): NcSnippet[] {
  try {
    const raw = window.localStorage.getItem(NC_SNIPPETS_STORAGE_KEY);
    if (!raw) return DEFAULT_NC_SNIPPETS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_NC_SNIPPETS;
  } catch {
    return DEFAULT_NC_SNIPPETS;
  }
}

function loadSavedRecentFiles(): RecentFileEntry[] {
  try {
    const raw = window.localStorage.getItem(RECENT_FILES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is RecentFileEntry =>
          Boolean(x && typeof x.path === "string" && typeof x.fileName === "string"),
      )
      .slice(0, MAX_RECENT_FILES);
  } catch {
    return [];
  }
}

/** 挿入・追記用に、先頭・末尾の単独 "%" 行を任意で取り除く */
function prepareInsertNcCode(rawContent: string, stripPercent: boolean): string {
  const normalized = rawContent.replace(/\r\n/g, "\n");
  if (!stripPercent) return normalized;
  const lines = normalized.split("\n");
  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  if (lines.length > 0 && lines[0].trim() === "%") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length > 0 && lines[lines.length - 1].trim() === "%") lines.pop();
  return lines.join("\n");
}

function parseImportedMachineProfiles(rawText: string): MachineProfile[] {
  const parsed = JSON.parse(rawText) as unknown;
  const rawItems: unknown[] = [];

  if (Array.isArray(parsed)) {
    rawItems.push(...parsed);
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.profiles)) {
      rawItems.push(...obj.profiles);
    } else if (obj.config && typeof obj.config === "object") {
      rawItems.push(obj);
    } else if (typeof obj.profileName === "string" || typeof obj.rapidRateX === "number") {
      // 単一の MachineConfig のみの場合も取り込めるようにする
      rawItems.push({
        id: `machine-import-${Date.now()}`,
        builtin: false,
        config: obj,
      });
    }
  }

  const builtinIds = new Set(BUILTIN_MACHINE_PROFILES.map((b) => b.id));
  const result: MachineProfile[] = [];
  rawItems.forEach((item, idx) => {
    if (!item || typeof item !== "object") return;
    const rec = item as Record<string, unknown>;
    const cfgObj =
      rec.config && typeof rec.config === "object"
        ? (rec.config as Partial<MachineConfig>)
        : null;
    if (!cfgObj) return;

    const rawId = typeof rec.id === "string" && rec.id.trim() ? rec.id.trim() : "";
    const isBuiltin = builtinIds.has(rawId);
    const id = rawId || `machine-import-${Date.now()}-${idx}`;
    const config = cloneMachineConfig(cfgObj as MachineConfig);
    if (!config.profileName || !config.profileName.trim()) {
      config.profileName = `インポートマシン ${idx + 1}`;
    }
    result.push({ id, builtin: isBuiltin, config });
  });

  if (result.length === 0) {
    throw new Error("有効なマシン設定データが見つかりませんでした。");
  }
  return result;
}

const NEW_NC_TEMPLATE = `%
O0001 (NEW PROGRAM)
G90 G40 G49 G80 G17 G21
T01 M06
G54 G00 X0.0 Y0.0
G43 Z50.0 H01 S5000 M03
G00 Z5.0
G01 Z-2.0 F200.0
G01 X50.0 Y0.0 F500.0
G00 Z50.0
M05
G91 G28 Z0.0
G90
M30
%`;

export function App() {
  const isMac = useMemo(
    () => typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent),
    [],
  );
  const [helpModal, setHelpModal] = useState<null | "shortcuts" | "about">(null);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateModalState>("idle");
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateInfo | null>(null);
  const [updateProgress, setUpdateProgress] = useState<UpdateDownloadProgress | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [hasDocument, setHasDocument] = useState<boolean>(false);
  const [source, setSource] = useState<string>("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [encoding, setEncoding] = useState<string>("UTF-8");
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [watchExternal, setWatchExternal] = useState<boolean>(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const hasDocumentRef = useRef<boolean>(false);
  hasDocumentRef.current = hasDocument;

  // マシンプロファイル一覧とアクティブマシン（ローカル自動永続化）
  const [machineProfiles, setMachineProfiles] = useState<MachineProfile[]>(() =>
    loadSavedMachineProfiles(),
  );
  const [activeMachineId, setActiveMachineId] = useState<string>(() =>
    loadSavedActiveMachineId(loadSavedMachineProfiles()),
  );

  const activeMachineProfile = useMemo(
    () => machineProfiles.find((p) => p.id === activeMachineId) ?? machineProfiles[0],
    [machineProfiles, activeMachineId],
  );
  const machineConfig = activeMachineProfile.config;

  useEffect(() => {
    try {
      window.localStorage.setItem(MACHINE_PROFILES_STORAGE_KEY, JSON.stringify(machineProfiles));
    } catch {
      // ignore
    }
  }, [machineProfiles]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_MACHINE_ID_STORAGE_KEY, activeMachineId);
    } catch {
      // ignore
    }
  }, [activeMachineId]);

  const [replaceBatches, setReplaceBatches] = useState<ReplaceBatch[]>(() =>
    loadSavedReplaceBatches(),
  );
  const [snippets, setSnippets] = useState<NcSnippet[]>(() => loadSavedNcSnippets());

  useEffect(() => {
    try {
      window.localStorage.setItem(REPLACE_BATCHES_STORAGE_KEY, JSON.stringify(replaceBatches));
    } catch {
      // ignore
    }
  }, [replaceBatches]);

  useEffect(() => {
    try {
      window.localStorage.setItem(NC_SNIPPETS_STORAGE_KEY, JSON.stringify(snippets));
    } catch {
      // ignore
    }
  }, [snippets]);

  const [displayOptions, setDisplayOptions] = useState<DisplayOptions>(() =>
    loadSavedDisplayOptions(),
  );
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState<boolean>(false);

  const [breakpoints, setBreakpoints] = useState<number[]>([]);
  const [autoBreak, setAutoBreak] = useState<AutoBreakConfig>(() => loadSavedAutoBreak());
  const [breakReason, setBreakReason] = useState<string | null>(null);

  // 描画オプション全般（ファイル固有フィルタを除く）を自動永続化
  useEffect(() => {
    try {
      const toSave = {
        showRapid: displayOptions.showRapid,
        showProgramPath: displayOptions.showProgramPath,
        showCompensatedPath: displayOptions.showCompensatedPath,
        showToolModel: displayOptions.showToolModel,
        showToolWidthFill: displayOptions.showToolWidthFill,
        showGrid: displayOptions.showGrid,
        showBoundingBox: displayOptions.showBoundingBox,
        colorByTool: displayOptions.colorByTool,
        traceClipFuture: displayOptions.traceClipFuture,
        viewLayout: displayOptions.viewLayout,
        stock: displayOptions.stock,
      };
      window.localStorage.setItem(DISPLAY_OPTIONS_STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // ignore
    }
  }, [
    displayOptions.showRapid,
    displayOptions.showProgramPath,
    displayOptions.showCompensatedPath,
    displayOptions.showToolModel,
    displayOptions.showToolWidthFill,
    displayOptions.showGrid,
    displayOptions.showBoundingBox,
    displayOptions.colorByTool,
    displayOptions.traceClipFuture,
    displayOptions.viewLayout,
    displayOptions.stock,
  ]);

  // 自動ブレイク条件を自動永続化
  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_BREAK_STORAGE_KEY, JSON.stringify(autoBreak));
    } catch {
      // ignore
    }
  }, [autoBreak]);

  // VS Code レイアウト（全ペイン開閉・サイズ・タブをローカル永続記憶）
  const initialLayoutRef = useRef<SavedUiLayout | null>(null);
  if (initialLayoutRef.current === null) {
    initialLayoutRef.current = loadSavedUiLayout();
  }
  const initLayout = initialLayoutRef.current;

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(initLayout.sidebarOpen);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(initLayout.sidebarTab);
  const [sidebarWidth, setSidebarWidth] = useState<number>(initLayout.sidebarWidth);
  const [editorOpen, setEditorOpen] = useState<boolean>(initLayout.editorOpen);
  const [bottomTab, setBottomTab] = useState<BottomTab>(initLayout.bottomTab);
  const [bottomCollapsed, setBottomCollapsed] = useState<boolean>(initLayout.bottomCollapsed);
  const [bottomHeight, setBottomHeight] = useState<number>(initLayout.bottomHeight);
  const [editorRatio, setEditorRatio] = useState<number>(initLayout.editorRatio);

  // パネル開閉・サイズ・タブ変更時に自動保存
  useEffect(() => {
    try {
      const payload: SavedUiLayout = {
        sidebarOpen,
        sidebarTab,
        sidebarWidth,
        editorOpen,
        editorRatio,
        bottomCollapsed,
        bottomTab,
        bottomHeight,
      };
      window.localStorage.setItem(UI_LAYOUT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [
    sidebarOpen,
    sidebarTab,
    sidebarWidth,
    editorOpen,
    editorRatio,
    bottomCollapsed,
    bottomTab,
    bottomHeight,
  ]);

  // トレース再生状態（デフォルト 30x、変更値はローカル記憶）
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [editorFontSize, setEditorFontSize] = useState<number>(() => {
    try {
      const v = Number(window.localStorage.getItem(EDITOR_FONT_SIZE_STORAGE_KEY));
      return Number.isFinite(v) && v >= 9 && v <= 24 ? v : 13;
    } catch {
      return 13;
    }
  });

  const handleChangeEditorFontSize = useCallback((next: number) => {
    const clamped = Math.min(24, Math.max(9, Math.round(next)));
    setEditorFontSize(clamped);
    try {
      window.localStorage.setItem(EDITOR_FONT_SIZE_STORAGE_KEY, String(clamped));
    } catch {
      // ignore
    }
  }, []);

  const [playbackSpeed, setPlaybackSpeed] = useState<number>(() => loadSavedPlaybackSpeed());
  const [skipToolChangeTime, setSkipToolChangeTime] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(SKIP_ATC_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const handleToggleSkipToolChangeTime = useCallback(() => {
    setSkipToolChangeTime((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SKIP_ATC_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

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
  const ncEditorRef = useRef<NcEditorHandle | null>(null);
  const dragModeRef = useRef<null | "sidebar" | "editor" | "bottom">(null);
  const isDirtyRef = useRef<boolean>(false);
  isDirtyRef.current = isDirty;

  // 最近開いたファイル履歴
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>(() => loadSavedRecentFiles());
  // 未保存確認モーダル
  const [unsavedPrompt, setUnsavedPrompt] = useState<{
    actionLabel: string;
    proceed: () => void | Promise<void>;
  } | null>(null);
  // ドラッグ＆ドロップ状態・選択モーダル
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [pendingDrop, setPendingDrop] = useState<{
    file: FileReadResult;
    selection: EditorSelectionInfo;
  } | null>(null);

  const pushRecentFile = useCallback((path: string, name: string) => {
    setRecentFiles((prev) => {
      const next = [{ path, fileName: name }, ...prev.filter((item) => item.path !== path)].slice(
        0,
        MAX_RECENT_FILES,
      );
      try {
        window.localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const handleClearRecentFiles = useCallback(() => {
    setRecentFiles([]);
    try {
      window.localStorage.removeItem(RECENT_FILES_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const confirmIfDirty = useCallback(
    (actionLabel: string, proceed: () => void | Promise<void>) => {
      if (!isDirtyRef.current) {
        void proceed();
        return;
      }
      setUnsavedPrompt({ actionLabel, proceed });
    },
    [],
  );

  // ファイル開く・サンプル切替後の「次回解析完了時」に必ず全体センタリングするフラグ
  const pendingAutoFitRef = useRef<boolean>(true);
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

  // Tauri 実行環境チェック
  useEffect(() => {
    if (!isTauriRuntime()) {
      setParseError(
        "このアプリは Tauri デスクトップ環境（npm run tauri dev）で実行してください。",
      );
    }
  }, []);

  // OSウィンドウタイトルを現在のファイル名・未保存状態と同期
  useEffect(() => {
    if (!isTauriRuntime()) return;
    const title = hasDocument
      ? `${isDirty ? "● " : ""}${fileName} - TomboGCoder`
      : "TomboGCoder — FANUC 3軸 NC Viewer";
    getCurrentWindow()
      .setTitle(title)
      .catch(() => {});
  }, [hasDocument, fileName, isDirty]);

  // ウィンドウを閉じる際の未保存変更ガード
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | null = null;
    let active = true;
    (async () => {
      try {
        unlisten = await getCurrentWindow().onCloseRequested((event) => {
          if (!active) return;
          if (isDirtyRef.current) {
            event.preventDefault();
            setUnsavedPrompt({
              actionLabel: "アプリを終了",
              proceed: async () => {
                await getCurrentWindow().destroy();
              },
            });
          }
        });
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
      unlisten?.();
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
            const applyReload = () => {
              setSource(reloaded.content);
              setEncoding(reloaded.encoding);
              setIsDirty(false);
              showToast(`外部更新を検知して再読込しました: ${reloaded.fileName}`);
            };
            if (isDirtyRef.current) {
              setUnsavedPrompt({
                actionLabel: "外部で更新されたファイルを再読込",
                proceed: applyReload,
              });
            } else {
              applyReload();
            }
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
            const total = res.compensatedSegments.length;
            return prev <= 0 ? 0 : Math.min(prev, total);
          });
          // 新規ファイル読込・サンプル切替直後は、新boundingBox確定後に自動で全体センタリング
          if (pendingAutoFitRef.current && res.boundingBox.valid) {
            pendingAutoFitRef.current = false;
            setCameraCommand((c) => ({ preset: "iso", seq: (c?.seq ?? 0) + 1 }));
          }
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

  const applyOpenedFile = useCallback(
    (file: FileReadResult) => {
      setIsPlaying(false);
      setBreakReason(null);
      setBreakpoints([]);
      setDisplayOptions((prev) => ({
        ...prev,
        hiddenPrograms: [],
        hiddenTools: [],
        hiddenDNumbers: [],
      }));
      setHasDocument(true);
      setSource(file.content);
      setFilePath(file.path);
      setFileName(file.fileName);
      setEncoding(file.encoding);
      setIsDirty(false);
      setActiveSegmentIndex(0);
      pendingAutoFitRef.current = true;
      pushRecentFile(file.path, file.fileName);
    },
    [pushRecentFile],
  );

  const handleNewFile = useCallback(() => {
    confirmIfDirty("新規NCプログラムを作成", () => {
      setIsPlaying(false);
      setBreakReason(null);
      setBreakpoints([]);
      setDisplayOptions((prev) => ({
        ...prev,
        hiddenPrograms: [],
        hiddenTools: [],
        hiddenDNumbers: [],
      }));
      setHasDocument(true);
      setSource(NEW_NC_TEMPLATE);
      setFilePath(null);
      setFileName("untitled.nc");
      setEncoding("UTF-8");
      setIsDirty(false);
      setActiveSegmentIndex(0);
      setEditorOpen(true);
      pendingAutoFitRef.current = true;
      showToast("新規NCプログラムを作成しました");
    });
  }, [confirmIfDirty, showToast]);

  const handleCloseDocument = useCallback(() => {
    if (!hasDocumentRef.current) return;
    confirmIfDirty("現在のファイルを閉じてスタート画面へ戻る", () => {
      setIsPlaying(false);
      setBreakReason(null);
      setBreakpoints([]);
      setHasDocument(false);
      setSource("");
      setFilePath(null);
      setFileName("");
      setParseResult(null);
      setIsDirty(false);
      setActiveSegmentIndex(0);
    });
  }, [confirmIfDirty]);

  const handleInsertExternalFile = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      const file = await openNcFileDialog();
      if (!file) return;
      const text = prepareInsertNcCode(file.content, true);
      if (!editorOpen) {
        setEditorOpen(true);
      }
      const inserted = ncEditorRef.current?.insertAtSelection(text);
      if (!inserted) {
        setSource((prev) => (prev ? `${prev}\n${text}` : text));
        setIsDirty(true);
      }
      showToast(`カーソル位置にコードを挿入しました: ${file.fileName} (Ctrl+Z で戻せます)`);
    } catch (err) {
      setParseError(`外部NCファイル挿入エラー: ${String(err)}`);
    }
  }, [editorOpen, showToast]);

  const handleQuitApp = useCallback(() => {
    if (!isTauriRuntime()) return;
    getCurrentWindow()
      .close()
      .catch(() => {});
  }, []);

  const handleOpenFile = useCallback(() => {
    if (!isTauriRuntime()) return;
    confirmIfDirty("別のファイルを開く", async () => {
      try {
        const file = await openNcFileDialog();
        if (!file) return;
        applyOpenedFile(file);
      } catch (err) {
        setParseError(`ファイルを開けませんでした: ${String(err)}`);
      }
    });
  }, [confirmIfDirty, applyOpenedFile]);

  const handleOpenRecentFile = useCallback(
    (path: string) => {
      if (!isTauriRuntime()) return;
      confirmIfDirty("履歴のファイルを開く", async () => {
        try {
          const file = await readNcFileByPath(path);
          applyOpenedFile(file);
        } catch (err) {
          setParseError(`ファイルを開けませんでした (${path}): ${String(err)}`);
        }
      });
    },
    [confirmIfDirty, applyOpenedFile],
  );

  const performSaveFile = useCallback(
    async (saveAs: boolean): Promise<boolean> => {
      if (!isTauriRuntime()) return false;
      try {
        const suggested = fileName.replace(/\s*\(.*\)$/, "") || "program.nc";
        const savedPath = await saveNcFile(source, filePath, saveAs, encoding, suggested);
        if (!savedPath) return false;
        setFilePath(savedPath);
        const name = savedPath.split(/[\\/]/).pop() ?? "program.nc";
        setFileName(name);
        setIsDirty(false);
        pushRecentFile(savedPath, name);
        showToast(
          `${saveAs ? "別名で保存" : "保存"}しました: ${name} (${encoding})`,
        );
        return true;
      } catch (err) {
        setParseError(`保存エラー: ${String(err)}`);
        return false;
      }
    },
    [source, filePath, fileName, encoding, pushRecentFile, showToast],
  );

  const handleSaveFile = useCallback(() => {
    if (!hasDocumentRef.current) return;
    void performSaveFile(false);
  }, [performSaveFile]);

  const handleSaveAsFile = useCallback(() => {
    if (!hasDocumentRef.current) return;
    void performSaveFile(true);
  }, [performSaveFile]);

  const handleToggleEncoding = useCallback(() => {
    if (!hasDocumentRef.current) return;
    const next = encoding === "Shift-JIS" ? "UTF-8" : "Shift-JIS";
    setEncoding(next);
    setIsDirty(true);
    showToast(`保存時の文字コードを ${next} に変更しました（Ctrl+S で保存反映）`);
  }, [encoding, showToast]);

  // チェック中の O番号だけで再集計したアクティブ結果（再生・加工時間・範囲・レポートすべてに連動）
  const effectiveResult = useMemo(
    () => buildFilteredParseResult(parseResult, displayOptions.hiddenPrograms),
    [parseResult, displayOptions.hiddenPrograms],
  );

  // O番号チェック切替時は安全に再生停止し、加工終了後の全体表示 (0) へリセット
  useEffect(() => {
    if (!effectiveResult) return;
    setIsPlaying(false);
    setBreakReason(null);
    setActiveSegmentIndex(0);
    // 絞り込み時は対象O番号へカメラフィット
    if (displayOptions.hiddenPrograms.length > 0 && effectiveResult.boundingBox.valid) {
      setCameraCommand((c) => ({ preset: "fit", seq: (c?.seq ?? 0) + 1 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayOptions.hiddenPrograms]);

  const handleTogglePlay = useCallback(() => {
    if (!effectiveResult || effectiveResult.compensatedSegments.length === 0) return;
    setBreakReason(null);
    const total = effectiveResult.compensatedSegments.length;
    setIsPlaying((playing) => {
      if (!playing && (activeSegmentIndex <= 0 || activeSegmentIndex >= total)) {
        // 0 (完了状態) または終端からの再生は 1ブロック目から加工スタート
        setActiveSegmentIndex(1);
      }
      return !playing;
    });
  }, [effectiveResult, activeSegmentIndex]);

  const handleToggleBreakpoint = useCallback((lineNumber: number) => {
    setBreakpoints((prev) =>
      prev.includes(lineNumber) ? prev.filter((l) => l !== lineNumber) : [...prev, lineNumber],
    );
  }, []);

  const handleSelectMachineProfile = useCallback(
    (id: string) => {
      const target = machineProfiles.find((p) => p.id === id);
      if (!target) return;
      setActiveMachineId(id);
      showToast(`マシンを切り替えました: ${target.config.profileName}`);
    },
    [machineProfiles, showToast],
  );

  const handleUpdateActiveMachineConfig = useCallback(
    (nextConfig: MachineConfig) => {
      setMachineProfiles((prev) =>
        prev.map((p) => (p.id === activeMachineId ? { ...p, config: nextConfig } : p)),
      );
    },
    [activeMachineId],
  );

  const handleDuplicateMachineProfile = useCallback(
    (newName: string) => {
      const id = `machine-custom-${Date.now()}`;
      const nextProfile: MachineProfile = {
        id,
        builtin: false,
        config: {
          ...cloneMachineConfig(activeMachineProfile.config),
          profileName: newName,
        },
      };
      setMachineProfiles((prev) => [...prev, nextProfile]);
      setActiveMachineId(id);
      showToast(`新しいマシンを作成しました: ${newName}`);
    },
    [activeMachineProfile, showToast],
  );

  const handleDeleteMachineProfile = useCallback(
    (id: string) => {
      const target = machineProfiles.find((p) => p.id === id);
      if (!target || target.builtin) return;
      const updated = machineProfiles.filter((p) => p.id !== id);
      setMachineProfiles(updated);
      if (activeMachineId === id && updated.length > 0) {
        setActiveMachineId(updated[0].id);
      }
      showToast(`カスタムマシンを削除しました: ${target.config.profileName}`);
    },
    [machineProfiles, activeMachineId, showToast],
  );

  const handleResetBuiltinMachineProfile = useCallback(
    (id: string) => {
      const builtin = BUILTIN_MACHINE_PROFILES.find((p) => p.id === id);
      if (!builtin) return;
      setMachineProfiles((prev) =>
        prev.map((p) => (p.id === id ? { ...p, config: cloneMachineConfig(builtin.config) } : p)),
      );
      showToast(`マシン設定を初期値に戻しました: ${builtin.config.profileName}`);
    },
    [showToast],
  );

  const handleExportActiveMachineProfile = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      const payload = JSON.stringify(
        {
          app: "TomboGCoder",
          format: "machine-profiles",
          version: 1,
          exportedAt: new Date().toISOString(),
          profiles: [activeMachineProfile],
        },
        null,
        2,
      );
      const defaultName = `${sanitizeFileName(activeMachineProfile.config.profileName)}.machine.json`;
      const saved = await exportJsonFile(
        defaultName,
        payload,
        `マシン設定を書き出し (${activeMachineProfile.config.profileName})`,
      );
      if (saved) {
        showToast(`マシン設定を書き出しました: ${activeMachineProfile.config.profileName}`);
      }
    } catch (err) {
      setParseError(`マシン設定エクスポートエラー: ${String(err)}`);
    }
  }, [activeMachineProfile, showToast]);

  const handleExportAllMachineProfiles = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      const payload = JSON.stringify(
        {
          app: "TomboGCoder",
          format: "machine-profiles",
          version: 1,
          exportedAt: new Date().toISOString(),
          profiles: machineProfiles,
        },
        null,
        2,
      );
      const saved = await exportJsonFile(
        "tombo_machines_backup.json",
        payload,
        `全マシン設定を一括バックアップ (${machineProfiles.length}台)`,
      );
      if (saved) {
        showToast(`全${machineProfiles.length}台のマシン設定を書き出しました`);
      }
    } catch (err) {
      setParseError(`全マシン設定エクスポートエラー: ${String(err)}`);
    }
  }, [machineProfiles, showToast]);

  const importMachineProfilesFromText = useCallback(
    (rawText: string) => {
      const imported = parseImportedMachineProfiles(rawText);

      const nextList = machineProfiles.map((p) => ({
        ...p,
        config: cloneMachineConfig(p.config),
      }));
      let addedCount = 0;
      let updatedCount = 0;
      let focusId: string | null = null;

      for (const item of imported) {
        if (item.builtin) {
          const idx = nextList.findIndex((p) => p.id === item.id);
          if (idx >= 0) {
            nextList[idx] = { ...nextList[idx], config: item.config };
            updatedCount += 1;
            focusId = nextList[idx].id;
          } else {
            nextList.push(item);
            addedCount += 1;
            focusId = item.id;
          }
        } else {
          // 既存カスタム機と ID または名称が一致すれば上書き、なければ新規追加
          const byId = nextList.findIndex((p) => !p.builtin && p.id === item.id);
          const byName =
            byId >= 0
              ? byId
              : nextList.findIndex(
                  (p) => !p.builtin && p.config.profileName === item.config.profileName,
                );
          if (byName >= 0) {
            nextList[byName] = { ...nextList[byName], config: item.config };
            updatedCount += 1;
            focusId = nextList[byName].id;
          } else {
            const uniqueId = nextList.some((p) => p.id === item.id)
              ? `machine-custom-${Date.now()}-${addedCount}`
              : item.id;
            nextList.push({ id: uniqueId, builtin: false, config: item.config });
            addedCount += 1;
            focusId = uniqueId;
          }
        }
      }

      setMachineProfiles(nextList);
      if (focusId) {
        setActiveMachineId(focusId);
      }

      const summaryParts: string[] = [];
      if (addedCount > 0) summaryParts.push(`追加 ${addedCount}台`);
      if (updatedCount > 0) summaryParts.push(`更新 ${updatedCount}台`);
      showToast(`マシン設定を読み込みました (${summaryParts.join(" / ")})`);
    },
    [machineProfiles, showToast],
  );

  const handleImportMachineProfiles = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      const file = await openJsonFileDialog("マシン設定 JSON をインポート");
      if (!file) return;
      importMachineProfilesFromText(file.content);
    } catch (err) {
      setParseError(`マシン設定インポートエラー: ${String(err)}`);
    }
  }, [importMachineProfilesFromText]);

  // ウィンドウへのファイル ドラッグ＆ドロップ監視（NC: スタート画面なら即開く / 編集中は新規or挿入選択、JSON: マシン設定読込）
  const importMachineRef = useRef(importMachineProfilesFromText);
  importMachineRef.current = importMachineProfilesFromText;
  const applyOpenedFileRef = useRef(applyOpenedFile);
  applyOpenedFileRef.current = applyOpenedFile;

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | null = null;
    let active = true;

    (async () => {
      try {
        unlisten = await getCurrentWindow().onDragDropEvent(async (event) => {
          if (!active) return;
          const payload = event.payload;
          if (payload.type === "enter" || payload.type === "over") {
            setIsDragOver(true);
          } else if (payload.type === "leave") {
            setIsDragOver(false);
          } else if (payload.type === "drop") {
            setIsDragOver(false);
            const firstPath = payload.paths[0];
            if (!firstPath) return;
            try {
              const file = await readNcFileByPath(firstPath);
              if (!active) return;
              if (file.fileName.toLowerCase().endsWith(".json")) {
                importMachineRef.current(file.content);
                return;
              }
              // スタートアップ画面表示中は確認モーダルを出さずにそのまま即開く
              if (!hasDocumentRef.current) {
                applyOpenedFileRef.current(file);
                return;
              }
              const selection = ncEditorRef.current?.getSelectionInfo() ?? {
                from: 0,
                to: 0,
                lineNumber: 1,
                endLineNumber: 1,
                selectedChars: 0,
              };
              setPendingDrop({ file, selection });
            } catch (err) {
              setParseError(`ドロップファイルの読込に失敗しました: ${String(err)}`);
            }
          }
        });
      } catch {
        // ignore
      }
    })();

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  const handleDropOpenAsNew = useCallback(() => {
    if (!pendingDrop) return;
    const dropped = pendingDrop.file;
    setPendingDrop(null);
    confirmIfDirty(`ドロップしたファイル「${dropped.fileName}」を開く`, () => {
      applyOpenedFile(dropped);
    });
  }, [pendingDrop, confirmIfDirty, applyOpenedFile]);

  const handleDropInsertAtSelection = useCallback(
    (stripPercent: boolean) => {
      if (!pendingDrop) return;
      const dropped = pendingDrop.file;
      const text = prepareInsertNcCode(dropped.content, stripPercent);
      setPendingDrop(null);
      if (!editorOpen) {
        setEditorOpen(true);
      }
      const inserted = ncEditorRef.current?.insertAtSelection(text);
      if (!inserted) {
        // エディタ未マウント時はソース末尾へ安全にフォールバック挿入
        setSource((prev) => (prev ? `${prev}\n${text}` : text));
        setIsDirty(true);
      }
      showToast(`選択箇所にコードを挿入しました: ${dropped.fileName} (Ctrl+Z で戻せます)`);
    },
    [pendingDrop, editorOpen, showToast],
  );

  const handleDropAppendToEnd = useCallback(
    (stripPercent: boolean) => {
      if (!pendingDrop) return;
      const dropped = pendingDrop.file;
      const text = prepareInsertNcCode(dropped.content, stripPercent);
      setPendingDrop(null);
      if (!editorOpen) {
        setEditorOpen(true);
      }
      const appended = ncEditorRef.current?.appendToEnd(text);
      if (!appended) {
        setSource((prev) => (prev ? `${prev}\n${text}` : text));
        setIsDirty(true);
      }
      showToast(`末尾にコードを追記しました: ${dropped.fileName} (Ctrl+Z で戻せます)`);
    },
    [pendingDrop, editorOpen, showToast],
  );

  const executeReplaceRules = useCallback(
    (label: string, rulesToApply: ReplaceRule[]) => {
      const res = applyReplaceRulesToText(source, rulesToApply);
      if (res.error) {
        setParseError(res.error);
        return;
      }
      if (res.text === source) {
        showToast(`「${label}」に一致する箇所がありませんでした`);
        return;
      }
      if (!editorOpen) setEditorOpen(true);
      const replaced = ncEditorRef.current?.replaceEntireDocument(res.text);
      if (!replaced) {
        setSource(res.text);
        setIsDirty(true);
      }
      showToast(
        `「${label}」を実行: ${res.appliedRules}ルールで ${res.hitCount}箇所を置換 (Ctrl+Z で元に戻せます)`,
      );
    },
    [source, editorOpen, showToast],
  );

  const handleRunReplaceBatch = useCallback(
    (batch: ReplaceBatch) => {
      executeReplaceRules(batch.name, batch.rules);
    },
    [executeReplaceRules],
  );

  const handleApplySingleRule = useCallback(
    (rule: ReplaceRule) => {
      executeReplaceRules(rule.name, [{ ...rule, enabled: true }]);
    },
    [executeReplaceRules],
  );

  const handleExportReplaceBatches = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      const payload = JSON.stringify(
        {
          app: "TomboGCoder",
          format: "replace-batches",
          version: 1,
          exportedAt: new Date().toISOString(),
          batches: replaceBatches,
        },
        null,
        2,
      );
      const saved = await exportJsonFile(
        "tombo_replace_batches.json",
        payload,
        "置換ルールセットを書き出し",
      );
      if (saved) showToast(`置換セット ${replaceBatches.length}件を書き出しました`);
    } catch (err) {
      setParseError(`置換セット書き出しエラー: ${String(err)}`);
    }
  }, [replaceBatches, showToast]);

  const handleImportReplaceBatches = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      const file = await openJsonFileDialog(
        "置換ルール JSON または MIFES REPBATCH (.ini/.txt) を読み込み",
        true,
      );
      if (!file) return;
      const imported = parseImportedReplaceBatches(file.content);
      setReplaceBatches((prev) => {
        const next = [...prev];
        for (const batch of imported) {
          const idx = next.findIndex((x) => x.id === batch.id || x.name === batch.name);
          if (idx >= 0) next[idx] = batch;
          else next.push(batch);
        }
        return next;
      });
      const totalRules = imported.reduce((acc, b) => acc + b.rules.length, 0);
      showToast(`置換セット ${imported.length}件（計${totalRules}ルール）を読み込みました`);
    } catch (err) {
      setParseError(`置換セット読み込みエラー: ${String(err)}`);
    }
  }, [showToast]);

  const handleInsertSnippet = useCallback(
    (snippet: NcSnippet) => {
      if (!editorOpen) setEditorOpen(true);
      const inserted = ncEditorRef.current?.insertAtSelection(snippet.body);
      if (!inserted) {
        setSource((prev) => (prev ? `${prev}\n${snippet.body}` : snippet.body));
        setIsDirty(true);
      }
      showToast(`定型文を挿入しました: ${snippet.name} (Ctrl+Z で元に戻せます)`);
    },
    [editorOpen, showToast],
  );

  const handleExportSnippets = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      const payload = JSON.stringify(
        {
          app: "TomboGCoder",
          format: "nc-snippets",
          version: 1,
          exportedAt: new Date().toISOString(),
          snippets,
        },
        null,
        2,
      );
      const saved = await exportJsonFile("tombo_nc_snippets.json", payload, "定型文集を書き出し");
      if (saved) showToast(`定型文 ${snippets.length}件を書き出しました`);
    } catch (err) {
      setParseError(`定型文書き出しエラー: ${String(err)}`);
    }
  }, [snippets, showToast]);

  const handleImportSnippets = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      const file = await openJsonFileDialog("定型文集 JSON を読み込み");
      if (!file) return;
      const parsed = JSON.parse(file.content) as unknown;
      const rawList = Array.isArray(parsed)
        ? parsed
        : parsed &&
            typeof parsed === "object" &&
            Array.isArray((parsed as { snippets?: unknown }).snippets)
          ? (parsed as { snippets: unknown[] }).snippets
          : [];
      const valid: NcSnippet[] = rawList
        .filter(
          (x): x is Partial<NcSnippet> =>
            Boolean(x && typeof x === "object" && typeof (x as NcSnippet).body === "string"),
        )
        .map((s, i) => ({
          id: s.id && typeof s.id === "string" ? s.id : `snip-imp-${Date.now()}-${i}`,
          name: s.name && typeof s.name === "string" ? s.name : `定型文 ${i + 1}`,
          category: s.category && typeof s.category === "string" ? s.category : "共通",
          body: s.body ?? "",
        }));
      if (valid.length === 0) {
        throw new Error("有効な定型文が見つかりませんでした");
      }
      setSnippets((prev) => {
        const next = [...prev];
        for (const item of valid) {
          const idx = next.findIndex((x) => x.name === item.name);
          if (idx >= 0) next[idx] = item;
          else next.push(item);
        }
        return next;
      });
      showToast(`定型文 ${valid.length}件を読み込みました`);
    } catch (err) {
      setParseError(`定型文読み込みエラー: ${String(err)}`);
    }
  }, [showToast]);

  const handleCheckForUpdates = useCallback(
    async (silent: boolean) => {
      if (!isTauriRuntime()) {
        if (!silent) {
          showToast("自動アップデートはデスクトップアプリ版で利用できます");
        }
        return;
      }
      if (!silent) {
        setUpdateError(null);
        setUpdateProgress(null);
        setUpdateState("checking");
        setUpdateModalOpen(true);
      }
      try {
        const info = await checkForAppUpdate();
        if (info) {
          setAvailableUpdate(info);
          setUpdateState("available");
          if (silent) {
            showToast(`新しいバージョン v${info.version} が利用可能です（右上の更新ボタンから適用）`);
          }
        } else if (!silent) {
          setAvailableUpdate(null);
          setUpdateState("up-to-date");
        }
      } catch (err) {
        if (!silent) {
          setUpdateError(String(err));
          setUpdateState("error");
        }
      }
    },
    [showToast],
  );

  const handleInstallUpdate = useCallback(async () => {
    if (!availableUpdate) return;
    setUpdateError(null);
    setUpdateState("downloading");
    setUpdateProgress({ downloadedBytes: 0, totalBytes: null, percent: 0 });
    try {
      await installAppUpdate(availableUpdate.raw, (prog) => {
        setUpdateProgress(prog);
      });
    } catch (err) {
      setUpdateError(String(err));
      setUpdateState("error");
    }
  }, [availableUpdate]);

  // デスクトップ起動3.5秒後にバックグラウンドで新バージョンを自動チェック（失敗時は静かに無視）
  useEffect(() => {
    if (!isTauriRuntime()) return;
    const timer = window.setTimeout(() => {
      void handleCheckForUpdates(true);
    }, 3500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (e.key === "Escape") {
        if (helpModal) {
          setHelpModal(null);
          return;
        }
        if (unsavedPrompt) {
          setUnsavedPrompt(null);
          return;
        }
        if (pendingDrop) {
          setPendingDrop(null);
          return;
        }
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleNewFile();
        return;
      }
      if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        handleOpenFile();
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (e.shiftKey) {
          handleSaveAsFile();
        } else {
          handleSaveFile();
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "w") {
        e.preventDefault();
        handleCloseDocument();
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
        const total = effectiveResult?.compensatedSegments.length ?? 0;
        setActiveSegmentIndex((prev) => Math.min(total, prev + 1));
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
  }, [
    handleNewFile,
    handleOpenFile,
    handleSaveFile,
    handleSaveAsFile,
    handleCloseDocument,
    handleTogglePlay,
    effectiveResult,
    helpModal,
    unsavedPrompt,
    pendingDrop,
  ]);

  const jumpToLine = useCallback(
    (lineNumber: number) => {
      if (!effectiveResult) return;
      const segs = effectiveResult.compensatedSegments;
      const exactIdx = segs.findIndex((s) => s.lineNumber === lineNumber);
      if (exactIdx >= 0) {
        setIsPlaying(false);
        setBreakReason(null);
        setActiveSegmentIndex(exactIdx + 1);
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
        setActiveSegmentIndex(nearestIdx + 1);
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

  // activeSegmentIndex: 0 = 加工終了後(全体表示), 1..N = 各ブロック実行状態
  const activeSegment = useMemo(() => {
    const segs = effectiveResult?.compensatedSegments;
    if (!segs || segs.length === 0) return null;
    if (activeSegmentIndex <= 0) return segs[segs.length - 1];
    return segs[Math.min(segs.length - 1, activeSegmentIndex - 1)] ?? null;
  }, [effectiveResult, activeSegmentIndex]);
  const activeEditorLine = activeSegmentIndex > 0 ? (activeSegment?.lineNumber ?? null) : null;
  const errorCount =
    effectiveResult?.diagnostics.filter((d) => d.severity === "error").length ?? 0;
  const warnCount =
    effectiveResult?.diagnostics.filter((d) => d.severity === "warning").length ?? 0;

  const fileStats = useMemo(() => {
    const charCountNoNewline = source.replace(/\r?\n/g, "").length;
    const lineCount = source ? source.split(/\r?\n/).length : 0;
    const programCount = parseResult?.detectedPrograms.length ?? 0;
    return { programCount, charCountNoNewline, lineCount };
  }, [source, parseResult]);

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
        isMac={isMac}
        hasDocument={hasDocument}
        fileName={fileName}
        filePath={filePath}
        encoding={encoding}
        isDirty={isDirty}
        isParsing={isParsing}
        watchExternal={watchExternal}
        recentFiles={recentFiles}
        machineProfiles={machineProfiles}
        activeMachineProfile={activeMachineProfile}
        displayOptions={displayOptions}
        isPlaying={isPlaying}
        isViewportMaximized={isViewportMaximized}
        breakpointCount={breakpoints.length}
        sidebarOpen={sidebarOpen}
        editorOpen={editorOpen}
        bottomOpen={!bottomCollapsed}
        onNewFile={handleNewFile}
        onOpenFile={handleOpenFile}
        onOpenRecentFile={handleOpenRecentFile}
        onClearRecentFiles={handleClearRecentFiles}
        onSaveFile={handleSaveFile}
        onSaveAsFile={handleSaveAsFile}
        onCloseDocument={handleCloseDocument}
        onToggleEncoding={handleToggleEncoding}
        onToggleWatchExternal={() => setWatchExternal((v) => !v)}
        onExportCsv={handleExportCsv}
        onExportHtml={handleExportHtml}
        onQuitApp={handleQuitApp}
        onEditUndo={() => {
          setEditorOpen(true);
          ncEditorRef.current?.undo();
        }}
        onEditRedo={() => {
          setEditorOpen(true);
          ncEditorRef.current?.redo();
        }}
        onEditSearch={() => {
          setEditorOpen(true);
          window.setTimeout(() => ncEditorRef.current?.openSearch(), 0);
        }}
        onEditSelectAll={() => {
          setEditorOpen(true);
          ncEditorRef.current?.selectAll();
        }}
        onInsertExternalFile={handleInsertExternalFile}
        onOpenEditToolsPanel={() => {
          setSidebarTab("edit");
          setSidebarOpen(true);
        }}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onToggleEditor={() => setEditorOpen((v) => !v)}
        onToggleBottom={() => setBottomCollapsed((v) => !v)}
        onToggleMaximizeViewport={handleToggleMaximizeViewport}
        onCameraPreset={(preset) =>
          setCameraCommand((c) => ({ preset, seq: (c?.seq ?? 0) + 1 }))
        }
        onUpdateDisplayOptions={(patch) =>
          setDisplayOptions((prev) => ({ ...prev, ...patch }))
        }
        onSelectMachineProfile={handleSelectMachineProfile}
        onOpenMachineSettings={() => {
          setSidebarTab("machine");
          setSidebarOpen(true);
        }}
        onExportActiveMachineProfile={handleExportActiveMachineProfile}
        onExportAllMachineProfiles={handleExportAllMachineProfiles}
        onImportMachineProfiles={handleImportMachineProfiles}
        onTogglePlay={handleTogglePlay}
        onRewindSim={() => {
          setIsPlaying(false);
          setBreakReason(null);
          setActiveSegmentIndex(0);
        }}
        onStepSim={(delta) => {
          setIsPlaying(false);
          setBreakReason(null);
          const total = effectiveResult?.compensatedSegments.length ?? 0;
          setActiveSegmentIndex((prev) => Math.max(0, Math.min(total, prev + delta)));
        }}
        onClearBreakpoints={() => setBreakpoints([])}
        onOpenBottomTab={(tab) => {
          setBottomTab(tab);
          setBottomCollapsed(false);
        }}
        availableUpdateVersion={availableUpdate?.version ?? null}
        onCheckForUpdates={() => {
          void handleCheckForUpdates(false);
        }}
        onOpenUpdateModal={() => {
          if (availableUpdate) {
            setUpdateState("available");
            setUpdateModalOpen(true);
          } else {
            void handleCheckForUpdates(false);
          }
        }}
        onOpenHelpModal={(mode) => setHelpModal(mode)}
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
              ["filter", Layers, "表示フィルタ・透過ストック・Zスライス (Cmd/Ctrl+B)"],
              ["machine", Settings, "マシン設定 (工具マガジン・径補正・仕様・Sim置換)"],
              ["edit", Wand2, "正規表現置換ルール & 定型文入力"],
              ["debug", Bug, "ブレイクポイント & 自動停止条件"],
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
                machineProfiles={machineProfiles}
                activeMachineProfile={activeMachineProfile}
                onSelectMachineProfile={handleSelectMachineProfile}
                onUpdateActiveMachineConfig={handleUpdateActiveMachineConfig}
                onDuplicateMachineProfile={handleDuplicateMachineProfile}
                onDeleteMachineProfile={handleDeleteMachineProfile}
                onResetBuiltinMachineProfile={handleResetBuiltinMachineProfile}
                onExportActiveMachineProfile={handleExportActiveMachineProfile}
                onExportAllMachineProfiles={handleExportAllMachineProfiles}
                onImportMachineProfiles={handleImportMachineProfiles}
                replaceBatches={replaceBatches}
                onUpdateReplaceBatches={setReplaceBatches}
                onRunReplaceBatch={handleRunReplaceBatch}
                onApplySingleRule={handleApplySingleRule}
                onExportReplaceBatches={handleExportReplaceBatches}
                onImportReplaceBatches={handleImportReplaceBatches}
                snippets={snippets}
                onUpdateSnippets={setSnippets}
                onInsertSnippet={handleInsertSnippet}
                onExportSnippets={handleExportSnippets}
                onImportSnippets={handleImportSnippets}
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
          {!hasDocument ? (
            <WelcomeScreen
              isMac={isMac}
              activeMachineProfile={activeMachineProfile}
              recentFiles={recentFiles}
              onOpenFile={handleOpenFile}
              onNewFile={handleNewFile}
              onOpenRecentFile={handleOpenRecentFile}
              onClearRecentFiles={handleClearRecentFiles}
              onOpenMachineSettings={() => {
                setSidebarTab("machine");
                setSidebarOpen(true);
              }}
              onOpenShortcuts={() => setHelpModal("shortcuts")}
            />
          ) : (
            <>
              <div ref={splitContainerRef} className="flex-1 flex min-h-0 overflow-hidden">
            {/* 左ペイン：NCコードエディタ（ワンクリックで折りたたみ可能） */}
            {editorOpen && (
              <>
                <div
                  style={{ width: `${editorRatio * 100}%` }}
                  className="h-full flex flex-col min-w-[200px] border-r border-[#2b2b2b]"
                >
                  <div className="h-8 bg-[#181818] border-b border-[#2b2b2b] px-2.5 flex items-center justify-between gap-2 text-[11.5px] shrink-0">
                    <span className="font-mono text-[#e2e8f0] truncate">{fileName}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-[#787878] font-mono hidden sm:inline">
                        {fileStats.lineCount}行
                        {parseResult && parseResult.expandedBlockCount > parseResult.lineCount
                          ? `→${parseResult.expandedBlockCount}`
                          : ""}
                      </span>
                      <button
                        onClick={() => ncEditorRef.current?.openSearch()}
                        className="p-1 rounded hover:bg-[#2d2d30] text-[#94a3b8] hover:text-white transition-colors"
                        title="検索・置換パネルを開く (Cmd/Ctrl+F)"
                      >
                        <Search className="w-3 h-3" />
                      </button>
                      <div className="flex items-center bg-[#222224] border border-[#323234] rounded text-[10px] font-mono">
                        <button
                          onClick={() => handleChangeEditorFontSize(editorFontSize - 1)}
                          className="px-1.5 py-0.5 hover:bg-[#323236] text-[#cbd5e1] hover:text-white rounded-l"
                          title="文字サイズを小さく"
                        >
                          A-
                        </button>
                        <button
                          onClick={() => handleChangeEditorFontSize(13)}
                          className="px-1 py-0.5 text-[#9cdcfe] hover:text-white border-x border-[#323234]"
                          title="クリックで標準サイズ (13px) に戻す"
                        >
                          {editorFontSize}
                        </button>
                        <button
                          onClick={() => handleChangeEditorFontSize(editorFontSize + 1)}
                          className="px-1.5 py-0.5 hover:bg-[#323236] text-[#cbd5e1] hover:text-white rounded-r"
                          title="文字サイズを大きく"
                        >
                          A+
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0">
                    <NcEditor
                      ref={ncEditorRef}
                      value={source}
                      fontSize={editorFontSize}
                      onChange={(val) => {
                        setSource(val);
                        setIsDirty(true);
                      }}
                      activeLine={activeEditorLine}
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
                skipToolChangeTime={skipToolChangeTime}
                onToggleSkipToolChangeTime={handleToggleSkipToolChangeTime}
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
            fileStats={fileStats}
            activeSegment={activeSegment}
            programFilterLabel={programFilterLabel}
            onJumpToLine={jumpToLine}
            onExportCsv={handleExportCsv}
            onExportHtml={handleExportHtml}
          />
            </>
          )}
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

      {isDragOver && <DragHoverOverlay />}

      {pendingDrop && (
        <DropActionModal
          droppedFile={pendingDrop.file}
          selectionInfo={pendingDrop.selection}
          editorOpen={editorOpen}
          isDirty={isDirty}
          onOpenAsNew={handleDropOpenAsNew}
          onInsertAtSelection={handleDropInsertAtSelection}
          onAppendToEnd={handleDropAppendToEnd}
          onCancel={() => setPendingDrop(null)}
        />
      )}

      {unsavedPrompt && (
        <UnsavedChangesModal
          fileName={fileName}
          actionLabel={unsavedPrompt.actionLabel}
          onSaveAndContinue={async () => {
            const proceed = unsavedPrompt.proceed;
            const ok = await performSaveFile(false);
            if (ok) {
              setUnsavedPrompt(null);
              await proceed();
            }
          }}
          onDiscardAndContinue={async () => {
            const proceed = unsavedPrompt.proceed;
            setUnsavedPrompt(null);
            await proceed();
          }}
          onCancel={() => setUnsavedPrompt(null)}
        />
      )}
      {helpModal && (
        <HelpModal mode={helpModal} isMac={isMac} onClose={() => setHelpModal(null)} />
      )}
      <UpdateModal
        open={updateModalOpen}
        state={updateState}
        updateInfo={availableUpdate}
        progress={updateProgress}
        errorMessage={updateError}
        onCheckAgain={() => {
          void handleCheckForUpdates(false);
        }}
        onStartInstall={() => {
          void handleInstallUpdate();
        }}
        onClose={() => setUpdateModalOpen(false)}
      />
    </div>
  );
}

export default App;
