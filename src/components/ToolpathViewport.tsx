import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  type AutoBreakConfig,
  type BoundingBox,
  type CameraPreset,
  type Diagnostic,
  type DisplayOptions,
  type PathSegment,
  type Point3,
  type ToolShape,
  compModeLabel,
  formatDuration,
  getToolColor,
} from "../types/nc";
import {
  type SnapPoint,
  buildToolWidthFillMesh,
  disposeGroupChildren,
  distToSegment2D,
  extractSnapPoints,
  getMotionColor,
  rebuildToolMeshes,
  samplePolylineAt,
  segmentMatchesZSlice,
} from "../utils/toolpathGeometry";
import {
  type ActiveSnapHover,
  type DroRefs,
  type HoverInfo,
  type NavMode,
  ViewportOverlays,
  type ZoomBox,
} from "./viewport/ViewportOverlays";
import { TraceBar } from "./viewport/TraceBar";

interface ToolpathViewportProps {
  programSegments: PathSegment[];
  compensatedSegments: PathSegment[];
  diagnostics: Diagnostic[];
  boundingBox: BoundingBox;
  displayOptions: DisplayOptions;
  onUpdateDisplayOptions: (patch: Partial<DisplayOptions>) => void;
  activeSegmentIndex: number;
  onSelectSegmentIndex: (idx: number, keepPlaying?: boolean) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStopPlay: () => void;
  playbackSpeed: number;
  onChangePlaybackSpeed: (speed: number) => void;
  breakpoints: number[];
  autoBreak: AutoBreakConfig;
  breakReason: string | null;
  onBreakHit: (idx: number, reason: string) => void;
  isViewportMaximized: boolean;
  onToggleMaximizeViewport: () => void;
  cameraCommand: { preset: CameraPreset | "fit"; seq: number } | null;
}

interface PathBufferHandles {
  cutActiveLine: THREE.LineSegments | null;
  cutDimLine: THREE.LineSegments | null;
  rapidActiveLine: THREE.LineSegments | null;
  rapidDimLine: THREE.LineSegments | null;
  cutVertsBefore: Int32Array;
  cutVertsAfter: Int32Array;
  rapidVertsBefore: Int32Array;
  rapidVertsAfter: Int32Array;
}

export const ToolpathViewport: React.FC<ToolpathViewportProps> = ({
  programSegments,
  compensatedSegments,
  diagnostics,
  boundingBox,
  displayOptions,
  onUpdateDisplayOptions,
  activeSegmentIndex,
  onSelectSegmentIndex,
  isPlaying,
  onTogglePlay,
  onStopPlay,
  playbackSpeed,
  onChangePlaybackSpeed,
  breakpoints,
  autoBreak,
  breakReason,
  onBreakHit,
  isViewportMaximized,
  onToggleMaximizeViewport,
  cameraCommand,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orthoCamsRef = useRef<{
    top: THREE.OrthographicCamera;
    front: THREE.OrthographicCamera;
    right: THREE.OrthographicCamera;
  } | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  const pathGroupRef = useRef<THREE.Group | null>(null);
  const activeTipLineRef = useRef<THREE.Line | null>(null);
  const hoverGroupRef = useRef<THREE.Group | null>(null);
  const toolGroupRef = useRef<THREE.Group | null>(null);
  const toolBuiltKeyRef = useRef<string>("");
  const helperGroupRef = useRef<THREE.Group | null>(null);
  const measureGroupRef = useRef<THREE.Group | null>(null);
  const pathHandlesRef = useRef<PathBufferHandles | null>(null);
  const liveTimeTextRef = useRef<HTMLSpanElement | null>(null);

  // 実機CNC風 DRO の60fps直接更新用 DOM Refs（React再レンダリング負荷ゼロ）
  const droXRef = useRef<HTMLSpanElement | null>(null);
  const droYRef = useRef<HTMLSpanElement | null>(null);
  const droZRef = useRef<HTMLSpanElement | null>(null);
  const droFeedRef = useRef<HTMLSpanElement | null>(null);
  const droSpindleRef = useRef<HTMLSpanElement | null>(null);
  const droToolRef = useRef<HTMLSpanElement | null>(null);
  const droMotionRef = useRef<HTMLSpanElement | null>(null);
  const droRefs = useMemo<DroRefs>(
    () => ({
      x: droXRef,
      y: droYRef,
      z: droZRef,
      feed: droFeedRef,
      spindle: droSpindleRef,
      tool: droToolRef,
      motion: droMotionRef,
    }),
    [],
  );

  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [navMode, setNavMode] = useState<NavMode>("pan");
  const [zoomBox, setZoomBox] = useState<ZoomBox | null>(null);
  const [measureMode, setMeasureMode] = useState<boolean>(false);
  const [measurePoints, setMeasurePoints] = useState<SnapPoint[]>([]);
  const [snapHover, setSnapHover] = useState<ActiveSnapHover | null>(null);

  const hasAutoFittedRef = useRef(false);
  const lastMiddleClickRef = useRef<number>(0);
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);

  // 60fps ループ参照用 Refs
  const quadViewRef = useRef(displayOptions.quadView);
  quadViewRef.current = displayOptions.quadView;
  const traceClipRef = useRef(displayOptions.traceClipFuture);
  traceClipRef.current = displayOptions.traceClipFuture;
  const showToolModelRef = useRef(displayOptions.showToolModel);
  showToolModelRef.current = displayOptions.showToolModel;
  const navModeRef = useRef<NavMode>(navMode);
  navModeRef.current = navMode;
  const bboxRef = useRef(boundingBox);
  bboxRef.current = boundingBox;
  const compSegsRef = useRef(compensatedSegments);
  compSegsRef.current = compensatedSegments;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const speedRef = useRef(playbackSpeed);
  speedRef.current = playbackSpeed;
  const breakpointsRef = useRef(breakpoints);
  breakpointsRef.current = breakpoints;
  const autoBreakRef = useRef(autoBreak);
  autoBreakRef.current = autoBreak;
  const diagnosticsRef = useRef(diagnostics);
  diagnosticsRef.current = diagnostics;
  const callbacksRef = useRef({ onSelectSegmentIndex, onStopPlay, onBreakHit });
  callbacksRef.current = { onSelectSegmentIndex, onStopPlay, onBreakHit };

  const simRef = useRef({ segIdx: 0, simTimeSec: 0, lastReportedIdx: -1 });

  // フィルタ適用済みセグメント
  const visibleCompSegments = useMemo(() => {
    const hiddenT = new Set(displayOptions.hiddenTools);
    const hiddenD = new Set(displayOptions.hiddenDNumbers);
    const hiddenP = new Set(displayOptions.hiddenPrograms);
    return compensatedSegments.filter((s) => {
      if (hiddenT.has(s.toolNumber)) return false;
      if (s.dNumber > 0 && hiddenD.has(s.dNumber)) return false;
      if (hiddenP.has(s.programNumber)) return false;
      if (
        !displayOptions.showRapid &&
        (s.motionType === "rapid" || s.motionType === "canned_rapid")
      ) {
        return false;
      }
      if (!segmentMatchesZSlice(s, displayOptions)) return false;
      return s.points.length >= 2;
    });
  }, [compensatedSegments, displayOptions]);

  const visibleProgramSegments = useMemo(() => {
    const hiddenT = new Set(displayOptions.hiddenTools);
    const hiddenD = new Set(displayOptions.hiddenDNumbers);
    const hiddenP = new Set(displayOptions.hiddenPrograms);
    return programSegments.filter((s) => {
      if (hiddenT.has(s.toolNumber)) return false;
      if (s.dNumber > 0 && hiddenD.has(s.dNumber)) return false;
      if (hiddenP.has(s.programNumber)) return false;
      if (s.compMode === "Off") return false;
      if (!segmentMatchesZSlice(s, displayOptions)) return false;
      return s.points.length >= 2;
    });
  }, [programSegments, displayOptions]);

  const snapPoints = useMemo(() => extractSnapPoints(visibleCompSegments), [visibleCompSegments]);
  const pickableRef = useRef<PathSegment[]>([]);
  pickableRef.current = visibleCompSegments;
  const snapPointsRef = useRef<SnapPoint[]>([]);
  snapPointsRef.current = snapPoints;

  /** O(1) GPU setDrawRange + 3D工具座標更新 */
  const applyVisualFrame = (segIdx: number, progress: number, displayTimeSec: number) => {
    const segs = compSegsRef.current;
    const handles = pathHandlesRef.current;
    const toolGroup = toolGroupRef.current;
    const tipLine = activeTipLineRef.current;

    if (liveTimeTextRef.current) {
      liveTimeTextRef.current.textContent = formatDuration(displayTimeSec);
    }
    if (segs.length === 0) {
      if (toolGroup) toolGroup.visible = false;
      if (tipLine) tipLine.visible = false;
      return;
    }

    const clampedIdx = Math.max(0, Math.min(segs.length - 1, segIdx));
    const seg = segs[clampedIdx];
    const isComplete = clampedIdx === segs.length - 1 && progress >= 0.999;

    if (handles) {
      const cutCount = isComplete
        ? handles.cutVertsAfter[clampedIdx]
        : handles.cutVertsBefore[clampedIdx];
      const rapidCount = isComplete
        ? handles.rapidVertsAfter[clampedIdx]
        : handles.rapidVertsBefore[clampedIdx];

      handles.cutActiveLine?.geometry.setDrawRange(0, cutCount);
      handles.rapidActiveLine?.geometry.setDrawRange(0, rapidCount);

      const showDim = !traceClipRef.current && !isComplete;
      if (handles.cutDimLine) handles.cutDimLine.visible = showDim;
      if (handles.rapidDimLine) handles.rapidDimLine.visible = showDim;
    }

    const { pos, partial } = samplePolylineAt(seg.points, progress);

    // 実機CNC風 DRO を 60fps リアルタイム更新
    if (droXRef.current) droXRef.current.textContent = pos.x.toFixed(3);
    if (droYRef.current) droYRef.current.textContent = pos.y.toFixed(3);
    if (droZRef.current) droZRef.current.textContent = pos.z.toFixed(3);
    if (droFeedRef.current) droFeedRef.current.textContent = `F${seg.feedRate.toFixed(0)}`;
    if (droSpindleRef.current) {
      droSpindleRef.current.textContent = `S${seg.spindleSpeed.toFixed(0)}`;
    }
    if (droToolRef.current) {
      droToolRef.current.textContent = `T${String(seg.toolNumber).padStart(2, "0")}`;
    }
    if (droMotionRef.current) {
      droMotionRef.current.textContent =
        seg.modalState.compMode !== "Off"
          ? `${seg.modalState.motionCode} ${seg.modalState.compMode === "Left" ? "G41" : "G42"}`
          : seg.modalState.motionCode;
    }

    if (tipLine) {
      if (partial.length >= 2) {
        tipLine.geometry.setFromPoints(partial);
        tipLine.visible = true;
      } else {
        tipLine.visible = false;
      }
    }

    if (toolGroup) {
      toolGroup.visible = showToolModelRef.current;
      if (showToolModelRef.current) {
        const dia = seg.modalState.toolDiameter > 0 ? seg.modalState.toolDiameter : 6.0;
        const shape: ToolShape = seg.modalState.toolShape || "endmill";
        const key = `${dia.toFixed(3)}:${shape}`;
        if (toolBuiltKeyRef.current !== key) {
          rebuildToolMeshes(toolGroup, dia, shape);
          toolBuiltKeyRef.current = key;
        }
        toolGroup.position.set(pos.x, pos.y, pos.z);
      }
    }
  };

  useEffect(() => {
    const segs = compensatedSegments;
    if (segs.length === 0) return;
    const idx = Math.max(0, Math.min(segs.length - 1, activeSegmentIndex));
    if (isPlayingRef.current && simRef.current.lastReportedIdx === idx) return;

    const seg = segs[idx];
    simRef.current.segIdx = idx;
    simRef.current.lastReportedIdx = idx;
    simRef.current.simTimeSec = seg.cumulativeTimeSec;
    applyVisualFrame(idx, 1.0, seg.cumulativeTimeSec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSegmentIndex, compensatedSegments]);

  useEffect(() => {
    if (!isPlaying) return;
    const segs = compensatedSegments;
    if (segs.length === 0) return;
    const idx = Math.max(0, Math.min(segs.length - 1, activeSegmentIndex));
    simRef.current.segIdx = idx;
    simRef.current.lastReportedIdx = idx;
    simRef.current.simTimeSec = idx === 0 ? 0 : segs[idx].cumulativeTimeSec;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  const applyCameraPreset = (preset: CameraPreset | "fit") => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const container = mountRef.current;
    if (!camera || !controls) return;

    const bb = bboxRef.current;
    const min = bb.valid ? bb.min : { x: -50, y: -50, z: -20 };
    const max = bb.valid ? bb.max : { x: 100, y: 100, z: 50 };
    const cx = (min.x + max.x) * 0.5;
    const cy = (min.y + max.y) * 0.5;
    const cz = (min.z + max.z) * 0.5;

    const sizeX = Math.max(max.x - min.x, 10);
    const sizeY = Math.max(max.y - min.y, 10);
    const sizeZ = Math.max(max.z - min.z, 10);

    // ウィンドウ縦横比と視野角 (FOV) を考慮して、バウンディングスフィア全体が必ず収まる距離を算出
    const aspect = container
      ? container.clientWidth / Math.max(1, container.clientHeight)
      : camera.aspect || 1.3;
    camera.aspect = aspect;
    const vFovRad = (camera.fov * Math.PI) / 180;
    const hFovRad = 2 * Math.atan(Math.tan(vFovRad * 0.5) * aspect);
    const halfMinFov = Math.min(vFovRad, hFovRad) * 0.5;

    const radius = Math.max(Math.hypot(sizeX, sizeY, sizeZ) * 0.5, 25);
    // 上部HUD・下部トレースバー分の余白も含めて 1.25倍の余裕を確保
    const dist = (radius / Math.max(0.15, Math.sin(halfMinFov))) * 1.25;

    // fit 用に、target を書き換える前の現在の視線方向ベクトルを保存
    const prevDir = camera.position.clone().sub(controls.target);

    controls.target.set(cx, cy, cz);
    if (preset === "top") {
      camera.position.set(cx, cy - 0.001, cz + dist);
    } else if (preset === "front") {
      camera.position.set(cx, cy - dist, cz);
    } else if (preset === "right") {
      camera.position.set(cx + dist, cy, cz);
    } else if (preset === "fit") {
      if (prevDir.lengthSq() < 1e-4) {
        const isoDir = new THREE.Vector3(0.65, -0.78, 0.65).normalize();
        camera.position.set(cx + isoDir.x * dist, cy + isoDir.y * dist, cz + isoDir.z * dist);
      } else {
        prevDir.normalize().multiplyScalar(dist);
        camera.position.set(cx + prevDir.x, cy + prevDir.y, cz + prevDir.z);
      }
    } else {
      const isoDir = new THREE.Vector3(0.65, -0.78, 0.65).normalize();
      camera.position.set(cx + isoDir.x * dist, cy + isoDir.y * dist, cz + isoDir.z * dist);
    }

    camera.near = Math.max(0.1, dist * 0.001);
    camera.far = Math.max(10000, dist * 25);
    camera.updateProjectionMatrix();
    controls.update();
  };

  const applyWindowZoom = (box: ZoomBox) => {
    const container = mountRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!container || !camera || !controls) return;

    const w = container.clientWidth;
    const h = Math.max(1, container.clientHeight);
    const bw = Math.abs(box.x1 - box.x0);
    const bh = Math.abs(box.y1 - box.y0);
    if (bw < 12 || bh < 12) return;

    const ndcX = (((box.x0 + box.x1) * 0.5) / w) * 2 - 1;
    const ndcY = -(((box.y0 + box.y1) * 0.5) / h) * 2 + 1;

    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const targetPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, controls.target);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const newTarget = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(targetPlane, newTarget)) return;

    const scale = Math.max(bw / w, bh / h, 0.08);
    const offset = camera.position.clone().sub(controls.target).multiplyScalar(scale);
    controls.target.copy(newTarget);
    camera.position.copy(newTarget).add(offset);
    controls.update();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (measureMode) {
          setMeasurePoints([]);
          setMeasureMode(false);
          setSnapHover(null);
        }
        if (navModeRef.current === "windowZoom") {
          setZoomBox(null);
          setNavMode("pan");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [measureMode]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.mouseButtons.LEFT =
      navMode === "windowZoom" ? null : navMode === "orbit" ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
  }, [navMode]);

  // 1. Three.js 初期化 & 60fps シミュレーションループ
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#141519");

    const camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      10000,
    );
    camera.up.set(0, 0, 1);
    camera.position.set(160, -170, 150);
    cameraRef.current = camera;

    const topCam = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 10000);
    topCam.up.set(0, 1, 0);
    const frontCam = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 10000);
    frontCam.up.set(0, 0, 1);
    const rightCam = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 10000);
    rightCam.up.set(0, 0, 1);
    orthoCamsRef.current = { top: topCam, front: frontCam, right: rightCam };

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.zoomSpeed = 1.15;
    controls.panSpeed = 1.0;
    controls.rotateSpeed = 0.85;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    controls.target.set(50, 40, 0);
    controls.update();
    controlsRef.current = controls;

    const onCanvasMouseDownCapture = (ev: MouseEvent) => {
      if (ev.button === 1) {
        ev.preventDefault();
        const now = performance.now();
        if (now - lastMiddleClickRef.current < 340) {
          lastMiddleClickRef.current = 0;
          applyCameraPreset("fit");
        } else {
          lastMiddleClickRef.current = now;
        }
      }
    };
    const onContextMenu = (ev: MouseEvent) => ev.preventDefault();
    renderer.domElement.addEventListener("mousedown", onCanvasMouseDownCapture, { capture: true });
    renderer.domElement.addEventListener("contextmenu", onContextMenu);

    const ambient = new THREE.AmbientLight(0xffffff, 0.78);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(120, -100, 200);
    scene.add(ambient, dirLight);

    const helperGroup = new THREE.Group();
    const pathGroup = new THREE.Group();
    const hoverGroup = new THREE.Group();
    const toolGroup = new THREE.Group();
    const measureGroup = new THREE.Group();

    const tipGeo = new THREE.BufferGeometry();
    const tipMat = new THREE.LineBasicMaterial({ color: 0xfef08a, depthTest: false });
    const tipLine = new THREE.Line(tipGeo, tipMat);
    tipLine.renderOrder = 10;
    tipLine.visible = false;

    scene.add(helperGroup, pathGroup, tipLine, hoverGroup, toolGroup, measureGroup);

    helperGroupRef.current = helperGroup;
    pathGroupRef.current = pathGroup;
    activeTipLineRef.current = tipLine;
    hoverGroupRef.current = hoverGroup;
    toolGroupRef.current = toolGroup;
    measureGroupRef.current = measureGroup;

    const checkBreak = (prevSeg: PathSegment | undefined, nextSeg: PathSegment): string | null => {
      if (
        breakpointsRef.current.includes(nextSeg.lineNumber) &&
        prevSeg?.lineNumber !== nextSeg.lineNumber
      ) {
        return `行 ${nextSeg.lineNumber} (手動ブレイクポイント)`;
      }
      const ab = autoBreakRef.current;
      if (
        ab.onErrorLine &&
        prevSeg?.lineNumber !== nextSeg.lineNumber &&
        diagnosticsRef.current.some(
          (d) => d.severity === "error" && d.lineNumber === nextSeg.lineNumber,
        )
      ) {
        return `行 ${nextSeg.lineNumber} (診断エラー検出行)`;
      }
      if (
        ab.onToolChange &&
        (nextSeg.motionType === "tool_change" ||
          (prevSeg && prevSeg.toolNumber !== nextSeg.toolNumber))
      ) {
        return `行 ${nextSeg.lineNumber} (工具交換 T${String(nextSeg.toolNumber).padStart(2, "0")})`;
      }
      if (ab.onZPlunge && prevSeg && prevSeg.end.z >= 0 && nextSeg.end.z < 0) {
        return `行 ${nextSeg.lineNumber} (Zマイナス突入 Z${nextSeg.end.z.toFixed(2)})`;
      }
      if (ab.onCompChange && prevSeg && prevSeg.compMode !== nextSeg.compMode) {
        return `行 ${nextSeg.lineNumber} (径補正切替: ${compModeLabel(nextSeg.compMode)})`;
      }
      return null;
    };

    let rafId = 0;
    let lastTs = performance.now();

    const animate = (now: number) => {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;

      if (isPlayingRef.current) {
        const segs = compSegsRef.current;
        if (segs.length > 0) {
          const sim = simRef.current;
          const totalTime = segs[segs.length - 1].cumulativeTimeSec;
          const nextTime = Math.min(totalTime, sim.simTimeSec + dt * speedRef.current);

          let idx = sim.segIdx;
          let broke = false;

          while (idx < segs.length - 1 && segs[idx].cumulativeTimeSec <= nextTime) {
            const nextIdx = idx + 1;
            const hit = checkBreak(segs[idx], segs[nextIdx]);
            idx = nextIdx;
            if (hit) {
              const prevEnd = segs[idx - 1].cumulativeTimeSec;
              sim.segIdx = idx;
              sim.simTimeSec = prevEnd;
              sim.lastReportedIdx = idx;
              applyVisualFrame(idx, 0.0, prevEnd);
              callbacksRef.current.onBreakHit(idx, hit);
              broke = true;
              break;
            }
          }

          if (!broke) {
            sim.segIdx = idx;
            sim.simTimeSec = nextTime;
            const seg = segs[idx];
            const prevCum = idx > 0 ? segs[idx - 1].cumulativeTimeSec : 0;
            const progress =
              seg.durationSec > 1e-6
                ? Math.max(0, Math.min(1, (nextTime - prevCum) / seg.durationSec))
                : 1;

            applyVisualFrame(idx, progress, nextTime);

            if (seg.spindleSpeed > 0 && toolGroup.visible) {
              const flute = toolGroup.getObjectByName("spindle_flute");
              if (flute) {
                flute.rotation.z -= dt * Math.min(45, (seg.spindleSpeed / 60) * 0.25 + 6);
              }
            }

            if (sim.lastReportedIdx !== idx) {
              sim.lastReportedIdx = idx;
              callbacksRef.current.onSelectSegmentIndex(idx, true);
            }

            if (nextTime >= totalTime - 1e-6 && idx >= segs.length - 1) {
              applyVisualFrame(segs.length - 1, 1.0, totalTime);
              callbacksRef.current.onStopPlay();
            }
          }
        }
      }

      controls.update();

      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);

      if (!quadViewRef.current) {
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
      } else {
        const hw = Math.floor(w / 2);
        const hh = Math.floor(h / 2);
        const aspect = hw / Math.max(1, hh);

        const bb = bboxRef.current;
        const min = bb.valid ? bb.min : { x: -50, y: -50, z: -20 };
        const max = bb.valid ? bb.max : { x: 100, y: 100, z: 50 };
        const cx = (min.x + max.x) * 0.5;
        const cy = (min.y + max.y) * 0.5;
        const cz = (min.z + max.z) * 0.5;
        const halfH = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 60) * 0.68;
        const halfW = halfH * aspect;
        const dist = Math.max(halfH * 6, 400);

        const updateOrtho = (cam: THREE.OrthographicCamera, pos: [number, number, number]) => {
          cam.left = -halfW;
          cam.right = halfW;
          cam.top = halfH;
          cam.bottom = -halfH;
          cam.near = 0.1;
          cam.far = dist * 4;
          cam.position.set(pos[0], pos[1], pos[2]);
          cam.lookAt(cx, cy, cz);
          cam.updateProjectionMatrix();
        };

        renderer.setScissorTest(true);

        updateOrtho(topCam, [cx, cy, cz + dist]);
        renderer.setViewport(0, hh, hw, h - hh);
        renderer.setScissor(0, hh, hw, h - hh);
        renderer.render(scene, topCam);

        camera.aspect = (w - hw) / Math.max(1, h - hh);
        camera.updateProjectionMatrix();
        renderer.setViewport(hw, hh, w - hw, h - hh);
        renderer.setScissor(hw, hh, w - hw, h - hh);
        renderer.render(scene, camera);

        updateOrtho(frontCam, [cx, cy - dist, cz]);
        renderer.setViewport(0, 0, hw, hh);
        renderer.setScissor(0, 0, hw, hh);
        renderer.render(scene, frontCam);

        updateOrtho(rightCam, [cx + dist, cy, cz]);
        renderer.setViewport(hw, 0, w - hw, hh);
        renderer.setScissor(hw, 0, w - hw, hh);
        renderer.render(scene, rightCam);
      }
    };
    rafId = requestAnimationFrame(animate);

    const ro = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      setViewportSize({ width: w, height: h });
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.domElement.removeEventListener("mousedown", onCanvasMouseDownCapture, {
        capture: true,
      });
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      tipGeo.dispose();
      tipMat.dispose();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. グリッド・座標軸・バウンディングボックス
  useEffect(() => {
    const helperGroup = helperGroupRef.current;
    if (!helperGroup) return;
    disposeGroupChildren(helperGroup);

    const span = boundingBox.valid
      ? Math.max(
          boundingBox.max.x - boundingBox.min.x,
          boundingBox.max.y - boundingBox.min.y,
          100,
        )
      : 200;
    const gridSize = Math.ceil((span * 1.8) / 50) * 50;
    const divisions = Math.max(10, Math.min(80, Math.round(gridSize / 10)));

    if (displayOptions.showGrid) {
      const grid = new THREE.GridHelper(gridSize, divisions, 0x333946, 0x20232b);
      grid.rotation.x = Math.PI / 2;
      if (boundingBox.valid) {
        grid.position.set(
          Math.round(((boundingBox.min.x + boundingBox.max.x) * 0.5) / 10) * 10,
          Math.round(((boundingBox.min.y + boundingBox.max.y) * 0.5) / 10) * 10,
          0,
        );
      }
      helperGroup.add(grid);
    }

    helperGroup.add(new THREE.AxesHelper(Math.max(30, span * 0.25)));

    if (displayOptions.showBoundingBox && boundingBox.valid) {
      const box3 = new THREE.Box3(
        new THREE.Vector3(boundingBox.min.x, boundingBox.min.y, boundingBox.min.z),
        new THREE.Vector3(boundingBox.max.x, boundingBox.max.y, boundingBox.max.z),
      );
      helperGroup.add(new THREE.Box3Helper(box3, new THREE.Color("#f59e0b")));
    }

    if (boundingBox.valid && !hasAutoFittedRef.current) {
      hasAutoFittedRef.current = true;
      applyCameraPreset("iso");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundingBox, displayOptions.showGrid, displayOptions.showBoundingBox]);

  useEffect(() => {
    if (!cameraCommand) return;
    applyCameraPreset(cameraCommand.preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraCommand]);

  // 3. ツールパス GPU バッファ 1回構築
  useEffect(() => {
    const pathGroup = pathGroupRef.current;
    if (!pathGroup) return;
    disposeGroupChildren(pathGroup);
    pathHandlesRef.current = null;

    if (displayOptions.showToolWidthFill) {
      const fillMesh = buildToolWidthFillMesh(visibleCompSegments, displayOptions.colorByTool);
      if (fillMesh) pathGroup.add(fillMesh);
    }

    const totalCount = compensatedSegments.length;
    const cutVertsBefore = new Int32Array(totalCount);
    const cutVertsAfter = new Int32Array(totalCount);
    const rapidVertsBefore = new Int32Array(totalCount);
    const rapidVertsAfter = new Int32Array(totalCount);

    let cutActiveLine: THREE.LineSegments | null = null;
    let cutDimLine: THREE.LineSegments | null = null;
    let rapidActiveLine: THREE.LineSegments | null = null;
    let rapidDimLine: THREE.LineSegments | null = null;

    if (displayOptions.showCompensatedPath && totalCount > 0) {
      const visibleIdSet = new Set(visibleCompSegments.map((s) => s.id));
      const cutPos: number[] = [];
      const cutCol: number[] = [];
      const cutDimCol: number[] = [];
      const rapidPos: number[] = [];
      const rapidCol: number[] = [];
      const rapidDimCol: number[] = [];
      let cutVertCursor = 0;
      let rapidVertCursor = 0;

      for (let idx = 0; idx < totalCount; idx++) {
        const seg = compensatedSegments[idx];
        cutVertsBefore[idx] = cutVertCursor;
        rapidVertsBefore[idx] = rapidVertCursor;

        if (visibleIdSet.has(seg.id) && seg.points.length >= 2) {
          const isRapid = seg.motionType === "rapid" || seg.motionType === "canned_rapid";
          const col = displayOptions.colorByTool
            ? new THREE.Color(getToolColor(seg.toolNumber))
            : getMotionColor(seg.motionType);
          const dim = col.clone().multiplyScalar(0.26);

          const targetPos = isRapid ? rapidPos : cutPos;
          const targetCol = isRapid ? rapidCol : cutCol;
          const targetDim = isRapid ? rapidDimCol : cutDimCol;

          for (let i = 0; i < seg.points.length - 1; i++) {
            const p0 = seg.points[i];
            const p1 = seg.points[i + 1];
            targetPos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
            targetCol.push(col.r, col.g, col.b, col.r, col.g, col.b);
            targetDim.push(dim.r, dim.g, dim.b, dim.r, dim.g, dim.b);
          }

          const addedVerts = (seg.points.length - 1) * 2;
          if (isRapid) rapidVertCursor += addedVerts;
          else cutVertCursor += addedVerts;
        }

        cutVertsAfter[idx] = cutVertCursor;
        rapidVertsAfter[idx] = rapidVertCursor;
      }

      if (cutPos.length > 0) {
        const posAttr = new THREE.Float32BufferAttribute(cutPos, 3);
        const dimGeo = new THREE.BufferGeometry();
        dimGeo.setAttribute("position", posAttr);
        dimGeo.setAttribute("color", new THREE.Float32BufferAttribute(cutDimCol, 3));
        cutDimLine = new THREE.LineSegments(
          dimGeo,
          new THREE.LineBasicMaterial({ vertexColors: true }),
        );
        pathGroup.add(cutDimLine);

        const actGeo = new THREE.BufferGeometry();
        actGeo.setAttribute("position", posAttr);
        actGeo.setAttribute("color", new THREE.Float32BufferAttribute(cutCol, 3));
        cutActiveLine = new THREE.LineSegments(
          actGeo,
          new THREE.LineBasicMaterial({ vertexColors: true }),
        );
        cutActiveLine.renderOrder = 2;
        pathGroup.add(cutActiveLine);
      }

      if (rapidPos.length > 0) {
        const posAttr = new THREE.Float32BufferAttribute(rapidPos, 3);
        const dimGeo = new THREE.BufferGeometry();
        dimGeo.setAttribute("position", posAttr);
        dimGeo.setAttribute("color", new THREE.Float32BufferAttribute(rapidDimCol, 3));
        rapidDimLine = new THREE.LineSegments(
          dimGeo,
          new THREE.LineDashedMaterial({
            vertexColors: true,
            dashSize: 3.5,
            gapSize: 2.5,
            transparent: true,
            opacity: 0.32,
          }),
        );
        rapidDimLine.computeLineDistances();
        pathGroup.add(rapidDimLine);

        const actGeo = new THREE.BufferGeometry();
        actGeo.setAttribute("position", posAttr);
        actGeo.setAttribute("color", new THREE.Float32BufferAttribute(rapidCol, 3));
        rapidActiveLine = new THREE.LineSegments(
          actGeo,
          new THREE.LineDashedMaterial({
            vertexColors: true,
            dashSize: 3.5,
            gapSize: 2.5,
            transparent: true,
            opacity: 0.65,
          }),
        );
        rapidActiveLine.computeLineDistances();
        rapidActiveLine.renderOrder = 2;
        pathGroup.add(rapidActiveLine);
      }
    }

    pathHandlesRef.current = {
      cutActiveLine,
      cutDimLine,
      rapidActiveLine,
      rapidDimLine,
      cutVertsBefore,
      cutVertsAfter,
      rapidVertsBefore,
      rapidVertsAfter,
    };

    if (displayOptions.showProgramPath && visibleProgramSegments.length > 0) {
      const progPos: number[] = [];
      for (const seg of visibleProgramSegments) {
        for (let i = 0; i < seg.points.length - 1; i++) {
          const p0 = seg.points[i];
          const p1 = seg.points[i + 1];
          progPos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
        }
      }
      if (progPos.length > 0) {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.Float32BufferAttribute(progPos, 3));
        const mat = new THREE.LineDashedMaterial({
          color: 0xe879f9,
          dashSize: 2.0,
          gapSize: 1.5,
          transparent: true,
          opacity: 0.72,
        });
        const lines = new THREE.LineSegments(geom, mat);
        lines.computeLineDistances();
        pathGroup.add(lines);
      }
    }

    const idx = Math.max(0, Math.min(compensatedSegments.length - 1, activeSegmentIndex));
    applyVisualFrame(idx, 1.0, compensatedSegments[idx]?.cumulativeTimeSec ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    visibleCompSegments,
    visibleProgramSegments,
    compensatedSegments,
    displayOptions.showCompensatedPath,
    displayOptions.showProgramPath,
    displayOptions.showToolWidthFill,
    displayOptions.colorByTool,
  ]);

  useEffect(() => {
    const idx = Math.max(0, Math.min(compensatedSegments.length - 1, activeSegmentIndex));
    applyVisualFrame(idx, isPlaying ? 0.5 : 1.0, compensatedSegments[idx]?.cumulativeTimeSec ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayOptions.traceClipFuture, displayOptions.showToolModel]);

  // 4. マウスオーバー中パスのハイライト描画
  useEffect(() => {
    const hg = hoverGroupRef.current;
    if (!hg) return;
    disposeGroupChildren(hg);

    const seg = hoverInfo?.segment;
    if (!seg || seg.points.length < 2) return;

    const pts = seg.points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }),
    );
    line.renderOrder = 15;
    hg.add(line);

    const span = boundingBox.valid
      ? Math.max(boundingBox.max.x - boundingBox.min.x, boundingBox.max.y - boundingBox.min.y, 80)
      : 100;
    const dotR = Math.max(0.55, span * 0.0055);

    const startDot = new THREE.Mesh(
      new THREE.SphereGeometry(dotR, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x4ade80, depthTest: false }),
    );
    startDot.position.set(seg.start.x, seg.start.y, seg.start.z);
    startDot.renderOrder = 16;

    const endDot = new THREE.Mesh(
      new THREE.SphereGeometry(dotR * 1.15, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }),
    );
    endDot.position.set(seg.end.x, seg.end.y, seg.end.z);
    endDot.renderOrder = 16;

    hg.add(startDot, endDot);

    // 円弧補間 (G02/G03) の場合は円の中心マーカー（クロス＋球）と始終点への半径ガイド破線を表示
    if (seg.arcCenter) {
      const c = seg.arcCenter;
      const cVec = new THREE.Vector3(c.x, c.y, c.z);

      const centerDot = new THREE.Mesh(
        new THREE.SphereGeometry(dotR * 1.2, 14, 14),
        new THREE.MeshBasicMaterial({ color: 0xfacc15, depthTest: false }),
      );
      centerDot.position.copy(cVec);
      centerDot.renderOrder = 17;

      // 中心十字クロス
      const crossSize = Math.max(dotR * 3.2, 2.0);
      const crossPts = [
        new THREE.Vector3(c.x - crossSize, c.y, c.z),
        new THREE.Vector3(c.x + crossSize, c.y, c.z),
        new THREE.Vector3(c.x, c.y - crossSize, c.z),
        new THREE.Vector3(c.x, c.y + crossSize, c.z),
      ];
      const crossLines = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(crossPts),
        new THREE.LineBasicMaterial({ color: 0xfacc15, depthTest: false }),
      );
      crossLines.renderOrder = 17;

      // 中心→始点 / 中心→終点 の半径ガイド破線
      const guidePts = [
        cVec,
        new THREE.Vector3(seg.start.x, seg.start.y, seg.start.z),
        cVec,
        new THREE.Vector3(seg.end.x, seg.end.y, seg.end.z),
      ];
      const guideLines = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(guidePts),
        new THREE.LineDashedMaterial({
          color: 0xfde047,
          dashSize: Math.max(1.5, dotR * 2),
          gapSize: Math.max(1.2, dotR * 1.6),
          transparent: true,
          opacity: 0.72,
          depthTest: false,
        }),
      );
      guideLines.computeLineDistances();
      guideLines.renderOrder = 14;

      hg.add(centerDot, crossLines, guideLines);
    }
  }, [hoverInfo?.segment, boundingBox]);

  // 5. スナップ計測3Dオーバーレイ
  useEffect(() => {
    const mg = measureGroupRef.current;
    if (!mg) return;
    disposeGroupChildren(mg);

    const addMarker = (pos: Point3, color: number, radius: number) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 16),
        new THREE.MeshBasicMaterial({ color, depthTest: false }),
      );
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.renderOrder = 20;
      mg.add(mesh);
    };

    const span = boundingBox.valid
      ? Math.max(boundingBox.max.x - boundingBox.min.x, boundingBox.max.y - boundingBox.min.y, 80)
      : 100;
    const markerR = Math.max(0.8, span * 0.008);

    if (snapHover && measureMode) {
      const color =
        snapHover.snap.kind === "endpoint"
          ? 0xfacc15
          : snapHover.snap.kind === "midpoint"
            ? 0x38bdf8
            : 0x4ade80;
      addMarker(snapHover.snap.pos, color, markerR * 1.1);
    }

    for (const mp of measurePoints) addMarker(mp.pos, 0xf97316, markerR * 1.25);

    if (measurePoints.length === 2) {
      const [p0, p1] = [measurePoints[0].pos, measurePoints[1].pos];
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(p0.x, p0.y, p0.z),
          new THREE.Vector3(p1.x, p1.y, p1.z),
        ]),
        new THREE.LineBasicMaterial({ color: 0xf97316, depthTest: false }),
      );
      line.renderOrder = 19;
      mg.add(line);
    } else if (measurePoints.length === 1 && snapHover && measureMode) {
      const [p0, p1] = [measurePoints[0].pos, snapHover.snap.pos];
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(p0.x, p0.y, p0.z),
          new THREE.Vector3(p1.x, p1.y, p1.z),
        ]),
        new THREE.LineDashedMaterial({
          color: 0xfdba74,
          dashSize: 2,
          gapSize: 2,
          depthTest: false,
        }),
      );
      line.computeLineDistances();
      line.renderOrder = 19;
      mg.add(line);
    }
  }, [measurePoints, snapHover, measureMode, boundingBox]);

  // ピッキングヘルパー
  const resolveActiveViewport = (clientX: number, clientY: number) => {
    const container = mountRef.current;
    const camera = cameraRef.current;
    if (!container || !camera) return null;

    const rect = container.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;

    if (!quadViewRef.current) {
      return { cam: camera as THREE.Camera, vx: 0, vy: 0, vw: rect.width, vh: rect.height, mx, my };
    }
    const hw = rect.width / 2;
    const hh = rect.height / 2;
    const orthos = orthoCamsRef.current;
    if (!orthos) return null;

    if (mx < hw && my < hh) return { cam: orthos.top as THREE.Camera, vx: 0, vy: 0, vw: hw, vh: hh, mx, my };
    if (mx >= hw && my < hh) return { cam: camera as THREE.Camera, vx: hw, vy: 0, vw: hw, vh: hh, mx, my };
    if (mx < hw && my >= hh) return { cam: orthos.front as THREE.Camera, vx: 0, vy: hh, vw: hw, vh: hh, mx, my };
    return { cam: orthos.right as THREE.Camera, vx: hw, vy: hh, vw: hw, vh: hh, mx, my };
  };

  const pickSnapPointAt = (clientX: number, clientY: number): ActiveSnapHover | null => {
    const vp = resolveActiveViewport(clientX, clientY);
    if (!vp) return null;

    const v = new THREE.Vector3();
    let best: SnapPoint | null = null;
    let bestDist = 18.0;

    for (const sp of snapPointsRef.current) {
      v.set(sp.pos.x, sp.pos.y, sp.pos.z).project(vp.cam);
      if (v.z > 1) continue;
      const sx = vp.vx + (v.x * 0.5 + 0.5) * vp.vw;
      const sy = vp.vy + (-v.y * 0.5 + 0.5) * vp.vh;
      const d = Math.hypot(vp.mx - sx, vp.my - sy);
      if (d < bestDist) {
        bestDist = d;
        best = sp;
      }
    }
    return best ? { snap: best, x: vp.mx, y: vp.my } : null;
  };

  const pickSegmentAt = (clientX: number, clientY: number): PathSegment | null => {
    const vp = resolveActiveViewport(clientX, clientY);
    if (!vp) return null;

    const v0 = new THREE.Vector3();
    const v1 = new THREE.Vector3();
    let bestSeg: PathSegment | null = null;
    let bestDist = 11.0;

    const segs = pickableRef.current;
    const stride = segs.length > 25000 ? Math.ceil(segs.length / 25000) : 1;

    for (let sIdx = 0; sIdx < segs.length; sIdx += stride) {
      const seg = segs[sIdx];
      const pts = seg.points;
      const ptStride = pts.length > 16 ? Math.ceil(pts.length / 16) : 1;
      for (let i = 0; i < pts.length - 1; i += ptStride) {
        const j = Math.min(pts.length - 1, i + ptStride);
        v0.set(pts[i].x, pts[i].y, pts[i].z).project(vp.cam);
        v1.set(pts[j].x, pts[j].y, pts[j].z).project(vp.cam);
        if (v0.z > 1 && v1.z > 1) continue;

        const sx0 = vp.vx + (v0.x * 0.5 + 0.5) * vp.vw;
        const sy0 = vp.vy + (-v0.y * 0.5 + 0.5) * vp.vh;
        const sx1 = vp.vx + (v1.x * 0.5 + 0.5) * vp.vw;
        const sy1 = vp.vy + (-v1.y * 0.5 + 0.5) * vp.vh;

        const d = distToSegment2D(vp.mx, vp.my, sx0, sy0, sx1, sy1);
        if (d < bestDist) {
          bestDist = d;
          bestSeg = seg;
        }
      }
    }
    return bestSeg;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoomBox) {
      const rect = e.currentTarget.getBoundingClientRect();
      setZoomBox((prev) =>
        prev ? { ...prev, x1: e.clientX - rect.left, y1: e.clientY - rect.top } : null,
      );
      return;
    }
    if (e.buttons !== 0) {
      if (hoverInfo) setHoverInfo(null);
      if (snapHover) setSnapHover(null);
      return;
    }
    if (measureMode) {
      setHoverInfo(null);
      setSnapHover(pickSnapPointAt(e.clientX, e.clientY));
      return;
    }
    const seg = pickSegmentAt(e.clientX, e.clientY);
    if (seg) {
      const rect = e.currentTarget.getBoundingClientRect();
      setHoverInfo({ segment: seg, x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else if (hoverInfo) {
      setHoverInfo(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    if (navMode === "windowZoom" && e.button === 0 && !measureMode) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setZoomBox({ x0: x, y0: y, x1: x, y1: y });
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoomBox) {
      const finished = zoomBox;
      setZoomBox(null);
      applyWindowZoom(finished);
      pointerDownPosRef.current = null;
      return;
    }
    const start = pointerDownPosRef.current;
    pointerDownPosRef.current = null;
    if (!start || e.button !== 0 || Math.hypot(e.clientX - start.x, e.clientY - start.y) >= 4) {
      return;
    }
    if (measureMode) {
      const found = pickSnapPointAt(e.clientX, e.clientY);
      if (found) setMeasurePoints((prev) => (prev.length >= 2 ? [found.snap] : [...prev, found.snap]));
      return;
    }
    const seg = pickSegmentAt(e.clientX, e.clientY);
    if (seg) {
      const idx = compensatedSegments.findIndex((s) => s.id === seg.id);
      if (idx >= 0) onSelectSegmentIndex(idx, false);
    }
  };

  const measurementStats = useMemo(() => {
    if (measurePoints.length < 2) return null;
    const [a, b] = [measurePoints[0].pos, measurePoints[1].pos];
    const [dx, dy, dz] = [b.x - a.x, b.y - a.y, b.z - a.z];
    return {
      a,
      b,
      dx,
      dy,
      dz,
      dist3d: Math.hypot(dx, dy, dz),
      distXY: Math.hypot(dx, dy),
      angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
    };
  }, [measurePoints]);

  return (
    <div className="relative h-full w-full bg-[#141519] overflow-hidden">
      <div
        ref={mountRef}
        className={`h-full w-full ${
          measureMode
            ? "cursor-crosshair"
            : navMode === "windowZoom"
              ? "cursor-zoom-in"
              : navMode === "orbit"
                ? "cursor-move"
                : "cursor-grab active:cursor-grabbing"
        }`}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          setHoverInfo(null);
          setSnapHover(null);
          setZoomBox(null);
        }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      />

      <ViewportOverlays
        containerWidth={viewportSize.width}
        containerHeight={viewportSize.height}
        displayOptions={displayOptions}
        onUpdateDisplayOptions={onUpdateDisplayOptions}
        navMode={navMode}
        onSelectNavMode={(mode) => {
          setMeasureMode(false);
          setMeasurePoints([]);
          setSnapHover(null);
          setNavMode(mode);
        }}
        measureMode={measureMode}
        onToggleMeasureMode={() =>
          setMeasureMode((v) => {
            if (v) {
              setMeasurePoints([]);
              setSnapHover(null);
            }
            return !v;
          })
        }
        measurePoints={measurePoints}
        onClearMeasurePoints={() => setMeasurePoints([])}
        measurementStats={measurementStats}
        snapHover={snapHover}
        hoverInfo={hoverInfo}
        zoomBox={zoomBox}
        droRefs={droRefs}
        isViewportMaximized={isViewportMaximized}
        onToggleMaximizeViewport={onToggleMaximizeViewport}
        onApplyCameraPreset={applyCameraPreset}
      />

      <TraceBar
        totalSteps={compensatedSegments.length}
        activeSegmentIndex={activeSegmentIndex}
        currentSegment={compensatedSegments[activeSegmentIndex] ?? null}
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        breakReason={breakReason}
        liveTimeTextRef={liveTimeTextRef}
        onSelectSegmentIndex={onSelectSegmentIndex}
        onTogglePlay={onTogglePlay}
        onChangePlaybackSpeed={onChangePlaybackSpeed}
      />
    </div>
  );
};
