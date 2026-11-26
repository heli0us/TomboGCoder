import { type MachineConfig, type ParseResult, formatDuration } from "../types/nc";

function csvEscape(v: string | number): string {
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Excel対応のBOM付きUTF-8 CSVレポートを生成 */
export function buildCsvReport(
  fileName: string,
  config: MachineConfig,
  result: ParseResult,
): string {
  const ct = result.cycleTime;
  const bb = result.boundingBox;
  const lines: string[] = [];

  lines.push("TomboGCoder NC加工検証レポート");
  lines.push(`ファイル名,${csvEscape(fileName)}`);
  lines.push(`機械プロファイル,${csvEscape(config.profileName)}`);
  lines.push(`総サイクルタイム,${csvEscape(formatDuration(ct.totalTimeSec))},${ct.totalTimeSec.toFixed(2)}秒`);
  lines.push(`切削時間,${csvEscape(formatDuration(ct.cutTimeSec))},切削距離,${ct.totalCutDistanceMm.toFixed(2)}mm`);
  lines.push(`早送り時間,${csvEscape(formatDuration(ct.rapidTimeSec))},早送り距離,${ct.totalRapidDistanceMm.toFixed(2)}mm`);
  lines.push(`工具交換回数,${ct.toolChanges},ATC合計,${ct.toolChangeTimeSec.toFixed(2)}秒`);
  if (bb.valid) {
    lines.push(
      `加工範囲(mm),X:${bb.min.x.toFixed(2)}..${bb.max.x.toFixed(2)},Y:${bb.min.y.toFixed(2)}..${bb.max.y.toFixed(2)},Z:${bb.min.z.toFixed(2)}..${bb.max.z.toFixed(2)}`,
    );
  }
  lines.push("");
  lines.push("工具番号,D番号,工具径(mm),切削距離(mm),早送り距離(mm),切削時間(秒),合計時間(秒),最小Z(mm),コメント");
  for (const t of ct.tools) {
    lines.push(
      [
        `T${String(t.toolNumber).padStart(2, "0")}`,
        t.dNumbers.map((d) => `D${String(d).padStart(2, "0")}`).join(" "),
        t.toolDiameter.toFixed(2),
        t.cutDistanceMm.toFixed(2),
        t.rapidDistanceMm.toFixed(2),
        t.cutTimeSec.toFixed(2),
        t.totalTimeSec.toFixed(2),
        t.minZ.toFixed(3),
        t.commentHint ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  if (result.diagnostics.length > 0) {
    lines.push("");
    lines.push("診断レベル,行番号,コード,メッセージ");
    for (const d of result.diagnostics) {
      lines.push([d.severity, d.lineNumber, d.code, d.message].map(csvEscape).join(","));
    }
  }

  return "\uFEFF" + lines.join("\r\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** そのままブラウザ印刷して現場配布できるHTML加工検証レポートを生成 */
export function buildHtmlReport(
  fileName: string,
  config: MachineConfig,
  result: ParseResult,
): string {
  const ct = result.cycleTime;
  const bb = result.boundingBox;
  const now = new Date().toLocaleString("ja-JP");

  const toolRows = ct.tools
    .map(
      (t) => `
      <tr>
        <td><strong>T${String(t.toolNumber).padStart(2, "0")}</strong></td>
        <td>${t.dNumbers.length > 0 ? t.dNumbers.map((d) => `D${String(d).padStart(2, "0")}`).join(", ") : "-"}</td>
        <td class="num">${t.toolDiameter > 0 ? `Ø${t.toolDiameter.toFixed(2)}` : "-"}</td>
        <td class="num">${t.cutDistanceMm.toFixed(1)} mm</td>
        <td class="num">${t.rapidDistanceMm.toFixed(1)} mm</td>
        <td class="num">${formatDuration(t.cutTimeSec)}</td>
        <td class="num"><strong>${formatDuration(t.totalTimeSec)}</strong></td>
        <td class="num">${t.minZ.toFixed(2)}</td>
        <td>${escapeHtml(t.commentHint ?? "")}</td>
      </tr>`,
    )
    .join("");

  const diagRows =
    result.diagnostics.length === 0
      ? `<p class="ok">エラー・警告は検出されませんでした。</p>`
      : `<table>
          <thead><tr><th>レベル</th><th>行</th><th>コード</th><th>内容</th></tr></thead>
          <tbody>
            ${result.diagnostics
              .map(
                (d) => `
              <tr class="sev-${d.severity}">
                <td>${d.severity.toUpperCase()}</td>
                <td class="num">${d.lineNumber}</td>
                <td>${escapeHtml(d.code)}</td>
                <td>${escapeHtml(d.message)}</td>
              </tr>`,
              )
              .join("")}
          </tbody>
        </table>`;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<title>NC加工検証レポート - ${escapeHtml(fileName)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif; color: #1f2937; margin: 24px; font-size: 13px; }
  h1 { font-size: 20px; border-bottom: 2px solid #0284c7; padding-bottom: 6px; margin-bottom: 12px; }
  h2 { font-size: 15px; margin-top: 22px; color: #0f172a; border-left: 4px solid #0284c7; padding-left: 8px; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 12px; }
  .kpi { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #ffffff; }
  .kpi .label { font-size: 11px; color: #64748b; }
  .kpi .val { font-size: 18px; font-weight: 700; font-family: monospace; color: #0369a1; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
  th { background: #f1f5f9; font-weight: 600; }
  td.num { text-align: right; font-family: monospace; }
  .ok { color: #15803d; font-weight: 600; }
  .sev-error td { background: #fef2f2; color: #991b1b; }
  .sev-warning td { background: #fffbeb; color: #92400e; }
  @media print { body { margin: 10mm; } }
</style>
</head>
<body>
  <h1>TomboGCoder — NC加工事前検証レポート</h1>
  <div class="meta">
    <div><strong>ファイル名:</strong> ${escapeHtml(fileName)}</div>
    <div><strong>機械プロファイル:</strong> ${escapeHtml(config.profileName)}</div>
    <div><strong>出力日時:</strong> ${escapeHtml(now)}</div>
    <div><strong>ソース行数 / 展開ブロック:</strong> ${result.lineCount} 行 / ${result.expandedBlockCount} ブロック</div>
    <div><strong>早送り速度 (X/Y/Z):</strong> ${config.rapidRateX} / ${config.rapidRateY} / ${config.rapidRateZ} mm/min</div>
    <div><strong>加工範囲 (mm):</strong> ${
      bb.valid
        ? `X[${bb.min.x.toFixed(1)}..${bb.max.x.toFixed(1)}] Y[${bb.min.y.toFixed(1)}..${bb.max.y.toFixed(1)}] Z[${bb.min.z.toFixed(1)}..${bb.max.z.toFixed(1)}]`
        : "-"
    }</div>
  </div>

  <div class="kpi-grid">
    <div class="kpi"><div class="label">総サイクルタイム</div><div class="val">${formatDuration(ct.totalTimeSec)}</div></div>
    <div class="kpi"><div class="label">切削時間 / 距離</div><div class="val">${formatDuration(ct.cutTimeSec)} (${ct.totalCutDistanceMm.toFixed(0)}mm)</div></div>
    <div class="kpi"><div class="label">早送り時間 / 距離</div><div class="val">${formatDuration(ct.rapidTimeSec)} (${ct.totalRapidDistanceMm.toFixed(0)}mm)</div></div>
    <div class="kpi"><div class="label">工具交換 (ATC)</div><div class="val">${ct.toolChanges}回 (${formatDuration(ct.toolChangeTimeSec)})</div></div>
  </div>

  <h2>工具別加工サマリー</h2>
  <table>
    <thead>
      <tr>
        <th>工具</th><th>D番号</th><th>工具径</th><th>切削距離</th><th>早送り距離</th><th>切削時間</th><th>合計時間</th><th>最小Z</th><th>コメント</th>
      </tr>
    </thead>
    <tbody>${toolRows}</tbody>
  </table>

  <h2>事前検証・径補正診断</h2>
  ${diagRows}
</body>
</html>`;
}
