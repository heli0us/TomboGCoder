import type {
  BoundingBox,
  CycleTimeSummary,
  ParseResult,
  PathSegment,
  ToolSummary,
} from "../types/nc";

export interface ProgramStat {
  count: number;
  timeSec: number;
  firstLine: number;
}

/** 各 O番号ごとのセグメント数・単体加工時間・先頭行を集計 */
export function computeProgramStats(result: ParseResult | null): Map<string, ProgramStat> {
  const map = new Map<string, ProgramStat>();
  if (!result) return map;

  for (const seg of result.compensatedSegments) {
    const prev = map.get(seg.programNumber);
    if (!prev) {
      map.set(seg.programNumber, {
        count: 1,
        timeSec: seg.durationSec,
        firstLine: seg.lineNumber,
      });
    } else {
      prev.count += 1;
      prev.timeSec += seg.durationSec;
      if (seg.lineNumber < prev.firstLine) {
        prev.firstLine = seg.lineNumber;
      }
    }
  }
  return map;
}

/**
 * hiddenPrograms で除外されていない O番号だけを対象に、
 * 累積時間・サイクルタイム・工具サマリー・バウンディングボックスを再集計した ParseResult を生成する。
 */
export function buildFilteredParseResult(
  full: ParseResult | null,
  hiddenPrograms: string[],
): ParseResult | null {
  if (!full) return null;
  if (hiddenPrograms.length === 0) return full;

  const hiddenSet = new Set(hiddenPrograms);

  // 1. プログラムパスを絞り込み、累積時間を0から再積算
  let progCum = 0;
  const programSegments: PathSegment[] = [];
  for (const seg of full.programSegments) {
    if (hiddenSet.has(seg.programNumber)) continue;
    progCum += seg.durationSec;
    programSegments.push({ ...seg, cumulativeTimeSec: progCum });
  }

  // 2. 補正後パスを絞り込み、累積時間・サイクルタイム・工具サマリー・範囲を再集計
  let compCum = 0;
  let rapidTimeSec = 0;
  let cutTimeSec = 0;
  let dwellTimeSec = 0;
  let toolChangeTimeSec = 0;
  let totalRapidDistanceMm = 0;
  let totalCutDistanceMm = 0;
  let toolChanges = 0;

  const toolMap = new Map<number, ToolSummary>();
  const origToolComments = new Map<number, string | null>();
  for (const t of full.cycleTime.tools) {
    origToolComments.set(t.toolNumber, t.commentHint);
  }

  const detectedToolsSet = new Set<number>();
  const detectedDSet = new Set<number>();
  const includedLines = new Set<number>();

  const compensatedSegments: PathSegment[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let bbValid = false;

  for (const seg of full.compensatedSegments) {
    if (hiddenSet.has(seg.programNumber)) continue;
    compCum += seg.durationSec;
    const copy: PathSegment = { ...seg, cumulativeTimeSec: compCum };
    compensatedSegments.push(copy);

    includedLines.add(seg.lineNumber);
    if (seg.toolNumber > 0) detectedToolsSet.add(seg.toolNumber);
    if (seg.dNumber > 0) detectedDSet.add(seg.dNumber);

    for (const p of seg.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.z < minZ) minZ = p.z;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
      if (p.z > maxZ) maxZ = p.z;
      bbValid = true;
    }

    const tNum = seg.toolNumber;
    let tEntry = toolMap.get(tNum);
    if (!tEntry) {
      tEntry = {
        toolNumber: tNum,
        dNumbers: [],
        toolDiameter: seg.modalState.toolDiameter,
        rapidDistanceMm: 0,
        cutDistanceMm: 0,
        rapidTimeSec: 0,
        cutTimeSec: 0,
        dwellTimeSec: 0,
        toolChangeTimeSec: 0,
        totalTimeSec: 0,
        minZ: Infinity,
        maxZ: -Infinity,
        segmentCount: 0,
        commentHint: origToolComments.get(tNum) ?? (seg.modalState.toolName || null),
      };
      toolMap.set(tNum, tEntry);
    }

    tEntry.segmentCount += 1;
    if (seg.dNumber > 0 && !tEntry.dNumbers.includes(seg.dNumber)) {
      tEntry.dNumbers.push(seg.dNumber);
    }
    if (seg.modalState.toolDiameter > 0 && tEntry.toolDiameter === 0) {
      tEntry.toolDiameter = seg.modalState.toolDiameter;
    }
    for (const p of seg.points) {
      if (p.z < tEntry.minZ) tEntry.minZ = p.z;
      if (p.z > tEntry.maxZ) tEntry.maxZ = p.z;
    }

    switch (seg.motionType) {
      case "rapid":
      case "canned_rapid":
        rapidTimeSec += seg.durationSec;
        totalRapidDistanceMm += seg.lengthMm;
        tEntry.rapidTimeSec += seg.durationSec;
        tEntry.rapidDistanceMm += seg.lengthMm;
        break;
      case "linear":
      case "arc_cw":
      case "arc_ccw":
      case "canned_feed":
        cutTimeSec += seg.durationSec;
        totalCutDistanceMm += seg.lengthMm;
        tEntry.cutTimeSec += seg.durationSec;
        tEntry.cutDistanceMm += seg.lengthMm;
        break;
      case "dwell":
        dwellTimeSec += seg.durationSec;
        tEntry.dwellTimeSec += seg.durationSec;
        break;
      case "tool_change":
        toolChangeTimeSec += seg.durationSec;
        toolChanges += 1;
        tEntry.toolChangeTimeSec += seg.durationSec;
        break;
    }
    tEntry.totalTimeSec += seg.durationSec;
  }

  for (const seg of programSegments) {
    for (const p of seg.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.z < minZ) minZ = p.z;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
      if (p.z > maxZ) maxZ = p.z;
      bbValid = true;
    }
  }

  const tools = Array.from(toolMap.values())
    .sort((a, b) => a.toolNumber - b.toolNumber)
    .map((t) => ({
      ...t,
      minZ: Number.isFinite(t.minZ) ? t.minZ : 0,
      maxZ: Number.isFinite(t.maxZ) ? t.maxZ : 0,
    }));

  const cycleTime: CycleTimeSummary = {
    totalTimeSec: compCum,
    rapidTimeSec,
    cutTimeSec,
    dwellTimeSec,
    toolChangeTimeSec,
    totalRapidDistanceMm,
    totalCutDistanceMm,
    toolChanges,
    tools,
  };

  const boundingBox: BoundingBox = bbValid
    ? { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ }, valid: true }
    : { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, valid: false };

  const diagnostics = full.diagnostics.filter((d) => includedLines.has(d.lineNumber));

  return {
    ...full,
    programSegments,
    compensatedSegments,
    diagnostics,
    boundingBox,
    cycleTime,
    detectedTools: Array.from(detectedToolsSet).sort((a, b) => a - b),
    detectedDNumbers: Array.from(detectedDSet).sort((a, b) => a - b),
    detectedPrograms: full.detectedPrograms.filter((p) => !hiddenSet.has(p)),
  };
}
