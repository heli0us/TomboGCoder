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

/** Group 内の全メッシュ・ラインの GPU リソースを安全に解放する */
export function disposeGroupChildren(group: THREE.Group): void {
  while (group.children.length > 0) {
    const obj = group.children.pop()!;
    obj.traverse((node) => {
      if ("geometry" in node && (node as THREE.Mesh).geometry) {
        (node as THREE.Mesh).geometry.dispose();
      }
      if ("material" in node) {
        const mat = (node as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      }
    });
  }
}

/** 切削パスから本家風の工具外周輪郭線（左右オフセット線＋外角円弧＋端点半円／穴底円）を構築 */
export function buildToolWidthFillMesh(
  segments: PathSegment[],
  colorByTool: boolean,
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
    const col = colorByTool
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
    opacity: 0.68,
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
