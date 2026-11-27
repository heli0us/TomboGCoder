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
  extractSnapPoints,
  getMotionColor,
  getSegmentSnapPoints,
  projectToSegment2D,
  rebuildToolMeshes,
  samplePolylineAt,
  segmentMatchesZSlice,
  updateScreenSpaceMarkers,
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
  skipToolChangeTime: boolean;
  onToggleSkipToolChangeTime: () => void;
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
  skipToolChangeTime,
  onToggleSkipToolChangeTime,
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
  const stockGroupRef = useRef<THREE.Group | null>(null);
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
  const [measureHoverSeg, setMeasureHoverSeg] = useState<PathSegment | null>(null);
  const [navMode, setNavMode] = useState<NavMode>("pan");
  const [zoomBox, setZoomBox] = useState<ZoomBox | null>(null);
  const [measureMode, setMeasureMode] = useState<boolean>(false);
  const [measurePoints, setMeasurePoints] = useState<SnapPoint[]>([]);
  const [measureAnchor, setMeasureAnchor] = useState<{ x: number; y: number } | null>(null);
  const [snapHover, setSnapHover] = useState<ActiveSnapHover | null>(null);

  const hasAutoFittedRef = useRef(false);
  const lastMiddleClickRef = useRef<number>(0);
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);

  // 60fps ループ参照用 Refs
  const viewLayoutRef = useRef(displayOptions.viewLayout);
  viewLayoutRef.current = displayOptions.viewLayout;
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
  const skipAtcRef = useRef(skipToolChangeTime);
  skipAtcRef.current = skipToolChangeTime;
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

  /** O(1) GPU setDrawRange + 3D工具座標更新（step=0 は加工終了後の全軌道表示、1..N は各ブロック） */
  const applyVisualFrame = (step: number, progress: number, displayTimeSec: number) => {
    const segs = compSegsRef.current;
    const handles = pathHandlesRef.current;
    const toolGroup = toolGroupRef.current;
    const tipLine = activeTipLineRef.current;

    if (segs.length === 0) {
      if (liveTimeTextRef.current) liveTimeTextRef.current.textContent = formatDuration(0);
      if (toolGroup) toolGroup.visible = false;
      if (tipLine) tipLine.visible = false;
      return;
    }

    // step === 0: 加工終了後（全軌道表示・工具非表示で全体見やすく）
    if (step <= 0) {
      const lastIdx = segs.length - 1;
      const lastSeg = segs[lastIdx];
      if (liveTimeTextRef.current) {
        liveTimeTextRef.current.textContent = formatDuration(lastSeg.cumulativeTimeSec);
      }
      if (handles) {
        handles.cutActiveLine?.geometry.setDrawRange(0, handles.cutVertsAfter[lastIdx]);
        handles.rapidActiveLine?.geometry.setDrawRange(0, handles.rapidVertsAfter[lastIdx]);
        if (handles.cutDimLine) handles.cutDimLine.visible = false;
        if (handles.rapidDimLine) handles.rapidDimLine.visible = false;
      }
      if (tipLine) tipLine.visible = false;
      if (toolGroup) toolGroup.visible = false;

      if (droXRef.current) droXRef.current.textContent = lastSeg.end.x.toFixed(3);
      if (droYRef.current) droYRef.current.textContent = lastSeg.end.y.toFixed(3);
      if (droZRef.current) droZRef.current.textContent = lastSeg.end.z.toFixed(3);
      if (droFeedRef.current) droFeedRef.current.textContent = `F${lastSeg.feedRate.toFixed(0)}`;
      if (droSpindleRef.current) {
        droSpindleRef.current.textContent = `S${lastSeg.spindleSpeed.toFixed(0)}`;
      }
      if (droToolRef.current) {
        droToolRef.current.textContent = `T${String(lastSeg.toolNumber).padStart(2, "0")}`;
      }
      if (droMotionRef.current) {
        droMotionRef.current.textContent = "完了";
      }
      return;
    }

    if (liveTimeTextRef.current) {
      liveTimeTextRef.current.textContent = formatDuration(displayTimeSec);
    }

    const clampedIdx = Math.max(0, Math.min(segs.length - 1, step - 1));
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
    const step = Math.max(0, Math.min(segs.length, activeSegmentIndex));
    if (isPlayingRef.current && simRef.current.lastReportedIdx === step) return;

    if (step === 0) {
      simRef.current.segIdx = 0;
      simRef.current.lastReportedIdx = 0;
      simRef.current.simTimeSec = 0;
      applyVisualFrame(0, 1.0, segs[segs.length - 1].cumulativeTimeSec);
      return;
    }

    const idx = step - 1;
    const seg = segs[idx];
    simRef.current.segIdx = idx;
    simRef.current.lastReportedIdx = step;
    simRef.current.simTimeSec = seg.cumulativeTimeSec;
    applyVisualFrame(step, 1.0, seg.cumulativeTimeSec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSegmentIndex, compensatedSegments]);

  useEffect(() => {
    if (!isPlaying) return;
    const segs = compensatedSegments;
    if (segs.length === 0) return;
    // step=0 または終端から再生するときは 1ブロック目 (idx=0, 時刻0) から開始
    const step =
      activeSegmentIndex <= 0 || activeSegmentIndex >= segs.length ? 1 : activeSegmentIndex;
    const idx = step - 1;
    simRef.current.segIdx = idx;
    simRef.current.lastReportedIdx = step;
    simRef.current.simTimeSec = idx === 0 ? 0 : segs[idx - 1].cumulativeTimeSec;
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
        // 原点側（左手前）からワーク全体を見渡すデフォルト ISO 角度
        const isoDir = new THREE.Vector3(-0.68, -0.78, 0.68).normalize();
        camera.position.set(cx + isoDir.x * dist, cy + isoDir.y * dist, cz + isoDir.z * dist);
      } else {
        prevDir.normalize().multiplyScalar(dist);
        camera.position.set(cx + prevDir.x, cy + prevDir.y, cz + prevDir.z);
      }
    } else {
      // 原点側（左手前 -X, -Y, +Z）からワークを見渡す ISO 角度
      const isoDir = new THREE.Vector3(-0.68, -0.78, 0.68).normalize();
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
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.closest(".cm-editor"))
      ) {
        return;
      }
      if (measureMode) {
        setMeasurePoints([]);
        setMeasureAnchor(null);
        setMeasureMode(false);
        setSnapHover(null);
        setMeasureHoverSeg(null);
      }
      if (navModeRef.current === "windowZoom") {
        setZoomBox(null);
        setNavMode("pan");
      }
      // 3D画面で ESC を押したら状態を 0（加工終了後の全体表示）へ戻す
      callbacksRef.current.onSelectSegmentIndex(0, false);
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

    const camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      10000,
    );
    camera.up.set(0, 0, 1);
    camera.position.set(-160, -170, 150);
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
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
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
    const stockGroup = new THREE.Group();
    const pathGroup = new THREE.Group();
    const hoverGroup = new THREE.Group();
    const toolGroup = new THREE.Group();
    const measureGroup = new THREE.Group();

    const tipGeo = new THREE.BufferGeometry();
    const tipMat = new THREE.LineBasicMaterial({ color: 0xfef08a, depthTest: false });
    const tipLine = new THREE.Line(tipGeo, tipMat);
    tipLine.renderOrder = 10;
    tipLine.visible = false;

    scene.add(helperGroup, stockGroup, pathGroup, tipLine, hoverGroup, toolGroup, measureGroup);

    helperGroupRef.current = helperGroup;
    stockGroupRef.current = stockGroup;
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
      if (ab.onM00 && nextSeg.hasM00) {
        return `行 ${nextSeg.lineNumber} (M00 プログラムストップ)`;
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
          let nextTime = Math.min(totalTime, sim.simTimeSec + dt * speedRef.current);

          let idx = sim.segIdx;
          let broke = false;

          // ATCスキップON時：現在位置が工具交換ブロックなら待ち時間を瞬間通過
          if (skipAtcRef.current && segs[idx]?.motionType === "tool_change") {
            nextTime = Math.max(nextTime, segs[idx].cumulativeTimeSec);
          }

          while (idx < segs.length - 1 && segs[idx].cumulativeTimeSec <= nextTime) {
            const nextIdx = idx + 1;
            const hit = checkBreak(segs[idx], segs[nextIdx]);
            idx = nextIdx;
            if (hit) {
              const prevEnd = segs[idx - 1].cumulativeTimeSec;
              const hitStep = idx + 1;
              sim.segIdx = idx;
              sim.simTimeSec = prevEnd;
              sim.lastReportedIdx = hitStep;
              applyVisualFrame(hitStep, 0.0, prevEnd);
              callbacksRef.current.onBreakHit(hitStep, hit);
              broke = true;
              break;
            }
            // ATCスキップON時：新しく入った工具交換ブロックも即スキップ
            if (skipAtcRef.current && segs[idx].motionType === "tool_change") {
              nextTime = Math.max(nextTime, segs[idx].cumulativeTimeSec);
            }
          }

          if (!broke) {
            sim.segIdx = idx;
            sim.simTimeSec = nextTime;
            const curStep = idx + 1;
            const seg = segs[idx];
            const prevCum = idx > 0 ? segs[idx - 1].cumulativeTimeSec : 0;
            const progress =
              seg.durationSec > 1e-6
                ? Math.max(0, Math.min(1, (nextTime - prevCum) / seg.durationSec))
                : 1;

            applyVisualFrame(curStep, progress, nextTime);

            if (seg.spindleSpeed > 0 && toolGroup.visible) {
              const flute = toolGroup.getObjectByName("spindle_flute");
              if (flute) {
                flute.rotation.z -= dt * Math.min(45, (seg.spindleSpeed / 60) * 0.25 + 6);
              }
            }

            if (sim.lastReportedIdx !== curStep) {
              sim.lastReportedIdx = curStep;
              callbacksRef.current.onSelectSegmentIndex(curStep, true);
            }

            if (nextTime >= totalTime - 1e-6 && idx >= segs.length - 1) {
              applyVisualFrame(segs.length, 1.0, totalTime);
              callbacksRef.current.onStopPlay();
            }
          }
        }
      }

      controls.update();

      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);

      const layout = viewLayoutRef.current;

      const renderView = (cam: THREE.Camera, vx: number, vy: number, vw: number, vh: number) => {
        updateScreenSpaceMarkers(hoverGroup, cam, vh);
        updateScreenSpaceMarkers(measureGroup, cam, vh);
        renderer.setViewport(vx, vy, vw, vh);
        if (layout !== "single") renderer.setScissor(vx, vy, vw, vh);
        renderer.render(scene, cam);
      };

      if (layout === "single") {
        renderer.setScissorTest(false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderView(camera, 0, 0, w, h);
      } else {
        const bb = bboxRef.current;
        const min = bb.valid ? bb.min : { x: -50, y: -50, z: -20 };
        const max = bb.valid ? bb.max : { x: 100, y: 100, z: 50 };
        const cx = (min.x + max.x) * 0.5;
        const cy = (min.y + max.y) * 0.5;
        const cz = (min.z + max.z) * 0.5;
        const halfH = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 60) * 0.68;
        const dist = Math.max(halfH * 6, 400);

        const updateOrtho = (
          cam: THREE.OrthographicCamera,
          pos: [number, number, number],
          vw: number,
          vh: number,
        ) => {
          const aspect = vw / Math.max(1, vh);
          const halfW = halfH * aspect;
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

        if (layout === "triple") {
          // 3画面分割：上段(34%)に XY上面・XZ正面、下段(66%)に大きなメイン3D
          const topH = Math.floor(h * 0.34);
          const mainH = Math.max(1, h - topH);
          const hw = Math.floor(w / 2);

          updateOrtho(topCam, [cx, cy, cz + dist], hw, topH);
          renderView(topCam, 0, mainH, hw, topH);

          updateOrtho(frontCam, [cx, cy - dist, cz], w - hw, topH);
          renderView(frontCam, hw, mainH, w - hw, topH);

          camera.aspect = w / mainH;
          camera.updateProjectionMatrix();
          renderView(camera, 0, 0, w, mainH);
        } else {
          // 4面図：上段(32%)に XY上面・XZ正面・YZ側面、下段(68%)に大きなメイン3D
          const topH = Math.floor(h * 0.32);
          const mainH = Math.max(1, h - topH);
          const w1 = Math.floor(w / 3);
          const w2 = Math.floor((w * 2) / 3) - w1;
          const w3 = w - w1 - w2;

          updateOrtho(topCam, [cx, cy, cz + dist], w1, topH);
          renderView(topCam, 0, mainH, w1, topH);

          updateOrtho(frontCam, [cx, cy - dist, cz], w2, topH);
          renderView(frontCam, w1, mainH, w2, topH);

          updateOrtho(rightCam, [cx + dist, cy, cz], w3, topH);
          renderView(rightCam, w1 + w2, mainH, w3, topH);

          camera.aspect = w / mainH;
          camera.updateProjectionMatrix();
          renderView(camera, 0, 0, w, mainH);
        }
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
      const grid = new THREE.GridHelper(gridSize, divisions, 0x2c374a, 0x1c212c);
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

  // 2.5. 透過ストック（四角：直方体 / 丸：円柱）描画
  useEffect(() => {
    const sg = stockGroupRef.current;
    if (!sg) return;
    disposeGroupChildren(sg);

    const stock = displayOptions.stock;
    if (!stock.enabled) return;

    const sz = Math.max(0.5, stock.sizeZ);
    const centerZ = stock.topZ - sz * 0.5;
    let geom: THREE.BufferGeometry;
    let cx: number;
    let cy: number;

    if (stock.shape === "cylinder") {
      const r = Math.max(0.5, stock.diameter * 0.5);
      geom = new THREE.CylinderGeometry(r, r, sz, 48);
      geom.rotateX(Math.PI / 2);
      cx = stock.originX;
      cy = stock.originY;
    } else {
      const sx = Math.max(0.5, stock.sizeX);
      const sy = Math.max(0.5, stock.sizeY);
      geom = new THREE.BoxGeometry(sx, sy, sz);
      cx = stock.originX + sx * 0.5;
      cy = stock.originY + sy * 0.5;
    }

    const meshMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.15,
      roughness: 0.55,
      transparent: true,
      opacity: Math.max(0.05, Math.min(0.6, stock.opacity)),
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, meshMat);
    mesh.position.set(cx, cy, centerZ);
    mesh.renderOrder = 1;

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geom, 18),
      new THREE.LineBasicMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: Math.min(0.85, stock.opacity + 0.35),
      }),
    );
    edges.position.set(cx, cy, centerZ);
    edges.renderOrder = 1;

    sg.add(mesh, edges);
  }, [displayOptions.stock]);

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

    const step = Math.max(0, Math.min(compensatedSegments.length, activeSegmentIndex));
    const tSec =
      step === 0
        ? (compensatedSegments[compensatedSegments.length - 1]?.cumulativeTimeSec ?? 0)
        : (compensatedSegments[step - 1]?.cumulativeTimeSec ?? 0);
    applyVisualFrame(step, 1.0, tSec);
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
    const step = Math.max(0, Math.min(compensatedSegments.length, activeSegmentIndex));
    const tSec =
      step === 0
        ? (compensatedSegments[compensatedSegments.length - 1]?.cumulativeTimeSec ?? 0)
        : (compensatedSegments[step - 1]?.cumulativeTimeSec ?? 0);
    applyVisualFrame(step, isPlaying ? 0.5 : 1.0, tSec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayOptions.traceClipFuture, displayOptions.showToolModel]);

  // 4. マウスオーバー中パス（通常＆計測モード共通）のハイライト描画（ボッチは画面相対サイズ）
  useEffect(() => {
    const hg = hoverGroupRef.current;
    if (!hg) return;
    disposeGroupChildren(hg);

    const seg = measureMode ? measureHoverSeg : hoverInfo?.segment;
    if (!seg || seg.points.length < 2) return;

    const pts = seg.points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const lineColor = measureMode ? 0xff3b30 : 0xffffff;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: lineColor, depthTest: false }),
    );
    line.renderOrder = 15;
    hg.add(line);

    const addRelDot = (pos: Point3, color: number, screenPx: number, order: number) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 14, 14),
        new THREE.MeshBasicMaterial({ color, depthTest: false }),
      );
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.userData.screenPx = screenPx;
      mesh.renderOrder = order;
      hg.add(mesh);
    };

    if (!measureMode) {
      addRelDot(seg.start, 0x4ade80, 3.6, 16);
      addRelDot(seg.end, 0xffffff, 4.0, 16);
    } else {
      // 計測モード中はハイライト中の軌道の特徴点（端点・中点）を控えめな相対ドットでガイド表示
      addRelDot(seg.start, 0xfef08a, 3.0, 16);
      addRelDot(seg.end, 0xfef08a, 3.0, 16);
      const mid = samplePolylineAt(seg.points, 0.5).pos;
      addRelDot(mid, 0x38bdf8, 3.2, 16);
    }

    // 円弧補間 (G02/G03) の場合は円の中心マーカー（相対サイズ十字クロス＋球）と半径ガイド破線を表示
    if (seg.arcCenter) {
      const c = seg.arcCenter;
      const cVec = new THREE.Vector3(c.x, c.y, c.z);

      addRelDot(c, 0xfacc15, 4.0, 17);

      // 中心十字クロス（原点基準の単位長 1.0 で作り screenPx で相対スケール）
      const crossPts = [
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(0, 1, 0),
      ];
      const crossLines = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(crossPts),
        new THREE.LineBasicMaterial({ color: 0xfacc15, depthTest: false }),
      );
      crossLines.position.copy(cVec);
      crossLines.userData.screenPx = 10.5;
      crossLines.renderOrder = 17;

      const radiusLen = Math.max(
        1,
        Math.hypot(seg.start.x - c.x, seg.start.y - c.y, seg.start.z - c.z),
      );
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
          dashSize: Math.max(0.8, radiusLen * 0.08),
          gapSize: Math.max(0.6, radiusLen * 0.06),
          transparent: true,
          opacity: 0.72,
          depthTest: false,
        }),
      );
      guideLines.computeLineDistances();
      guideLines.renderOrder = 14;

      hg.add(crossLines, guideLines);
    }
  }, [hoverInfo?.segment, measureHoverSeg, measureMode]);

  // 5. スナップ計測3Dオーバーレイ（全ボッチを画面ピクセル基準の相対サイズに統一）
  useEffect(() => {
    const mg = measureGroupRef.current;
    if (!mg) return;
    disposeGroupChildren(mg);

    const addRelMarker = (pos: Point3, color: number, screenPx: number) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 16),
        new THREE.MeshBasicMaterial({ color, depthTest: false }),
      );
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.userData.screenPx = screenPx;
      mesh.renderOrder = 20;
      mg.add(mesh);
    };

    if (snapHover && measureMode) {
      const color =
        snapHover.snap.kind === "endpoint"
          ? 0xfacc15
          : snapHover.snap.kind === "midpoint"
            ? 0x38bdf8
            : snapHover.snap.kind === "center"
              ? 0x4ade80
              : 0xf472b6;
      addRelMarker(snapHover.snap.pos, color, 4.8);
    }

    for (const mp of measurePoints) addRelMarker(mp.pos, 0xf97316, 5.2);

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
      const segDist = Math.max(1, Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z));
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(p0.x, p0.y, p0.z),
          new THREE.Vector3(p1.x, p1.y, p1.z),
        ]),
        new THREE.LineDashedMaterial({
          color: 0xfdba74,
          dashSize: Math.max(0.8, segDist * 0.04),
          gapSize: Math.max(0.6, segDist * 0.03),
          depthTest: false,
        }),
      );
      line.computeLineDistances();
      line.renderOrder = 19;
      mg.add(line);
    }
  }, [measurePoints, snapHover, measureMode]);

  // ピッキングヘルパー
  const resolveActiveViewport = (clientX: number, clientY: number) => {
    const container = mountRef.current;
    const camera = cameraRef.current;
    if (!container || !camera) return null;

    const rect = container.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;

    const layout = viewLayoutRef.current;
    if (layout === "single") {
      return { cam: camera as THREE.Camera, vx: 0, vy: 0, vw: rect.width, vh: rect.height, mx, my };
    }
    const orthos = orthoCamsRef.current;
    if (!orthos) return null;

    if (layout === "triple") {
      const topH = rect.height * 0.34;
      const hw = rect.width * 0.5;
      if (my < topH) {
        if (mx < hw) return { cam: orthos.top as THREE.Camera, vx: 0, vy: 0, vw: hw, vh: topH, mx, my };
        return { cam: orthos.front as THREE.Camera, vx: hw, vy: 0, vw: rect.width - hw, vh: topH, mx, my };
      }
      return {
        cam: camera as THREE.Camera,
        vx: 0,
        vy: topH,
        vw: rect.width,
        vh: rect.height - topH,
        mx,
        my,
      };
    }

    // 4面図（上3面: XY / XZ / YZ、下: メイン3D）
    const topH = rect.height * 0.32;
    const w1 = rect.width / 3;
    const w2 = (rect.width * 2) / 3;
    if (my < topH) {
      if (mx < w1) return { cam: orthos.top as THREE.Camera, vx: 0, vy: 0, vw: w1, vh: topH, mx, my };
      if (mx < w2) return { cam: orthos.front as THREE.Camera, vx: w1, vy: 0, vw: w2 - w1, vh: topH, mx, my };
      return { cam: orthos.right as THREE.Camera, vx: w2, vy: 0, vw: rect.width - w2, vh: topH, mx, my };
    }
    return {
      cam: camera as THREE.Camera,
      vx: 0,
      vy: topH,
      vw: rect.width,
      vh: rect.height - topH,
      mx,
      my,
    };
  };

  /** マウス直下の最も近い軌道セグメントと、その軌道上の正確な3D最近点を検出 */
  const pickSegmentWithNearestAt = (
    clientX: number,
    clientY: number,
    maxPx = 12.0,
  ): { segment: PathSegment; nearestPos: Point3; distPx: number; mx: number; my: number } | null => {
    const vp = resolveActiveViewport(clientX, clientY);
    if (!vp) return null;

    const v0 = new THREE.Vector3();
    const v1 = new THREE.Vector3();
    let bestSeg: PathSegment | null = null;
    let bestPos: Point3 | null = null;
    let bestDist = maxPx;

    const segs = pickableRef.current;
    const stride = segs.length > 25000 ? Math.ceil(segs.length / 25000) : 1;

    for (let sIdx = 0; sIdx < segs.length; sIdx += stride) {
      const seg = segs[sIdx];
      const pts = seg.points;
      const ptStride = pts.length > 64 ? Math.ceil(pts.length / 64) : 1;
      for (let i = 0; i < pts.length - 1; i += ptStride) {
        const j = Math.min(pts.length - 1, i + ptStride);
        const p0 = pts[i];
        const p1 = pts[j];
        v0.set(p0.x, p0.y, p0.z).project(vp.cam);
        v1.set(p1.x, p1.y, p1.z).project(vp.cam);
        if (v0.z > 1 && v1.z > 1) continue;

        const sx0 = vp.vx + (v0.x * 0.5 + 0.5) * vp.vw;
        const sy0 = vp.vy + (-v0.y * 0.5 + 0.5) * vp.vh;
        const sx1 = vp.vx + (v1.x * 0.5 + 0.5) * vp.vw;
        const sy1 = vp.vy + (-v1.y * 0.5 + 0.5) * vp.vh;

        const { dist, t } = projectToSegment2D(vp.mx, vp.my, sx0, sy0, sx1, sy1);
        if (dist < bestDist) {
          bestDist = dist;
          bestSeg = seg;
          bestPos = {
            x: p0.x + (p1.x - p0.x) * t,
            y: p0.y + (p1.y - p0.y) * t,
            z: p0.z + (p1.z - p0.z) * t,
          };
        }
      }
    }
    return bestSeg && bestPos
      ? { segment: bestSeg, nearestPos: bestPos, distPx: bestDist, mx: vp.mx, my: vp.my }
      : null;
  };

  /** 二点間計測ピッカー：ハイライト中軌道の特徴点 → 全体特徴点 → 軌道上最近点の優先順でスナップ */
  const pickMeasureTargetAt = (
    clientX: number,
    clientY: number,
  ): { hoverSeg: PathSegment | null; snap: ActiveSnapHover | null } => {
    const vp = resolveActiveViewport(clientX, clientY);
    if (!vp) return { hoverSeg: null, snap: null };

    const segHit = pickSegmentWithNearestAt(clientX, clientY, 13.0);
    const v = new THREE.Vector3();

    // 1) ホバー中軌道自身の特徴点（端点・円弧実中点・円弧中心）を最優先スナップ
    if (segHit) {
      let localBest: SnapPoint | null = null;
      let localDist = 16.0;
      for (const sp of getSegmentSnapPoints(segHit.segment)) {
        v.set(sp.pos.x, sp.pos.y, sp.pos.z).project(vp.cam);
        if (v.z > 1) continue;
        const sx = vp.vx + (v.x * 0.5 + 0.5) * vp.vw;
        const sy = vp.vy + (-v.y * 0.5 + 0.5) * vp.vh;
        const d = Math.hypot(vp.mx - sx, vp.my - sy);
        if (d < localDist) {
          localDist = d;
          localBest = sp;
        }
      }
      if (localBest) {
        return {
          hoverSeg: segHit.segment,
          snap: { snap: localBest, x: vp.mx, y: vp.my },
        };
      }
    }

    // 2) 全セグメントの特徴点（円弧中心など軌道線から離れた特徴点も含む）
    let globalBest: SnapPoint | null = null;
    let globalDist = 15.0;
    for (const sp of snapPointsRef.current) {
      v.set(sp.pos.x, sp.pos.y, sp.pos.z).project(vp.cam);
      if (v.z > 1) continue;
      const sx = vp.vx + (v.x * 0.5 + 0.5) * vp.vw;
      const sy = vp.vy + (-v.y * 0.5 + 0.5) * vp.vh;
      const d = Math.hypot(vp.mx - sx, vp.my - sy);
      if (d < globalDist) {
        globalDist = d;
        globalBest = sp;
      }
    }
    if (globalBest) {
      return {
        hoverSeg: segHit?.segment ?? null,
        snap: { snap: globalBest, x: vp.mx, y: vp.my },
      };
    }

    // 3) 軌道上にポインタがあれば軌道上の最近点を取得
    if (segHit) {
      return {
        hoverSeg: segHit.segment,
        snap: { snap: { pos: segHit.nearestPos, kind: "onpath" }, x: vp.mx, y: vp.my },
      };
    }

    return { hoverSeg: null, snap: null };
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
      if (measureHoverSeg) setMeasureHoverSeg(null);
      return;
    }
    if (measureMode) {
      if (hoverInfo) setHoverInfo(null);
      const res = pickMeasureTargetAt(e.clientX, e.clientY);
      setMeasureHoverSeg(res.hoverSeg);
      setSnapHover(res.snap);
      return;
    }
    const segHit = pickSegmentWithNearestAt(e.clientX, e.clientY, 11.0);
    if (segHit) {
      setHoverInfo({ segment: segHit.segment, x: segHit.mx, y: segHit.my });
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
      const res = pickMeasureTargetAt(e.clientX, e.clientY);
      if (res.snap) {
        const pickedSnap = res.snap.snap;
        const clickPos = { x: res.snap.x, y: res.snap.y };
        setMeasurePoints((prev) => {
          if (prev.length === 1) {
            setMeasureAnchor(clickPos);
            return [...prev, pickedSnap];
          }
          setMeasureAnchor(null);
          return [pickedSnap];
        });
      } else {
        // 軌道・スナップ点以外の余白をクリックしたら選択中の計測点を解除
        setMeasurePoints([]);
        setMeasureAnchor(null);
      }
      return;
    }
    const segHit = pickSegmentWithNearestAt(e.clientX, e.clientY, 11.0);
    if (segHit) {
      const idx = compensatedSegments.findIndex((s) => s.id === segHit.segment.id);
      if (idx >= 0) onSelectSegmentIndex(idx + 1, false);
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
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        backgroundColor: "#141519",
        backgroundImage:
          "radial-gradient(circle at 22% 18%, rgba(56, 189, 248, 0.09), transparent 46%), radial-gradient(circle at 82% 80%, rgba(14, 165, 233, 0.065), transparent 44%)",
      }}
    >
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
          setMeasureHoverSeg(null);
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
          setMeasureAnchor(null);
          setMeasureHoverSeg(null);
          setSnapHover(null);
          setNavMode(mode);
        }}
        measureMode={measureMode}
        onToggleMeasureMode={() =>
          setMeasureMode((v) => {
            if (v) {
              setMeasurePoints([]);
              setMeasureAnchor(null);
              setMeasureHoverSeg(null);
              setSnapHover(null);
            }
            return !v;
          })
        }
        measurePoints={measurePoints}
        measureAnchor={measureAnchor}
        onClearMeasurePoints={() => {
          setMeasurePoints([]);
          setMeasureAnchor(null);
        }}
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
        currentSegment={
          activeSegmentIndex === 0
            ? (compensatedSegments[compensatedSegments.length - 1] ?? null)
            : (compensatedSegments[activeSegmentIndex - 1] ?? null)
        }
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        skipToolChangeTime={skipToolChangeTime}
        breakReason={breakReason}
        liveTimeTextRef={liveTimeTextRef}
        onSelectSegmentIndex={onSelectSegmentIndex}
        onTogglePlay={onTogglePlay}
        onChangePlaybackSpeed={onChangePlaybackSpeed}
        onToggleSkipToolChangeTime={onToggleSkipToolChangeTime}
      />
    </div>
  );
};
