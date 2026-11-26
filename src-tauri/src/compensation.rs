use crate::geometry::{
    from_plane, intersect_circles, intersect_line_circle, intersect_lines, pick_closest,
    tessellate_arc, to_plane, Vec2, EPS,
};
use crate::models::{
    CutterCompMode, Diagnostic, DiagnosticSeverity, MachineConfig, MotionType, PathSegment, Plane,
};
use std::collections::HashMap;
use std::f64::consts::TAU;

/// 平面上のオフセット済み要素（直線または円弧）
#[derive(Debug, Clone)]
enum OffsetGeom {
    Line {
        start: Vec2,
        end: Vec2,
        orig_dir: Vec2,
    },
    Arc {
        center: Vec2,
        radius: f64,
        start: Vec2,
        end: Vec2,
        cw: bool,
    },
}

impl OffsetGeom {
    fn start(&self) -> Vec2 {
        match *self {
            OffsetGeom::Line { start, .. } => start,
            OffsetGeom::Arc { start, .. } => start,
        }
    }

    fn end(&self) -> Vec2 {
        match *self {
            OffsetGeom::Line { end, .. } => end,
            OffsetGeom::Arc { end, .. } => end,
        }
    }

    fn set_start(&mut self, p: Vec2) {
        match self {
            OffsetGeom::Line { start, .. } => *start = p,
            OffsetGeom::Arc { start, .. } => *start = p,
        }
    }

    fn set_end(&mut self, p: Vec2) {
        match self {
            OffsetGeom::Line { end, .. } => *end = p,
            OffsetGeom::Arc { end, .. } => *end = p,
        }
    }
}

/// プログラムセグメント列から工具径補正（G40/G41/G42）適用後のセグメント列を生成する
pub fn apply_cutter_compensation(
    program_segments: &[PathSegment],
    config: &MachineConfig,
    effective_diameters: &HashMap<u32, f64>,
    diagnostics: &mut Vec<Diagnostic>,
) -> Vec<PathSegment> {
    let mut out: Vec<PathSegment> = Vec::with_capacity(program_segments.len());
    let mut next_id: usize = 0;

    let n = program_segments.len();
    let mut i = 0;

    while i < n {
        let seg = &program_segments[i];
        if seg.comp_mode == CutterCompMode::Off {
            let mut copy = seg.clone();
            copy.id = next_id;
            next_id += 1;
            copy.is_compensated = false;
            out.push(copy);
            i += 1;
            continue;
        }

        // G41 / G42 の連続区間を抽出する
        let group_start = i;
        while i < n && program_segments[i].comp_mode != CutterCompMode::Off {
            i += 1;
        }
        let group_end = i; // exclusive

        // 直後にG40キャンセル移動ブロックが存在する場合は一緒に取り込む
        let cancel_seg = if i < n
            && program_segments[i].comp_mode == CutterCompMode::Off
            && is_planar_move(&program_segments[i])
        {
            let c = &program_segments[i];
            i += 1;
            Some(c)
        } else {
            None
        };

        process_comp_group(
            &program_segments[group_start..group_end],
            cancel_seg,
            config,
            effective_diameters,
            diagnostics,
            &mut out,
            &mut next_id,
        );
    }

    out
}

fn is_planar_move(seg: &PathSegment) -> bool {
    if !matches!(
        seg.motion_type,
        MotionType::Rapid | MotionType::Linear | MotionType::ArcCw | MotionType::ArcCcw
    ) {
        return false;
    }
    if matches!(seg.motion_type, MotionType::ArcCw | MotionType::ArcCcw) {
        return true;
    }
    let (s2, _) = to_plane(seg.start, seg.plane);
    let (e2, _) = to_plane(seg.end, seg.plane);
    e2.sub(s2).len() > EPS
}

/// 元のプログラム要素における始点・終点の単位接線ベクトルを計算
fn program_tangents(seg: &PathSegment) -> Option<(Vec2, Vec2)> {
    let (s2, _) = to_plane(seg.start, seg.plane);
    let (e2, _) = to_plane(seg.end, seg.plane);
    match seg.motion_type {
        MotionType::ArcCw | MotionType::ArcCcw => {
            let c3 = seg.arc_center?;
            let (c2, _) = to_plane(c3, seg.plane);
            let cw = seg.arc_cw.unwrap_or(seg.motion_type == MotionType::ArcCw);
            let rs = s2.sub(c2).normalize()?;
            let re = e2.sub(c2).normalize()?;
            // 円弧の接線: CWは右法線方向 (ry, -rx)、CCWは左法線方向 (-ry, rx)
            let ts = if cw {
                rs.right_normal()
            } else {
                rs.left_normal()
            };
            let te = if cw {
                re.right_normal()
            } else {
                re.left_normal()
            };
            Some((ts, te))
        }
        _ => {
            let dir = e2.sub(s2).normalize()?;
            Some((dir, dir))
        }
    }
}

/// 1セグメント分のオフセット幾何要素を作成
fn build_offset_geom(
    seg: &PathSegment,
    radius: f64,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<OffsetGeom> {
    let (s2, _) = to_plane(seg.start, seg.plane);
    let (e2, _) = to_plane(seg.end, seg.plane);
    let is_left = seg.comp_mode == CutterCompMode::Left;

    match seg.motion_type {
        MotionType::ArcCw | MotionType::ArcCcw => {
            let c3 = seg.arc_center?;
            let (c2, _) = to_plane(c3, seg.plane);
            let orig_r = seg.arc_radius.unwrap_or_else(|| s2.sub(c2).len());
            let cw = seg.arc_cw.unwrap_or(seg.motion_type == MotionType::ArcCw);

            // G41+CCW または G42+CW は内側オフセット（半径縮小）
            // G41+CW  または G42+CCW は外側オフセット（半径拡大）
            let shrink = (is_left && !cw) || (!is_left && cw);
            let new_r = if shrink { orig_r - radius } else { orig_r + radius };

            if new_r <= 1e-4 {
                diagnostics.push(Diagnostic {
                    severity: DiagnosticSeverity::Error,
                    line_number: seg.line_number,
                    code: "COMP_ARC_TOO_SMALL".to_string(),
                    message: format!(
                        "工具径補正エラー: 内側円弧半径 R={:.3}mm が工具半径 r={:.3}mm (D{:02}) 以下のため過切込が発生します",
                        orig_r, radius, seg.d_number
                    ),
                });
                // 安全フォールバック（極小円弧として中心近傍を維持）
                let safe_r = 0.05;
                let us = s2.sub(c2).normalize().unwrap_or(Vec2::new(1.0, 0.0));
                let ue = e2.sub(c2).normalize().unwrap_or(Vec2::new(1.0, 0.0));
                return Some(OffsetGeom::Arc {
                    center: c2,
                    radius: safe_r,
                    start: c2.add(us.scale(safe_r)),
                    end: c2.add(ue.scale(safe_r)),
                    cw,
                });
            }

            let us = s2.sub(c2).normalize()?;
            let ue = e2.sub(c2).normalize()?;
            Some(OffsetGeom::Arc {
                center: c2,
                radius: new_r,
                start: c2.add(us.scale(new_r)),
                end: c2.add(ue.scale(new_r)),
                cw,
            })
        }
        _ => {
            let dir = e2.sub(s2).normalize()?;
            let normal = if is_left {
                dir.left_normal()
            } else {
                dir.right_normal()
            };
            let off = normal.scale(radius);
            Some(OffsetGeom::Line {
                start: s2.add(off),
                end: e2.add(off),
                orig_dir: dir,
            })
        }
    }
}

/// 2つのオフセット要素の交点を求める（コーナー点付近に最も近い交点を選択）
fn intersect_offset_geoms(a: &OffsetGeom, b: &OffsetGeom, hint: Vec2) -> Option<Vec2> {
    match (a, b) {
        (
            OffsetGeom::Line {
                start: a1,
                end: a2,
                ..
            },
            OffsetGeom::Line {
                start: b1,
                end: b2,
                ..
            },
        ) => intersect_lines(*a1, *a2, *b1, *b2).map(|(p, _, _)| p),
        (
            OffsetGeom::Line {
                start: l1,
                end: l2,
                ..
            },
            OffsetGeom::Arc { center, radius, .. },
        ) => {
            let pts = intersect_line_circle(*l1, *l2, *center, *radius);
            pick_closest(&pts, hint)
        }
        (
            OffsetGeom::Arc { center, radius, .. },
            OffsetGeom::Line {
                start: l1,
                end: l2,
                ..
            },
        ) => {
            let pts = intersect_line_circle(*l1, *l2, *center, *radius);
            pick_closest(&pts, hint)
        }
        (
            OffsetGeom::Arc {
                center: c1,
                radius: r1,
                ..
            },
            OffsetGeom::Arc {
                center: c2,
                radius: r2,
                ..
            },
        ) => {
            let pts = intersect_circles(*c1, *r1, *c2, *r2);
            pick_closest(&pts, hint)
        }
    }
}

/// G41/G42 補正グループを処理して補正済みセグメント列を出力
fn process_comp_group(
    group: &[PathSegment],
    cancel_seg: Option<&PathSegment>,
    config: &MachineConfig,
    effective_diameters: &HashMap<u32, f64>,
    diagnostics: &mut Vec<Diagnostic>,
    out: &mut Vec<PathSegment>,
    next_id: &mut usize,
) {
    // グループ内で平面移動するインデックス一覧を抽出
    let planar_indices: Vec<usize> = group
        .iter()
        .enumerate()
        .filter_map(|(idx, s)| if is_planar_move(s) { Some(idx) } else { None })
        .collect();

    if planar_indices.is_empty() {
        for seg in group {
            let mut copy = seg.clone();
            copy.id = *next_id;
            *next_id += 1;
            copy.is_compensated = true;
            out.push(copy);
        }
        if let Some(c) = cancel_seg {
            let mut copy = c.clone();
            copy.id = *next_id;
            *next_id += 1;
            copy.is_compensated = true;
            out.push(copy);
        }
        return;
    }

    // 要素ごとの工具半径を取得するヘルパー
    let radius_for = |seg: &PathSegment| -> f64 {
        let dia = effective_diameters
            .get(&seg.d_number)
            .copied()
            .or_else(|| config.tool_diameters.get(&seg.d_number).copied())
            .unwrap_or(0.0);
        (dia * 0.5).max(0.0)
    };

    // 補正径が0のD番号が使われていたら警告を1回だけ出す
    let first_seg = &group[planar_indices[0]];
    if radius_for(first_seg) <= EPS {
        diagnostics.push(Diagnostic {
            severity: DiagnosticSeverity::Warning,
            line_number: first_seg.line_number,
            code: "COMP_ZERO_DIAMETER".to_string(),
            message: format!(
                "D{:02} の工具径が 0mm に設定されているため、径補正オフセット量は 0 として描画されます（サイドバーの工具径テーブルで変更できます）",
                first_seg.d_number
            ),
        });
    }

    // スタートアップ（planar_indices[0]）以降の平面要素に対してオフセット幾何を作成
    // 要素0がスタートアップブロック（G40->G41/G42のリードイン移動）
    let mut offset_geoms: Vec<Option<OffsetGeom>> = vec![None; planar_indices.len()];
    let mut tangents: Vec<Option<(Vec2, Vec2)>> = vec![None; planar_indices.len()];

    for (k, &g_idx) in planar_indices.iter().enumerate() {
        let seg = &group[g_idx];
        tangents[k] = program_tangents(seg);
        let r = radius_for(seg);
        offset_geoms[k] = build_offset_geom(seg, r, diagnostics);
    }

    // コーナー接続（ロールアラウンド円弧挿入用マップ: k の直後に挿入する円弧）
    let mut corner_arcs: HashMap<usize, (Vec2, f64, Vec2, Vec2, bool)> = HashMap::new();

    // k=1..m-1 の連続する補正実行ブロック間（および k=0 スタートアップ -> k=1）を解決
    let m = planar_indices.len();

    // スタートアップ (k=0) の処理:
    // プログラム始点(無補正) -> k=1 のオフセット始点へリードイン（FANUC Bタイプ相当）
    // もし m == 1 なら k=0 のオフセット終点へリードイン
    if m >= 2 {
        let seg0 = &group[planar_indices[0]];
        let (s0_2d, _) = to_plane(seg0.start, seg0.plane);
        let (e0_2d, _) = to_plane(seg0.end, seg0.plane);
        if let Some(geom1) = &offset_geoms[1] {
            let lead_target = geom1.start();
            // スタートアップ自体は直線アプローチとして構成
            offset_geoms[0] = Some(OffsetGeom::Line {
                start: s0_2d,
                end: lead_target,
                orig_dir: lead_target
                    .sub(s0_2d)
                    .normalize()
                    .unwrap_or_else(|| e0_2d.sub(s0_2d).normalize().unwrap_or(Vec2::new(1.0, 0.0))),
            });
        }
    } else if m == 1 {
        let seg0 = &group[planar_indices[0]];
        let (s0_2d, _) = to_plane(seg0.start, seg0.plane);
        if let Some(geom0) = &offset_geoms[0] {
            let target = geom0.end();
            offset_geoms[0] = Some(OffsetGeom::Line {
                start: s0_2d,
                end: target,
                orig_dir: target
                    .sub(s0_2d)
                    .normalize()
                    .unwrap_or(Vec2::new(1.0, 0.0)),
            });
        }
    }

    // k=1 .. m-2 の各コーナー (k と k+1 の接続) を解決
    for k in 1..m.saturating_sub(1) {
        let seg_a = &group[planar_indices[k]];
        let seg_b = &group[planar_indices[k + 1]];
        let r_a = radius_for(seg_a);
        let r_b = radius_for(seg_b);
        if r_a <= EPS && r_b <= EPS {
            continue;
        }
        let (Some((_, t_a_end)), Some((t_b_start, _))) = (tangents[k], tangents[k + 1]) else {
            continue;
        };
        let (Some(geom_a), Some(geom_b)) = (offset_geoms[k].clone(), offset_geoms[k + 1].clone())
        else {
            continue;
        };

        let (corner_v, _) = to_plane(seg_a.end, seg_a.plane);
        let cross = t_a_end.cross(t_b_start);
        let dot = t_a_end.dot(t_b_start);
        let is_left = seg_a.comp_mode == CutterCompMode::Left;

        // ほぼ接線連続（同方向）
        if cross.abs() < 1e-4 && dot > 0.0 {
            let mid = geom_a.end().add(geom_b.start()).scale(0.5);
            if let Some(ga) = offset_geoms[k].as_mut() {
                ga.set_end(mid);
            }
            if let Some(gb) = offset_geoms[k + 1].as_mut() {
                gb.set_start(mid);
            }
            continue;
        }

        // 内角（食い込み側）判定: G41は左折(cross>0)が内角、G42は右折(cross<0)が内角
        let is_inside = (is_left && cross > 0.0) || (!is_left && cross < 0.0);

        if is_inside {
            let hint = geom_a.end().add(geom_b.start()).scale(0.5);
            if let Some(inter) = intersect_offset_geoms(&geom_a, &geom_b, hint) {
                // 干渉チェック: 直線が逆転していないか検証
                let mut interference = false;
                if let OffsetGeom::Line {
                    start, orig_dir, ..
                } = &geom_a
                {
                    if inter.sub(*start).dot(*orig_dir) < -1e-3 {
                        interference = true;
                    }
                }
                if let OffsetGeom::Line { end, orig_dir, .. } = &geom_b {
                    if end.sub(inter).dot(*orig_dir) < -1e-3 {
                        interference = true;
                    }
                }

                if interference {
                    diagnostics.push(Diagnostic {
                        severity: DiagnosticSeverity::Error,
                        line_number: seg_b.line_number,
                        code: "COMP_INTERFERENCE".to_string(),
                        message: format!(
                            "工具径補正干渉エラー: 行 {}〜{} の内角コーナーで工具径 (Ø{:.2}mm) が大きすぎるため過切込が発生します",
                            seg_a.line_number,
                            seg_b.line_number,
                            r_a * 2.0
                        ),
                    });
                }

                if let Some(ga) = offset_geoms[k].as_mut() {
                    ga.set_end(inter);
                }
                if let Some(gb) = offset_geoms[k + 1].as_mut() {
                    gb.set_start(inter);
                }
            } else {
                diagnostics.push(Diagnostic {
                    severity: DiagnosticSeverity::Error,
                    line_number: seg_b.line_number,
                    code: "COMP_NO_INTERSECTION".to_string(),
                    message: format!(
                        "工具径補正交点エラー: 行 {}〜{} のオフセット要素に交点が見つかりません",
                        seg_a.line_number, seg_b.line_number
                    ),
                });
            }
        } else {
            // 外角（張り出し側）処理
            let gap = geom_a.end().sub(geom_b.start()).len();
            if gap > 1e-4 {
                if config.corner_arc_roll_around || dot < -0.5 {
                    // ロールアラウンド円弧（コーナー頂点中心、半径 r_a）
                    // G41の外角(右折)はCW、G42の外角(左折)はCCW
                    let cw = is_left;
                    corner_arcs.insert(k, (corner_v, r_a, geom_a.end(), geom_b.start(), cw));
                } else {
                    // 伸長交点接続
                    let hint = geom_a.end().add(geom_b.start()).scale(0.5);
                    if let Some(inter) = intersect_offset_geoms(&geom_a, &geom_b, hint) {
                        if let Some(ga) = offset_geoms[k].as_mut() {
                            ga.set_end(inter);
                        }
                        if let Some(gb) = offset_geoms[k + 1].as_mut() {
                            gb.set_start(inter);
                        }
                    } else {
                        let cw = is_left;
                        corner_arcs.insert(k, (corner_v, r_a, geom_a.end(), geom_b.start(), cw));
                    }
                }
            }
        }
    }

    // 実際にセグメントを組み立てて出力（非平面移動も順序通り挟み込む）
    let mut last_comp_uv: Option<Vec2> = None;
    let mut planar_cursor = 0usize;

    for (g_idx, seg) in group.iter().enumerate() {
        if planar_cursor < planar_indices.len() && planar_indices[planar_cursor] == g_idx {
            let k = planar_cursor;
            planar_cursor += 1;

            if let Some(geom) = &offset_geoms[k] {
                let (_, w_start) = to_plane(seg.start, seg.plane);
                let (_, w_end) = to_plane(seg.end, seg.plane);
                let comp_seg =
                    materialize_segment(seg, geom, w_start, w_end, *next_id, true);
                *next_id += 1;
                last_comp_uv = Some(geom.end());
                out.push(comp_seg);

                // 外角ロールアラウンド円弧があれば直後に挿入
                if let Some(&(c2, r, arc_s, arc_e, cw)) = corner_arcs.get(&k) {
                    let arc_seg = materialize_corner_arc(
                        seg, c2, r, arc_s, arc_e, w_end, cw, *next_id,
                    );
                    *next_id += 1;
                    last_comp_uv = Some(arc_e);
                    out.push(arc_seg);
                }
            } else {
                let mut copy = seg.clone();
                copy.id = *next_id;
                *next_id += 1;
                copy.is_compensated = true;
                out.push(copy);
            }
        } else {
            // 非平面移動（Z上下、ドウェル等）は現在の補正済みXY位置を保って移動
            let mut copy = seg.clone();
            copy.id = *next_id;
            *next_id += 1;
            copy.is_compensated = true;
            if let Some(uv) = last_comp_uv {
                let (_, ws) = to_plane(seg.start, seg.plane);
                let (_, we) = to_plane(seg.end, seg.plane);
                let s3 = from_plane(uv, ws, seg.plane);
                let e3 = from_plane(uv, we, seg.plane);
                copy.start = s3;
                copy.end = e3;
                copy.points = vec![s3, e3];
                copy.length_mm = s3.distance_to(&e3);
            }
            out.push(copy);
        }
    }

    // キャンセルブロック（G40）のリードアウト出力
    if let Some(c_seg) = cancel_seg {
        let mut copy = c_seg.clone();
        copy.id = *next_id;
        *next_id += 1;
        copy.is_compensated = true;
        if let Some(uv) = last_comp_uv {
            let (_, ws) = to_plane(c_seg.start, c_seg.plane);
            let s3 = from_plane(uv, ws, c_seg.plane);
            let e3 = c_seg.end;
            copy.start = s3;
            copy.end = e3;
            copy.points = vec![s3, e3];
            copy.length_mm = s3.distance_to(&e3);
            copy.arc_center = None;
            copy.arc_radius = None;
            copy.arc_cw = None;
            if matches!(copy.motion_type, MotionType::ArcCw | MotionType::ArcCcw) {
                copy.motion_type = MotionType::Linear;
            }
        }
        out.push(copy);
    }
}

/// OffsetGeom を実体の PathSegment（頂点列・距離計算済み）へ変換
fn materialize_segment(
    orig: &PathSegment,
    geom: &OffsetGeom,
    w_start: f64,
    w_end: f64,
    id: usize,
    is_compensated: bool,
) -> PathSegment {
    let mut seg = orig.clone();
    seg.id = id;
    seg.is_compensated = is_compensated;

    match *geom {
        OffsetGeom::Line { start, end, .. } => {
            let s3 = from_plane(start, w_start, orig.plane);
            let e3 = from_plane(end, w_end, orig.plane);
            seg.start = s3;
            seg.end = e3;
            seg.points = vec![s3, e3];
            seg.length_mm = s3.distance_to(&e3);
            seg.arc_center = None;
            seg.arc_radius = None;
            seg.arc_cw = None;
        }
        OffsetGeom::Arc {
            center,
            radius,
            start,
            end,
            cw,
        } => {
            let s3 = from_plane(start, w_start, orig.plane);
            let e3 = from_plane(end, w_end, orig.plane);
            let c3 = from_plane(center, w_start, orig.plane);
            let start_ang = (start.v - center.v).atan2(start.u - center.u);
            let end_ang = (end.v - center.v).atan2(end.u - center.u);
            let is_full = start.sub(end).len() < EPS;

            let sweep = if is_full {
                if cw { -TAU } else { TAU }
            } else if cw {
                let mut da = end_ang - start_ang;
                while da >= 0.0 {
                    da -= TAU;
                }
                if da.abs() < 1e-7 { -TAU } else { da }
            } else {
                let mut da = end_ang - start_ang;
                while da <= 0.0 {
                    da += TAU;
                }
                if da.abs() < 1e-7 { TAU } else { da }
            };

            let (pts, len) =
                tessellate_arc(s3, e3, c3, radius, sweep, start_ang, orig.plane);
            seg.start = s3;
            seg.end = e3;
            seg.arc_center = Some(c3);
            seg.arc_radius = Some(radius);
            seg.arc_cw = Some(cw);
            seg.points = pts;
            seg.length_mm = len;
            seg.motion_type = if cw {
                MotionType::ArcCw
            } else {
                MotionType::ArcCcw
            };
        }
    }

    seg
}

/// 外角ロールアラウンド円弧セグメントを生成
#[allow(clippy::too_many_arguments)]
fn materialize_corner_arc(
    parent: &PathSegment,
    center_2d: Vec2,
    radius: f64,
    start_2d: Vec2,
    end_2d: Vec2,
    w: f64,
    cw: bool,
    id: usize,
) -> PathSegment {
    let plane: Plane = parent.plane;
    let s3 = from_plane(start_2d, w, plane);
    let e3 = from_plane(end_2d, w, plane);
    let c3 = from_plane(center_2d, w, plane);

    let start_ang = (start_2d.v - center_2d.v).atan2(start_2d.u - center_2d.u);
    let end_ang = (end_2d.v - center_2d.v).atan2(end_2d.u - center_2d.u);
    let mut sweep = end_ang - start_ang;
    if cw {
        while sweep >= 0.0 {
            sweep -= TAU;
        }
    } else {
        while sweep <= 0.0 {
            sweep += TAU;
        }
    }

    let (pts, len) = tessellate_arc(s3, e3, c3, radius, sweep, start_ang, plane);

    let mut seg = parent.clone();
    seg.id = id;
    seg.is_compensated = true;
    seg.motion_type = if cw {
        MotionType::ArcCw
    } else {
        MotionType::ArcCcw
    };
    seg.start = s3;
    seg.end = e3;
    seg.arc_center = Some(c3);
    seg.arc_radius = Some(radius);
    seg.arc_cw = Some(cw);
    seg.points = pts;
    seg.length_mm = len;
    seg
}
