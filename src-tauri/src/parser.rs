use crate::models::Point3;
use std::collections::HashMap;

/// 1つのGコードワード (例: G01, X100.5)
#[derive(Debug, Clone)]
pub struct NcWord {
    pub letter: char,
    pub value: f64,
}

/// パース済みの1行（1ブロック）
#[derive(Debug, Clone)]
pub struct NcBlock {
    pub line_number: usize,
    pub raw_line: String,
    pub skipped: bool,
    pub program_number: Option<String>,
    pub sequence_number: Option<u32>,
    pub words: Vec<NcWord>,
    pub comments: Vec<String>,
}

/// コメントから自動抽出したメタ情報（システムアイ NC Viewer 形式含む）
#[derive(Debug, Default)]
pub struct ExtractedHints {
    /// T番号 -> 工具直径 (mm)
    pub tool_diameters: HashMap<u32, f64>,
    /// D番号 -> 工具直径 (mm)（※ OFFSET=半径 は ×2 して直径として保持）
    pub d_diameters: HashMap<u32, f64>,
    /// T番号 -> コメント説明
    pub tool_comments: HashMap<u32, String>,
    /// (INIT=X..Y..Z..) 初期位置
    pub init_pos: Option<Point3>,
}

/// 1行分のFANUC Gコードをトークン化
pub fn parse_single_line(line_number: usize, raw: &str, optional_block_skip: bool) -> NcBlock {
    let trimmed = raw.trim();
    let mut block = NcBlock {
        line_number,
        raw_line: raw.to_string(),
        skipped: false,
        program_number: None,
        sequence_number: None,
        words: Vec::new(),
        comments: Vec::new(),
    };

    if trimmed.is_empty() || trimmed == "%" {
        return block;
    }

    // オプショナルブロックスキップ `/`
    let mut work_str = trimmed;
    if work_str.starts_with('/') {
        if optional_block_skip {
            block.skipped = true;
            return block;
        }
        let after_slash = work_str[1..].trim_start_matches(|c: char| c.is_ascii_digit());
        work_str = after_slash.trim_start();
    }

    // コメント抽出とコード部の分離 (`(...)` および `;` 以降)
    let mut code_part = String::with_capacity(work_str.len());
    let chars: Vec<char> = work_str.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        if ch == '(' {
            let mut depth = 1;
            let mut comment = String::new();
            i += 1;
            while i < chars.len() && depth > 0 {
                if chars[i] == '(' {
                    depth += 1;
                    comment.push(chars[i]);
                } else if chars[i] == ')' {
                    depth -= 1;
                    if depth > 0 {
                        comment.push(chars[i]);
                    }
                } else {
                    comment.push(chars[i]);
                }
                i += 1;
            }
            let c_trim = comment.trim();
            if !c_trim.is_empty() {
                block.comments.push(c_trim.to_string());
            }
        } else if ch == ';' {
            let rest: String = chars[i + 1..].iter().collect();
            let rest_trim = rest.trim();
            if !rest_trim.is_empty() {
                block.comments.push(rest_trim.to_string());
            }
            break;
        } else {
            code_part.push(ch);
            i += 1;
        }
    }

    // コード部からワードを抽出
    let code_chars: Vec<char> = code_part.chars().collect();
    let mut p = 0;
    while p < code_chars.len() {
        let ch = code_chars[p];
        if ch.is_ascii_alphabetic() {
            let letter = ch.to_ascii_uppercase();
            p += 1;
            while p < code_chars.len() && code_chars[p].is_ascii_whitespace() {
                p += 1;
            }
            let start = p;
            if p < code_chars.len() && (code_chars[p] == '+' || code_chars[p] == '-') {
                p += 1;
            }
            let mut has_digit = false;
            while p < code_chars.len()
                && (code_chars[p].is_ascii_digit() || code_chars[p] == '.')
            {
                if code_chars[p].is_ascii_digit() {
                    has_digit = true;
                }
                p += 1;
            }
            if has_digit {
                let raw_val: String = code_chars[start..p].iter().collect();
                if let Ok(val) = raw_val.parse::<f64>() {
                    if letter == 'O' {
                        block.program_number = Some(format!("O{}", raw_val.trim_start_matches('+')));
                    } else if letter == 'N' {
                        block.sequence_number = Some(val.round().max(0.0) as u32);
                    } else {
                        block.words.push(NcWord { letter, value: val });
                    }
                }
            }
        } else {
            p += 1;
        }
    }

    block
}

/// コメント文から工具径（mm）のヒントを抽出する
pub fn extract_diameter_from_comment(comment: &str) -> Option<f64> {
    let upper = comment.to_ascii_uppercase();

    for key in ["DIAMETER=", "DIAMETER ", "DIA=", "DIA ", "Φ", "Ø"] {
        if let Some(pos) = upper.find(key) {
            let tail = &upper[pos + key.len()..];
            if let Some(v) = parse_leading_number(tail.trim_start_matches([':', '=', ' '])) {
                if v > 0.0 && v < 500.0 {
                    return Some(v);
                }
            }
        }
    }

    let tokens: Vec<&str> = upper
        .split(|c: char| c.is_whitespace() || c == ',' || c == '/' || c == ';' || c == '_')
        .filter(|s| !s.is_empty())
        .collect();

    for tok in &tokens {
        if let Some(rest) = tok.strip_prefix("D=") {
            // "(D=1 OFFSET=2.7)" のような補正番号指定は除外（OFFSET= を別途解析する）
            if !upper.contains("OFFSET") {
                if let Some(v) = parse_leading_number(rest) {
                    if v > 0.0 && v < 500.0 {
                        return Some(v);
                    }
                }
            }
        } else if let Some(rest) = tok.strip_prefix('D') {
            if rest.contains('.') || rest.ends_with("MM") {
                if let Some(v) = parse_leading_number(rest) {
                    if v > 0.0 && v < 500.0 {
                        return Some(v);
                    }
                }
            }
        } else if let Some(rest) = tok.strip_prefix("R=") {
            if let Some(v) = parse_leading_number(rest) {
                if v > 0.0 && v < 250.0 {
                    return Some(v * 2.0);
                }
            }
        }
    }

    None
}

fn parse_leading_number(s: &str) -> Option<f64> {
    let mut end = 0;
    let mut dot_seen = false;
    let mut sign_seen = false;
    for (idx, ch) in s.char_indices() {
        if idx == 0 && (ch == '+' || ch == '-') && !sign_seen {
            sign_seen = true;
            end = idx + ch.len_utf8();
        } else if ch.is_ascii_digit() {
            end = idx + ch.len_utf8();
        } else if ch == '.' && !dot_seen {
            dot_seen = true;
            end = idx + ch.len_utf8();
        } else {
            break;
        }
    }
    if end == 0 {
        return None;
    }
    s[..end].parse::<f64>().ok()
}

/// ブロック列全体から工具情報・D番号オフセット・初期座標のコメントヒントを収集する
/// システムアイ NC Viewer 書式:
/// - `(INIT=X0.Y0.Z50.)`
/// - `(T=1 DIA=10. NAME=EMS)`
/// - `(D=1 OFFSET=2.7)` (半径オフセット -> 直径 5.4mm)
pub fn collect_comment_hints(blocks: &[NcBlock]) -> ExtractedHints {
    let mut hints = ExtractedHints::default();
    let mut current_tool: Option<u32> = None;

    for block in blocks {
        for w in &block.words {
            if w.letter == 'T' {
                current_tool = Some(w.value.round().max(0.0) as u32);
            }
        }

        for c in &block.comments {
            let upper = c.to_ascii_uppercase();

            // 1. (INIT=X0.Y0.Z50.)
            if let Some(pos) = upper.find("INIT=") {
                let tail = &upper[pos + 5..];
                let init_block = parse_single_line(0, tail, false);
                let mut x = 0.0;
                let mut y = 0.0;
                let mut z = 100.0;
                let mut any = false;
                for w in init_block.words {
                    match w.letter {
                        'X' => {
                            x = w.value;
                            any = true;
                        }
                        'Y' => {
                            y = w.value;
                            any = true;
                        }
                        'Z' => {
                            z = w.value;
                            any = true;
                        }
                        _ => {}
                    }
                }
                if any {
                    hints.init_pos = Some(Point3::new(x, y, z));
                }
                continue;
            }

            // 2. (D=1 OFFSET=2.7) -> 半径オフセット * 2 = 直径
            if let Some(d_pos) = upper.find("D=") {
                if let Some(off_pos) = upper.find("OFFSET=") {
                    if let (Some(d_num_f), Some(off_val)) = (
                        parse_leading_number(upper[d_pos + 2..].trim_start()),
                        parse_leading_number(upper[off_pos + 7..].trim_start()),
                    ) {
                        let d_num = d_num_f.round().max(0.0) as u32;
                        if d_num > 0 && off_val >= 0.0 {
                            hints.d_diameters.insert(d_num, off_val * 2.0);
                            continue;
                        }
                    }
                }
            }

            // 3. (T=1 DIA=10. NAME=EMS) や (T01 DIA=10.0 FLAT ENDMILL)
            let mut comment_tool = current_tool;
            if let Some(t_pos) = upper.find("T=") {
                if let Some(tn_f) = parse_leading_number(upper[t_pos + 2..].trim_start()) {
                    let tn = tn_f.round().max(0.0) as u32;
                    if tn > 0 {
                        comment_tool = Some(tn);
                    }
                }
            } else {
                for tok in upper.split_whitespace() {
                    if let Some(rest) = tok.strip_prefix('T') {
                        if let Ok(tn) = rest.trim_end_matches([',', ':']).parse::<u32>() {
                            if tn > 0 {
                                comment_tool = Some(tn);
                                break;
                            }
                        }
                    }
                }
            }

            if let Some(t) = comment_tool {
                if t > 0 {
                    hints.tool_comments.entry(t).or_insert_with(|| c.clone());
                    if let Some(dia) = extract_diameter_from_comment(c) {
                        hints.tool_diameters.entry(t).or_insert(dia);
                    }
                }
            }
        }
    }

    hints
}
