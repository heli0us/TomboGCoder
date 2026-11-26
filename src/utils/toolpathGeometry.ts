import * as THREE from "three";
import {
  type DisplayOptions,
  type MotionType,
  type PathSegment,
  type Point3,
  type ToolShape,
  getToolColor,
} from "../types/nc";

export type SnapKind = "endpoint" | "midpoint" | "center";

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

/** 2Dスクリーン空間での点と線分の最短距離 */
export function distToSegment2D(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
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

  const stride = segments.length > 5000 ? Math.ceil(segments.length / 5000) : 1;
  for (let i = 0; i < segments.length; i += stride) {
    const seg = segments[i];
    addPt(seg.start, "endpoint");
    addPt(seg.end, "endpoint");
    if (seg.arcCenter) {
      addPt(seg.arcCenter, "center");
    } else {
      addPt(
        {
          x: (seg.start.x + seg.end.x) * 0.5,
          y: (seg.start.y + seg.end.y) * 0.5,
          z: (seg.start.z + seg.end.z) * 0.5,
        },
        "midpoint",
      );
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

/** 切削パスから工具径分の幅を持つ塗りつぶしリボンメッシュを構築 */
export function buildToolWidthFillMesh(
  segments: PathSegment[],
  colorByTool: boolean,
): THREE.Mesh | null {
  const positions: number[] = [];
  const colors: number[] = [];
  const capSides = 10;

  const pushTri = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    col: THREE.Color,
  ) => {
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    colors.push(col.r, col.g, col.b, col.r, col.g, col.b, col.r, col.g, col.b);
  };

  const pushCap = (cx: number, cy: number, z: number, r: number, col: THREE.Color) => {
    for (let k = 0; k < capSides; k++) {
      const a0 = (k / capSides) * Math.PI * 2;
      const a1 = ((k + 1) / capSides) * Math.PI * 2;
      pushTri(
        cx,
        cy,
        z,
        cx + Math.cos(a0) * r,
        cy + Math.sin(a0) * r,
        z,
        cx + Math.cos(a1) * r,
        cy + Math.sin(a1) * r,
        z,
        col,
      );
    }
  };

  let segCount = 0;
  for (const seg of segments) {
    if (
      seg.motionType !== "linear" &&
      seg.motionType !== "arc_cw" &&
      seg.motionType !== "arc_ccw"
    ) {
      continue;
    }
    if (++segCount > 12000) break;

    const dia = seg.modalState.toolDiameter > 0 ? seg.modalState.toolDiameter : 6.0;
    const r = dia * 0.5;
    const col = colorByTool
      ? new THREE.Color(getToolColor(seg.toolNumber))
      : new THREE.Color("#38bdf8");

    const pts = seg.points;
    let drewAny = false;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) continue;
      drewAny = true;

      const nx = (-dy / len) * r;
      const ny = (dx / len) * r;
      const z0 = p0.z - 0.03;
      const z1 = p1.z - 0.03;

      pushTri(
        p0.x + nx,
        p0.y + ny,
        z0,
        p0.x - nx,
        p0.y - ny,
        z0,
        p1.x + nx,
        p1.y + ny,
        z1,
        col,
      );
      pushTri(
        p0.x - nx,
        p0.y - ny,
        z0,
        p1.x - nx,
        p1.y - ny,
        z1,
        p1.x + nx,
        p1.y + ny,
        z1,
        col,
      );
    }

    if (drewAny) {
      const ps = pts[0];
      const pe = pts[pts.length - 1];
      pushCap(ps.x, ps.y, ps.z - 0.03, r, col);
      pushCap(pe.x, pe.y, pe.z - 0.03, r, col);
    }
  }

  if (positions.length === 0) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  return new THREE.Mesh(geom, mat);
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
