import * as THREE from "three";
import {
  type DisplayOptions,
  type MotionType,
  type PathSegment,
  type Point3,
  type ToolShape,
  getToolColor,
} from "../types/nc";

export type SnapKind = "endpoint" | "midpoint" | "center" | "onpath";

export interface SnapPoint {
  pos: Point3;
  kind: SnapKind;
}

export function snapKindLabel(kind: SnapKind): string {
  switch (kind) {
    case "endpoint":
      return "端点";
    case "midpoint":
      return "中点";
    case "center":
      return "円弧中心";
    case "onpath":
      return "軌道上";
  }
}

/** 移動種別ごとの標準カラー */
export function getMotionColor(type: MotionType): THREE.Color {
  switch (type) {
    case "rapid":
    case "canned_rapid":
      return new THREE.Color("#f87171");
    case "linear":
      return new THREE.Color("#38bdf8");
    case "arc_cw":
      return new THREE.Color("#4ade80");
    case "arc_ccw":
      return new THREE.Color("#34d399");
    case "canned_feed":
      return new THREE.Color("#fbbf24");
    default:
      return new THREE.Color("#94a3b8");
  }
}

/** 2Dスクリーン空間での点と線分の最短距離と補間パラメータ t (0..1) */
export function projectToSegment2D(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { dist: number; t: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return { dist: Math.hypot(px - x1, py - y1), t: 0 };
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return { dist: Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)), t };
}

/** 2Dスクリーン空間での点と線分の最短距離 */
export function distToSegment2D(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  return projectToSegment2D(px, py, x1, y1, x2, y2).dist;
}

/** 画面上のピクセル半径が常に一定になるよう、カメラ距離に応じてマーカーを相対スケーリング */
export function updateScreenSpaceMarkers(
  group: THREE.Group | null,
  camera: THREE.Camera,
  viewportHeight: number,
): void {
  if (!group || group.children.length === 0) return;
  const vh = Math.max(1, viewportHeight);
  const isPersp = camera instanceof THREE.PerspectiveCamera;
  const tanHalfFov = isPersp ? Math.tan((camera.fov * Math.PI) / 360) : 0;
  const orthoWorldPerPx =
    camera instanceof THREE.OrthographicCamera
      ? (camera.top - camera.bottom) / (Math.max(1e-6, camera.zoom) * vh)
      : 0;
  const worldPos = new THREE.Vector3();

  for (const child of group.children) {
    const px = child.userData?.screenPx as number | undefined;
    if (!px || px <= 0) continue;
    let scale: number;
    if (isPersp) {
      child.getWorldPosition(worldPos);
      const dist = Math.max(0.5, camera.position.distanceTo(worldPos));
      scale = ((2 * dist * tanHalfFov) / vh) * px;
    } else {
      scale = orthoWorldPerPx * px;
    }
    scale = Math.max(0.05, scale);
    child.scale.setScalar(scale);
  }
}

/** Zスライス条件に一致するかを判定 */
export function segmentMatchesZSlice(seg: PathSegment, opts: DisplayOptions): boolean {
  if (!opts.zSliceEnabled) return true;
  const lo = Math.min(opts.zSliceMin, opts.zSliceMax);
  const hi = Math.max(opts.zSliceMin, opts.zSliceMax);
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of seg.points) {
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return maxZ >= lo - 1e-4 && minZ <= hi + 1e-4;
}

/** ポリライン上の進行度 t (0..1) に対応する補間座標と部分ポリライン頂点を返す */
export function samplePolylineAt(
  points: Point3[],
  t: number,
): { pos: Point3; partial: THREE.Vector3[] } {
  if (points.length === 0) {
    return { pos: { x: 0, y: 0, z: 0 }, partial: [] };
  }
  if (points.length === 1 || t <= 0) {
    const p = points[0];
    return { pos: p, partial: [new THREE.Vector3(p.x, p.y, p.z)] };
  }
  if (t >= 1) {
    const p = points[points.length - 1];
    return {
      pos: p,
      partial: points.map((pt) => new THREE.Vector3(pt.x, pt.y, pt.z)),
    };
  }

  let totalLen = 0;
  const segLens: number[] = new Array(points.length - 1);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    segLens[i] = d;
    totalLen += d;
  }

  if (totalLen < 1e-9) {
    const p = points[points.length - 1];
    return { pos: p, partial: [new THREE.Vector3(p.x, p.y, p.z)] };
  }

  const targetDist = totalLen * t;
  let acc = 0;
  const partial: THREE.Vector3[] = [new THREE.Vector3(points[0].x, points[0].y, points[0].z)];

  for (let i = 0; i < segLens.length; i++) {
    const d = segLens[i];
    if (acc + d >= targetDist || i === segLens.length - 1) {
      const localT = d > 1e-9 ? Math.max(0, Math.min(1, (targetDist - acc) / d)) : 1;
      const a = points[i];
      const b = points[i + 1];
      const pos = {
        x: a.x + (b.x - a.x) * localT,
        y: a.y + (b.y - a.y) * localT,
        z: a.z + (b.z - a.z) * localT,
      };
      partial.push(new THREE.Vector3(pos.x, pos.y, pos.z));
      return { pos, partial };
    }
    acc += d;
    const b = points[i + 1];
    partial.push(new THREE.Vector3(b.x, b.y, b.z));
  }

  const last = points[points.length - 1];
  return { pos: last, partial };
}

/** 単一セグメントの特徴スナップ点（端点・実中点・円弧中心）を取得 */
export function getSegmentSnapPoints(seg: PathSegment): SnapPoint[] {
  const pts: SnapPoint[] = [
    { pos: seg.start, kind: "endpoint" },
    { pos: seg.end, kind: "endpoint" },
  ];
  if (seg.points.length >= 2) {
    // 円弧・直線ともにポリライン上の正確な実中点（円弧なら弧のど真ん中）を算出
    const mid = samplePolylineAt(seg.points, 0.5).pos;
    pts.push({ pos: mid, kind: "midpoint" });
  }
  if (seg.arcCenter) {
    pts.push({ pos: seg.arcCenter, kind: "center" });
  }
  return pts;
}

/** セグメント列からスナップ候補点（端点・中点・円弧中心）を抽出 */
export function extractSnapPoints(segments: PathSegment[]): SnapPoint[] {
  const list: SnapPoint[] = [];
  const seen = new Set<string>();
  const addPt = (pos: Point3, kind: SnapKind) => {
    const key = `${kind}:${pos.x.toFixed(3)},${pos.y.toFixed(3)},${pos.z.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push({ pos, kind });
  };

  const stride = segments.length > 20000 ? Math.ceil(segments.length / 20000) : 1;
  for (let i = 0; i < segments.length; i += stride) {
    for (const sp of getSegmentSnapPoints(segments[i])) {
      addPt(sp.pos, sp.kind);
    }
  }
  return list;
}

/** Group 内の全メッシュ・ライン・スプライトの GPU リソースを安全に解放する */
export function disposeGroupChildren(group: THREE.Group): void {
  const disposeMat = (m: THREE.Material | undefined) => {
    if (!m) return;
    if ("map" in m && (m as THREE.SpriteMaterial).map) {
      (m as THREE.SpriteMaterial).map?.dispose();
    }
    m.dispose();
  };
  while (group.children.length > 0) {
    const obj = group.children.pop()!;
    obj.traverse((node) => {
      if ("geometry" in node && (node as THREE.Mesh).geometry) {
        (node as THREE.Mesh).geometry.dispose();
      }
      if ("material" in node) {
        const mat = (node as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach(disposeMat);
        else disposeMat(mat);
      }
    });
  }
}

/** 軸ラベル用の高解像度ビルボードスプライトを生成 */
function createAxisLabelSprite(letter: "X" | "Y" | "Z", colorHex: string): THREE.Sprite {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    const c = size * 0.5;
    ctx.font = "700 72px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // 軌道線と重なっても読めるよう極細のダーク縁取りのみ付与
    ctx.lineJoin = "round";
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(14, 16, 22, 0.88)";
    ctx.strokeText(letter, c, c + 2);
    ctx.fillStyle = colorHex;
    ctx.fillText(letter, c, c + 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    opacity: 0.72,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.36, 0.36, 1);
  sprite.renderOrder = 13;
  return sprite;
}

/** 画面相対サイズのモダン CAD 風 UCS 原点ギズモ（矢印＋X/Y/Zビルボードラベル＋原点キューブ）を構築 */
export function buildOriginUcsGizmo(screenPx = 48): THREE.Group {
  const root = new THREE.Group();
  root.userData.screenPx = screenPx;
  root.renderOrder = 12;

  const shaftLen = 0.78;
  const shaftRadius = 0.022;
  const headLen = 0.22;
  const headRadius = 0.072;

  const axes: Array<{
    letter: "X" | "Y" | "Z";
    colorHex: string;
    colorNum: number;
    dir: THREE.Vector3;
  }> = [
    { letter: "X", colorHex: "#f87171", colorNum: 0xf87171, dir: new THREE.Vector3(1, 0, 0) },
    { letter: "Y", colorHex: "#4ade80", colorNum: 0x4ade80, dir: new THREE.Vector3(0, 1, 0) },
    { letter: "Z", colorHex: "#60a5fa", colorNum: 0x60a5fa, dir: new THREE.Vector3(0, 0, 1) },
  ];

  const up = new THREE.Vector3(0, 1, 0);

  for (const ax of axes) {
    const mat = new THREE.MeshBasicMaterial({
      color: ax.colorNum,
      transparent: true,
      opacity: 0.65,
      depthTest: false,
      depthWrite: false,
    });
    const quat = new THREE.Quaternion().setFromUnitVectors(up, ax.dir);

    // 軸シャフト
    const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLen, 10);
    const shaft = new THREE.Mesh(shaftGeo, mat);
    shaft.quaternion.copy(quat);
    shaft.position.copy(ax.dir).multiplyScalar(shaftLen * 0.5);
    shaft.renderOrder = 12;

    // 矢印ヘッド
    const headGeo = new THREE.ConeGeometry(headRadius, headLen, 14);
    const head = new THREE.Mesh(headGeo, mat.clone());
    head.quaternion.copy(quat);
    head.position.copy(ax.dir).multiplyScalar(shaftLen + headLen * 0.5);
    head.renderOrder = 12;

    // ビルボード文字ラベル（どの角度から見ても常に正面向き）
    const label = createAxisLabelSprite(ax.letter, ax.colorHex);
    label.position.copy(ax.dir).multiplyScalar(1.18);

    root.add(shaft, head, label);
  }

  // 原点センターマーク（CAD UCS 風の極小キューブ＋細枠）
  const originGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
  const originMat = new THREE.MeshBasicMaterial({
    color: 0xe2e8f0,
    transparent: true,
    opacity: 0.62,
    depthTest: false,
    depthWrite: false,
  });
  const originCube = new THREE.Mesh(originGeo, originMat);
  originCube.renderOrder = 13;
  root.add(originCube);

  return root;
}

export type OutlineRole = "outer" | "inner" | "side" | "hole";

export interface TypedOutlinePolyline {
  role: OutlineRole;
  points: Point3[];
}

/** 1セグメント分の工具径外周ポリライン列を役割（outer/inner/side/hole）付きで返す */
export function getSegmentTypedOutlines(seg: PathSegment): TypedOutlinePolyline[] {
  const isCutXY =
    seg.motionType === "linear" ||
    seg.motionType === "arc_cw" ||
    seg.motionType === "arc_ccw";
  const isCanned = seg.motionType === "canned_feed";
  if (!isCutXY && !isCanned) return [];

  const dia = seg.modalState.toolDiameter > 0 ? seg.modalState.toolDiameter : 6.0;
  const r = dia * 0.5;
  if (r <= 1e-4) return [];

  const buildCirclePts = (cx: number, cy: number, z: number): Point3[] => {
    const sides = 24;
    const pts: Point3[] = [];
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, z });
    }
    return pts;
  };

  if (isCanned) {
    return [{ role: "hole", points: buildCirclePts(seg.end.x, seg.end.y, seg.end.z) }];
  }

  let skipLeft = false;
  let skipRight = false;
  const isArc =
    seg.arcCenter !== null && (seg.motionType === "arc_ccw" || seg.motionType === "arc_cw");
  if (isArc && seg.arcCenter) {
    const arcR = Math.hypot(seg.start.x - seg.arcCenter.x, seg.start.y - seg.arcCenter.y);
    if (arcR <= r + 0.05) {
      if (seg.motionType === "arc_ccw") skipLeft = true;
      else skipRight = true;
    }
  }

  const pts = seg.points;
  const leftPts: Point3[] = [];
  const rightPts: Point3[] = [];

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;
    const nx = (-dy / len) * r;
    const ny = (dx / len) * r;

    if (!skipLeft) {
      if (leftPts.length === 0) leftPts.push({ x: p0.x + nx, y: p0.y + ny, z: p0.z });
      leftPts.push({ x: p1.x + nx, y: p1.y + ny, z: p1.z });
    }
    if (!skipRight) {
      if (rightPts.length === 0) rightPts.push({ x: p0.x - nx, y: p0.y - ny, z: p0.z });
      rightPts.push({ x: p1.x - nx, y: p1.y - ny, z: p1.z });
    }
  }

  // G03(反時計回り)は左が内側・右が外側、G02(時計回り)は左が外側・右が内側
  const leftRole: OutlineRole = isArc
    ? seg.motionType === "arc_ccw"
      ? "inner"
      : "outer"
    : "side";
  const rightRole: OutlineRole = isArc
    ? seg.motionType === "arc_ccw"
      ? "outer"
      : "inner"
    : "side";

  const out: TypedOutlinePolyline[] = [];
  if (leftPts.length >= 2) out.push({ role: leftRole, points: leftPts });
  if (rightPts.length >= 2) out.push({ role: rightRole, points: rightPts });

  // 垂直プランジ（XY移動なし・Z降下）の場合は穴底円を返す
  if (out.length === 0 && seg.end.z < seg.start.z - 1e-4) {
    out.push({ role: "hole", points: buildCirclePts(seg.end.x, seg.end.y, seg.end.z) });
  }
  return out;
}

/** 1セグメント分の工具径外周ポリライン列（左オフセット・右オフセット・または穴底円）を返す */
export function getSegmentOutlinePolylines(seg: PathSegment): Point3[][] {
  return getSegmentTypedOutlines(seg).map((o) => o.points);
}

/** 切削パスから本家風の工具外周輪郭線（左右オフセット線＋外角円弧＋端点半円／穴底円）を構築 */
export function buildToolWidthFillMesh(
  segments: PathSegment[],
  colorByTool: boolean,
  opts?: { overrideColor?: number; opacity?: number; depthTest?: boolean },
): THREE.LineSegments | null {
  const positions: number[] = [];
  const colors: number[] = [];
  const maxFloatCount = 600_000 * 3; // 30万線分（60万頂点）上限ガード

  const pushLine = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    col: THREE.Color,
  ) => {
    if (positions.length >= maxFloatCount) return;
    positions.push(ax, ay, az, bx, by, bz);
    colors.push(col.r, col.g, col.b, col.r, col.g, col.b);
  };

  const pushArc = (
    cx: number,
    cy: number,
    z: number,
    r: number,
    startAng: number,
    sweepAng: number,
    col: THREE.Color,
    segsPerQuarter = 4,
  ) => {
    if (Math.abs(sweepAng) < 1e-4) return;
    const steps = Math.max(
      1,
      Math.min(20, Math.ceil((Math.abs(sweepAng) / (Math.PI * 0.5)) * segsPerQuarter)),
    );
    let px = cx + Math.cos(startAng) * r;
    let py = cy + Math.sin(startAng) * r;
    for (let k = 1; k <= steps; k++) {
      const a = startAng + (sweepAng * k) / steps;
      const nx = cx + Math.cos(a) * r;
      const ny = cy + Math.sin(a) * r;
      pushLine(px, py, z, nx, ny, z, col);
      px = nx;
      py = ny;
    }
  };

  const pushCircle = (cx: number, cy: number, z: number, r: number, col: THREE.Color) => {
    const sides = 20;
    let px = cx + r;
    let py = cy;
    for (let k = 1; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const nx = cx + Math.cos(a) * r;
      const ny = cy + Math.sin(a) * r;
      pushLine(px, py, z, nx, ny, z, col);
      px = nx;
      py = ny;
    }
  };

  interface Step2D {
    p0: Point3;
    p1: Point3;
    len: number;
    tx: number;
    ty: number;
    nx: number;
    ny: number;
    skipLeft: boolean;
    skipRight: boolean;
  }

  let chain: Step2D[] = [];
  let chainRadius = 0;
  let chainColor = new THREE.Color("#a78bfa");

  const flushChain = () => {
    const n = chain.length;
    if (n === 0) return;

    const r = chainRadius;
    const col = chainColor;
    const first = chain[0];
    const last = chain[n - 1];
    const isClosed =
      n >= 2 &&
      Math.hypot(last.p1.x - first.p0.x, last.p1.y - first.p0.y) < 1e-3 &&
      Math.abs(last.p1.z - first.p0.z) < 1e-3;

    const lStartTrim = new Float64Array(n);
    const lEndTrim = new Float64Array(n);
    const rStartTrim = new Float64Array(n);
    const rEndTrim = new Float64Array(n);

    const jointCount = isClosed ? n : n - 1;
    for (let j = 0; j < jointCount; j++) {
      const nextIdx = (j + 1) % n;
      const a = chain[j];
      const b = chain[nextIdx];
      const cross = a.tx * b.ty - a.ty * b.tx;
      const dot = a.tx * b.tx + a.ty * b.ty;
      const ang = Math.atan2(cross, dot); // +: 左折, -: 右折
      const jz = a.p1.z - 0.015;

      // 左側 (+N) のコーナー処理
      if (!a.skipLeft && !b.skipLeft) {
        if (ang < -0.02) {
          // 右折 → 左側が外角：工具半径Rのロールアラウンド円弧で繋ぐ
          const startAng = Math.atan2(a.ny, a.nx);
          pushArc(a.p1.x, a.p1.y, jz, r, startAng, ang, col);
        } else if (ang > 0.02) {
          // 左折 → 左側が内角：交点トリムで飛び出しを除去
          const trim = ang < Math.PI * 0.85 ? r * Math.tan(ang * 0.5) : Infinity;
          if (trim <= a.len * 0.49 && trim <= b.len * 0.49) {
            lEndTrim[j] = Math.max(lEndTrim[j], trim);
            lStartTrim[nextIdx] = Math.max(lStartTrim[nextIdx], trim);
          }
        }
      }

      // 右側 (-N) のコーナー処理
      if (!a.skipRight && !b.skipRight) {
        if (ang > 0.02) {
          // 左折 → 右側が外角：工具半径Rのロールアラウンド円弧で繋ぐ
          const startAng = Math.atan2(-a.ny, -a.nx);
          pushArc(a.p1.x, a.p1.y, jz, r, startAng, ang, col);
        } else if (ang < -0.02) {
          // 右折 → 右側が内角：交点トリムで飛び出しを除去
          const absAng = -ang;
          const trim = absAng < Math.PI * 0.85 ? r * Math.tan(absAng * 0.5) : Infinity;
          if (trim <= a.len * 0.49 && trim <= b.len * 0.49) {
            rEndTrim[j] = Math.max(rEndTrim[j], trim);
            rStartTrim[nextIdx] = Math.max(rStartTrim[nextIdx], trim);
          }
        }
      }
    }

    // 各区間の左右平行オフセット線を描画
    for (let i = 0; i < n; i++) {
      const s = chain[i];
      const invLen = 1 / s.len;
      const dz = s.p1.z - s.p0.z;

      if (!s.skipLeft) {
        const t0 = lStartTrim[i];
        const t1 = lEndTrim[i];
        if (t0 + t1 < s.len - 1e-4) {
          const u0 = t0 * invLen;
          const u1 = 1 - t1 * invLen;
          pushLine(
            s.p0.x + s.nx * r + s.tx * t0,
            s.p0.y + s.ny * r + s.ty * t0,
            s.p0.z + dz * u0 - 0.015,
            s.p1.x + s.nx * r - s.tx * t1,
            s.p1.y + s.ny * r - s.ty * t1,
            s.p0.z + dz * u1 - 0.015,
            col,
          );
        }
      }

      if (!s.skipRight) {
        const t0 = rStartTrim[i];
        const t1 = rEndTrim[i];
        if (t0 + t1 < s.len - 1e-4) {
          const u0 = t0 * invLen;
          const u1 = 1 - t1 * invLen;
          pushLine(
            s.p0.x - s.nx * r + s.tx * t0,
            s.p0.y - s.ny * r + s.ty * t0,
            s.p0.z + dz * u0 - 0.015,
            s.p1.x - s.nx * r - s.tx * t1,
            s.p1.y - s.ny * r - s.ty * t1,
            s.p0.z + dz * u1 - 0.015,
            col,
          );
        }
      }
    }

    // 開いたパスの両端に工具半径Rの半円アークを描く
    if (!isClosed) {
      const startAng = Math.atan2(first.ny, first.nx);
      pushArc(first.p0.x, first.p0.y, first.p0.z - 0.015, r, startAng, Math.PI, col, 6);

      const endAng = Math.atan2(-last.ny, -last.nx);
      pushArc(last.p1.x, last.p1.y, last.p1.z - 0.015, r, endAng, Math.PI, col, 6);
    }

    chain = [];
  };

  let segCount = 0;
  const drawnHoles = new Set<string>();

  for (let sIdx = 0; sIdx < segments.length; sIdx++) {
    const seg = segments[sIdx];
    const isCutXY =
      seg.motionType === "linear" ||
      seg.motionType === "arc_cw" ||
      seg.motionType === "arc_ccw";
    const isCanned = seg.motionType === "canned_feed";

    if (!isCutXY && !isCanned) {
      flushChain();
      continue;
    }
    if (++segCount > 30000) break;

    const dia = seg.modalState.toolDiameter > 0 ? seg.modalState.toolDiameter : 6.0;
    const r = dia * 0.5;
    const col =
      opts?.overrideColor !== undefined
        ? new THREE.Color(opts.overrideColor)
        : colorByTool
          ? new THREE.Color(getToolColor(seg.toolNumber))
          : new THREE.Color("#a78bfa");

    // 固定サイクル穴あけ（G81/G83/G84等）：穴底に工具径の真円リングを描画
    if (isCanned) {
      flushChain();
      const holeKey = `${seg.end.x.toFixed(2)},${seg.end.y.toFixed(2)},${seg.end.z.toFixed(2)},${r.toFixed(2)}`;
      if (!drawnHoles.has(holeKey)) {
        drawnHoles.add(holeKey);
        pushCircle(seg.end.x, seg.end.y, seg.end.z - 0.015, r, col);
      }
      continue;
    }

    // 小径円弧の内側が工具半径より小さい場合、裏返り線を防止
    let skipLeft = false;
    let skipRight = false;
    if (seg.arcCenter && (seg.motionType === "arc_ccw" || seg.motionType === "arc_cw")) {
      const arcR = Math.hypot(seg.start.x - seg.arcCenter.x, seg.start.y - seg.arcCenter.y);
      if (arcR <= r + 0.05) {
        if (seg.motionType === "arc_ccw") skipLeft = true;
        else skipRight = true;
      }
    }

    // 工具径または色が変わったらチェインを区切る
    if (
      chain.length > 0 &&
      (Math.abs(chainRadius - r) > 1e-4 || !chainColor.equals(col))
    ) {
      flushChain();
    }

    const pts = seg.points;
    let hadHorizontalStep = false;

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) {
        flushChain();
        continue;
      }
      hadHorizontalStep = true;

      if (chain.length > 0) {
        const prev = chain[chain.length - 1];
        const gap = Math.hypot(p0.x - prev.p1.x, p0.y - prev.p1.y, p0.z - prev.p1.z);
        if (gap > 1e-3) {
          flushChain();
        }
      }

      if (chain.length === 0) {
        chainRadius = r;
        chainColor = col;
      }

      const tx = dx / len;
      const ty = dy / len;
      chain.push({
        p0,
        p1,
        len,
        tx,
        ty,
        nx: -ty,
        ny: tx,
        skipLeft,
        skipRight,
      });
    }

    // 独立した垂直プランジ（G01 Z-xx 単体でその後にXY切削が続かない穴あけマクロ等）
    if (!hadHorizontalStep && seg.end.z < seg.start.z - 1e-4) {
      const nextSeg = segments[sIdx + 1];
      const nextStartsHorizontalHere =
        nextSeg &&
        (nextSeg.motionType === "linear" ||
          nextSeg.motionType === "arc_cw" ||
          nextSeg.motionType === "arc_ccw") &&
        Math.hypot(nextSeg.start.x - seg.end.x, nextSeg.start.y - seg.end.y) < 1e-3 &&
        Math.hypot(nextSeg.end.x - nextSeg.start.x, nextSeg.end.y - nextSeg.start.y) > 1e-3;
      if (!nextStartsHorizontalHere) {
        const holeKey = `${seg.end.x.toFixed(2)},${seg.end.y.toFixed(2)},${seg.end.z.toFixed(2)},${r.toFixed(2)}`;
        if (!drawnHoles.has(holeKey)) {
          drawnHoles.add(holeKey);
          pushCircle(seg.end.x, seg.end.y, seg.end.z - 0.015, r, col);
        }
      }
    }
  }

  flushChain();

  if (positions.length === 0) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: opts?.opacity ?? 0.68,
    depthTest: opts?.depthTest ?? true,
  });
  return new THREE.LineSegments(geom, mat);
}

/** T番号の工具径と工具形状に応じた 3D工具メッシュを構築 */
export function rebuildToolMeshes(group: THREE.Group, diameter: number, shape: ToolShape): void {
  disposeGroupChildren(group);

  const dia = diameter > 0 ? diameter : 6.0;
  const radius = dia * 0.5;
  const fluteLen = Math.max(18, dia * 2.5);
  const shankLen = 14;

  const fluteColor =
    shape === "drill"
      ? 0xfbbf24
      : shape === "ball"
        ? 0x4ade80
        : shape === "chamfer"
          ? 0xf472b6
          : shape === "tap"
            ? 0xc084fc
            : 0x38bdf8;

  const fluteMat = new THREE.MeshStandardMaterial({
    color: fluteColor,
    metalness: 0.48,
    roughness: 0.28,
    transparent: true,
    opacity: 0.82,
  });

  const fluteGroup = new THREE.Group();
  fluteGroup.name = "spindle_flute";

  if (shape === "drill" || shape === "chamfer") {
    const tipHeight = shape === "chamfer" ? radius : radius * 0.6;
    const coneGeo = new THREE.ConeGeometry(radius, tipHeight, 20);
    coneGeo.rotateX(-Math.PI / 2);
    coneGeo.translate(0, 0, tipHeight * 0.5);
    fluteGroup.add(new THREE.Mesh(coneGeo, fluteMat));

    const bodyLen = Math.max(10, fluteLen - tipHeight);
    const bodyGeo = new THREE.CylinderGeometry(radius, radius, bodyLen, 16);
    bodyGeo.rotateX(Math.PI / 2);
    bodyGeo.translate(0, 0, tipHeight + bodyLen * 0.5);
    fluteGroup.add(new THREE.Mesh(bodyGeo, fluteMat));
  } else if (shape === "ball") {
    const sphereGeo = new THREE.SphereGeometry(radius, 20, 14);
    sphereGeo.translate(0, 0, radius);
    fluteGroup.add(new THREE.Mesh(sphereGeo, fluteMat));

    const bodyLen = Math.max(10, fluteLen - radius);
    const bodyGeo = new THREE.CylinderGeometry(radius, radius, bodyLen, 16);
    bodyGeo.rotateX(Math.PI / 2);
    bodyGeo.translate(0, 0, radius + bodyLen * 0.5);
    fluteGroup.add(new THREE.Mesh(bodyGeo, fluteMat));
  } else if (shape === "tap") {
    const tipHeight = radius * 0.8;
    const coneGeo = new THREE.CylinderGeometry(radius, radius * 0.55, tipHeight, 16);
    coneGeo.rotateX(Math.PI / 2);
    coneGeo.translate(0, 0, tipHeight * 0.5);
    fluteGroup.add(new THREE.Mesh(coneGeo, fluteMat));

    const bodyGeo = new THREE.CylinderGeometry(radius * 0.85, radius, fluteLen - tipHeight, 16);
    bodyGeo.rotateX(Math.PI / 2);
    bodyGeo.translate(0, 0, tipHeight + (fluteLen - tipHeight) * 0.5);
    fluteGroup.add(new THREE.Mesh(bodyGeo, fluteMat));
  } else {
    const bodyGeo = new THREE.CylinderGeometry(radius, radius, fluteLen, 16);
    bodyGeo.rotateX(Math.PI / 2);
    bodyGeo.translate(0, 0, fluteLen * 0.5);
    fluteGroup.add(new THREE.Mesh(bodyGeo, fluteMat));
  }

  const stripeGeo = new THREE.BoxGeometry(
    radius * 2.04,
    Math.max(0.35, radius * 0.14),
    fluteLen * 0.72,
  );
  stripeGeo.translate(0, 0, fluteLen * 0.55);
  const stripeMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.45,
  });
  fluteGroup.add(new THREE.Mesh(stripeGeo, stripeMat));

  const holderGeo = new THREE.CylinderGeometry(radius * 1.45, radius * 1.15, shankLen, 20);
  holderGeo.rotateX(Math.PI / 2);
  holderGeo.translate(0, 0, fluteLen + shankLen * 0.5);
  const holderMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    metalness: 0.65,
    roughness: 0.35,
    transparent: true,
    opacity: 0.88,
  });

  const tipRingGeo = new THREE.RingGeometry(Math.max(0.2, radius - 0.35), radius, 28);
  const tipRingMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    side: THREE.DoubleSide,
  });
  const tipRing = new THREE.Mesh(tipRingGeo, tipRingMat);
  tipRing.position.set(0, 0, 0.05);

  group.add(fluteGroup, new THREE.Mesh(holderGeo, holderMat), tipRing);
}
