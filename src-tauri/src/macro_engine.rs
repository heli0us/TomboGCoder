use crate::models::{Diagnostic, DiagnosticSeverity, MacroVariableEntry, SimReplaceRule};
use crate::parser::{parse_single_line, NcBlock};
use encoding_rs::{SHIFT_JIS, UTF_8};
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::{Path, PathBuf};

const MAX_EXEC_STEPS: usize = 200_000;
const MAX_CALL_DEPTH: usize = 16;

/// マクロ変数ストレージ（ローカル変数スタック + コモン変数）
#[derive(Debug, Default)]
pub struct MacroVars {
    local_stack: Vec<HashMap<u32, f64>>,
    common: BTreeMap<u32, f64>,
}

impl MacroVars {
    pub fn new() -> Self {
        Self {
            local_stack: vec![HashMap::new()],
            common: BTreeMap::new(),
        }
    }

    pub fn get(&self, num: u32) -> f64 {
        if (1..=33).contains(&num) {
            self.local_stack
                .last()
                .and_then(|m| m.get(&num).copied())
                .unwrap_or(0.0)
        } else {
            self.common.get(&num).copied().unwrap_or(0.0)
        }
    }

    pub fn set(&mut self, num: u32, val: f64) {
        if (1..=33).contains(&num) {
            if let Some(frame) = self.local_stack.last_mut() {
                frame.insert(num, val);
            }
        } else if num >= 100 {
            self.common.insert(num, val);
        }
    }

    pub fn push_frame(&mut self, args: HashMap<u32, f64>) {
        self.local_stack.push(args);
    }

    pub fn pop_frame(&mut self) {
        if self.local_stack.len() > 1 {
            self.local_stack.pop();
        }
    }

    pub fn to_entries(&self) -> Vec<MacroVariableEntry> {
        let mut entries = Vec::new();
        if let Some(top) = self.local_stack.first() {
            let mut locals: Vec<(u32, f64)> = top.iter().map(|(&k, &v)| (k, v)).collect();
            locals.sort_by_key(|&(k, _)| k);
            for (k, v) in locals {
                entries.push(MacroVariableEntry {
                    number: k,
                    value: v,
                    scope: "ローカル".to_string(),
                });
            }
        }
        for (&k, &v) in &self.common {
            entries.push(MacroVariableEntry {
                number: k,
                value: v,
                scope: if k >= 500 {
                    "コモン(保持)".to_string()
                } else {
                    "コモン".to_string()
                },
            });
        }
        entries
    }
}

/// 1プログラム（メインまたはサブプログラム）の行リスト
#[derive(Debug, Clone)]
struct ProgramUnit {
    /// (元ファイルの1始まり行番号, 生テキスト)
    lines: Vec<(usize, String)>,
    /// シーケンス番号 N -> lines内インデックス
    n_labels: HashMap<u32, usize>,
}

/// サブプログラム呼び出しフレーム
#[derive(Debug, Clone)]
struct CallFrame {
    prog_name: String,
    return_pc: usize,
    remaining_repeats: u32,
    sub_name: String,
    is_macro_call: bool,
}

/// WHILE ループフレーム
#[derive(Debug, Clone)]
struct WhileFrame {
    do_id: u32,
    while_pc: usize,
}

/// マクロ＆サブプログラム展開結果
pub struct MacroExpandOutput {
    pub blocks: Vec<NcBlock>,
    pub variables: Vec<MacroVariableEntry>,
}

/// ソースコードからサブプログラム(M98/M99)およびカスタムマクロBを展開し、実行順の NcBlock 列を生成する
pub fn expand_program(
    source: &str,
    optional_block_skip: bool,
    file_path: Option<&str>,
    subprogram_dirs: &[String],
    sim_replace_rules: &[SimReplaceRule],
    diagnostics: &mut Vec<Diagnostic>,
) -> MacroExpandOutput {
    let mut search_dirs: Vec<PathBuf> = Vec::new();
    if let Some(dir) = file_path.and_then(|p| Path::new(p).parent()) {
        search_dirs.push(dir.to_path_buf());
    }
    for d in subprogram_dirs {
        let t = d.trim();
        if !t.is_empty() {
            let pb = PathBuf::from(t);
            if !search_dirs.contains(&pb) {
                search_dirs.push(pb);
            }
        }
    }

    let (mut programs, program_order) = split_programs(source, diagnostics);
    let main_name = program_order
        .first()
        .cloned()
        .unwrap_or_else(|| "MAIN".to_string());

    let mut vars = MacroVars::new();
    let mut out_blocks: Vec<NcBlock> = Vec::new();
    let mut visited_programs: std::collections::HashSet<String> = std::collections::HashSet::new();

    // メインプログラムを実行し、もし同一ファイル内に一度も呼ばれなかった独立 O番号があれば続けて展開する
    let mut entry_queue: Vec<String> = vec![main_name];
    let mut total_steps: usize = 0;

    while let Some(entry_prog) = entry_queue.pop() {
        if visited_programs.contains(&entry_prog) {
            continue;
        }
        visited_programs.insert(entry_prog.clone());

        let mut call_stack: Vec<CallFrame> = Vec::new();
        let mut while_stack: Vec<WhileFrame> = Vec::new();
        let mut cur_prog = entry_prog;
        let mut pc: usize = 0;

        loop {
            if total_steps >= MAX_EXEC_STEPS {
                diagnostics.push(Diagnostic {
                    severity: DiagnosticSeverity::Error,
                    line_number: 1,
                    code: "MACRO_LOOP_LIMIT".to_string(),
                    message: format!(
                        "マクロ/サブプログラムの実行ステップ上限 ({}) に達しました（無限ループの可能性があります）",
                        MAX_EXEC_STEPS
                    ),
                });
                break;
            }
            total_steps += 1;

            let Some(unit) = programs.get(&cur_prog) else {
                break;
            };

            if pc >= unit.lines.len() {
                if let Some(frame) = call_stack.pop() {
                    if frame.remaining_repeats > 1 {
                        let next_frame = CallFrame {
                            remaining_repeats: frame.remaining_repeats - 1,
                            ..frame.clone()
                        };
                        cur_prog = frame.sub_name;
                        call_stack.push(next_frame);
                        pc = 0;
                        while_stack.clear();
                    } else {
                        if frame.is_macro_call {
                            vars.pop_frame();
                        }
                        cur_prog = frame.prog_name;
                        pc = frame.return_pc;
                        while_stack.clear();
                    }
                    continue;
                }
                break;
            }

            let (line_no, raw_line) = unit.lines[pc].clone();
            let trimmed = raw_line.trim();
            if trimmed.is_empty() || trimmed == "%" {
                pc += 1;
                continue;
            }

            let mut active_str = trimmed;
            if active_str.starts_with('/') {
                if optional_block_skip {
                    pc += 1;
                    continue;
                }
                active_str = active_str[1..]
                    .trim_start_matches(|c: char| c.is_ascii_digit())
                    .trim_start();
            }

            let code_only = strip_comments(active_str);
            let code_trimmed = code_only.trim();
            if code_trimmed.is_empty() {
                let mut cb = parse_single_line(line_no, &raw_line, optional_block_skip);
                cb.program_number = Some(cur_prog.clone());
                out_blocks.push(cb);
                pc += 1;
                continue;
            }

            let stmt = strip_leading_n_number(code_trimmed);
            let upper = stmt.to_ascii_uppercase();

            // 1. WHILE [cond] DO m
            if upper.starts_with("WHILE") {
                match parse_while_stmt(&upper, &vars) {
                    Ok((cond, do_id)) => {
                        if cond {
                            if while_stack
                                .last()
                                .map(|w| w.do_id != do_id || w.while_pc != pc)
                                .unwrap_or(true)
                            {
                                while_stack.push(WhileFrame {
                                    do_id,
                                    while_pc: pc,
                                });
                            }
                            pc += 1;
                        } else {
                            if let Some(last) = while_stack.last() {
                                if last.do_id == do_id && last.while_pc == pc {
                                    while_stack.pop();
                                }
                            }
                            if let Some(end_pc) = find_matching_end(&unit.lines, pc + 1, do_id) {
                                pc = end_pc + 1;
                            } else {
                                diagnostics.push(Diagnostic {
                                    severity: DiagnosticSeverity::Error,
                                    line_number: line_no,
                                    code: "MACRO_MISSING_END".to_string(),
                                    message: format!(
                                        "WHILE DO{} に対応する END{} が見つかりません",
                                        do_id, do_id
                                    ),
                                });
                                pc += 1;
                            }
                        }
                    }
                    Err(msg) => {
                        diagnostics.push(Diagnostic {
                            severity: DiagnosticSeverity::Error,
                            line_number: line_no,
                            code: "MACRO_SYNTAX".to_string(),
                            message: msg,
                        });
                        pc += 1;
                    }
                }
                continue;
            }

            // 2. END m
            if upper.starts_with("END") && upper[3..].trim().chars().all(|c| c.is_ascii_digit()) {
                let do_id = upper[3..].trim().parse::<u32>().unwrap_or(1);
                if let Some(pos) = while_stack.iter().rposition(|w| w.do_id == do_id) {
                    let target_pc = while_stack[pos].while_pc;
                    while_stack.truncate(pos + 1);
                    pc = target_pc;
                } else {
                    pc += 1;
                }
                continue;
            }

            // 3. IF [cond] GOTO n / IF [cond] THEN #var = expr
            if upper.starts_with("IF") {
                match parse_if_stmt(&upper, &vars) {
                    Ok(IfAction::Goto(n_target)) => {
                        if let Some(&target_pc) = unit.n_labels.get(&n_target) {
                            pc = target_pc;
                        } else {
                            diagnostics.push(Diagnostic {
                                severity: DiagnosticSeverity::Error,
                                line_number: line_no,
                                code: "MACRO_LABEL_NOT_FOUND".to_string(),
                                message: format!("ジャンプ先 N{} が見つかりません", n_target),
                            });
                            pc += 1;
                        }
                    }
                    Ok(IfAction::Assign(var_num, val)) => {
                        vars.set(var_num, val);
                        pc += 1;
                    }
                    Ok(IfAction::NoOp) => {
                        pc += 1;
                    }
                    Err(msg) => {
                        diagnostics.push(Diagnostic {
                            severity: DiagnosticSeverity::Error,
                            line_number: line_no,
                            code: "MACRO_SYNTAX".to_string(),
                            message: msg,
                        });
                        pc += 1;
                    }
                }
                continue;
            }

            // 4. GOTO n
            if let Some(rest) = upper.strip_prefix("GOTO") {
                let target_str = rest.trim();
                match eval_expression(target_str, &vars) {
                    Ok(v) => {
                        let n_target = v.round().max(0.0) as u32;
                        if let Some(&target_pc) = unit.n_labels.get(&n_target) {
                            pc = target_pc;
                        } else {
                            diagnostics.push(Diagnostic {
                                severity: DiagnosticSeverity::Error,
                                line_number: line_no,
                                code: "MACRO_LABEL_NOT_FOUND".to_string(),
                                message: format!("GOTO 先の N{} が見つかりません", n_target),
                            });
                            pc += 1;
                        }
                    }
                    Err(msg) => {
                        diagnostics.push(Diagnostic {
                            severity: DiagnosticSeverity::Error,
                            line_number: line_no,
                            code: "MACRO_SYNTAX".to_string(),
                            message: msg,
                        });
                        pc += 1;
                    }
                }
                continue;
            }

            // 5. マクロ変数代入文
            if upper.starts_with('#') && upper.contains('=') {
                match eval_assignment(&upper, &vars) {
                    Ok((var_num, val)) => {
                        vars.set(var_num, val);
                    }
                    Err(msg) => {
                        diagnostics.push(Diagnostic {
                            severity: DiagnosticSeverity::Error,
                            line_number: line_no,
                            code: "MACRO_ASSIGN_ERROR".to_string(),
                            message: msg,
                        });
                    }
                }
                pc += 1;
                continue;
            }

            // 6. 通常のNCブロック内に `#変数` や `[式]` があれば展開
            let expanded_code = if code_trimmed.contains('#') || code_trimmed.contains('[') {
                match expand_inline_expressions(code_trimmed, &vars) {
                    Ok(s) => s,
                    Err(msg) => {
                        diagnostics.push(Diagnostic {
                            severity: DiagnosticSeverity::Error,
                            line_number: line_no,
                            code: "MACRO_EXPR_ERROR".to_string(),
                            message: msg,
                        });
                        code_trimmed.to_string()
                    }
                }
            } else {
                code_trimmed.to_string()
            };

            // 元のコメントと現在実行中 O番号を正確に付与してブロックパース
            let parsed_block = {
                let mut b = parse_single_line(line_no, &expanded_code, optional_block_skip);
                let orig = parse_single_line(line_no, &raw_line, optional_block_skip);
                b.raw_line = raw_line.clone();
                b.comments = orig.comments;
                b.program_number = Some(cur_prog.clone());
                b
            };

            let is_prog_end = parsed_block
                .words
                .iter()
                .any(|w| w.letter == 'M' && matches!(w.value.round() as u32, 2 | 30));

            // 8. G65 マクロ呼出
            let is_g65 = parsed_block
                .words
                .iter()
                .any(|w| w.letter == 'G' && (w.value - 65.0).abs() < 1e-4);

            if is_g65 {
                let p_num = parsed_block
                    .words
                    .iter()
                    .find(|w| w.letter == 'P')
                    .map(|w| w.value.round().max(0.0) as u32);
                let l_rep = parsed_block
                    .words
                    .iter()
                    .find(|w| w.letter == 'L')
                    .map(|w| (w.value.round() as u32).max(1))
                    .unwrap_or(1);

                if let Some(p_val) = p_num {
                    let sub_key = resolve_subprogram_key(
                        p_val,
                        &mut programs,
                        &search_dirs,
                        sim_replace_rules,
                    );
                    if let Some(sub_name) = sub_key {
                        if call_stack.len() >= MAX_CALL_DEPTH {
                            diagnostics.push(Diagnostic {
                                severity: DiagnosticSeverity::Error,
                                line_number: line_no,
                                code: "SUB_CALL_DEPTH".to_string(),
                                message: "サブプログラム/マクロの呼出階層が上限を超えました"
                                    .to_string(),
                            });
                            pc += 1;
                        } else {
                            visited_programs.insert(sub_name.clone());
                            let args = build_g65_local_args(&parsed_block);
                            vars.push_frame(args);
                            call_stack.push(CallFrame {
                                prog_name: cur_prog.clone(),
                                return_pc: pc + 1,
                                remaining_repeats: l_rep,
                                sub_name: sub_name.clone(),
                                is_macro_call: true,
                            });
                            cur_prog = sub_name;
                            pc = 0;
                            while_stack.clear();
                        }
                    } else {
                        diagnostics.push(Diagnostic {
                            severity: DiagnosticSeverity::Error,
                            line_number: line_no,
                            code: "SUB_NOT_FOUND".to_string(),
                            message: format!("G65 呼出先のマクロ O{:04} が見つかりません", p_val),
                        });
                        pc += 1;
                    }
                } else {
                    pc += 1;
                }
                continue;
            }

            // 9. M98 サブプログラム呼出
            let is_m98 = parsed_block
                .words
                .iter()
                .any(|w| w.letter == 'M' && w.value.round() as u32 == 98);

            if is_m98 {
                let p_raw = parsed_block
                    .words
                    .iter()
                    .find(|w| w.letter == 'P')
                    .map(|w| w.value.round().max(0.0) as u32);
                let l_opt = parsed_block
                    .words
                    .iter()
                    .find(|w| w.letter == 'L')
                    .map(|w| (w.value.round() as u32).max(1));

                let mut pre_block = parsed_block.clone();
                pre_block.words.retain(|w| {
                    !(w.letter == 'M' && w.value.round() as u32 == 98)
                        && w.letter != 'P'
                        && w.letter != 'L'
                });
                if !pre_block.words.is_empty() {
                    out_blocks.push(pre_block);
                }

                if let Some(p_num_full) = p_raw {
                    let (sub_num, repeats) = if let Some(l) = l_opt {
                        (p_num_full, l)
                    } else if p_num_full >= 10_000 {
                        (p_num_full % 10_000, (p_num_full / 10_000).max(1))
                    } else {
                        (p_num_full, 1)
                    };

                    if let Some(sub_name) = resolve_subprogram_key(
                        sub_num,
                        &mut programs,
                        &search_dirs,
                        sim_replace_rules,
                    ) {
                        if call_stack.len() >= MAX_CALL_DEPTH {
                            diagnostics.push(Diagnostic {
                                severity: DiagnosticSeverity::Error,
                                line_number: line_no,
                                code: "SUB_CALL_DEPTH".to_string(),
                                message: "M98 サブプログラムの呼出階層が上限を超えました"
                                    .to_string(),
                            });
                            pc += 1;
                        } else {
                            visited_programs.insert(sub_name.clone());
                            call_stack.push(CallFrame {
                                prog_name: cur_prog.clone(),
                                return_pc: pc + 1,
                                remaining_repeats: repeats,
                                sub_name: sub_name.clone(),
                                is_macro_call: false,
                            });
                            cur_prog = sub_name;
                            pc = 0;
                            while_stack.clear();
                        }
                    } else {
                        diagnostics.push(Diagnostic {
                            severity: DiagnosticSeverity::Error,
                            line_number: line_no,
                            code: "SUB_NOT_FOUND".to_string(),
                            message: format!(
                                "M98 呼出先のサブプログラム O{:04} が見つかりません",
                                sub_num
                            ),
                        });
                        pc += 1;
                    }
                } else {
                    pc += 1;
                }
                continue;
            }

            // 10. M99 サブプログラム復帰
            let is_m99 = parsed_block
                .words
                .iter()
                .any(|w| w.letter == 'M' && w.value.round() as u32 == 99);

            if is_m99 {
                let p_return_n = parsed_block
                    .words
                    .iter()
                    .find(|w| w.letter == 'P')
                    .map(|w| w.value.round().max(0.0) as u32);

                let mut pre_block = parsed_block.clone();
                pre_block.words.retain(|w| {
                    !(w.letter == 'M' && w.value.round() as u32 == 99) && w.letter != 'P'
                });
                if !pre_block.words.is_empty() {
                    out_blocks.push(pre_block);
                }

                if let Some(frame) = call_stack.pop() {
                    if frame.remaining_repeats > 1 {
                        let next_frame = CallFrame {
                            remaining_repeats: frame.remaining_repeats - 1,
                            ..frame.clone()
                        };
                        cur_prog = frame.sub_name;
                        call_stack.push(next_frame);
                        pc = 0;
                        while_stack.clear();
                    } else {
                        if frame.is_macro_call {
                            vars.pop_frame();
                        }
                        cur_prog = frame.prog_name;
                        pc = if let Some(n_lbl) = p_return_n {
                            programs
                                .get(&cur_prog)
                                .and_then(|u| u.n_labels.get(&n_lbl).copied())
                                .unwrap_or(frame.return_pc)
                        } else {
                            frame.return_pc
                        };
                        while_stack.clear();
                    }
                    continue;
                } else {
                    break;
                }
            }

            out_blocks.push(parsed_block);

            if is_prog_end && call_stack.is_empty() {
                break;
            }
            pc += 1;
        }

        // 未実行の独立した O番号（複数プログラム同梱 DNC ファイル等）があれば次キューへ追加
        if total_steps < MAX_EXEC_STEPS && entry_queue.is_empty() {
            if let Some(next_unvisited) = program_order
                .iter()
                .find(|p| !visited_programs.contains(p.as_str()))
            {
                entry_queue.push(next_unvisited.clone());
            }
        }
    }

    MacroExpandOutput {
        blocks: out_blocks,
        variables: vars.to_entries(),
    }
}

/// ソースを O番号ごとの ProgramUnit に分割し、出現順リストも返す（同一ファイル内のO番号重複を警告）
fn split_programs(
    source: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> (HashMap<String, ProgramUnit>, Vec<String>) {
    let mut programs: HashMap<String, ProgramUnit> = HashMap::new();
    let mut order: Vec<String> = Vec::new();
    let mut first_defined_line: HashMap<String, usize> = HashMap::new();
    let mut current_name = "MAIN".to_string();
    let mut current_lines: Vec<(usize, String)> = Vec::new();
    let mut has_executable_in_current = false;

    for (idx, line) in source.lines().enumerate() {
        let line_no = idx + 1;
        let code = strip_comments(line.trim());
        let code_t = code.trim();
        if let Some(o_name) = detect_program_header(code_t) {
            if let Some(&first_line) = first_defined_line.get(&o_name) {
                diagnostics.push(Diagnostic {
                    severity: DiagnosticSeverity::Warning,
                    line_number: line_no,
                    code: "DUPLICATE_PROGRAM_NUMBER".to_string(),
                    message: format!(
                        "プログラム番号 {} が重複しています（最初の定義: {} 行目）",
                        o_name, first_line
                    ),
                });
            } else {
                first_defined_line.insert(o_name.clone(), line_no);
            }

            if has_executable_in_current {
                let unit = build_unit(current_lines);
                if !order.contains(&current_name) {
                    order.push(current_name.clone());
                }
                programs.entry(current_name.clone()).or_insert(unit);
                current_lines = Vec::new();
            }
            current_name = o_name;
            has_executable_in_current = true;
        } else if !code_t.is_empty() && code_t != "%" {
            has_executable_in_current = true;
        }
        current_lines.push((line_no, line.to_string()));
    }

    if !current_lines.is_empty() || programs.is_empty() {
        let unit = build_unit(current_lines);
        if !order.contains(&current_name) {
            order.push(current_name.clone());
        }
        programs.entry(current_name).or_insert(unit);
    }

    (programs, order)
}

fn build_unit(lines: Vec<(usize, String)>) -> ProgramUnit {
    let mut n_labels = HashMap::new();
    for (idx, (_, raw)) in lines.iter().enumerate() {
        let code = strip_comments(raw.trim());
        let t = code.trim().trim_start_matches('/');
        if let Some(rest) = t.strip_prefix('N').or_else(|| t.strip_prefix('n')) {
            let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
            if let Ok(n) = digits.parse::<u32>() {
                n_labels.entry(n).or_insert(idx);
            }
        }
    }
    ProgramUnit { lines, n_labels }
}

fn detect_program_header(code: &str) -> Option<String> {
    let upper = code.to_ascii_uppercase();
    if let Some(rest) = upper.strip_prefix('O') {
        let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        if !digits.is_empty() {
            if let Ok(n) = digits.parse::<u32>() {
                return Some(format!("O{}", n));
            }
        }
    }
    None
}

/// UTF-8 / Shift-JIS 自動判別してファイルテキストを読み込む
fn read_nc_text_lossy(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    if let Ok(s) = std::str::from_utf8(&bytes) {
        Some(s.trim_start_matches('\u{feff}').to_string())
    } else {
        let (decoded, _, had_errors) = SHIFT_JIS.decode(&bytes);
        if !had_errors {
            Some(decoded.into_owned())
        } else {
            let (fallback, _, _) = UTF_8.decode(&bytes);
            Some(fallback.into_owned())
        }
    }
}

/// 外部サブプログラムに対してもリテラル Sim置換ルールを1行単位で適用する
fn apply_literal_sim_rules(content: &str, rules: &[SimReplaceRule]) -> String {
    let active: Vec<&SimReplaceRule> = rules
        .iter()
        .filter(|r| r.enabled && !r.use_regex && !r.pattern.is_empty())
        .collect();
    if active.is_empty() {
        return content.to_string();
    }
    let mut out = String::with_capacity(content.len());
    for (idx, line) in content.lines().enumerate() {
        if idx > 0 {
            out.push('\n');
        }
        let mut s = line.to_string();
        for rule in &active {
            if s.contains(&rule.pattern) {
                let safe_repl = rule.replacement.replace(['\r', '\n'], " ");
                s = s.replace(&rule.pattern, &safe_repl);
            }
        }
        out.push_str(&s);
    }
    out
}

/// 同一ファイル内 or 検索フォルダ群からサブプログラム O番号を解決
fn resolve_subprogram_key(
    num: u32,
    programs: &mut HashMap<String, ProgramUnit>,
    search_dirs: &[PathBuf],
    sim_replace_rules: &[SimReplaceRule],
) -> Option<String> {
    let key = format!("O{}", num);
    if programs.contains_key(&key) {
        return Some(key);
    }

    let candidates = [
        format!("O{:04}.nc", num),
        format!("O{:04}.NC", num),
        format!("O{:04}.dnc", num),
        format!("O{:04}.DNC", num),
        format!("O{}.nc", num),
        format!("O{}.NC", num),
        format!("O{}.dnc", num),
        format!("O{:04}.tap", num),
        format!("O{:04}.TAP", num),
        format!("{:04}.nc", num),
        format!("{:04}.NC", num),
        format!("{:04}.dnc", num),
        format!("O{:04}.txt", num),
        format!("O{:04}", num),
        format!("O{}", num),
    ];

    for dir in search_dirs {
        if !dir.is_dir() {
            continue;
        }
        // 1) ファイル名候補でダイレクト検索
        for fname in &candidates {
            let p = dir.join(fname);
            if p.is_file() {
                if let Some(raw_content) = read_nc_text_lossy(&p) {
                    let content = apply_literal_sim_rules(&raw_content, sim_replace_rules);
                    let mut dummy_diags = Vec::new();
                    let (sub_progs, _) = split_programs(&content, &mut dummy_diags);
                    if let Some(unit) = sub_progs.get(&key) {
                        programs.insert(key.clone(), unit.clone());
                        return Some(key);
                    }
                    let lines: Vec<(usize, String)> = content
                        .lines()
                        .enumerate()
                        .map(|(i, s)| (i + 1, s.to_string()))
                        .collect();
                    programs.insert(key.clone(), build_unit(lines));
                    return Some(key);
                }
            }
        }

        // 2) フォルダ内のNCファイル先頭ヘッダ走査（別名ファイルに Oxxxx が含まれるケース対応）
        if let Ok(entries) = fs::read_dir(dir) {
            let mut checked = 0usize;
            for entry in entries.flatten() {
                if checked >= 200 {
                    break;
                }
                let p = entry.path();
                if !p.is_file() {
                    continue;
                }
                let meta_len = entry.metadata().map(|m| m.len()).unwrap_or(u64::MAX);
                if meta_len > 2 * 1024 * 1024 {
                    continue;
                }
                checked += 1;
                if let Some(raw_content) = read_nc_text_lossy(&p) {
                    let has_header = raw_content.lines().take(40).any(|l| {
                        let code = strip_comments(l.trim());
                        detect_program_header(code.trim()).as_deref() == Some(key.as_str())
                    });
                    if has_header {
                        let content = apply_literal_sim_rules(&raw_content, sim_replace_rules);
                        let mut dummy_diags = Vec::new();
                        let (sub_progs, _) = split_programs(&content, &mut dummy_diags);
                        if let Some(unit) = sub_progs.get(&key) {
                            programs.insert(key.clone(), unit.clone());
                            return Some(key);
                        }
                    }
                }
            }
        }
    }
    None
}

/// G65 引数 (A,B,C,I,J,K,D,E,F,H,M,Q,R,S,T,U,V,W,X,Y,Z) を FANUC標準ローカル変数番号へ変換
fn build_g65_local_args(block: &NcBlock) -> HashMap<u32, f64> {
    let mut map = HashMap::new();
    for w in &block.words {
        let var_id = match w.letter {
            'A' => Some(1),
            'B' => Some(2),
            'C' => Some(3),
            'I' => Some(4),
            'J' => Some(5),
            'K' => Some(6),
            'D' => Some(7),
            'E' => Some(8),
            'F' => Some(9),
            'H' => Some(11),
            'M' => Some(13),
            'Q' => Some(17),
            'R' => Some(18),
            'S' => Some(19),
            'T' => Some(20),
            'U' => Some(21),
            'V' => Some(22),
            'W' => Some(23),
            'X' => Some(24),
            'Y' => Some(25),
            'Z' => Some(26),
            _ => None,
        };
        if let Some(id) = var_id {
            map.insert(id, w.value);
        }
    }
    map
}

fn strip_comments(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut depth = 0usize;
    for ch in s.chars() {
        if ch == '(' {
            depth += 1;
        } else if ch == ')' {
            depth = depth.saturating_sub(1);
        } else if ch == ';' && depth == 0 {
            break;
        } else if depth == 0 {
            out.push(ch);
        }
    }
    out
}

fn strip_leading_n_number(s: &str) -> &str {
    let t = s.trim();
    if t.starts_with('N') || t.starts_with('n') {
        let rest = &t[1..];
        let digits = rest.bytes().take_while(|b| b.is_ascii_digit()).count();
        if digits > 0 {
            return rest[digits..].trim_start();
        }
    }
    t
}

fn find_matching_end(lines: &[(usize, String)], start_pc: usize, do_id: u32) -> Option<usize> {
    let target = format!("END{}", do_id);
    for (idx, (_, raw)) in lines.iter().enumerate().skip(start_pc) {
        let code = strip_comments(raw.trim());
        let stmt = strip_leading_n_number(code.trim())
            .to_ascii_uppercase()
            .replace(' ', "");
        if stmt == target {
            return Some(idx);
        }
    }
    None
}

enum IfAction {
    Goto(u32),
    Assign(u32, f64),
    NoOp,
}

fn parse_while_stmt(upper: &str, vars: &MacroVars) -> Result<(bool, u32), String> {
    let after_while = upper.strip_prefix("WHILE").unwrap().trim();
    let do_pos = after_while
        .rfind("DO")
        .ok_or_else(|| "WHILE 文に DO が見つかりません".to_string())?;
    let cond_str = after_while[..do_pos].trim();
    let do_id = after_while[do_pos + 2..]
        .trim()
        .parse::<u32>()
        .unwrap_or(1);
    let val = eval_expression(cond_str, vars)?;
    Ok((val.abs() > 1e-9, do_id))
}

fn parse_if_stmt(upper: &str, vars: &MacroVars) -> Result<IfAction, String> {
    let after_if = upper.strip_prefix("IF").unwrap().trim();
    if let Some(goto_pos) = after_if.find("GOTO") {
        let cond_str = after_if[..goto_pos].trim();
        let target_str = after_if[goto_pos + 4..].trim();
        let cond = eval_expression(cond_str, vars)?.abs() > 1e-9;
        if cond {
            let n = eval_expression(target_str, vars)?.round().max(0.0) as u32;
            Ok(IfAction::Goto(n))
        } else {
            Ok(IfAction::NoOp)
        }
    } else if let Some(then_pos) = after_if.find("THEN") {
        let cond_str = after_if[..then_pos].trim();
        let body = after_if[then_pos + 4..].trim();
        let cond = eval_expression(cond_str, vars)?.abs() > 1e-9;
        if cond {
            let (var_num, val) = eval_assignment(body, vars)?;
            Ok(IfAction::Assign(var_num, val))
        } else {
            Ok(IfAction::NoOp)
        }
    } else {
        Err("IF 文には GOTO または THEN が必要です".to_string())
    }
}

fn eval_assignment(stmt: &str, vars: &MacroVars) -> Result<(u32, f64), String> {
    let eq_pos = stmt
        .find('=')
        .ok_or_else(|| "代入文に '=' がありません".to_string())?;
    let lhs = stmt[..eq_pos].trim();
    let rhs = stmt[eq_pos + 1..].trim();
    let var_expr = lhs
        .strip_prefix('#')
        .ok_or_else(|| "代入先が '#' 変数ではありません".to_string())?;
    let var_num = eval_expression(var_expr, vars)?.round().max(0.0) as u32;
    let val = eval_expression(rhs, vars)?;
    Ok((var_num, val))
}

/// 通常Gコード行の中の `#100` や `[...]` 式を実数値へ展開
fn expand_inline_expressions(code: &str, vars: &MacroVars) -> Result<String, String> {
    let chars: Vec<char> = code.chars().collect();
    let mut out = String::with_capacity(code.len() + 16);
    let mut i = 0;

    while i < chars.len() {
        let ch = chars[i];
        if ch == '[' {
            // 対応する ']' までを丸ごと式評価
            let start = i;
            let mut depth = 1usize;
            i += 1;
            while i < chars.len() && depth > 0 {
                if chars[i] == '[' {
                    depth += 1;
                } else if chars[i] == ']' {
                    depth -= 1;
                }
                i += 1;
            }
            let expr_str: String = chars[start..i].iter().collect();
            let val = eval_expression(&expr_str, vars)?;
            out.push_str(&format_macro_num(val));
        } else if ch == '#' {
            // `#100` または `#[expr]`
            i += 1;
            if i < chars.len() && chars[i] == '[' {
                let start = i;
                let mut depth = 1usize;
                i += 1;
                while i < chars.len() && depth > 0 {
                    if chars[i] == '[' {
                        depth += 1;
                    } else if chars[i] == ']' {
                        depth -= 1;
                    }
                    i += 1;
                }
                let expr_str: String = chars[start..i].iter().collect();
                let idx = eval_expression(&expr_str, vars)?.round().max(0.0) as u32;
                out.push_str(&format_macro_num(vars.get(idx)));
            } else {
                let start = i;
                while i < chars.len() && chars[i].is_ascii_digit() {
                    i += 1;
                }
                let num_str: String = chars[start..i].iter().collect();
                let idx = num_str.parse::<u32>().unwrap_or(0);
                out.push_str(&format_macro_num(vars.get(idx)));
            }
        } else {
            out.push(ch);
            i += 1;
        }
    }

    Ok(out)
}

fn format_macro_num(v: f64) -> String {
    if (v - v.round()).abs() < 1e-9 {
        format!("{:.0}", v.round())
    } else {
        format!("{:.6}", v)
            .trim_end_matches('0')
            .trim_end_matches('.')
            .to_string()
    }
}

// ===== FANUC カスタムマクロB 式パーサ＆評価器 =====

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Num(f64),
    Hash,
    LBracket,
    RBracket,
    Plus,
    Minus,
    Star,
    Slash,
    Ident(String),
}

fn tokenize_expr(input: &str) -> Result<Vec<Tok>, String> {
    let mut toks = Vec::new();
    let chars: Vec<char> = input.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        if ch.is_ascii_whitespace() {
            i += 1;
        } else if ch == '#' {
            toks.push(Tok::Hash);
            i += 1;
        } else if ch == '[' || ch == '(' {
            toks.push(Tok::LBracket);
            i += 1;
        } else if ch == ']' || ch == ')' {
            toks.push(Tok::RBracket);
            i += 1;
        } else if ch == '+' {
            toks.push(Tok::Plus);
            i += 1;
        } else if ch == '-' {
            toks.push(Tok::Minus);
            i += 1;
        } else if ch == '*' {
            toks.push(Tok::Star);
            i += 1;
        } else if ch == '/' {
            toks.push(Tok::Slash);
            i += 1;
        } else if ch.is_ascii_digit() || ch == '.' {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                i += 1;
            }
            let s: String = chars[start..i].iter().collect();
            let v = s
                .parse::<f64>()
                .map_err(|_| format!("数値の解析に失敗しました: {}", s))?;
            toks.push(Tok::Num(v));
        } else if ch.is_ascii_alphabetic() {
            let start = i;
            while i < chars.len() && chars[i].is_ascii_alphabetic() {
                i += 1;
            }
            let s: String = chars[start..i].iter().collect();
            toks.push(Tok::Ident(s.to_ascii_uppercase()));
        } else {
            return Err(format!("マクロ式に不正な文字があります: '{}'", ch));
        }
    }
    Ok(toks)
}

struct ExprParser<'a> {
    toks: Vec<Tok>,
    pos: usize,
    vars: &'a MacroVars,
}

impl<'a> ExprParser<'a> {
    fn peek(&self) -> Option<&Tok> {
        self.toks.get(self.pos)
    }

    fn next(&mut self) -> Option<Tok> {
        if self.pos < self.toks.len() {
            let t = self.toks[self.pos].clone();
            self.pos += 1;
            Some(t)
        } else {
            None
        }
    }

    fn parse_or(&mut self) -> Result<f64, String> {
        let mut left = self.parse_and()?;
        while let Some(Tok::Ident(op)) = self.peek() {
            if op == "OR" || op == "XOR" {
                let op_name = op.clone();
                self.next();
                let right = self.parse_and()?;
                let lb = left.abs() > 1e-9;
                let rb = right.abs() > 1e-9;
                left = if op_name == "OR" {
                    if lb || rb { 1.0 } else { 0.0 }
                } else if lb ^ rb {
                    1.0
                } else {
                    0.0
                };
            } else {
                break;
            }
        }
        Ok(left)
    }

    fn parse_and(&mut self) -> Result<f64, String> {
        let mut left = self.parse_cmp()?;
        while let Some(Tok::Ident(op)) = self.peek() {
            if op == "AND" {
                self.next();
                let right = self.parse_cmp()?;
                left = if left.abs() > 1e-9 && right.abs() > 1e-9 {
                    1.0
                } else {
                    0.0
                };
            } else {
                break;
            }
        }
        Ok(left)
    }

    fn parse_cmp(&mut self) -> Result<f64, String> {
        let mut left = self.parse_add()?;
        while let Some(Tok::Ident(op)) = self.peek() {
            if matches!(op.as_str(), "EQ" | "NE" | "GT" | "LT" | "GE" | "LE") {
                let op_name = op.clone();
                self.next();
                let right = self.parse_add()?;
                let res = match op_name.as_str() {
                    "EQ" => (left - right).abs() < 1e-6,
                    "NE" => (left - right).abs() >= 1e-6,
                    "GT" => left > right + 1e-6,
                    "LT" => left < right - 1e-6,
                    "GE" => left >= right - 1e-6,
                    "LE" => left <= right + 1e-6,
                    _ => false,
                };
                left = if res { 1.0 } else { 0.0 };
            } else {
                break;
            }
        }
        Ok(left)
    }

    fn parse_add(&mut self) -> Result<f64, String> {
        let mut left = self.parse_mul()?;
        loop {
            match self.peek() {
                Some(Tok::Plus) => {
                    self.next();
                    left += self.parse_mul()?;
                }
                Some(Tok::Minus) => {
                    self.next();
                    left -= self.parse_mul()?;
                }
                _ => break,
            }
        }
        Ok(left)
    }

    fn parse_mul(&mut self) -> Result<f64, String> {
        let mut left = self.parse_unary()?;
        loop {
            match self.peek() {
                Some(Tok::Star) => {
                    self.next();
                    left *= self.parse_unary()?;
                }
                Some(Tok::Slash) => {
                    self.next();
                    let r = self.parse_unary()?;
                    if r.abs() < 1e-12 {
                        return Err("マクロ式でゼロ除算が発生しました".to_string());
                    }
                    left /= r;
                }
                Some(Tok::Ident(s)) if s == "MOD" => {
                    self.next();
                    let r = self.parse_unary()?;
                    if r.abs() < 1e-12 {
                        return Err("MOD 演算でゼロ除算が発生しました".to_string());
                    }
                    left %= r;
                }
                _ => break,
            }
        }
        Ok(left)
    }

    fn parse_unary(&mut self) -> Result<f64, String> {
        match self.peek() {
            Some(Tok::Plus) => {
                self.next();
                self.parse_unary()
            }
            Some(Tok::Minus) => {
                self.next();
                Ok(-self.parse_unary()?)
            }
            _ => self.parse_primary(),
        }
    }

    fn parse_primary(&mut self) -> Result<f64, String> {
        match self.next() {
            Some(Tok::Num(v)) => Ok(v),
            Some(Tok::Hash) => {
                let idx_val = self.parse_primary()?;
                let idx = idx_val.round().max(0.0) as u32;
                Ok(self.vars.get(idx))
            }
            Some(Tok::LBracket) => {
                let val = self.parse_or()?;
                if self.peek() == Some(&Tok::RBracket) {
                    self.next();
                }
                Ok(val)
            }
            Some(Tok::Ident(func)) => {
                // FANUC関数: SIN[deg], COS[deg], TAN[deg], SQRT[x], ABS[x], ROUND[x], FIX[x], FUP[x], ATAN[y]/[x]
                let arg = self.parse_primary()?;
                match func.as_str() {
                    "SIN" => Ok(arg.to_radians().sin()),
                    "COS" => Ok(arg.to_radians().cos()),
                    "TAN" => Ok(arg.to_radians().tan()),
                    "ASIN" => Ok(arg.clamp(-1.0, 1.0).asin().to_degrees()),
                    "ACOS" => Ok(arg.clamp(-1.0, 1.0).acos().to_degrees()),
                    "ATAN" => {
                        if self.peek() == Some(&Tok::Slash) {
                            self.next();
                            let denom = self.parse_primary()?;
                            Ok(arg.atan2(denom).to_degrees())
                        } else {
                            Ok(arg.atan().to_degrees())
                        }
                    }
                    "SQRT" => {
                        if arg < 0.0 {
                            Err("SQRT に負の値が渡されました".to_string())
                        } else {
                            Ok(arg.sqrt())
                        }
                    }
                    "ABS" => Ok(arg.abs()),
                    "ROUND" => Ok(arg.round()),
                    "FIX" => Ok(arg.trunc()),
                    "FUP" => Ok(if arg >= 0.0 { arg.ceil() } else { arg.floor() }),
                    "LN" => Ok(arg.ln()),
                    "EXP" => Ok(arg.exp()),
                    _ => Err(format!("未対応のマクロ関数です: {}", func)),
                }
            }
            other => Err(format!("マクロ式の構文エラー: 予期しないトークン {:?}", other)),
        }
    }
}

pub fn eval_expression(input: &str, vars: &MacroVars) -> Result<f64, String> {
    let toks = tokenize_expr(input)?;
    if toks.is_empty() {
        return Ok(0.0);
    }
    let mut parser = ExprParser {
        toks,
        pos: 0,
        vars,
    };
    parser.parse_or()
}
