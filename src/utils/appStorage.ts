import type { SidebarTab } from "../components/Sidebar";
import type { BottomTab } from "../components/BottomPanel";
import type { RecentFileEntry } from "../components/TopBar";
import {
  BUILTIN_MACHINE_PROFILES,
  type AutoBreakConfig,
  DEFAULT_AUTO_BREAK,
  DEFAULT_DISPLAY_OPTIONS,
  DEFAULT_MACHINE_CONFIG,
  DEFAULT_NC_SNIPPETS,
  DEFAULT_REPLACE_BATCHES,
  type DisplayOptions,
  type MachineConfig,
  type MachineProfile,
  type NcSnippet,
  type ReplaceBatch,
} from "../types/nc";
import { repairReplaceBatches } from "./replaceEngine";

export const MACHINE_PROFILES_STORAGE_KEY = "tombo_gcoder_machine_profiles_v1";
export const ACTIVE_MACHINE_ID_STORAGE_KEY = "tombo_gcoder_active_machine_id_v1";
export const PLAYBACK_SPEED_STORAGE_KEY = "tombo_gcoder_playback_speed_v1";
export const SKIP_ATC_STORAGE_KEY = "tombo_gcoder_skip_atc_v1";
export const EDITOR_FONT_SIZE_STORAGE_KEY = "tombo_gcoder_editor_font_size_v1";
export const REPLACE_BATCHES_STORAGE_KEY = "tombo_gcoder_replace_batches_v1";
export const NC_SNIPPETS_STORAGE_KEY = "tombo_gcoder_nc_snippets_v1";
export const DISPLAY_OPTIONS_STORAGE_KEY = "tombo_gcoder_display_options_v1";
export const AUTO_BREAK_STORAGE_KEY = "tombo_gcoder_auto_break_v1";
export const UI_LAYOUT_STORAGE_KEY = "tombo_gcoder_ui_layout_v1";
export const RECENT_FILES_STORAGE_KEY = "tombo_gcoder_recent_files_v1";
export const MAX_RECENT_FILES = 8;

export interface SavedUiLayout {
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

export function loadSavedUiLayout(): SavedUiLayout {
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

export function loadSavedPlaybackSpeed(): number {
  try {
    const raw = window.localStorage.getItem(PLAYBACK_SPEED_STORAGE_KEY);
    if (!raw) return 30;
    const val = Number(raw);
    return Number.isFinite(val) && val > 0 ? val : 30;
  } catch {
    return 30;
  }
}

export function cloneMachineConfig(cfg: MachineConfig): MachineConfig {
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

export function loadSavedMachineProfiles(): MachineProfile[] {
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

export function loadSavedActiveMachineId(profiles: MachineProfile[]): string {
  try {
    const raw = window.localStorage.getItem(ACTIVE_MACHINE_ID_STORAGE_KEY);
    if (raw && profiles.some((p) => p.id === raw)) return raw;
  } catch {
    // ignore
  }
  return profiles[0]?.id ?? BUILTIN_MACHINE_PROFILES[0].id;
}

export function sanitizeFileName(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|\s]+/g, "_");
  return cleaned || "machine";
}

export function loadSavedDisplayOptions(): DisplayOptions {
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
      snapToolOutline:
        typeof p.snapToolOutline === "boolean"
          ? p.snapToolOutline
          : DEFAULT_DISPLAY_OPTIONS.snapToolOutline,
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

export function loadSavedAutoBreak(): AutoBreakConfig {
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

export function loadSavedReplaceBatches(): ReplaceBatch[] {
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

export function loadSavedNcSnippets(): NcSnippet[] {
  try {
    const raw = window.localStorage.getItem(NC_SNIPPETS_STORAGE_KEY);
    if (!raw) return DEFAULT_NC_SNIPPETS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_NC_SNIPPETS;
  } catch {
    return DEFAULT_NC_SNIPPETS;
  }
}

export function loadSavedRecentFiles(): RecentFileEntry[] {
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
export function prepareInsertNcCode(rawContent: string, stripPercent: boolean): string {
  const normalized = rawContent.replace(/\r\n/g, "\n");
  if (!stripPercent) return normalized;
  const lines = normalized.split("\n");
  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  if (lines.length > 0 && lines[0].trim() === "%") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length > 0 && lines[lines.length - 1].trim() === "%") lines.pop();
  return lines.join("\n");
}

export function parseImportedMachineProfiles(rawText: string): MachineProfile[] {
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
