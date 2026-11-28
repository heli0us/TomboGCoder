export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export type Plane = "G17" | "G18" | "G19";
export type CutterCompMode = "Off" | "Left" | "Right";
export type MotionType =
  | "rapid"
  | "linear"
  | "arc_cw"
  | "arc_ccw"
  | "canned_rapid"
  | "canned_feed"
  | "dwell"
  | "tool_change";

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  lineNumber: number;
  code: string;
  message: string;
}

export type ToolShape = "endmill" | "ball" | "drill" | "chamfer" | "tap";

export interface ToolSpec {
  diameter: number;
  shape: ToolShape;
  name: string;
}

export interface ModalSnapshot {
  motionCode: string;
  plane: Plane;
  distanceMode: string;
  workOffset: string;
  compMode: CutterCompMode;
  lengthComp: string;
  cannedCycle: string;
  unitMode: string;
  feedRate: number;
  spindleSpeed: number;
  toolNumber: number;
  dNumber: number;
  hNumber: number;
  toolDiameter: number;
  toolShape: ToolShape;
  toolName: string;
}

export interface PathSegment {
  id: number;
  lineNumber: number;
  rawLine: string;
  motionType: MotionType;
  isCompensated: boolean;
  compMode: CutterCompMode;
  plane: Plane;
  start: Point3;
  end: Point3;
  arcCenter: Point3 | null;
  arcRadius: number | null;
  arcCw: boolean | null;
  points: Point3[];
  toolNumber: number;
  dNumber: number;
  hNumber: number;
  programNumber: string;
  feedRate: number;
  spindleSpeed: number;
  lengthMm: number;
  durationSec: number;
  cumulativeTimeSec: number;
  hasM00?: boolean;
  modalState: ModalSnapshot;
}

export interface BoundingBox {
  min: Point3;
  max: Point3;
  valid: boolean;
}

export interface ToolSummary {
  toolNumber: number;
  dNumbers: number[];
  toolDiameter: number;
  rapidDistanceMm: number;
  cutDistanceMm: number;
  rapidTimeSec: number;
  cutTimeSec: number;
  dwellTimeSec: number;
  toolChangeTimeSec: number;
  totalTimeSec: number;
  minZ: number;
  maxZ: number;
  segmentCount: number;
  commentHint: string | null;
}

export interface CycleTimeSummary {
  totalTimeSec: number;
  rapidTimeSec: number;
  cutTimeSec: number;
  dwellTimeSec: number;
  toolChangeTimeSec: number;
  totalRapidDistanceMm: number;
  totalCutDistanceMm: number;
  toolChanges: number;
  tools: ToolSummary[];
}

export interface MacroVariableEntry {
  number: number;
  value: number;
  scope: string;
}

/** 3Dシミュレーション時のみ適用する特殊Gコード置換ルール（元ファイルは変更しない） */
export interface SimReplaceRule {
  id: string;
  name: string;
  pattern: string;
  replacement: string;
  useRegex: boolean;
  enabled: boolean;
}

export interface MachineConfig {
  profileName: string;
  rapidRateX: number;
  rapidRateY: number;
  rapidRateZ: number;
  toolChangeTimeSec: number;
  accelOverheadFactor: number;
  minBlockTimeSec: number;
  defaultFeedRate: number;
  /** T番号 -> 工具マガジン定義（径・形状・名称） */
  tools: Record<number, ToolSpec>;
  /** D番号 -> 径補正用工具直径 (mm) */
  toolDiameters: Record<number, number>;
  toolLengths: Record<number, number>;
  workOffsets: Record<string, Point3>;
  optionalBlockSkip: boolean;
  autoExtractDiameter: boolean;
  cornerArcRollAround: boolean;
  /** 外部サブプログラム (M98/G65) 検索フォルダ一覧 */
  subprogramDirs: string[];
  /** シミュレーション専用 特殊Gコード置換ルール */
  simReplaceRules: SimReplaceRule[];
}

export interface ParseResult {
  programSegments: PathSegment[];
  compensatedSegments: PathSegment[];
  diagnostics: Diagnostic[];
  boundingBox: BoundingBox;
  cycleTime: CycleTimeSummary;
  detectedTools: number[];
  detectedDNumbers: number[];
  detectedPrograms: string[];
  extractedToolDiameters: Record<number, number>;
  extractedTools: Record<number, ToolSpec>;
  macroVariables: MacroVariableEntry[];
  expandedBlockCount: number;
  lineCount: number;
}

export interface FileReadResult {
  path: string;
  fileName: string;
  content: string;
  encoding: string;
}

export type ViewportLayoutMode = "single" | "triple" | "quad";

export type StockShape = "box" | "cylinder";

export interface StockConfig {
  enabled: boolean;
  shape: StockShape;
  /** 四角(box): X幅 / Y奥行 / Z厚み (mm) */
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  /** 丸(cylinder): 直径 Ø (mm) */
  diameter: number;
  /** 四角: X最小端 / 丸: 中心X (mm) */
  originX: number;
  /** 四角: Y最小端 / 丸: 中心Y (mm) */
  originY: number;
  /** ワーク上面 Z座標 (mm)（ここから -sizeZ 方向へ素材が存在） */
  topZ: number;
  /** 半透明の不透明度 (0.05..0.6) */
  opacity: number;
}

export interface DisplayOptions {
  showRapid: boolean;
  showProgramPath: boolean;
  showCompensatedPath: boolean;
  showToolModel: boolean;
  showToolWidthFill: boolean;
  snapToolOutline: boolean;
  showGrid: boolean;
  showBoundingBox: boolean;
  colorByTool: boolean;
  traceClipFuture: boolean;
  viewLayout: ViewportLayoutMode;
  stock: StockConfig;
  zSliceEnabled: boolean;
  zSliceMin: number;
  zSliceMax: number;
  hiddenTools: number[];
  hiddenDNumbers: number[];
  hiddenPrograms: string[];
}

export interface ToolPreset {
  id: string;
  name: string;
  /** T番号ごとの工具仕様（マガジン構成） */
  tools: Record<number, ToolSpec>;
  /** 任意で同時適用する D番号径補正テーブル */
  diameters?: Record<number, number>;
  builtin?: boolean;
}

/** 機械ごとの統合プロファイル（機械仕様 + T工具マガジン + D径補正） */
export interface MachineProfile {
  id: string;
  builtin?: boolean;
  config: MachineConfig;
}

export interface AutoBreakConfig {
  onToolChange: boolean;
  onM00: boolean;
  onZPlunge: boolean;
  onCompChange: boolean;
  onErrorLine: boolean;
}

export type CameraPreset = "iso" | "top" | "front" | "right";

export const DEFAULT_MACHINE_CONFIG: MachineConfig = {
  profileName: "FANUC 標準3軸マシニング",
  rapidRateX: 24000,
  rapidRateY: 24000,
  rapidRateZ: 18000,
  toolChangeTimeSec: 4.5,
  accelOverheadFactor: 1.08,
  minBlockTimeSec: 0.015,
  defaultFeedRate: 500,
  tools: {
    1: { diameter: 10.0, shape: "endmill", name: "フラットEM Ø10" },
    2: { diameter: 6.0, shape: "endmill", name: "仕上EM Ø6" },
    3: { diameter: 8.0, shape: "drill", name: "超硬ドリル Ø8" },
    4: { diameter: 12.0, shape: "endmill", name: "荒EM Ø12" },
    5: { diameter: 4.0, shape: "endmill", name: "小径EM Ø4" },
  },
  toolDiameters: {
    1: 10.0,
    2: 6.0,
    3: 8.0,
    4: 12.0,
    5: 4.0,
  },
  toolLengths: {},
  workOffsets: {
    G54: { x: 0, y: 0, z: 0 },
    G55: { x: 0, y: 0, z: 0 },
    G56: { x: 0, y: 0, z: 0 },
    G57: { x: 0, y: 0, z: 0 },
    G58: { x: 0, y: 0, z: 0 },
    G59: { x: 0, y: 0, z: 0 },
  },
  optionalBlockSkip: false,
  autoExtractDiameter: true,
  cornerArcRollAround: true,
  subprogramDirs: [],
  simReplaceRules: [],
};

export const DEFAULT_STOCK_CONFIG: StockConfig = {
  enabled: false,
  shape: "box",
  sizeX: 120,
  sizeY: 90,
  sizeZ: 25,
  diameter: 100,
  originX: 0,
  originY: 0,
  topZ: 0,
  opacity: 0.18,
};

export const DEFAULT_DISPLAY_OPTIONS: DisplayOptions = {
  showRapid: true,
  showProgramPath: true,
  showCompensatedPath: true,
  showToolModel: true,
  showToolWidthFill: false,
  snapToolOutline: false,
  showGrid: true,
  showBoundingBox: false,
  colorByTool: false,
  traceClipFuture: false,
  viewLayout: "single",
  stock: DEFAULT_STOCK_CONFIG,
  zSliceEnabled: false,
  zSliceMin: -50,
  zSliceMax: 100,
  hiddenTools: [],
  hiddenDNumbers: [],
  hiddenPrograms: [],
};

export const BUILTIN_TOOL_PRESETS: ToolPreset[] = [
  {
    id: "builtin-standard-mag",
    name: "標準マシニング マガジン (T01〜T08)",
    builtin: true,
    tools: {
      1: { diameter: 10.0, shape: "endmill", name: "フラットEM Ø10" },
      2: { diameter: 6.0, shape: "endmill", name: "仕上EM Ø6" },
      3: { diameter: 8.0, shape: "drill", name: "超硬ドリル Ø8" },
      4: { diameter: 12.0, shape: "endmill", name: "荒EM Ø12" },
      5: { diameter: 4.0, shape: "endmill", name: "小径EM Ø4" },
      6: { diameter: 3.0, shape: "chamfer", name: "センター/面取 Ø3" },
      7: { diameter: 6.0, shape: "ball", name: "ボールEM R3" },
      8: { diameter: 6.0, shape: "tap", name: "タップ M6" },
    },
  },
  {
    id: "builtin-aluminum-mag",
    name: "アルミ高速加工 マガジン (T01〜T08)",
    builtin: true,
    tools: {
      1: { diameter: 16.0, shape: "endmill", name: "アルミ荒EM Ø16" },
      2: { diameter: 10.0, shape: "endmill", name: "アルミ仕上EM Ø10" },
      3: { diameter: 6.0, shape: "endmill", name: "ポケットEM Ø6" },
      4: { diameter: 4.0, shape: "endmill", name: "コーナーEM Ø4" },
      5: { diameter: 6.0, shape: "chamfer", name: "面取カッター Ø6" },
      6: { diameter: 5.0, shape: "drill", name: "下穴ドリル Ø5.0" },
      7: { diameter: 6.8, shape: "drill", name: "M8下穴ドリル Ø6.8" },
      8: { diameter: 8.0, shape: "tap", name: "スパイラルタップ M8" },
    },
  },
  {
    id: "builtin-precision-mag",
    name: "精密・小径加工 マガジン (T01〜T08)",
    builtin: true,
    tools: {
      1: { diameter: 4.0, shape: "endmill", name: "荒EM Ø4" },
      2: { diameter: 2.0, shape: "endmill", name: "中仕上EM Ø2" },
      3: { diameter: 1.0, shape: "endmill", name: "微細EM Ø1" },
      4: { diameter: 0.5, shape: "endmill", name: "マイクロEM Ø0.5" },
      5: { diameter: 2.0, shape: "ball", name: "ボールEM R1" },
      6: { diameter: 1.0, shape: "ball", name: "ボールEM R0.5" },
      7: { diameter: 2.0, shape: "chamfer", name: "面取 Ø2" },
      8: { diameter: 1.6, shape: "drill", name: "小径ドリル Ø1.6" },
    },
  },
  {
    id: "builtin-t-equals-dia",
    name: "T番号＝工具径 (T01=Ø1 .. T20=Ø20)",
    builtin: true,
    tools: {
      1: { diameter: 1.0, shape: "endmill", name: "EM Ø1" },
      2: { diameter: 2.0, shape: "endmill", name: "EM Ø2" },
      3: { diameter: 3.0, shape: "endmill", name: "EM Ø3" },
      4: { diameter: 4.0, shape: "endmill", name: "EM Ø4" },
      5: { diameter: 5.0, shape: "endmill", name: "EM Ø5" },
      6: { diameter: 6.0, shape: "endmill", name: "EM Ø6" },
      8: { diameter: 8.0, shape: "endmill", name: "EM Ø8" },
      10: { diameter: 10.0, shape: "endmill", name: "EM Ø10" },
      12: { diameter: 12.0, shape: "endmill", name: "EM Ø12" },
      16: { diameter: 16.0, shape: "endmill", name: "EM Ø16" },
      20: { diameter: 20.0, shape: "endmill", name: "EM Ø20" },
    },
  },
];

export const BUILTIN_MACHINE_PROFILES: MachineProfile[] = [
  {
    id: "machine-standard",
    builtin: true,
    config: {
      ...DEFAULT_MACHINE_CONFIG,
      profileName: "FANUC 標準3軸マシニング",
      rapidRateX: 24000,
      rapidRateY: 24000,
      rapidRateZ: 18000,
      toolChangeTimeSec: 4.5,
      accelOverheadFactor: 1.08,
      tools: { ...BUILTIN_TOOL_PRESETS[0].tools },
      toolDiameters: { 1: 10.0, 2: 6.0, 3: 8.0, 4: 12.0, 5: 4.0, 6: 3.0, 7: 6.0, 8: 6.0 },
    },
  },
  {
    id: "machine-robodrill",
    builtin: true,
    config: {
      ...DEFAULT_MACHINE_CONFIG,
      profileName: "FANUC Robodrill 高速機",
      rapidRateX: 54000,
      rapidRateY: 54000,
      rapidRateZ: 54000,
      toolChangeTimeSec: 1.6,
      accelOverheadFactor: 1.05,
      minBlockTimeSec: 0.01,
      tools: { ...BUILTIN_TOOL_PRESETS[1].tools },
      toolDiameters: { 1: 16.0, 2: 10.0, 3: 6.0, 4: 4.0, 5: 6.0, 6: 5.0, 7: 6.8, 8: 8.0 },
    },
  },
  {
    id: "machine-precision",
    builtin: true,
    config: {
      ...DEFAULT_MACHINE_CONFIG,
      profileName: "精密・微細加工機 (小径)",
      rapidRateX: 15000,
      rapidRateY: 15000,
      rapidRateZ: 12000,
      toolChangeTimeSec: 6.0,
      accelOverheadFactor: 1.12,
      minBlockTimeSec: 0.02,
      defaultFeedRate: 200,
      tools: { ...BUILTIN_TOOL_PRESETS[2].tools },
      toolDiameters: { 1: 4.0, 2: 2.0, 3: 1.0, 4: 0.5, 5: 2.0, 6: 1.0, 7: 2.0, 8: 1.6 },
    },
  },
];

export function toolShapeLabel(shape: ToolShape): string {
  switch (shape) {
    case "endmill":
      return "フラットEM";
    case "ball":
      return "ボールEM";
    case "drill":
      return "ドリル";
    case "chamfer":
      return "面取/センター";
    case "tap":
      return "タップ";
  }
}

/** NCコード編集用の正規表現置換ルール（1ステップ） */
export interface ReplaceRule {
  id: string;
  name: string;
  pattern: string;
  replacement: string;
  useRegex: boolean;
  ignoreCase: boolean;
  multiline: boolean;
  enabled: boolean;
}

/** 複数の置換ルールを順番に一括実行する置換バッチ（MIFES REPBATCH 互換） */
export interface ReplaceBatch {
  id: string;
  name: string;
  rules: ReplaceRule[];
}

/** NCエディタへワンクリック挿入できる定型文（スニペット） */
export interface NcSnippet {
  id: string;
  name: string;
  category: string;
  body: string;
}

export const DEFAULT_REPLACE_RULES: ReplaceRule[] = [
  {
    id: "rule-strip-trailing-spaces",
    name: "行末の余分な空白を除去",
    pattern: "[ \\t]+$",
    replacement: "",
    useRegex: true,
    ignoreCase: false,
    multiline: true,
    enabled: true,
  },
  {
    id: "rule-strip-n-numbers",
    name: "行頭のシーケンス番号 (N番号) を削除",
    pattern: "^[ \\t]*N\\d+[ \\t]*",
    replacement: "",
    useRegex: true,
    ignoreCase: true,
    multiline: true,
    enabled: false,
  },
];

export const DEFAULT_REPLACE_BATCHES: ReplaceBatch[] = [
  {
    id: "batch-default-format",
    name: "基本整形 (空白・N番号)",
    rules: DEFAULT_REPLACE_RULES,
  },
];

export const DEFAULT_NC_SNIPPETS: NcSnippet[] = [
  {
    id: "snip-safety-block",
    name: "安全ブロック (標準)",
    category: "ヘッダ",
    body: "G90 G40 G49 G80 G17 G21",
  },
  {
    id: "snip-tool-change",
    name: "工具交換 + アプローチ",
    category: "工具交換",
    body: "T01 M06\nG54 G00 X0.0 Y0.0\nG43 Z50.0 H01 S6000 M03",
  },
  {
    id: "snip-m00-check",
    name: "M00 ワーク確認停止",
    category: "停止",
    body: "G00 Z100.0\nM05\nM00 (WORK CHECK)",
  },
  {
    id: "snip-footer-m30",
    name: "プログラム終了フッタ (M30)",
    category: "フッタ",
    body: "G00 Z100.0\nM05\nG91 G28 Z0.0\nG90\nM30",
  },
];

export const DEFAULT_AUTO_BREAK: AutoBreakConfig = {
  onToolChange: false,
  onM00: true,
  onZPlunge: false,
  onCompChange: false,
  onErrorLine: true,
};

/** 工具番号ごとの見やすいカラーパレット */
export const TOOL_COLORS = [
  "#38bdf8",
  "#4ade80",
  "#fbbf24",
  "#c084fc",
  "#fb7185",
  "#2dd4bf",
  "#f97316",
  "#818cf8",
];

export function getToolColor(toolNumber: number): string {
  if (toolNumber <= 0) return "#94a3b8";
  return TOOL_COLORS[(toolNumber - 1) % TOOL_COLORS.length];
}

/** 秒数を mm:ss.s または hh:mm:ss 形式に整形 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00.0";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(Math.floor(secs)).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${secs.toFixed(1).padStart(4, "0")}`;
}

export function motionTypeLabel(type: MotionType): string {
  switch (type) {
    case "rapid":
      return "早送り (G00)";
    case "linear":
      return "直線切削 (G01)";
    case "arc_cw":
      return "円弧CW (G02)";
    case "arc_ccw":
      return "円弧CCW (G03)";
    case "canned_rapid":
      return "固定サイクル早送り";
    case "canned_feed":
      return "固定サイクル切削";
    case "dwell":
      return "ドウェル (G04)";
    case "tool_change":
      return "工具交換 (M06)";
  }
}

export function compModeLabel(mode: CutterCompMode): string {
  switch (mode) {
    case "Off":
      return "G40 (無効)";
    case "Left":
      return "G41 (左補正)";
    case "Right":
      return "G42 (右補正)";
  }
}
