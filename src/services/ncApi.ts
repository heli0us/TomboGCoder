import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { FileReadResult, MachineConfig, ParseResult, SimReplaceRule } from "../types/nc";

/** Tauri デスクトップ実行環境かどうかを判定 */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * 3Dシミュレーション専用の特殊Gコード置換を「行番号を一切ずらさず」に1行単位で適用する
 * （元ファイル・エディタ内容は書き換えない）
 */
export function applySimReplaceRules(source: string, rules: SimReplaceRule[] | undefined): string {
  if (!rules || rules.length === 0) return source;
  const active = rules.filter((r) => r.enabled && r.pattern.length > 0);
  if (active.length === 0) return source;

  const compiled = active
    .map((r) => {
      try {
        const regex = r.useRegex ? new RegExp(r.pattern, "gi") : null;
        return { rule: r, regex };
      } catch {
        return null;
      }
    })
    .filter((x): x is { rule: SimReplaceRule; regex: RegExp | null } => x !== null);

  if (compiled.length === 0) return source;

  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const hasCr = line.endsWith("\r");
    if (hasCr) line = line.slice(0, -1);
    for (const { rule, regex } of compiled) {
      // 置換後文字列に改行が混ざると行番号がずれるためスペースへ正規化
      const safeRepl = rule.replacement.replace(/\r?\n/g, " ");
      if (regex) {
        line = line.replace(regex, safeRepl);
      } else if (line.includes(rule.pattern)) {
        line = line.split(rule.pattern).join(safeRepl);
      }
    }
    lines[i] = hasCr ? `${line}\r` : line;
  }
  return lines.join("\n");
}

/** Rust NC解析エンジンでGコードを解析 */
export async function parseNcProgram(
  source: string,
  config: MachineConfig,
  filePath?: string | null,
): Promise<ParseResult> {
  const effectiveSource = applySimReplaceRules(source, config.simReplaceRules);
  return invoke<ParseResult>("parse_nc_program", {
    request: { source: effectiveSource, config, filePath: filePath ?? null },
  });
}

/** ネイティブフォルダ選択ダイアログを開く（サブプログラム検索フォルダ指定用） */
export async function openFolderDialog(title = "フォルダを選択"): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title,
  });
  if (!selected || Array.isArray(selected)) return null;
  return selected;
}

/** 初期サンプルNCプログラムを取得（標準3軸プレート） */
export async function getSampleNc(): Promise<string> {
  return invoke<string>("get_sample_nc");
}

/** カスタムマクロB + サブプログラムデモNCを取得 */
export async function getMacroSampleNc(): Promise<string> {
  return invoke<string>("get_macro_sample_nc");
}

/** ネイティブファイル選択ダイアログからNCファイルを開く */
export async function openNcFileDialog(): Promise<FileReadResult | null> {
  const selected = await open({
    multiple: false,
    title: "NCプログラムを開く",
    filters: [
      {
        name: "NC / DNC プログラム",
        extensions: [
          "nc",
          "NC",
          "dnc",
          "DNC",
          "tap",
          "TAP",
          "gcode",
          "cnc",
          "min",
          "prg",
          "iso",
          "ISO",
          "eia",
          "EIA",
          "txt",
        ],
      },
      { name: "すべてのファイル", extensions: ["*"] },
    ],
  });

  if (!selected || Array.isArray(selected)) {
    return null;
  }

  return readNcFileByPath(selected);
}

/** パス指定でNCファイルを読み込む（Shift-JIS / UTF-8自動判別） */
export async function readNcFileByPath(path: string): Promise<FileReadResult> {
  return invoke<FileReadResult>("read_text_file", { path });
}

/** ネイティブ保存ダイアログまたは上書き保存（元の文字コードを維持） */
export async function saveNcFile(
  content: string,
  currentPath: string | null,
  saveAs = false,
  encoding = "UTF-8",
  suggestedFileName?: string,
): Promise<string | null> {
  let targetPath = saveAs ? null : currentPath;
  if (!targetPath) {
    const defaultPath = currentPath ?? suggestedFileName ?? "program.nc";
    const picked = await save({
      title: saveAs ? "名前を付けてNCプログラムを保存" : "NCプログラムを保存",
      defaultPath,
      filters: [
        { name: "NC / DNC プログラム", extensions: ["nc", "dnc", "tap", "gcode", "txt"] },
        { name: "すべてのファイル", extensions: ["*"] },
      ],
    });
    if (!picked) return null;
    targetPath = picked;
  }

  await invoke<void>("write_text_file", { path: targetPath, content, encoding });
  return targetPath;
}

/** CSV または HTML 加工レポートを保存ダイアログで出力 */
export async function exportReportFile(
  defaultFileName: string,
  content: string,
  kind: "csv" | "html",
): Promise<string | null> {
  const picked = await save({
    title: kind === "csv" ? "CSVレポートを保存" : "HTML加工レポートを保存",
    defaultPath: defaultFileName,
    filters:
      kind === "csv"
        ? [{ name: "CSV ファイル", extensions: ["csv"] }]
        : [{ name: "HTML レポート", extensions: ["html", "htm"] }],
  });
  if (!picked) return null;
  await invoke<void>("write_text_file", { path: picked, content });
  return picked;
}

/** マシン設定JSONファイルを保存ダイアログでエクスポート */
export async function exportJsonFile(
  defaultFileName: string,
  content: string,
  title = "マシン設定をエクスポート",
): Promise<string | null> {
  const picked = await save({
    title,
    defaultPath: defaultFileName,
    filters: [
      { name: "マシン設定 JSON", extensions: ["json"] },
      { name: "すべてのファイル", extensions: ["*"] },
    ],
  });
  if (!picked) return null;
  await invoke<void>("write_text_file", { path: picked, content });
  return picked;
}

/** ネイティブファイル選択ダイアログからJSONまたはテキスト設定ファイルを読み込む */
export async function openJsonFileDialog(
  title = "マシン設定をインポート",
  allowTextExtensions = false,
): Promise<FileReadResult | null> {
  const selected = await open({
    multiple: false,
    title,
    filters: allowTextExtensions
      ? [
          { name: "JSON / MIFES設定", extensions: ["json", "ini", "txt", "cfg"] },
          { name: "すべてのファイル", extensions: ["*"] },
        ]
      : [
          { name: "マシン設定 JSON", extensions: ["json"] },
          { name: "すべてのファイル", extensions: ["*"] },
        ],
  });
  if (!selected || Array.isArray(selected)) {
    return null;
  }
  return readNcFileByPath(selected);
}

/** 外部エディタ連動のファイル変更監視を開始 */
export async function startWatchFile(path: string): Promise<void> {
  return invoke<void>("start_watch_file", { path });
}

/** 外部エディタ連動のファイル監視を停止 */
export async function stopWatchFile(): Promise<void> {
  return invoke<void>("stop_watch_file");
}

/** 外部からのファイル変更イベントを購読 */
export async function onNcFileChanged(
  callback: (changedPath: string) => void,
): Promise<UnlistenFn> {
  return listen<string>("nc-file-changed", (event) => {
    callback(event.payload);
  });
}
