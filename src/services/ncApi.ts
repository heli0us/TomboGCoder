import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { FileReadResult, MachineConfig, ParseResult } from "../types/nc";

/** Tauri デスクトップ実行環境かどうかを判定 */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Rust NC解析エンジンでGコードを解析 */
export async function parseNcProgram(
  source: string,
  config: MachineConfig,
  filePath?: string | null,
): Promise<ParseResult> {
  return invoke<ParseResult>("parse_nc_program", {
    request: { source, config, filePath: filePath ?? null },
  });
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

/** ネイティブ保存ダイアログまたは上書き保存 */
export async function saveNcFile(
  content: string,
  currentPath: string | null,
  saveAs = false,
): Promise<string | null> {
  let targetPath = saveAs ? null : currentPath;
  if (!targetPath) {
    const picked = await save({
      title: "NCプログラムを保存",
      defaultPath: currentPath ?? "program.nc",
      filters: [
        { name: "NC / DNC プログラム", extensions: ["nc", "dnc", "tap", "gcode", "txt"] },
        { name: "すべてのファイル", extensions: ["*"] },
      ],
    });
    if (!picked) return null;
    targetPath = picked;
  }

  await invoke<void>("write_text_file", { path: targetPath, content });
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
