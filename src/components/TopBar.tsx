import React from "react";
import { Code2, FileCode2, FolderOpen, Radio, Save, Sparkles } from "lucide-react";

interface TopBarProps {
  fileName: string;
  filePath: string | null;
  encoding: string;
  isDirty: boolean;
  isParsing: boolean;
  watchExternal: boolean;
  profileName: string;
  onOpenFile: () => void;
  onSaveFile: () => void;
  onLoadSample: (mode: "plate" | "macro") => void;
  onToggleWatchExternal: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  fileName,
  filePath,
  encoding,
  isDirty,
  isParsing,
  watchExternal,
  profileName,
  onOpenFile,
  onSaveFile,
  onLoadSample,
  onToggleWatchExternal,
}) => {
  return (
    <header className="h-9 bg-[#1f1f1f] border-b border-[#2b2b2b] px-3 flex items-center justify-between shrink-0 text-xs select-none">
      {/* 左：ブランド & ファイルアクション */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex items-center gap-1.5 font-semibold text-[#f1f5f9] tracking-tight">
          <FileCode2 className="w-4 h-4 text-[#38bdf8]" />
          <span>TomboGCoder</span>
        </div>

        <div className="h-4 w-px bg-[#333333]" />

        <div className="flex items-center gap-0.5">
          <button
            onClick={onOpenFile}
            className="px-2 py-1 rounded hover:bg-[#2d2d30] flex items-center gap-1.5 text-[#d4d4d4] hover:text-white transition-colors"
            title="NC / DNC ファイルを開く (Cmd/Ctrl+O)"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#fbbf24]" />
            開く
          </button>
          <button
            onClick={onSaveFile}
            className="px-2 py-1 rounded hover:bg-[#2d2d30] flex items-center gap-1.5 text-[#d4d4d4] hover:text-white transition-colors"
            title="NCファイルを保存 (Cmd/Ctrl+S)"
          >
            <Save className="w-3.5 h-3.5 text-[#4ade80]" />
            保存
          </button>
          <button
            onClick={() => onLoadSample("plate")}
            className="px-2 py-1 rounded hover:bg-[#2d2d30] flex items-center gap-1.5 text-[#d4d4d4] hover:text-white transition-colors"
            title="標準プレートデモ（G41/G42/G83）を読み込む"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#38bdf8]" />
            プレートデモ
          </button>
          <button
            onClick={() => onLoadSample("macro")}
            className="px-2 py-1 rounded hover:bg-[#2d2d30] flex items-center gap-1.5 text-[#d4d4d4] hover:text-white transition-colors"
            title="カスタムマクロB + サブプログラム(M98/G65) デモを読み込む"
          >
            <Code2 className="w-3.5 h-3.5 text-[#c084fc]" />
            マクロデモ
          </button>
        </div>
      </div>

      {/* 中央：現在ファイル表示 */}
      <div className="flex items-center gap-2 text-[11.5px] text-[#d4d4d4] font-mono truncate max-w-[36%] bg-[#181818] border border-[#2b2b2b] rounded px-2.5 py-0.5">
        <span className="truncate">
          {fileName}
          {isDirty ? <span className="text-[#fbbf24] ml-1">●</span> : null}
        </span>
        <span className="px-1.5 py-0 rounded bg-[#252526] text-[10px] text-[#8e95a2] shrink-0">
          {encoding}
        </span>
        {isParsing && (
          <span className="text-[#38bdf8] text-[10px] animate-pulse shrink-0">解析中...</span>
        )}
      </div>

      {/* 右：外部ファイル監視 & プロファイル */}
      <div className="flex items-center gap-2 text-[11px]">
        <button
          onClick={onToggleWatchExternal}
          disabled={!filePath}
          className={`px-2 py-0.5 rounded border flex items-center gap-1 transition-colors ${
            filePath && watchExternal
              ? "bg-[#14532d]/45 border-[#22c55e]/60 text-[#86efac]"
              : "bg-[#181818] border-[#2f2f32] text-[#787878]"
          } disabled:opacity-45`}
          title={
            filePath
              ? "外部エディタでファイル保存時に自動リロード（クリックでON/OFF）"
              : "ローカルファイルを開くと外部変更の自動監視が有効になります"
          }
        >
          <Radio className="w-3 h-3" />
          自動監視
        </button>
        <span className="px-2 py-0.5 rounded bg-[#181818] border border-[#2f2f32] text-[#9cdcfe]">
          {profileName}
        </span>
      </div>
    </header>
  );
};
