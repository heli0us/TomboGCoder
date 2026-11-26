use crate::models::{Plane, Point3};
use std::f64::consts::{PI, TAU};

pub const EPS: f64 = 1e-6;

/// 選択平面上の2次元座標 (u, v) と垂直軸 w
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vec2 {
    pub u: f64,
    pub v: f64,
}

impl Vec2 {
    pub fn new(u: f64, v: f64) -> Self {
        Self { u, v }
    }

    pub fn add(self, o: Vec2) -> Vec2 {
        Vec2::new(self.u + o.u, self.v + o.v)
    }

    pub fn sub(self, o: Vec2) -> Vec2 {
        Vec2::new(self.u - o.u, self.v - o.v)
    }

    pub fn scale(self, s: f64) -> Vec2 {
        Vec2::new(self.u * s, self.v * s)
    }

    pub fn dot(self, o: Vec2) -> f64 {
        self.u * o.u + self.v * o.v
    }

    pub fn cross(self, o: Vec2) -> f64 {
        self.u * o.v - self.v * o.u
    }

    pub fn len(self) -> f64 {
        (self.u * self.u + self.v * self.v).sqrt()
    }

    pub fn normalize(self) -> Option<Vec2> {
        let l = self.len();
        if l < 1e-9 {
            None
        } else {
            Some(Vec2::new(self.u / l, self.v / l))
        }
    }

    /// 進行方向に対する左法線 (G41) または右法線 (G42)
    pub fn left_normal(self) -> Vec2 {
        Vec2::new(-self.v, self.u)
    }

    pub fn right_normal(self) -> Vec2 {
        Vec2::new(self.v, -self.u)
    }
}

/// 3D点を選択平面 (u, v) と垂直軸 w に分解する
/// G17: (X, Y), w=Z / G18: (Z, X), w=Y / G19: (Y, Z), w=X
pub fn to_plane(p: Point3, plane: Plane) -> (Vec2, f64) {
    match plane {
        Plane::G17 => (Vec2::new(p.x, p.y), p.z),
        Plane::G18 => (Vec2::new(p.z, p.x), p.y),
        Plane::G19 => (Vec2::new(p.y, p.z), p.x),
    }
}

/// 平面座標 (u, v) と垂直軸 w から3D点へ復元する
pub fn from_plane(uv: Vec2, w: f64, plane: Plane) -> Point3 {
    match plane {
        Plane::G17 => Point3::new(uv.u, uv.v, w),
        Plane::G18 => Point3::new(uv.v, w, uv.u),
        Plane::G19 => Point3::new(w, uv.u, uv.v),
    }
}

/// 円弧中心の解決結果
#[derive(Debug, Clone)]
pub struct ResolvedArc {
    pub center: Point3,
    pub radius: f64,
    pub sweep_angle: f64, // ラジアン（CWなら負、CCWなら正）
    pub start_angle: f64,
    pub warning: Option<String>,
}

/// G02/G03 の円弧中心・半径・スイープ角を解決する
pub fn resolve_arc(
    start: Point3,
    end: Point3,
    plane: Plane,
    cw: bool,
    ijk: (Option<f64>, Option<f64>, Option<f64>),
    r_opt: Option<f64>,
) -> Result<ResolvedArc, String> {
    let (s2, ws) = to_plane(start, plane);
    let (e2, _we) = to_plane(end, plane);

    let (center_2d, radius, mut warning) = if let Some(r_val) = r_opt {
        // R指定
        let d_vec = e2.sub(s2);
        let chord = d_vec.len();
        if chord < EPS {
            return Err("R指定円弧で始点と終点が一致しています（全円はI/J/Kで指定してください）".to_string());
        }
        let abs_r = r_val.abs();
        let half_chord = chord * 0.5;
        let mut warn = None;
        let effective_r = if abs_r + 1e-3 < half_chord {
            return Err(format!(
                "円弧半径 R={:.3} が弦の半分 ({:.3}) より小さいため円弧を構成できません",
                abs_r, half_chord
            ));
        } else if abs_r < half_chord {
            warn = Some(format!(
                "円弧半径 R={:.4} を微小誤差補正しました (半弦={:.4})",
                abs_r, half_chord
            ));
            half_chord
        } else {
            abs_r
        };

        let h = (effective_r * effective_r - half_chord * half_chord)
            .max(0.0)
            .sqrt();
        let mid = s2.add(e2).scale(0.5);
        let dir = d_vec.normalize().unwrap();
        // FANUC仕様:
        // CW(G02): R>0 は180°以下(右側中心)、R<0 は180°超(左側中心)
        // CCW(G03): R>0 は180°以下(左側中心)、R<0 は180°超(右側中心)
        let use_left = (cw && r_val < 0.0) || (!cw && r_val > 0.0);
        let normal = if use_left {
            dir.left_normal()
        } else {
            dir.right_normal()
        };
        (mid.add(normal.scale(h)), effective_r, warn)
    } else {
        // I/J/K 指定（始点からの増分ベクトル）
        let (du, dv) = match plane {
            Plane::G17 => (ijk.0.unwrap_or(0.0), ijk.1.unwrap_or(0.0)),
            Plane::G18 => (ijk.2.unwrap_or(0.0), ijk.0.unwrap_or(0.0)),
            Plane::G19 => (ijk.1.unwrap_or(0.0), ijk.2.unwrap_or(0.0)),
        };
        let c2 = Vec2::new(s2.u + du, s2.v + dv);
        let r_start = s2.sub(c2).len();
        let r_end = e2.sub(c2).len();
        if r_start < EPS {
            return Err("円弧半径が0です（I/J/K の指定を確認してください）".to_string());
        }
        let diff = (r_start - r_end).abs();
        let warn = if diff > 0.05 {
            Some(format!(
                "円弧の始点半径 ({:.3}) と終点半径 ({:.3}) の差が {:.3}mm あります",
                r_start, r_end, diff
            ))
        } else {
            None
        };
        (c2, r_start, warn)
    };

    let start_angle = (s2.v - center_2d.v).atan2(s2.u - center_2d.u);
    let end_angle = (e2.v - center_2d.v).atan2(e2.u - center_2d.u);
    let is_full_circle = s2.sub(e2).len() < EPS;

    let sweep_angle = if is_full_circle {
        if cw { -TAU } else { TAU }
    } else if cw {
        let mut da = end_angle - start_angle;
        while da >= 0.0 {
            da -= TAU;
        }
        if da.abs() < 1e-7 {
            -TAU
        } else {
            da
        }
    } else {
        let mut da = end_angle - start_angle;
        while da <= 0.0 {
            da += TAU;
        }
        if da.abs() < 1e-7 {
            TAU
        } else {
            da
        }
    };

    if sweep_angle.abs() > TAU + 1e-4 {
        warning = Some("円弧角度が異常値です".to_string());
    }

    let center_3d = from_plane(center_2d, ws, plane);
    Ok(ResolvedArc {
        center: center_3d,
        radius,
        sweep_angle,
        start_angle,
        warning,
    })
}

/// 円弧（ヘリカル補間含む）をポリライン頂点列へ分割し、実移動距離 (mm) を返す
pub fn tessellate_arc(
    start: Point3,
    end: Point3,
    center: Point3,
    radius: f64,
    sweep_angle: f64,
    start_angle: f64,
    plane: Plane,
) -> (Vec<Point3>, f64) {
    let (c2, ws) = to_plane(center, plane);
    let (_, w_start) = to_plane(start, plane);
    let (_, w_end) = to_plane(end, plane);
    let _ = ws;

    // 1ステップ最大5度、最低4分割、最大128分割で滑らかかつ軽量に描画
    let abs_sweep = sweep_angle.abs();
    let steps = ((abs_sweep / (PI / 36.0)).ceil() as usize).clamp(4, 128);
    let mut pts = Vec::with_capacity(steps + 1);
    pts.push(start);

    for i in 1..steps {
        let t = i as f64 / steps as f64;
        let ang = start_angle + sweep_angle * t;
        let uv = Vec2::new(c2.u + radius * ang.cos(), c2.v + radius * ang.sin());
        let w = w_start + (w_end - w_start) * t;
        pts.push(from_plane(uv, w, plane));
    }
    pts.push(end);

    // ヘリカルを含めた正確な弧長
    let arc_len_2d = radius * abs_sweep;
    let dw = w_end - w_start;
    let total_len = (arc_len_2d * arc_len_2d + dw * dw).sqrt();

    (pts, total_len)
}

/// 2直線 (p1->p2) と (p3->p4) の無限直線交点を求める
pub fn intersect_lines(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2) -> Option<(Vec2, f64, f64)> {
    let d1 = p2.sub(p1);
    let d2 = p4.sub(p3);
    let denom = d1.cross(d2);
    if denom.abs() < 1e-9 {
        return None;
    }
    let diff = p3.sub(p1);
    let t = diff.cross(d2) / denom;
    let u = diff.cross(d1) / denom;
    Some((p1.add(d1.scale(t)), t, u))
}

/// 無限直線 (p1->p2) と円 (center, radius) の交点リスト (0〜2点) を求める
pub fn intersect_line_circle(p1: Vec2, p2: Vec2, center: Vec2, radius: f64) -> Vec<Vec2> {
    let d = p2.sub(p1);
    let f = p1.sub(center);
    let a = d.dot(d);
    if a < 1e-12 {
        return Vec::new();
    }
    let b = 2.0 * f.dot(d);
    let c = f.dot(f) - radius * radius;
    let disc = b * b - 4.0 * a * c;
    if disc < -1e-6 {
        return Vec::new();
    }
    let sqrt_disc = disc.max(0.0).sqrt();
    let t1 = (-b - sqrt_disc) / (2.0 * a);
    let t2 = (-b + sqrt_disc) / (2.0 * a);
    if (t1 - t2).abs() < 1e-7 {
        vec![p1.add(d.scale(t1))]
    } else {
        vec![p1.add(d.scale(t1)), p1.add(d.scale(t2))]
    }
}

/// 2円 (c1, r1) と (c2, r2) の交点リスト (0〜2点) を求める
pub fn intersect_circles(c1: Vec2, r1: f64, c2: Vec2, r2: f64) -> Vec<Vec2> {
    let d_vec = c2.sub(c1);
    let d = d_vec.len();
    if d < 1e-9 {
        return Vec::new();
    }
    if d > r1 + r2 + 1e-5 || d < (r1 - r2).abs() - 1e-5 {
        return Vec::new();
    }
    let a = (r1 * r1 - r2 * r2 + d * d) / (2.0 * d);
    let h_sq = r1 * r1 - a * a;
    if h_sq < -1e-5 {
        return Vec::new();
    }
    let h = h_sq.max(0.0).sqrt();
    let p_mid = c1.add(d_vec.scale(a / d));
    let perp = Vec2::new(-d_vec.v / d, d_vec.u / d);
    if h < 1e-7 {
        vec![p_mid]
    } else {
        vec![p_mid.add(perp.scale(h)), p_mid.sub(perp.scale(h))]
    }
}

/// 点 `p` が2点 (c, s->e) の円弧の範囲に最も近いか選択するためのヘルパー
pub fn pick_closest(candidates: &[Vec2], target: Vec2) -> Option<Vec2> {
    candidates
        .iter()
        .copied()
        .min_by(|a, b| {
            let da = a.sub(target).len();
            let db = b.sub(target).len();
            da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
        })
}
