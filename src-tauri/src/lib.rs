mod compensation;
mod geometry;
mod macro_engine;
mod models;
mod parser;
mod simulator;

use encoding_rs::{SHIFT_JIS, UTF_8};
use models::{FileReadResult, NcParseRequest, ParseResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WindowEvent};

/// ウィンドウ位置・サイズ・最大化状態の永続化構造体
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SavedWindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

fn window_state_file_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    let _ = fs::create_dir_all(&dir);
    Some(dir.join("window-state.json"))
}

fn load_window_state(path: &Path) -> Option<SavedWindowState> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str::<SavedWindowState>(&text).ok()
}

fn save_window_state(path: &Path, state: &SavedWindowState) {
    if let Ok(json) = serde_json::to_string_pretty(state) {
        let _ = fs::write(path, json);
    }
}

/// 保存されたウィンドウ位置が現在の利用可能モニター群のいずれかと交差するか検証（画面外迷子防止）
fn is_position_visible_on_monitors(
    window: &tauri::WebviewWindow,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> bool {
    let Ok(monitors) = window.available_monitors() else {
        return true;
    };
    if monitors.is_empty() {
        return true;
    }
    let w_right = x.saturating_add(width as i32);
    let w_bottom = y.saturating_add(height as i32);
    monitors.iter().any(|m| {
        let pos = m.position();
        let size = m.size();
        let m_left = pos.x;
        let m_top = pos.y;
        let m_right = m_left.saturating_add(size.width as i32);
        let m_bottom = m_top.saturating_add(size.height as i32);
        // 少なくともタイトルバー領域（上端）がモニター内に収まっているか
        w_right > m_left + 80
            && x < m_right - 80
            && y >= m_top - 20
            && y < m_bottom - 60
            && w_bottom > m_top + 60
    })
}

/// 外部エディタ連動のファイル監視状態
#[derive(Default)]
struct WatchState {
    inner: Arc<Mutex<WatchTarget>>,
}

#[derive(Default)]
struct WatchTarget {
    path: Option<String>,
    last_modified: Option<SystemTime>,
    generation: u64,
}

/// NCプログラム解析コマンド（フロントエンドから invoke で呼び出し）
#[tauri::command]
fn parse_nc_program(request: NcParseRequest) -> Result<ParseResult, String> {
    Ok(simulator::simulate_nc(
        &request.source,
        &request.config,
        request.file_path.as_deref(),
    ))
}

/// ローカルNCファイルをUTF-8 / Shift-JIS自動判別して読み込む
#[tauri::command]
fn read_text_file(path: String) -> Result<FileReadResult, String> {
    let bytes = fs::read(&path).map_err(|e| format!("ファイル読込エラー: {}", e))?;

    let (content, encoding) = if let Ok(s) = std::str::from_utf8(&bytes) {
        (
            s.trim_start_matches('\u{feff}').to_string(),
            "UTF-8".to_string(),
        )
    } else {
        let (decoded, _, had_errors) = SHIFT_JIS.decode(&bytes);
        if !had_errors {
            (decoded.into_owned(), "Shift-JIS".to_string())
        } else {
            let (fallback, _, _) = UTF_8.decode(&bytes);
            (fallback.into_owned(), "UTF-8 (lossy)".to_string())
        }
    };

    let file_name = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("untitled.nc")
        .to_string();

    Ok(FileReadResult {
        path,
        file_name,
        content,
        encoding,
    })
}

/// ローカルNCファイル・レポートファイルを保存する（Shift-JIS / UTF-8 対応）
#[tauri::command]
fn write_text_file(
    path: String,
    content: String,
    encoding: Option<String>,
    watch_state: State<'_, WatchState>,
) -> Result<(), String> {
    let bytes: Vec<u8> = match encoding.as_deref() {
        Some("Shift-JIS") => {
            let (encoded, _, _) = SHIFT_JIS.encode(&content);
            encoded.into_owned()
        }
        _ => content.as_bytes().to_vec(),
    };
    fs::write(&path, &bytes).map_err(|e| format!("ファイル保存エラー: {}", e))?;

    // 自己保存でファイル監視リロードが誤発火しないよう mtime を同期する
    if let Ok(mut guard) = watch_state.inner.lock() {
        if guard.path.as_deref() == Some(path.as_str()) {
            guard.last_modified = fs::metadata(&path).and_then(|m| m.modified()).ok();
        }
    }
    Ok(())
}

/// 外部エディタによるファイル変更監視を開始する
#[tauri::command]
fn start_watch_file(
    path: String,
    app: AppHandle,
    watch_state: State<'_, WatchState>,
) -> Result<(), String> {
    let mtime = fs::metadata(&path).and_then(|m| m.modified()).ok();
    let gen = {
        let mut guard = watch_state
            .inner
            .lock()
            .map_err(|_| "監視ロック取得に失敗しました".to_string())?;
        guard.generation += 1;
        guard.path = Some(path.clone());
        guard.last_modified = mtime;
        guard.generation
    };

    let shared = Arc::clone(&watch_state.inner);
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(450));
        let should_emit = {
            let Ok(mut guard) = shared.lock() else {
                break;
            };
            if guard.generation != gen || guard.path.as_deref() != Some(path.as_str()) {
                break;
            }
            if let Ok(meta) = fs::metadata(&path) {
                if let Ok(modified) = meta.modified() {
                    if guard.last_modified != Some(modified) {
                        guard.last_modified = Some(modified);
                        true
                    } else {
                        false
                    }
                } else {
                    false
                }
            } else {
                false
            }
        };

        if should_emit {
            let _ = app.emit("nc-file-changed", path.clone());
        }
    });

    Ok(())
}

/// ファイル監視を停止する
#[tauri::command]
fn stop_watch_file(watch_state: State<'_, WatchState>) -> Result<(), String> {
    if let Ok(mut guard) = watch_state.inner.lock() {
        guard.generation += 1;
        guard.path = None;
        guard.last_modified = None;
    }
    Ok(())
}

/// 初回起動時用の実践的なFANUC 3軸サンプルNCプログラムを返す
#[tauri::command]
fn get_sample_nc() -> String {
    SAMPLE_NC.to_string()
}

/// Phase 2用：カスタムマクロB + サブプログラム(M98/M99, G65) のデモNCプログラムを返す
#[tauri::command]
fn get_macro_sample_nc() -> String {
    MACRO_SAMPLE_NC.to_string()
}

const SAMPLE_NC: &str = r#"%
O1001 (TOMBO PLATE DEMO - FANUC 3AXIS)
G90 G40 G49 G80 G17 G21

(--- T01: DIA=10.0 FLAT ENDMILL - OUTER CONTOUR WITH G41 ---)
T01 M06 (T01 DIA=10.0 FLAT ENDMILL)
G54 G00 X-20.0 Y-20.0
G43 Z50.0 H01 S6000 M03
Z5.0
G01 Z-6.0 F300.0
G41 D01 X0.0 Y0.0 F800.0 (CUTTER COMP STARTUP LEFT)
G01 X100.0 Y0.0
G03 X115.0 Y15.0 R15.0 (CORNER FILLET R15)
G01 X115.0 Y65.0
G03 X100.0 Y80.0 R15.0
G01 X20.0 Y80.0
G01 X0.0 Y60.0 (CHAMFER 20x20)
G01 X0.0 Y0.0
G40 G01 X-20.0 Y-20.0 (CUTTER COMP CANCEL)
G00 Z50.0

(--- T02: DIA=6.0 ENDMILL - INNER POCKET WITH G42 ---)
T02 M06 (T02 DIA=6.0 FINISH ENDMILL)
G54 G00 X55.0 Y40.0
G43 Z50.0 H02 S8500 M03
Z3.0
G01 Z-4.0 F250.0
G42 D02 X30.0 Y22.0 F650.0 (INNER POCKET G42)
G01 X30.0 Y58.0
G02 X38.0 Y66.0 R8.0
G01 X82.0 Y66.0
G02 X90.0 Y58.0 R8.0
G01 X90.0 Y22.0
G02 X82.0 Y14.0 R8.0
G01 X38.0 Y14.0
G02 X30.0 Y22.0 R8.0
G40 G01 X55.0 Y40.0
G00 Z50.0

(--- T03: DIA=8.0 DRILL - G83 PECK DRILLING CYCLE ---)
T03 M06 (T03 DIA=8.0 CARBIDE DRILL)
G54 G00 X18.0 Y18.0
G43 Z50.0 H03 S2800 M03
G98 G83 X18.0 Y18.0 Z-18.0 R3.0 Q5.0 F220.0
X98.0 Y18.0
X98.0 Y62.0
X18.0 Y62.0
G80
G00 Z80.0
M05
G91 G28 Z0.0
G90
M30
%"#;

const MACRO_SAMPLE_NC: &str = r#"%
O2001 (CUSTOM MACRO B + SUBPROGRAM DEMO)
G90 G40 G49 G80 G17 G21

(--- T01: DIA=10.0 STEP-DOWN SQUARE CONTOUR BY M98 L3 ---)
T01 M06 (T01 DIA=10.0 ENDMILL)
G54 G00 X-15.0 Y-15.0
G43 Z50.0 H01 S6500 M03
Z2.0
#100 = 0.0 (CURRENT Z DEPTH)
M98 P2100 L3 (3 PASSES STEP-DOWN)
G00 Z50.0

(--- T02: DIA=6.0 BOLT HOLE CIRCLE BY G65 CUSTOM MACRO B ---)
T02 M06 (T02 DIA=6.0 CARBIDE DRILL)
G54 G00 X50.0 Y50.0
G43 Z50.0 H02 S3200 M03
(X50 Y50 CENTER, R=32mm PCD, A=0 DEG START, B=8 HOLES, Z=-12mm)
G65 P2200 X50.0 Y50.0 R32.0 A0.0 B8.0 Z-12.0 F240.0
G00 Z80.0
M05
G91 G28 Z0.0
G90
M30

O2100 (SUBPROGRAM: STEP-DOWN CONTOUR WITH G41)
#100 = #100 - 3.0
G90 G00 X-15.0 Y-15.0
G01 Z#100 F300.0
G41 D01 X0.0 Y0.0 F850.0
G01 X100.0 Y0.0
G03 X100.0 Y100.0 R50.0
G01 X0.0 Y100.0
G01 X0.0 Y0.0
G40 G01 X-15.0 Y-15.0
M99

O2200 (MACRO: BOLT HOLE CIRCLE - #24=X #25=Y #18=R #1=START_ANG #2=HOLES #26=Z #9=F)
#101 = 0 (HOLE INDEX)
#102 = 360.0 / #2 (ANGLE STEP)
WHILE [#101 LT #2] DO 1
  #103 = #1 + #101 * #102
  #104 = #24 + #18 * COS[#103]
  #105 = #25 + #18 * SIN[#103]
  G98 G81 X#104 Y#105 Z#26 R3.0 F#9
  G80
  #101 = #101 + 1
END 1
M99
%"#;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WatchState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                // Windows / Linux では OS 標準タイトルバーを外してカスタム一体型タイトルバーにする
                // （macOS は tauri.conf.json の titleBarStyle: Overlay でトラフィックライト付き一体型）
                #[cfg(not(target_os = "macos"))]
                {
                    let _ = window.set_decorations(false);
                }

                // 前回のウィンドウサイズ・位置・最大化状態を復元
                let state_path = window_state_file_path(app.handle());
                let initial_state = state_path
                    .as_deref()
                    .and_then(load_window_state)
                    .filter(|s| s.width >= 640 && s.height >= 480);

                if let Some(ref s) = initial_state {
                    let _ = window.set_size(PhysicalSize::new(s.width, s.height));
                    if is_position_visible_on_monitors(&window, s.x, s.y, s.width, s.height) {
                        let _ = window.set_position(PhysicalPosition::new(s.x, s.y));
                    }
                    if s.maximized {
                        let _ = window.maximize();
                    }
                }

                // ウィンドウ移動・リサイズ・終了時に状態を自動保存（最小化時の異常座標は無視）
                if let Some(path) = state_path {
                    let current = Arc::new(Mutex::new(initial_state.unwrap_or(SavedWindowState {
                        x: 100,
                        y: 100,
                        width: 1440,
                        height: 900,
                        maximized: false,
                    })));
                    let win_clone = window.clone();
                    let state_clone = Arc::clone(&current);
                    window.on_window_event(move |event| match event {
                        WindowEvent::Moved(_)
                        | WindowEvent::Resized(_)
                        | WindowEvent::CloseRequested { .. } => {
                            if win_clone.is_minimized().unwrap_or(false) {
                                return;
                            }
                            let is_max = win_clone.is_maximized().unwrap_or(false);
                            if let Ok(mut guard) = state_clone.lock() {
                                guard.maximized = is_max;
                                if !is_max {
                                    if let Ok(pos) = win_clone.outer_position() {
                                        guard.x = pos.x;
                                        guard.y = pos.y;
                                    }
                                    if let Ok(size) = win_clone.inner_size() {
                                        if size.width >= 640 && size.height >= 480 {
                                            guard.width = size.width;
                                            guard.height = size.height;
                                        }
                                    }
                                }
                                save_window_state(&path, &guard);
                            }
                        }
                        _ => {}
                    });
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            parse_nc_program,
            read_text_file,
            write_text_file,
            start_watch_file,
            stop_watch_file,
            get_sample_nc,
            get_macro_sample_nc,
        ])
        .run(tauri::generate_context!())
        .expect("TomboGCoder の起動中にエラーが発生しました");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{CutterCompMode, DiagnosticSeverity, MachineConfig, MotionType};

    #[test]
    fn test_sample_nc_simulation_and_cycle_time() {
        let cfg = MachineConfig::default();
        let res = simulator::simulate_nc(SAMPLE_NC, &cfg, None);

        assert!(!res.program_segments.is_empty());
        assert!(!res.compensated_segments.is_empty());
        assert_eq!(res.detected_tools, vec![1, 2, 3]);
        assert_eq!(res.detected_d_numbers, vec![1, 2]);
        assert!(res.cycle_time.total_time_sec > 15.0);
        assert_eq!(res.cycle_time.tool_changes, 3);
        assert!(res.bounding_box.valid);
        let errors: Vec<_> = res
            .diagnostics
            .iter()
            .filter(|d| d.severity == DiagnosticSeverity::Error)
            .collect();
        assert!(errors.is_empty(), "想定外のエラー: {:?}", errors);
    }

    #[test]
    fn test_cutter_comp_g41_square_offset() {
        let nc = r#"
G90 G17 G21
G00 X-10. Y-10. Z5.
G01 Z-5. F300.
G41 D01 X0. Y0. F500.
G01 X100. Y0.
G01 X100. Y100.
G01 X0. Y100.
G01 X0. Y0.
G40 G01 X-10. Y-10.
"#;
        let cfg = MachineConfig::default();
        let res = simulator::simulate_nc(nc, &cfg, None);
        let comp_lines: Vec<_> = res
            .compensated_segments
            .iter()
            .filter(|s| s.comp_mode == CutterCompMode::Left && s.motion_type == MotionType::Linear)
            .collect();
        assert!(comp_lines.len() >= 5);
        let first_edge = comp_lines[1];
        assert!((first_edge.start.y - 5.0).abs() < 1e-3, "start={:?}", first_edge.start);
        assert!((first_edge.end.x - 95.0).abs() < 1e-3, "end={:?}", first_edge.end);
        assert!((first_edge.end.y - 5.0).abs() < 1e-3, "end={:?}", first_edge.end);
    }

    #[test]
    fn test_cutter_comp_small_inner_arc_error() {
        let nc = r#"
G90 G17 G21
G00 X0. Y0. Z-2.
G41 D01 X10. Y0. F500.
G01 X20. Y0.
G03 X23. Y3. R3.
G01 X23. Y20.
G40 G01 X0. Y20.
"#;
        let cfg = MachineConfig::default();
        let res = simulator::simulate_nc(nc, &cfg, None);
        assert!(
            res.diagnostics
                .iter()
                .any(|d| d.code == "COMP_ARC_TOO_SMALL"),
            "内R不足エラーが検出されませんでした: {:?}",
            res.diagnostics
        );
    }

    #[test]
    fn test_macro_b_and_subprogram_demo() {
        let cfg = MachineConfig::default();
        let res = simulator::simulate_nc(MACRO_SAMPLE_NC, &cfg, None);

        let errors: Vec<_> = res
            .diagnostics
            .iter()
            .filter(|d| d.severity == DiagnosticSeverity::Error)
            .collect();
        assert!(errors.is_empty(), "マクロ実行エラー: {:?}", errors);

        // #100 は M98 L3 で -3.0 × 3 = -9.0 になっているはず
        let var100 = res.macro_variables.iter().find(|v| v.number == 100);
        assert!(var100.is_some());
        assert!((var100.unwrap().value - (-9.0)).abs() < 1e-6);

        // G65 P2200 で B=8 穴分の G81 切削セグメントが展開されているはず
        let drilled_holes = res
            .program_segments
            .iter()
            .filter(|s| s.motion_type == MotionType::CannedFeed)
            .count();
        assert_eq!(drilled_holes, 8, "ボルトホール円の穴数が一致しません");

        // 最小Zは -12.0mm
        assert!((res.bounding_box.min.z - (-12.0)).abs() < 1e-3);
    }

    #[test]
    fn test_real_funuc_nc_file() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("FUNUC.nc");
        if !path.is_file() {
            return;
        }
        let content = fs::read_to_string(&path).expect("FUNUC.nc 読込失敗");
        let cfg = MachineConfig::default();
        let res = simulator::simulate_nc(&content, &cfg, path.to_str());

        let errors: Vec<_> = res
            .diagnostics
            .iter()
            .filter(|d| d.severity == DiagnosticSeverity::Error)
            .collect();
        assert!(errors.is_empty(), "FUNUC.nc 解析エラー: {:?}", errors);

        // 工具 T1〜T8、径補正 D1〜D3、全O番号が検出されること
        assert_eq!(res.detected_tools, vec![1, 2, 3, 4, 5, 6, 7, 8]);
        assert_eq!(res.detected_d_numbers, vec![1, 2, 3]);
        assert!(res.detected_programs.contains(&"O1000".to_string()));
        assert!(res.detected_programs.contains(&"O2000".to_string()));
        assert!(res.detected_programs.contains(&"O3000".to_string()));
        assert!(res.compensated_segments.len() > 300);
        assert!(
            res.bounding_box.min.x >= -150.0 && res.bounding_box.max.x <= 150.0,
            "X範囲異常: {:?}",
            res.bounding_box
        );
        assert!(
            (res.bounding_box.min.z - (-20.0)).abs() < 1e-2,
            "最小Z異常: {:?}",
            res.bounding_box
        );
    }

    #[test]
    fn test_multiple_independent_o_programs_in_one_file() {
        let nc = r#"%
O0001
G90 G00 X0. Y0. Z10.
G01 Z-2. F200.
X50. Y0.
G00 Z10.
M30
O0002
G90 G00 X100. Y0. Z10.
G01 Z-3. F200.
X150. Y50.
G00 Z10.
M30
%"#;
        let cfg = MachineConfig::default();
        let res = simulator::simulate_nc(nc, &cfg, None);
        assert_eq!(res.detected_programs, vec!["O1".to_string(), "O2".to_string()]);
        assert!(res.compensated_segments.iter().any(|s| s.program_number == "O1"));
        assert!(res.compensated_segments.iter().any(|s| s.program_number == "O2"));
    }

    #[test]
    fn test_g52_local_coordinate_partial_axis_and_cancel() {
        let nc = r#"
G90 G54 G17 G21
G52 X50. Y20.
G00 X0. Y0. Z10.
G52 Z-5.
G01 X10. Y5. Z0. F300.
G52 X0. Y0. Z0.
G00 X0. Y0. Z10.
"#;
        let cfg = MachineConfig::default();
        let res = simulator::simulate_nc(nc, &cfg, None);
        let segs = &res.program_segments;
        assert_eq!(segs.len(), 3);
        // 1本目: G52 X50 Y20 下での (0, 0, 10) -> (50, 20, 10)
        assert!((segs[0].end.x - 50.0).abs() < 1e-6);
        assert!((segs[0].end.y - 20.0).abs() < 1e-6);
        assert!((segs[0].end.z - 10.0).abs() < 1e-6);
        // 2本目: G52 Z-5 で X=50, Y=20 が保持され、X10 Y5 Z0 -> (60, 25, -5)
        assert!((segs[1].end.x - 60.0).abs() < 1e-6);
        assert!((segs[1].end.y - 25.0).abs() < 1e-6);
        assert!((segs[1].end.z - (-5.0)).abs() < 1e-6);
        // 3本目: G52 X0 Y0 Z0 で解除後、(0, 0, 10)
        assert!((segs[2].end.x - 0.0).abs() < 1e-6);
        assert!((segs[2].end.y - 0.0).abs() < 1e-6);
        assert!((segs[2].end.z - 10.0).abs() < 1e-6);
    }

    #[test]
    fn test_duplicate_o_number_warning_and_m00_segment() {
        let nc = r#"%
O1001
G90 G00 X0. Y0. Z10.
M00 (CHECK WORK)
G01 X20. Y0. F300.
M30
O1001
G90 G00 X10. Y10. Z10.
M30
%"#;
        let cfg = MachineConfig::default();
        let res = simulator::simulate_nc(nc, &cfg, None);
        assert!(
            res.diagnostics
                .iter()
                .any(|d| d.code == "DUPLICATE_PROGRAM_NUMBER" && d.line_number == 7),
            "O番号重複警告が検出されていません: {:?}",
            res.diagnostics
        );
        assert!(
            res.compensated_segments
                .iter()
                .any(|s| s.has_m00 && s.line_number == 4),
            "M00セグメントが検出されていません"
        );
    }

    #[test]
    fn test_g92_with_g52_does_not_double_shift() {
        let nc = r#"
G90 G54 G17 G21
G52 X50. Y20.
G00 X203.2 Y-10. Z10.
G91 X0. Y0.
G92 X203.2 Y-10.
G90 G01 X210. Y0. F300.
"#;
        let cfg = MachineConfig::default();
        let res = simulator::simulate_nc(nc, &cfg, None);
        let last = res.program_segments.last().unwrap();
        // G52 X50 Y20 下での G90 X210 Y0 -> (260, 20) になり、二重シフトしないこと
        assert!((last.end.x - 260.0).abs() < 1e-6, "X={}", last.end.x);
        assert!((last.end.y - 20.0).abs() < 1e-6, "Y={}", last.end.y);
    }
}
