use crate::compensation::apply_cutter_compensation;
use crate::geometry::{resolve_arc, tessellate_arc, EPS};
use crate::macro_engine::expand_program;
use crate::models::{
    BoundingBox, CutterCompMode, CycleTimeSummary, Diagnostic, DiagnosticSeverity, MachineConfig,
    ModalSnapshot, MotionType, ParseResult, PathSegment, Plane, Point3, ToolSpec, ToolSummary,
};
use crate::parser::{collect_comment_hints, NcBlock};
use std::collections::{BTreeMap, BTreeSet, HashMap};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CannedCycle {
    None,
    G73, // 高速深穴
    G74, // 左タップ
    G76, // 精ボーリング
    G81, // ドリル
    G82, // カウンタボーリング（ドウェル付）
    G83, // 深穴ペックドリル
    G84, // 右タップ
    G85, // ボーリング（切削戻り）
    G86, // ボーリング（早送り戻り）
    G89, // ボーリング（ドウェル＋切削戻り）
}

impl CannedCycle {
    fn code_str(self) -> &'static str {
        match self {
            CannedCycle::None => "G80",
            CannedCycle::G73 => "G73",
            CannedCycle::G74 => "G74",
            CannedCycle::G76 => "G76",
            CannedCycle::G81 => "G81",
            CannedCycle::G82 => "G82",
            CannedCycle::G83 => "G83",
            CannedCycle::G84 => "G84",
            CannedCycle::G85 => "G85",
            CannedCycle::G86 => "G86",
            CannedCycle::G89 => "G89",
        }
    }
}

/// シミュレータの内部モーダル状態
struct SimState {
    /// 現在のワーク座標（出力表示用の基準座標系位置）
    pos: Point3,
    /// ワーク座標系オフセット（G54〜G59）
    work_offset_name: String,
    work_offset: Point3,
    /// ローカル座標系オフセット（G52）
    local_offset: Point3,
    /// G92 シフト
    g92_offset: Point3,
    /// モーダル移動 (0, 1, 2, 3)
    motion_mode: u8,
    plane: Plane,
    absolute: bool, // true=G90, false=G91
    inch_mode: bool,
    comp_mode: CutterCompMode,
    length_comp_code: String,
    h_number: u32,
    d_number: u32,
    tool_number: u32,
    staged_tool: Option<u32>,
    has_m06_in_program: bool,
    feed_rate: f64,
    spindle_speed: f64,
    program_number: String,
    /// 固定サイクル状態
    canned: CannedCycle,
    canned_retract_initial: bool, // true=G98, false=G99
    canned_initial_z: f64,
    canned_r: f64,
    canned_z: f64,
    canned_q: f64,
    canned_p_sec: f64,
}

impl SimState {
    fn new(config: &MachineConfig, init_pos: Option<Point3>, has_m06: bool) -> Self {
        let g54 = config
            .work_offsets
            .get("G54")
            .copied()
            .unwrap_or_else(Point3::zero);
        let start_pos = init_pos.unwrap_or_else(|| Point3::new(0.0, 0.0, 100.0));
        Self {
            pos: start_pos,
            work_offset_name: "G54".to_string(),
            work_offset: g54,
            local_offset: Point3::zero(),
            g92_offset: Point3::zero(),
            motion_mode: 0,
            plane: Plane::G17,
            absolute: true,
            inch_mode: false,
            comp_mode: CutterCompMode::Off,
            length_comp_code: "G49".to_string(),
            h_number: 0,
            d_number: 0,
            tool_number: 0,
            staged_tool: None,
            has_m06_in_program: has_m06,
            feed_rate: 0.0,
            spindle_speed: 0.0,
            program_number: "MAIN".to_string(),
            canned: CannedCycle::None,
            canned_retract_initial: true,
            canned_initial_z: start_pos.z,
            canned_r: 0.0,
            canned_z: 0.0,
            canned_q: 0.0,
            canned_p_sec: 0.0,
        }
    }

    fn unit_scale(&self) -> f64 {
        if self.inch_mode { 25.4 } else { 1.0 }
    }

    fn snapshot(
        &self,
        effective_tools: &HashMap<u32, ToolSpec>,
        effective_diameters: &HashMap<u32, f64>,
    ) -> ModalSnapshot {
        let motion_code = match self.motion_mode {
            0 => "G00",
            1 => "G01",
            2 => "G02",
            3 => "G03",
            _ => "G00",
        }
        .to_string();

        let t_spec = effective_tools.get(&self.tool_number);
        let tool_diameter = t_spec
            .map(|s| s.diameter)
            .filter(|&d| d > 0.0)
            .or_else(|| effective_diameters.get(&self.d_number).copied())
            .or_else(|| effective_diameters.get(&self.tool_number).copied())
            .unwrap_or(0.0);

        ModalSnapshot {
            motion_code,
            plane: self.plane,
            distance_mode: if self.absolute {
                "G90".to_string()
            } else {
                "G91".to_string()
            },
            work_offset: self.work_offset_name.clone(),
            comp_mode: self.comp_mode,
            length_comp: self.length_comp_code.clone(),
            canned_cycle: self.canned.code_str().to_string(),
            unit_mode: if self.inch_mode {
                "G20".to_string()
            } else {
                "G21".to_string()
            },
            feed_rate: self.feed_rate,
            spindle_speed: self.spindle_speed,
            tool_number: self.tool_number,
            d_number: self.d_number,
            h_number: self.h_number,
            tool_diameter,
            tool_shape: t_spec
                .map(|s| s.shape.clone())
                .unwrap_or_else(|| "endmill".to_string()),
            tool_name: t_spec.map(|s| s.name.clone()).unwrap_or_default(),
        }
    }
}

/// コメント文字列から工具形状を推測する
fn guess_tool_shape(comment: &str) -> String {
    let u = comment.to_ascii_uppercase();
    if u.contains("BALL") || u.contains("BEM") || u.contains("Rボール") || u.contains("ボール") {
        "ball".to_string()
    } else if u.contains("DRILL") || u.contains("DRN") || u.contains("ドリル") {
        "drill".to_string()
    } else if u.contains("CDA")
        || u.contains("CENTER")
        || u.contains("CHAMFER")
        || u.contains("面取")
        || u.contains("センター")
    {
        "chamfer".to_string()
    } else if u.contains("TAP") || u.contains("タップ") {
        "tap".to_string()
    } else {
        "endmill".to_string()
    }
}

/// NCソースコードを解析し、プログラムパス・工具径補正パス・サイクルタイム・診断を返す
pub fn simulate_nc(source: &str, config: &MachineConfig, file_path: Option<&str>) -> ParseResult {
    let line_count = source.lines().count();
    let mut diagnostics: Vec<Diagnostic> = Vec::new();

    // サブプログラム (M98/M99) およびカスタムマクロB (変数・式・制御構文・G65) を展開
    let expanded = expand_program(
        source,
        config.optional_block_skip,
        file_path,
        &config.subprogram_dirs,
        &config.sim_replace_rules,
        &mut diagnostics,
    );
    let blocks = expanded.blocks;
    let expanded_block_count = blocks.len();

    let hints = collect_comment_hints(&blocks);
    let has_m06 = blocks
        .iter()
        .any(|b| b.words.iter().any(|w| w.letter == 'M' && w.value.round() as u32 == 6));

    // コメントから抽出した T番号 ToolSpec を組み立てる
    let mut extracted_tools: HashMap<u32, ToolSpec> = HashMap::new();
    for (&t_num, &dia) in &hints.tool_diameters {
        let comment = hints.tool_comments.get(&t_num).cloned().unwrap_or_default();
        extracted_tools.insert(
            t_num,
            ToolSpec {
                diameter: dia,
                shape: guess_tool_shape(&comment),
                name: comment,
            },
        );
    }

    // 有効な T番号->ToolSpec マップ（config.tools が基本、auto_extract_diameter ONならコメント抽出を優先反映）
    let mut effective_tools = config.tools.clone();
    if config.auto_extract_diameter {
        for (t_num, spec) in &extracted_tools {
            effective_tools.insert(*t_num, spec.clone());
        }
    }

    // 有効なD番号->直径マップ（D番号未登録時は T番号工具径にもフォールバック可能にする）
    let mut effective_diameters = config.tool_diameters.clone();
    for (&t_num, spec) in &effective_tools {
        effective_diameters.entry(t_num).or_insert(spec.diameter);
    }
    let extracted_d_only = hints.d_diameters.clone();
    if config.auto_extract_diameter {
        for (&d_num, &dia) in &hints.d_diameters {
            effective_diameters.insert(d_num, dia);
        }
    }

    let mut state = SimState::new(config, hints.init_pos, has_m06);
    let mut program_segments: Vec<PathSegment> = Vec::new();
    let mut seg_id = 0usize;

    let mut detected_tools: BTreeSet<u32> = BTreeSet::new();
    let mut detected_d_numbers: BTreeSet<u32> = BTreeSet::new();
    let mut detected_programs: BTreeSet<String> = BTreeSet::new();

    for block in &blocks {
        if block.skipped {
            continue;
        }
        if let Some(prog) = &block.program_number {
            state.program_number = prog.clone();
            detected_programs.insert(prog.clone());
        }
        if block.words.is_empty() {
            continue;
        }

        execute_block(
            block,
            config,
            &effective_tools,
            &effective_diameters,
            &mut state,
            &mut program_segments,
            &mut seg_id,
            &mut diagnostics,
            &mut detected_tools,
            &mut detected_d_numbers,
        );
    }

    // 工具径補正 (G40/G41/G42) を適用して補正後パスを生成
    let mut compensated_segments = apply_cutter_compensation(
        &program_segments,
        config,
        &effective_diameters,
        &mut diagnostics,
    );

    // プログラムパス・補正パス双方にサイクルタイムを計算付与（集計基準は実際の工具中心移動である補正後パス）
    assign_timings(&mut program_segments, config);
    let cycle_time = compute_cycle_time_summary(
        &mut compensated_segments,
        config,
        &effective_tools,
        &effective_diameters,
        &hints.tool_comments,
    );

    let bounding_box = compute_bounding_box(&program_segments, &compensated_segments);

    if detected_programs.is_empty() {
        detected_programs.insert("MAIN".to_string());
    }

    ParseResult {
        program_segments,
        compensated_segments,
        diagnostics,
        bounding_box,
        cycle_time,
        detected_tools: detected_tools.into_iter().collect(),
        detected_d_numbers: detected_d_numbers.into_iter().collect(),
        detected_programs: detected_programs.into_iter().collect(),
        extracted_tool_diameters: extracted_d_only,
        extracted_tools,
        macro_variables: expanded.variables,
        expanded_block_count,
        line_count,
    }
}

#[allow(clippy::too_many_arguments)]
fn execute_block(
    block: &NcBlock,
    config: &MachineConfig,
    effective_tools: &HashMap<u32, ToolSpec>,
    effective_diameters: &HashMap<u32, f64>,
    state: &mut SimState,
    segments: &mut Vec<PathSegment>,
    seg_id: &mut usize,
    diagnostics: &mut Vec<Diagnostic>,
    detected_tools: &mut BTreeSet<u32>,
    detected_d_numbers: &mut BTreeSet<u32>,
) {
    // ワードを分類抽出
    let mut g_codes: Vec<f64> = Vec::new();
    let mut m_codes: Vec<u32> = Vec::new();
    let mut x_val: Option<f64> = None;
    let mut y_val: Option<f64> = None;
    let mut z_val: Option<f64> = None;
    let mut i_val: Option<f64> = None;
    let mut j_val: Option<f64> = None;
    let mut k_val: Option<f64> = None;
    let mut r_val: Option<f64> = None;
    let mut p_val: Option<f64> = None;
    let mut q_val: Option<f64> = None;
    let mut l_val: Option<u32> = None;

    for w in &block.words {
        match w.letter {
            'G' => g_codes.push(w.value),
            'M' => m_codes.push(w.value.round().max(0.0) as u32),
            'X' => x_val = Some(w.value),
            'Y' => y_val = Some(w.value),
            'Z' => z_val = Some(w.value),
            'I' => i_val = Some(w.value),
            'J' => j_val = Some(w.value),
            'K' => k_val = Some(w.value),
            'R' => r_val = Some(w.value),
            'P' => p_val = Some(w.value),
            'Q' => q_val = Some(w.value),
            'L' => l_val = Some(w.value.round().max(0.0) as u32),
            'F' => state.feed_rate = w.value.max(0.0),
            'S' => state.spindle_speed = w.value.max(0.0),
            'T' => {
                let tn = w.value.round().max(0.0) as u32;
                if tn > 0 {
                    detected_tools.insert(tn);
                }
                if state.has_m06_in_program {
                    // FANUC ATC プリセレクト: M06 で主軸へ装着する
                    state.staged_tool = Some(tn);
                } else {
                    state.tool_number = tn;
                }
            }
            'D' => {
                let dn = w.value.round().max(0.0) as u32;
                state.d_number = dn;
                if dn > 0 {
                    detected_d_numbers.insert(dn);
                }
            }
            'H' => {
                state.h_number = w.value.round().max(0.0) as u32;
            }
            _ => {}
        }
    }

    // 非モーダルGコードフラグ
    let mut is_dwell = false;
    let mut is_g28 = false;
    let mut is_g30 = false;
    let mut is_g53 = false;
    let mut is_g52 = false;
    let mut is_g92 = false;
    let mut canned_activated = false;

    // 1. モーダルGコードの更新
    for &g in &g_codes {
        let g10 = (g * 10.0).round() as i32;
        match g10 {
            0 => {
                state.motion_mode = 0;
                state.canned = CannedCycle::None;
            }
            10 => {
                state.motion_mode = 1;
                state.canned = CannedCycle::None;
            }
            20 => {
                state.motion_mode = 2;
                state.canned = CannedCycle::None;
            }
            30 => {
                state.motion_mode = 3;
                state.canned = CannedCycle::None;
            }
            40 => is_dwell = true,
            170 => state.plane = Plane::G17,
            180 => state.plane = Plane::G18,
            190 => state.plane = Plane::G19,
            200 => state.inch_mode = true,
            210 => state.inch_mode = false,
            280 => is_g28 = true,
            300 => is_g30 = true,
            400 => state.comp_mode = CutterCompMode::Off,
            410 => state.comp_mode = CutterCompMode::Left,
            420 => state.comp_mode = CutterCompMode::Right,
            430 => state.length_comp_code = "G43".to_string(),
            440 => state.length_comp_code = "G44".to_string(),
            490 => {
                state.length_comp_code = "G49".to_string();
                state.h_number = 0;
            }
            520 => is_g52 = true,
            530 => is_g53 = true,
            540..=590 if g10 % 10 == 0 => {
                let name = format!("G{}", g10 / 10);
                state.work_offset = config
                    .work_offsets
                    .get(&name)
                    .copied()
                    .unwrap_or_else(Point3::zero);
                state.work_offset_name = name;
            }
            541 => {
                let p_idx = p_val.unwrap_or(1.0).round() as u32;
                let name = format!("G54.1 P{}", p_idx);
                state.work_offset = config
                    .work_offsets
                    .get(&name)
                    .copied()
                    .unwrap_or_else(Point3::zero);
                state.work_offset_name = name;
            }
            730 => {
                state.canned = CannedCycle::G73;
                canned_activated = true;
            }
            740 => {
                state.canned = CannedCycle::G74;
                canned_activated = true;
            }
            760 => {
                state.canned = CannedCycle::G76;
                canned_activated = true;
            }
            800 => state.canned = CannedCycle::None,
            810 => {
                state.canned = CannedCycle::G81;
                canned_activated = true;
            }
            820 => {
                state.canned = CannedCycle::G82;
                canned_activated = true;
            }
            830 => {
                state.canned = CannedCycle::G83;
                canned_activated = true;
            }
            840 => {
                state.canned = CannedCycle::G84;
                canned_activated = true;
            }
            850 => {
                state.canned = CannedCycle::G85;
                canned_activated = true;
            }
            860 => {
                state.canned = CannedCycle::G86;
                canned_activated = true;
            }
            890 => {
                state.canned = CannedCycle::G89;
                canned_activated = true;
            }
            900 => state.absolute = true,
            910 => state.absolute = false,
            920 => is_g92 = true,
            980 => state.canned_retract_initial = true,
            990 => state.canned_retract_initial = false,
            // 許容される補助Gコード（送りモード等）は警告なし
            940 | 950 | 150 | 160 | 500 | 610 | 640 | 690 => {}
            _ => {
                diagnostics.push(Diagnostic {
                    severity: DiagnosticSeverity::Info,
                    line_number: block.line_number,
                    code: "UNSUPPORTED_GCODE".to_string(),
                    message: format!("未対応の G{} コードは無視されました", g),
                });
            }
        }
    }

    let scale = state.unit_scale();

    // 2. 工具交換 (M06) イベント記録（プリセレクト工具を主軸へ装着）
    if m_codes.contains(&6) {
        if let Some(staged) = state.staged_tool.take() {
            state.tool_number = staged;
        }
        if state.tool_number > 0 {
            detected_tools.insert(state.tool_number);
        }
        segments.push(PathSegment {
            id: *seg_id,
            line_number: block.line_number,
            raw_line: block.raw_line.clone(),
            motion_type: MotionType::ToolChange,
            is_compensated: false,
            comp_mode: state.comp_mode,
            plane: state.plane,
            start: state.pos,
            end: state.pos,
            arc_center: None,
            arc_radius: None,
            arc_cw: None,
            points: vec![state.pos],
            tool_number: state.tool_number,
            d_number: state.d_number,
            h_number: state.h_number,
            program_number: state.program_number.clone(),
            feed_rate: state.feed_rate,
            spindle_speed: state.spindle_speed,
            length_mm: 0.0,
            duration_sec: config.tool_change_time_sec,
            cumulative_time_sec: 0.0,
            has_m00: false,
            modal_state: state.snapshot(effective_tools, effective_diameters),
        });
        *seg_id += 1;
    }

    // 2.5. プログラムストップ (M00) イベント記録（移動のない単独M00行でもブレイク停止できるよう独立セグメント化）
    if m_codes.contains(&0) {
        segments.push(PathSegment {
            id: *seg_id,
            line_number: block.line_number,
            raw_line: block.raw_line.clone(),
            motion_type: MotionType::Dwell,
            is_compensated: false,
            comp_mode: state.comp_mode,
            plane: state.plane,
            start: state.pos,
            end: state.pos,
            arc_center: None,
            arc_radius: None,
            arc_cw: None,
            points: vec![state.pos],
            tool_number: state.tool_number,
            d_number: state.d_number,
            h_number: state.h_number,
            program_number: state.program_number.clone(),
            feed_rate: state.feed_rate,
            spindle_speed: state.spindle_speed,
            length_mm: 0.0,
            duration_sec: 0.0,
            cumulative_time_sec: 0.0,
            has_m00: true,
            modal_state: state.snapshot(effective_tools, effective_diameters),
        });
        *seg_id += 1;
    }

    // 3. G52 ローカル座標設定 / G92 座標系設定
    if is_g52 {
        // FANUC仕様: 指定された軸のローカルオフセットのみ更新（省略軸は現在値を保持）。全軸省略の単独G52は全クリア。
        if x_val.is_none() && y_val.is_none() && z_val.is_none() {
            state.local_offset = Point3::zero();
        } else {
            if let Some(x) = x_val {
                state.local_offset.x = x * scale;
            }
            if let Some(y) = y_val {
                state.local_offset.y = y * scale;
            }
            if let Some(z) = z_val {
                state.local_offset.z = z * scale;
            }
        }
        return;
    }
    if is_g92 {
        // FANUC仕様: G92 座標系設定は現在の機械位置を (x + work_offset + local_offset) と一致させる
        if let Some(x) = x_val {
            state.g92_offset.x =
                state.pos.x - (x * scale + state.work_offset.x + state.local_offset.x);
        }
        if let Some(y) = y_val {
            state.g92_offset.y =
                state.pos.y - (y * scale + state.work_offset.y + state.local_offset.y);
        }
        if let Some(z) = z_val {
            state.g92_offset.z =
                state.pos.z - (z * scale + state.work_offset.z + state.local_offset.z);
        }
        return;
    }

    // 4. G04 ドウェル
    if is_dwell {
        let sec = if let Some(x) = x_val {
            x.max(0.0)
        } else if let Some(p) = p_val {
            // FANUC標準: Pはミリ秒（小数点付きなら秒扱いになるケースもあるが通常P1000=1秒）
            if p >= 20.0 { p / 1000.0 } else { p.max(0.0) }
        } else {
            0.0
        };
        if sec > 0.0 {
            segments.push(PathSegment {
                id: *seg_id,
                line_number: block.line_number,
                raw_line: block.raw_line.clone(),
                motion_type: MotionType::Dwell,
                is_compensated: false,
                comp_mode: state.comp_mode,
                plane: state.plane,
                start: state.pos,
                end: state.pos,
                arc_center: None,
                arc_radius: None,
                arc_cw: None,
                points: vec![state.pos],
                tool_number: state.tool_number,
                d_number: state.d_number,
                h_number: state.h_number,
                program_number: state.program_number.clone(),
                feed_rate: state.feed_rate,
                spindle_speed: state.spindle_speed,
                length_mm: 0.0,
                duration_sec: sec,
                cumulative_time_sec: 0.0,
                has_m00: false,
                modal_state: state.snapshot(effective_tools, effective_diameters),
            });
            *seg_id += 1;
        }
        return;
    }

    // 5. G28 / G30 機械原点復帰
    if is_g28 || is_g30 {
        let mid = compute_target(state, x_val, y_val, z_val, scale, false);
        if state.pos.distance_to(&mid) > EPS {
            push_linear_segment(
                block,
                state,
                effective_tools,
                effective_diameters,
                MotionType::Rapid,
                state.pos,
                mid,
                segments,
                seg_id,
            );
            state.pos = mid;
        }
        let mut home = state.pos;
        if x_val.is_some() {
            home.x = 0.0;
        }
        if y_val.is_some() {
            home.y = 0.0;
        }
        if z_val.is_some() {
            home.z = 100.0; // Z機械原点（安全高さ想定）
        }
        if state.pos.distance_to(&home) > EPS {
            push_linear_segment(
                block,
                state,
                effective_tools,
                effective_diameters,
                MotionType::Rapid,
                state.pos,
                home,
                segments,
                seg_id,
            );
            state.pos = home;
        }
        return;
    }

    // 6. 固定サイクル実行 (G73, G74, G76, G81..G89)
    if state.canned != CannedCycle::None {
        if canned_activated {
            state.canned_initial_z = state.pos.z;
        }
        let offset_z = state.work_offset.z + state.local_offset.z + state.g92_offset.z;
        if let Some(r) = r_val {
            state.canned_r = if state.absolute {
                r * scale + offset_z
            } else {
                state.pos.z + r * scale
            };
        }
        if let Some(z) = z_val {
            state.canned_z = if state.absolute {
                z * scale + offset_z
            } else {
                state.canned_r + z * scale
            };
        }
        if let Some(q) = q_val {
            state.canned_q = (q * scale).abs();
        }
        if let Some(p) = p_val {
            state.canned_p_sec = if p >= 20.0 { p / 1000.0 } else { p.max(0.0) };
        }

        let has_xy = x_val.is_some() || y_val.is_some();
        // FANUC固定サイクルでは K または L で繰返し回数を指定 (K0 / L0 = 穴あけせずモーダル記憶のみ)
        let repeat = l_val
            .or_else(|| k_val.map(|k| k.round().max(0.0) as u32))
            .unwrap_or(1);
        if (has_xy || canned_activated) && repeat > 0 {
            for _ in 0..repeat {
                let hole_xy = compute_target(state, x_val, y_val, None, scale, false);
                expand_canned_cycle(
                    block,
                    state,
                    effective_tools,
                    effective_diameters,
                    hole_xy.x,
                    hole_xy.y,
                    segments,
                    seg_id,
                );
            }
        }
        return;
    }

    // 7. 通常の移動ブロック (G00 / G01 / G02 / G03)
    let has_axis = x_val.is_some()
        || y_val.is_some()
        || z_val.is_some()
        || i_val.is_some()
        || j_val.is_some()
        || k_val.is_some();
    if !has_axis {
        return;
    }

    let start = state.pos;
    let end = compute_target(state, x_val, y_val, z_val, scale, is_g53);

    match state.motion_mode {
        0 => {
            if start.distance_to(&end) > EPS {
                push_linear_segment(
                    block,
                    state,
                    effective_tools,
                    effective_diameters,
                    MotionType::Rapid,
                    start,
                    end,
                    segments,
                    seg_id,
                );
                state.pos = end;
            }
        }
        1 => {
            if start.distance_to(&end) > EPS {
                if state.feed_rate <= 0.0 {
                    diagnostics.push(Diagnostic {
                        severity: DiagnosticSeverity::Warning,
                        line_number: block.line_number,
                        code: "MISSING_FEED".to_string(),
                        message: format!(
                            "送り速度 F が未指定のまま切削送り (G01) が指令されています（デフォルト F{:.0} を仮適用）",
                            config.default_feed_rate
                        ),
                    });
                }
                push_linear_segment(
                    block,
                    state,
                    effective_tools,
                    effective_diameters,
                    MotionType::Linear,
                    start,
                    end,
                    segments,
                    seg_id,
                );
                state.pos = end;
            }
        }
        2 | 3 => {
            let cw = state.motion_mode == 2;
            let ijk = (
                i_val.map(|v| v * scale),
                j_val.map(|v| v * scale),
                k_val.map(|v| v * scale),
            );
            let r_scaled = r_val.map(|v| v * scale);

            match resolve_arc(start, end, state.plane, cw, ijk, r_scaled) {
                Ok(resolved) => {
                    if let Some(warn) = resolved.warning {
                        diagnostics.push(Diagnostic {
                            severity: DiagnosticSeverity::Warning,
                            line_number: block.line_number,
                            code: "ARC_RADIUS_MISMATCH".to_string(),
                            message: warn,
                        });
                    }
                    let (pts, len) = tessellate_arc(
                        start,
                        end,
                        resolved.center,
                        resolved.radius,
                        resolved.sweep_angle,
                        resolved.start_angle,
                        state.plane,
                    );
                    segments.push(PathSegment {
                        id: *seg_id,
                        line_number: block.line_number,
                        raw_line: block.raw_line.clone(),
                        motion_type: if cw {
                            MotionType::ArcCw
                        } else {
                            MotionType::ArcCcw
                        },
                        is_compensated: false,
                        comp_mode: state.comp_mode,
                        plane: state.plane,
                        start,
                        end,
                        arc_center: Some(resolved.center),
                        arc_radius: Some(resolved.radius),
                        arc_cw: Some(cw),
                        points: pts,
                        tool_number: state.tool_number,
                        d_number: state.d_number,
                        h_number: state.h_number,
                        program_number: state.program_number.clone(),
                        feed_rate: state.feed_rate,
                        spindle_speed: state.spindle_speed,
                        length_mm: len,
                        duration_sec: 0.0,
                        cumulative_time_sec: 0.0,
                        has_m00: false,
                        modal_state: state.snapshot(effective_tools, effective_diameters),
                    });
                    *seg_id += 1;
                    state.pos = end;
                }
                Err(err_msg) => {
                    diagnostics.push(Diagnostic {
                        severity: DiagnosticSeverity::Error,
                        line_number: block.line_number,
                        code: "ARC_INVALID".to_string(),
                        message: err_msg,
                    });
                    // 描画が途切れないよう直線フォールバック
                    if start.distance_to(&end) > EPS {
                        push_linear_segment(
                            block,
                            state,
                            effective_tools,
                            effective_diameters,
                            MotionType::Linear,
                            start,
                            end,
                            segments,
                            seg_id,
                        );
                        state.pos = end;
                    }
                }
            }
        }
        _ => {}
    }
}

fn compute_target(
    state: &SimState,
    x: Option<f64>,
    y: Option<f64>,
    z: Option<f64>,
    scale: f64,
    is_g53: bool,
) -> Point3 {
    if is_g53 {
        return Point3::new(
            x.map(|v| v * scale).unwrap_or(state.pos.x),
            y.map(|v| v * scale).unwrap_or(state.pos.y),
            z.map(|v| v * scale).unwrap_or(state.pos.z),
        );
    }

    let ox = state.work_offset.x + state.local_offset.x + state.g92_offset.x;
    let oy = state.work_offset.y + state.local_offset.y + state.g92_offset.y;
    let oz = state.work_offset.z + state.local_offset.z + state.g92_offset.z;

    if state.absolute {
        Point3::new(
            x.map(|v| v * scale + ox).unwrap_or(state.pos.x),
            y.map(|v| v * scale + oy).unwrap_or(state.pos.y),
            z.map(|v| v * scale + oz).unwrap_or(state.pos.z),
        )
    } else {
        Point3::new(
            state.pos.x + x.map(|v| v * scale).unwrap_or(0.0),
            state.pos.y + y.map(|v| v * scale).unwrap_or(0.0),
            state.pos.z + z.map(|v| v * scale).unwrap_or(0.0),
        )
    }
}

#[allow(clippy::too_many_arguments)]
fn push_linear_segment(
    block: &NcBlock,
    state: &SimState,
    effective_tools: &HashMap<u32, ToolSpec>,
    effective_diameters: &HashMap<u32, f64>,
    motion_type: MotionType,
    start: Point3,
    end: Point3,
    segments: &mut Vec<PathSegment>,
    seg_id: &mut usize,
) {
    let len = start.distance_to(&end);
    segments.push(PathSegment {
        id: *seg_id,
        line_number: block.line_number,
        raw_line: block.raw_line.clone(),
        motion_type,
        is_compensated: false,
        comp_mode: state.comp_mode,
        plane: state.plane,
        start,
        end,
        arc_center: None,
        arc_radius: None,
        arc_cw: None,
        points: vec![start, end],
        tool_number: state.tool_number,
        d_number: state.d_number,
        h_number: state.h_number,
        program_number: state.program_number.clone(),
        feed_rate: state.feed_rate,
        spindle_speed: state.spindle_speed,
        length_mm: len,
        duration_sec: 0.0,
        cumulative_time_sec: 0.0,
        has_m00: false,
        modal_state: state.snapshot(effective_tools, effective_diameters),
    });
    *seg_id += 1;
}

/// 固定サイクル（G73/G81/G82/G83/G84/G85等）を詳細軌跡に展開
#[allow(clippy::too_many_arguments)]
fn expand_canned_cycle(
    block: &NcBlock,
    state: &mut SimState,
    effective_tools: &HashMap<u32, ToolSpec>,
    effective_diameters: &HashMap<u32, f64>,
    hx: f64,
    hy: f64,
    segments: &mut Vec<PathSegment>,
    seg_id: &mut usize,
) {
    let return_z = if state.canned_retract_initial {
        state.canned_initial_z
    } else {
        state.canned_r
    };

    // 1. XY位置決め（現在Z高さで早送り）
    let p_xy = Point3::new(hx, hy, state.pos.z);
    if state.pos.distance_to(&p_xy) > EPS {
        push_linear_segment(
            block,
            state,
            effective_tools,
            effective_diameters,
            MotionType::CannedRapid,
            state.pos,
            p_xy,
            segments,
            seg_id,
        );
        state.pos = p_xy;
    }

    // 2. R点へ早送りアプローチ
    let p_r = Point3::new(hx, hy, state.canned_r);
    if state.pos.distance_to(&p_r) > EPS {
        push_linear_segment(
            block,
            state,
            effective_tools,
            effective_diameters,
            MotionType::CannedRapid,
            state.pos,
            p_r,
            segments,
            seg_id,
        );
        state.pos = p_r;
    }

    // 3. 切込動作（G83/G73はペック展開、その他はZ底まで直進）
    let z_bottom = state.canned_z;
    if matches!(state.canned, CannedCycle::G83 | CannedCycle::G73)
        && state.canned_q > EPS
        && z_bottom < state.canned_r - EPS
    {
        let mut cur_depth = state.canned_r;
        let q = state.canned_q;
        let retract_clear = 1.0_f64;
        while cur_depth > z_bottom + EPS {
            let next_depth = (cur_depth - q).max(z_bottom);
            let p_cut = Point3::new(hx, hy, next_depth);
            push_linear_segment(
                block,
                state,
                effective_tools,
                effective_diameters,
                MotionType::CannedFeed,
                state.pos,
                p_cut,
                segments,
                seg_id,
            );
            state.pos = p_cut;

            if next_depth > z_bottom + EPS {
                let retract_to = if state.canned == CannedCycle::G83 {
                    state.canned_r
                } else {
                    (next_depth + retract_clear).min(state.canned_r)
                };
                let p_ret = Point3::new(hx, hy, retract_to);
                push_linear_segment(
                    block,
                    state,
                    effective_tools,
                    effective_diameters,
                    MotionType::CannedRapid,
                    state.pos,
                    p_ret,
                    segments,
                    seg_id,
                );
                state.pos = p_ret;

                if state.canned == CannedCycle::G83 {
                    let p_reapproach =
                        Point3::new(hx, hy, (next_depth + retract_clear).min(state.canned_r));
                    push_linear_segment(
                        block,
                        state,
                        effective_tools,
                        effective_diameters,
                        MotionType::CannedRapid,
                        state.pos,
                        p_reapproach,
                        segments,
                        seg_id,
                    );
                    state.pos = p_reapproach;
                }
            }
            cur_depth = next_depth;
        }
    } else {
        let p_bot = Point3::new(hx, hy, z_bottom);
        if state.pos.distance_to(&p_bot) > EPS {
            push_linear_segment(
                block,
                state,
                effective_tools,
                effective_diameters,
                MotionType::CannedFeed,
                state.pos,
                p_bot,
                segments,
                seg_id,
            );
            state.pos = p_bot;
        }
    }

    // 4. 穴底ドウェル (G82 / G89)
    if matches!(state.canned, CannedCycle::G82 | CannedCycle::G89) && state.canned_p_sec > 0.0 {
        segments.push(PathSegment {
            id: *seg_id,
            line_number: block.line_number,
            raw_line: block.raw_line.clone(),
            motion_type: MotionType::Dwell,
            is_compensated: false,
            comp_mode: state.comp_mode,
            plane: state.plane,
            start: state.pos,
            end: state.pos,
            arc_center: None,
            arc_radius: None,
            arc_cw: None,
            points: vec![state.pos],
            tool_number: state.tool_number,
            d_number: state.d_number,
            h_number: state.h_number,
            program_number: state.program_number.clone(),
            feed_rate: state.feed_rate,
            spindle_speed: state.spindle_speed,
            length_mm: 0.0,
            duration_sec: state.canned_p_sec,
            cumulative_time_sec: 0.0,
            has_m00: false,
            modal_state: state.snapshot(effective_tools, effective_diameters),
        });
        *seg_id += 1;
    }

    // 5. 復帰動作 (G84/G74/G85/G89 は切削戻りでR点まで、その後イニシャル点へ早送り)
    let feed_return = matches!(
        state.canned,
        CannedCycle::G84 | CannedCycle::G74 | CannedCycle::G85 | CannedCycle::G89
    );
    if feed_return && (state.pos.z - state.canned_r).abs() > EPS {
        let p_back_r = Point3::new(hx, hy, state.canned_r);
        push_linear_segment(
            block,
            state,
            effective_tools,
            effective_diameters,
            MotionType::CannedFeed,
            state.pos,
            p_back_r,
            segments,
            seg_id,
        );
        state.pos = p_back_r;
    }

    let p_final = Point3::new(hx, hy, return_z);
    if state.pos.distance_to(&p_final) > EPS {
        push_linear_segment(
            block,
            state,
            effective_tools,
            effective_diameters,
            MotionType::CannedRapid,
            state.pos,
            p_final,
            segments,
            seg_id,
        );
        state.pos = p_final;
    }
}

/// 1セグメントの所要時間（秒）を計算
fn calc_segment_duration_sec(seg: &PathSegment, config: &MachineConfig) -> f64 {
    match seg.motion_type {
        MotionType::Dwell => seg.duration_sec.max(0.0),
        MotionType::ToolChange => config.tool_change_time_sec.max(0.0),
        MotionType::Rapid | MotionType::CannedRapid => {
            let dx = (seg.end.x - seg.start.x).abs();
            let dy = (seg.end.y - seg.start.y).abs();
            let dz = (seg.end.z - seg.start.z).abs();
            let vx = config.rapid_rate_x.max(100.0);
            let vy = config.rapid_rate_y.max(100.0);
            let vz = config.rapid_rate_z.max(100.0);
            // 3軸同時独立早送り（最長軸時間で決まる）
            let raw_sec = (dx / vx).max(dy / vy).max(dz / vz) * 60.0;
            if raw_sec <= 0.0 {
                0.0
            } else {
                (raw_sec * config.accel_overhead_factor.max(1.0)).max(config.min_block_time_sec)
            }
        }
        MotionType::Linear | MotionType::ArcCw | MotionType::ArcCcw | MotionType::CannedFeed => {
            let f = if seg.feed_rate > 0.0 {
                seg.feed_rate
            } else {
                config.default_feed_rate.max(1.0)
            };
            let raw_sec = (seg.length_mm / f) * 60.0;
            if raw_sec <= 0.0 {
                0.0
            } else {
                (raw_sec * config.accel_overhead_factor.max(1.0)).max(config.min_block_time_sec)
            }
        }
    }
}

fn assign_timings(segments: &mut [PathSegment], config: &MachineConfig) {
    let mut cum = 0.0;
    for seg in segments.iter_mut() {
        let dt = calc_segment_duration_sec(seg, config);
        seg.duration_sec = dt;
        cum += dt;
        seg.cumulative_time_sec = cum;
    }
}

/// セグメント列へ所要時間を付与し、全体および工具別のサイクルタイムを集計する
fn compute_cycle_time_summary(
    segments: &mut [PathSegment],
    config: &MachineConfig,
    effective_tools: &HashMap<u32, ToolSpec>,
    effective_diameters: &HashMap<u32, f64>,
    tool_comments: &HashMap<u32, String>,
) -> CycleTimeSummary {
    let mut cum = 0.0;
    let mut total_rapid_time = 0.0;
    let mut total_cut_time = 0.0;
    let mut total_dwell_time = 0.0;
    let mut total_tc_time = 0.0;
    let mut total_rapid_dist = 0.0;
    let mut total_cut_dist = 0.0;
    let mut tool_changes = 0usize;

    let mut per_tool: BTreeMap<u32, ToolSummary> = BTreeMap::new();

    for seg in segments.iter_mut() {
        let dt = calc_segment_duration_sec(seg, config);
        seg.duration_sec = dt;
        cum += dt;
        seg.cumulative_time_sec = cum;

        let t = seg.tool_number;
        let t_spec = effective_tools.get(&t);
        let entry = per_tool.entry(t).or_insert_with(|| ToolSummary {
            tool_number: t,
            d_numbers: Vec::new(),
            tool_diameter: t_spec
                .map(|s| s.diameter)
                .or_else(|| effective_diameters.get(&t).copied())
                .unwrap_or(0.0),
            rapid_distance_mm: 0.0,
            cut_distance_mm: 0.0,
            rapid_time_sec: 0.0,
            cut_time_sec: 0.0,
            dwell_time_sec: 0.0,
            tool_change_time_sec: 0.0,
            total_time_sec: 0.0,
            min_z: f64::INFINITY,
            max_z: f64::NEG_INFINITY,
            segment_count: 0,
            comment_hint: t_spec
                .map(|s| s.name.clone())
                .filter(|n| !n.is_empty())
                .or_else(|| tool_comments.get(&t).cloned()),
        });

        entry.segment_count += 1;
        if seg.d_number > 0 && !entry.d_numbers.contains(&seg.d_number) {
            entry.d_numbers.push(seg.d_number);
            if let Some(&dia) = effective_diameters.get(&seg.d_number) {
                entry.tool_diameter = dia;
            }
        }

        for p in &seg.points {
            if p.z < entry.min_z {
                entry.min_z = p.z;
            }
            if p.z > entry.max_z {
                entry.max_z = p.z;
            }
        }

        match seg.motion_type {
            MotionType::Rapid | MotionType::CannedRapid => {
                total_rapid_time += dt;
                total_rapid_dist += seg.length_mm;
                entry.rapid_time_sec += dt;
                entry.rapid_distance_mm += seg.length_mm;
            }
            MotionType::Linear
            | MotionType::ArcCw
            | MotionType::ArcCcw
            | MotionType::CannedFeed => {
                total_cut_time += dt;
                total_cut_dist += seg.length_mm;
                entry.cut_time_sec += dt;
                entry.cut_distance_mm += seg.length_mm;
            }
            MotionType::Dwell => {
                total_dwell_time += dt;
                entry.dwell_time_sec += dt;
            }
            MotionType::ToolChange => {
                total_tc_time += dt;
                tool_changes += 1;
                entry.tool_change_time_sec += dt;
            }
        }
        entry.total_time_sec += dt;
    }

    let tools: Vec<ToolSummary> = per_tool
        .into_values()
        .map(|mut ts| {
            if !ts.min_z.is_finite() {
                ts.min_z = 0.0;
                ts.max_z = 0.0;
            }
            ts
        })
        .collect();

    CycleTimeSummary {
        total_time_sec: cum,
        rapid_time_sec: total_rapid_time,
        cut_time_sec: total_cut_time,
        dwell_time_sec: total_dwell_time,
        tool_change_time_sec: total_tc_time,
        total_rapid_distance_mm: total_rapid_dist,
        total_cut_distance_mm: total_cut_dist,
        tool_changes,
        tools,
    }
}

fn compute_bounding_box(prog: &[PathSegment], comp: &[PathSegment]) -> BoundingBox {
    let mut min = Point3::new(f64::INFINITY, f64::INFINITY, f64::INFINITY);
    let mut max = Point3::new(f64::NEG_INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
    let mut valid = false;

    for seg in prog.iter().chain(comp.iter()) {
        // 原点復帰のみの極端な高さに引っ張られないよう、全点を含めつつ妥当な範囲を記録
        for p in &seg.points {
            min.x = min.x.min(p.x);
            min.y = min.y.min(p.y);
            min.z = min.z.min(p.z);
            max.x = max.x.max(p.x);
            max.y = max.y.max(p.y);
            max.z = max.z.max(p.z);
            valid = true;
        }
    }

    if !valid {
        BoundingBox {
            min: Point3::zero(),
            max: Point3::zero(),
            valid: false,
        }
    } else {
        BoundingBox { min, max, valid }
    }
}
