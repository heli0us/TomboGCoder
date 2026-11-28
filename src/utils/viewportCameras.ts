import * as THREE from "three";
import type { BoundingBox, CameraPreset, ViewportLayoutMode } from "../types/nc";

export type ViewPaneId = "main" | "sub1" | "sub2" | "sub3";

export type PaneViewAngle =
  | "iso"
  | "top"
  | "bottom"
  | "front"
  | "back"
  | "right"
  | "left"
  | "custom";

export interface SavedPaneCamera {
  angle: PaneViewAngle;
  /** ターゲットからカメラへの単位方向ベクトル */
  dir: [number, number, number];
}

export type SavedPaneCameraMap = Record<ViewPaneId, SavedPaneCamera>;

export interface PaneAngleOption {
  angle: Exclude<PaneViewAngle, "custom">;
  shortLabel: string;
  label: string;
}

export const PANE_ANGLE_OPTIONS: readonly PaneAngleOption[] = [
  { angle: "iso", shortLabel: "ISO 3D", label: "ISO 等角 (3D)" },
  { angle: "top", shortLabel: "XY 上面", label: "XY 上面 (+Z)" },
  { angle: "bottom", shortLabel: "XY 下面", label: "XY 下面 (-Z)" },
  { angle: "front", shortLabel: "XZ 正面", label: "XZ 正面 (-Y)" },
  { angle: "back", shortLabel: "XZ 背面", label: "XZ 背面 (+Y)" },
  { angle: "right", shortLabel: "YZ 右側面", label: "YZ 右側面 (+X)" },
  { angle: "left", shortLabel: "YZ 左側面", label: "YZ 左側面 (-X)" },
] as const;

export const ALL_PANE_IDS: readonly ViewPaneId[] = ["main", "sub1", "sub2", "sub3"];

const CAMERA_STORAGE_KEY = "tombo_gcoder_viewport_cameras_v1";

/** 角度プリセットに対応する単位方向ベクトル（ターゲット → カメラ） */
export function getPresetDirection(angle: Exclude<PaneViewAngle, "custom">): THREE.Vector3 {
  switch (angle) {
    case "top":
      return new THREE.Vector3(0, -0.0008, 1).normalize();
    case "bottom":
      return new THREE.Vector3(0, -0.0008, -1).normalize();
    case "front":
      return new THREE.Vector3(0, -1, 0);
    case "back":
      return new THREE.Vector3(0, 1, 0);
    case "right":
      return new THREE.Vector3(1, 0, 0);
    case "left":
      return new THREE.Vector3(-1, 0, 0);
    case "iso":
    default:
      // 原点側（左手前 -X, -Y, +Z）からワークを見渡す ISO 角度
      return new THREE.Vector3(-0.68, -0.78, 0.68).normalize();
  }
}

export function paneAngleShortLabel(angle: PaneViewAngle): string {
  if (angle === "custom") return "3D 自由";
  return PANE_ANGLE_OPTIONS.find((o) => o.angle === angle)?.shortLabel ?? "ISO 3D";
}

export function cameraPresetToPaneAngle(preset: CameraPreset): Exclude<PaneViewAngle, "custom"> {
  switch (preset) {
    case "top":
      return "top";
    case "front":
      return "front";
    case "right":
      return "right";
    case "iso":
    default:
      return "iso";
  }
}

export function defaultSavedPaneCameras(): SavedPaneCameraMap {
  const mk = (angle: Exclude<PaneViewAngle, "custom">): SavedPaneCamera => {
    const v = getPresetDirection(angle);
    return { angle, dir: [v.x, v.y, v.z] };
  };
  return {
    main: mk("iso"),
    sub1: mk("top"),
    sub2: mk("front"),
    sub3: mk("right"),
  };
}

export function loadSavedPaneCameras(): SavedPaneCameraMap {
  const defaults = defaultSavedPaneCameras();
  try {
    const raw = window.localStorage.getItem(CAMERA_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Record<ViewPaneId, Partial<SavedPaneCamera>>>;
    const validAngles = new Set<PaneViewAngle>([
      "iso",
      "top",
      "bottom",
      "front",
      "back",
      "right",
      "left",
      "custom",
    ]);
    const next = { ...defaults };
    for (const id of ALL_PANE_IDS) {
      const entry = parsed[id];
      if (!entry) continue;
      const angle: PaneViewAngle =
        entry.angle && validAngles.has(entry.angle) ? entry.angle : defaults[id].angle;
      const d = entry.dir;
      if (
        Array.isArray(d) &&
        d.length === 3 &&
        d.every((n) => typeof n === "number" && Number.isFinite(n))
      ) {
        const vec = new THREE.Vector3(d[0], d[1], d[2]);
        if (vec.lengthSq() > 1e-6) {
          vec.normalize();
          next[id] = { angle, dir: [vec.x, vec.y, vec.z] };
          continue;
        }
      }
      const fallbackDir =
        angle === "custom" ? getPresetDirection("iso") : getPresetDirection(angle);
      next[id] = { angle, dir: [fallbackDir.x, fallbackDir.y, fallbackDir.z] };
    }
    return next;
  } catch {
    return defaults;
  }
}

export function savePaneCamerasToStorage(map: SavedPaneCameraMap): void {
  try {
    window.localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

/** 現在のレイアウトで表示されるペインのピクセル矩形（CSS 左上原点）と WebGL ビューポート（左下原点）を算出 */
export interface PaneRect {
  id: ViewPaneId;
  /** CSS 座標 (左上原点) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** WebGL setViewport / setScissor 座標 (左下原点) */
  glX: number;
  glY: number;
}

export function computeLayoutPaneRects(
  layout: ViewportLayoutMode,
  totalW: number,
  totalH: number,
): PaneRect[] {
  const w = Math.max(1, totalW);
  const h = Math.max(1, totalH);

  if (layout === "single") {
    return [{ id: "main", x: 0, y: 0, w, h, glX: 0, glY: 0 }];
  }

  if (layout === "triple") {
    const topH = Math.max(1, Math.floor(h * 0.34));
    const mainH = Math.max(1, h - topH);
    const hw = Math.max(1, Math.floor(w / 2));
    return [
      { id: "sub1", x: 0, y: 0, w: hw, h: topH, glX: 0, glY: mainH },
      { id: "sub2", x: hw, y: 0, w: Math.max(1, w - hw), h: topH, glX: hw, glY: mainH },
      { id: "main", x: 0, y: topH, w, h: mainH, glX: 0, glY: 0 },
    ];
  }

  // quad (4面図：上段3面 + 下段メイン)
  const topH = Math.max(1, Math.floor(h * 0.32));
  const mainH = Math.max(1, h - topH);
  const w1 = Math.max(1, Math.floor(w / 3));
  const w2 = Math.max(1, Math.floor((w * 2) / 3) - w1);
  const w3 = Math.max(1, w - w1 - w2);
  return [
    { id: "sub1", x: 0, y: 0, w: w1, h: topH, glX: 0, glY: mainH },
    { id: "sub2", x: w1, y: 0, w: w2, h: topH, glX: w1, glY: mainH },
    { id: "sub3", x: w1 + w2, y: 0, w: w3, h: topH, glX: w1 + w2, glY: mainH },
    { id: "main", x: 0, y: topH, w, h: mainH, glX: 0, glY: 0 },
  ];
}

/** バウンディングボックス全体が指定ペインに収まるカメラ距離と中心を算出 */
export function computeFitCameraMetrics(
  bb: BoundingBox,
  fovDeg: number,
  paneW: number,
  paneH: number,
  marginFactor = 1.24,
): { center: THREE.Vector3; dist: number } {
  const min = bb.valid ? bb.min : { x: -50, y: -50, z: -20 };
  const max = bb.valid ? bb.max : { x: 100, y: 100, z: 50 };
  const cx = (min.x + max.x) * 0.5;
  const cy = (min.y + max.y) * 0.5;
  const cz = (min.z + max.z) * 0.5;

  const sizeX = Math.max(max.x - min.x, 10);
  const sizeY = Math.max(max.y - min.y, 10);
  const sizeZ = Math.max(max.z - min.z, 10);

  const aspect = Math.max(1, paneW) / Math.max(1, paneH);
  const vFovRad = (fovDeg * Math.PI) / 180;
  const hFovRad = 2 * Math.atan(Math.tan(vFovRad * 0.5) * aspect);
  const halfMinFov = Math.min(vFovRad, hFovRad) * 0.5;

  const radius = Math.max(Math.hypot(sizeX, sizeY, sizeZ) * 0.5, 25);
  const dist = (radius / Math.max(0.15, Math.sin(halfMinFov))) * marginFactor;
  return { center: new THREE.Vector3(cx, cy, cz), dist };
}
