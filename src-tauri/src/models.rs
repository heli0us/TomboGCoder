use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 3次元座標点（単位: mm）
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct Point3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Point3 {
    pub fn zero() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            z: 0.0,
        }
    }

    pub fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }

    pub fn distance_to(&self, other: &Point3) -> f64 {
        let dx = other.x - self.x;
        let dy = other.y - self.y;
        let dz = other.z - self.z;
        (dx * dx + dy * dy + dz * dz).sqrt()
    }
}

/// 選択平面
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Plane {
    G17,
    G18,
    G19,
}

/// 工具径補正モード
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum CutterCompMode {
    Off,
    Left,
    Right,
}

/// パス移動種別
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MotionType {
    Rapid,
    Linear,
    ArcCw,
    ArcCcw,
    CannedRapid,
    CannedFeed,
    Dwell,
    ToolChange,
}

/// 診断メッセージの重要度
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
    Info,
}

/// 構文エラー・径補正警告等の診断情報
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub severity: DiagnosticSeverity,
    pub line_number: usize,
    pub code: String,
    pub message: String,
}

/// ブロック実行時点のモーダル状態スナップショット
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModalSnapshot {
    pub motion_code: String,
    pub plane: Plane,
    pub distance_mode: String,
    pub work_offset: String,
    pub comp_mode: CutterCompMode,
    pub length_comp: String,
    pub canned_cycle: String,
    pub unit_mode: String,
    pub feed_rate: f64,
    pub spindle_speed: f64,
    pub tool_number: u32,
    pub d_number: u32,
    pub h_number: u32,
    /// 実工具直径（T番号基準）
    pub tool_diameter: f64,
    /// 工具形状 ("endmill" | "ball" | "drill" | "chamfer" | "tap")
    pub tool_shape: String,
    /// 工具名
    pub tool_name: String,
}

/// T番号ごとの工具仕様（工具マガジン設定）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolSpec {
    pub diameter: f64,
    #[serde(default = "default_tool_shape")]
    pub shape: String,
    #[serde(default)]
    pub name: String,
}

fn default_tool_shape() -> String {
    "endmill".to_string()
}

/// 描画・トレース用の1パスセグメント
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathSegment {
    pub id: usize,
    pub line_number: usize,
    pub raw_line: String,
    pub motion_type: MotionType,
    pub is_compensated: bool,
    pub comp_mode: CutterCompMode,
    pub plane: Plane,
    pub start: Point3,
    pub end: Point3,
    pub arc_center: Option<Point3>,
    pub arc_radius: Option<f64>,
    pub arc_cw: Option<bool>,
    pub points: Vec<Point3>,
    pub tool_number: u32,
    pub d_number: u32,
    pub h_number: u32,
    pub program_number: String,
    pub feed_rate: f64,
    pub spindle_speed: f64,
    pub length_mm: f64,
    pub duration_sec: f64,
    pub cumulative_time_sec: f64,
    /// M00（プログラムストップ）を含むブロックか
    #[serde(default)]
    pub has_m00: bool,
    pub modal_state: ModalSnapshot,
}

/// バウンディングボックス
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoundingBox {
    pub min: Point3,
    pub max: Point3,
    pub valid: bool,
}

/// 工具別サマリー
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolSummary {
    pub tool_number: u32,
    pub d_numbers: Vec<u32>,
    pub tool_diameter: f64,
    pub rapid_distance_mm: f64,
    pub cut_distance_mm: f64,
    pub rapid_time_sec: f64,
    pub cut_time_sec: f64,
    pub dwell_time_sec: f64,
    pub tool_change_time_sec: f64,
    pub total_time_sec: f64,
    pub min_z: f64,
    pub max_z: f64,
    pub segment_count: usize,
    pub comment_hint: Option<String>,
}

/// サイクルタイム全体サマリー
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CycleTimeSummary {
    pub total_time_sec: f64,
    pub rapid_time_sec: f64,
    pub cut_time_sec: f64,
    pub dwell_time_sec: f64,
    pub tool_change_time_sec: f64,
    pub total_rapid_distance_mm: f64,
    pub total_cut_distance_mm: f64,
    pub tool_changes: usize,
    pub tools: Vec<ToolSummary>,
}

/// 3Dシミュレーション時のみ適用する特殊Gコード置換ルール
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimReplaceRule {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub pattern: String,
    #[serde(default)]
    pub replacement: String,
    #[serde(default)]
    pub use_regex: bool,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

/// 機械パラメータおよび補正テーブル設定
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineConfig {
    pub profile_name: String,
    /// 各軸早送り速度 (mm/min)
    pub rapid_rate_x: f64,
    pub rapid_rate_y: f64,
    pub rapid_rate_z: f64,
    /// 工具交換 (M06) 所要時間 (秒)
    pub tool_change_time_sec: f64,
    /// 加減速によるオーバヘッド係数 (例: 1.08 = +8%)
    pub accel_overhead_factor: f64,
    /// 1ブロックあたりの最小処理時間 (秒)
    pub min_block_time_sec: f64,
    /// 送り速度未指定時のフォールバック速度 (mm/min)
    pub default_feed_rate: f64,
    /// T番号 -> 工具仕様（直径・形状・名称）
    #[serde(default)]
    pub tools: HashMap<u32, ToolSpec>,
    /// D番号 -> 径補正用工具直径 (mm)
    pub tool_diameters: HashMap<u32, f64>,
    /// H番号 -> 工具長補正量 (mm)
    pub tool_lengths: HashMap<u32, f64>,
    /// ワーク座標系オフセット (例: "G54" -> Point3)
    pub work_offsets: HashMap<String, Point3>,
    /// オプショナルブロックスキップ (`/`) を有効にするか
    pub optional_block_skip: bool,
    /// コメントから工具径を自動補完するか（テーブル未登録D番号向け）
    pub auto_extract_diameter: bool,
    /// 外角コーナー処理でロールアラウンド円弧を挿入するか（falseなら交点伸長）
    pub corner_arc_roll_around: bool,
    /// 外部サブプログラム (M98/G65) 検索フォルダ一覧
    #[serde(default)]
    pub subprogram_dirs: Vec<String>,
    /// シミュレーション専用 特殊Gコード置換ルール（外部サブプログラム展開時にも適用）
    #[serde(default)]
    pub sim_replace_rules: Vec<SimReplaceRule>,
}

impl Default for MachineConfig {
    fn default() -> Self {
        let mut tools = HashMap::new();
        tools.insert(
            1,
            ToolSpec {
                diameter: 10.0,
                shape: "endmill".to_string(),
                name: "フラットEM Ø10".to_string(),
            },
        );
        tools.insert(
            2,
            ToolSpec {
                diameter: 6.0,
                shape: "endmill".to_string(),
                name: "仕上EM Ø6".to_string(),
            },
        );
        tools.insert(
            3,
            ToolSpec {
                diameter: 8.0,
                shape: "drill".to_string(),
                name: "ドリル Ø8".to_string(),
            },
        );
        tools.insert(
            4,
            ToolSpec {
                diameter: 12.0,
                shape: "endmill".to_string(),
                name: "荒EM Ø12".to_string(),
            },
        );
        tools.insert(
            5,
            ToolSpec {
                diameter: 4.0,
                shape: "endmill".to_string(),
                name: "小径EM Ø4".to_string(),
            },
        );

        let mut tool_diameters = HashMap::new();
        tool_diameters.insert(1, 10.0);
        tool_diameters.insert(2, 6.0);
        tool_diameters.insert(3, 8.0);
        tool_diameters.insert(4, 12.0);
        tool_diameters.insert(5, 4.0);

        let mut work_offsets = HashMap::new();
        work_offsets.insert("G54".to_string(), Point3::zero());
        work_offsets.insert("G55".to_string(), Point3::zero());
        work_offsets.insert("G56".to_string(), Point3::zero());
        work_offsets.insert("G57".to_string(), Point3::zero());
        work_offsets.insert("G58".to_string(), Point3::zero());
        work_offsets.insert("G59".to_string(), Point3::zero());

        Self {
            profile_name: "FANUC 標準3軸マシニング".to_string(),
            rapid_rate_x: 24000.0,
            rapid_rate_y: 24000.0,
            rapid_rate_z: 18000.0,
            tool_change_time_sec: 4.5,
            accel_overhead_factor: 1.08,
            min_block_time_sec: 0.015,
            default_feed_rate: 500.0,
            tools,
            tool_diameters,
            tool_lengths: HashMap::new(),
            work_offsets,
            optional_block_skip: false,
            auto_extract_diameter: true,
            corner_arc_roll_around: true,
            subprogram_dirs: Vec::new(),
            sim_replace_rules: Vec::new(),
        }
    }
}

/// 解析リクエスト
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NcParseRequest {
    pub source: String,
    pub config: MachineConfig,
    /// 外部サブプログラム検索用の基準ファイルパス（任意）
    #[serde(default)]
    pub file_path: Option<String>,
}

/// マクロ変数の最終状態エントリ
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MacroVariableEntry {
    pub number: u32,
    pub value: f64,
    pub scope: String,
}

/// 解析結果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseResult {
    pub program_segments: Vec<PathSegment>,
    pub compensated_segments: Vec<PathSegment>,
    pub diagnostics: Vec<Diagnostic>,
    pub bounding_box: BoundingBox,
    pub cycle_time: CycleTimeSummary,
    pub detected_tools: Vec<u32>,
    pub detected_d_numbers: Vec<u32>,
    pub detected_programs: Vec<String>,
    /// D番号のコメント抽出値（(D=1 OFFSET=2.7) -> D1=5.4）
    pub extracted_tool_diameters: HashMap<u32, f64>,
    /// T番号のコメント抽出工具仕様（(T=1 DIA=10. NAME=EMS) 等）
    pub extracted_tools: HashMap<u32, ToolSpec>,
    pub macro_variables: Vec<MacroVariableEntry>,
    pub expanded_block_count: usize,
    pub line_count: usize,
}

/// ファイル読込結果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileReadResult {
    pub path: String,
    pub file_name: String,
    pub content: String,
    pub encoding: String,
}
