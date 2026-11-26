import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Code2,
  FileCode2,
  FolderOpen,
  PanelBottom,
  PanelLeft,
  Radio,
  Save,
  Sparkles,
} from "lucide-react";

interface TopBarProps {
  fileName: string;
  filePath: string | null;
  encoding: string;
  isDirty: boolean;
  isParsing: boolean;
  watchExternal: boolean;
  profileName: string;
  sidebarOpen: boolean;
  editorOpen: boolean;
  bottomOpen: boolean;
  onOpenFile: () => void;
  onSaveFile: () => void;
  onLoadSample: (mode: "plate" | "macro") => void;
  onToggleWatchExternal: () => void;
  onToggleSidebar: () => void;
  onToggleEditor: () => void;
  onToggleBottom: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  fileName,
  filePath,
  encoding,
  isDirty,
  isParsing,
  watchExternal,
  profileName,
  sidebarOpen,
  editorOpen,
  bottomOpen,
  onOpenFile,
  onSaveFile,
  onLoadSample,
  onToggleWatchExternal,
  onToggleSidebar,
  onToggleEditor,
  onToggleBottom,
}) => {
  const [sampleMenuOpen, setSampleMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!sampleMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setSampleMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [sampleMenuOpen]);

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

          {/* サンプルNC ドロップダウン */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setSampleMenuOpen((v) => !v)}
              className={`px-2 py-1 rounded flex items-center gap-1 transition-colors ${
                sampleMenuOpen
                  ? "bg-[#2d2d30] text-white"
                  : "text-[#b4b4b4] hover:bg-[#2d2d30] hover:text-white"
              }`}
              title="デモ用サンプルNCプログラムを読み込む"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#38bdf8]" />
              サンプル
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>

            {sampleMenuOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 w-60 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-2xl py-1 text-xs">
                <button
                  onClick={() => {
                    setSampleMenuOpen(false);
                    onLoadSample("plate");
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#094771] hover:text-white flex items-start gap-2 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#38bdf8] mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium text-[#e2e8f0]">プレート加工デモ</div>
                    <div className="text-[10.5px] text-[#94a3b8]">
                      G41外周輪郭・G42ポケット・G83ペック
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setSampleMenuOpen(false);
                    onLoadSample("macro");
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#094771] hover:text-white flex items-start gap-2 transition-colors"
                >
                  <Code2 className="w-3.5 h-3.5 text-[#c084fc] mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium text-[#e2e8f0]">カスタムマクロB デモ</div>
                    <div className="text-[10.5px] text-[#94a3b8]">
                      M98 L3 切込＋G65/WHILE ボルトホール円
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 中央：現在ファイル表示 */}
      <div className="flex items-center gap-2 text-[11.5px] text-[#d4d4d4] font-mono truncate max-w-[34%] bg-[#181818] border border-[#2b2b2b] rounded px-2.5 py-0.5">
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

      {/* 右：外部ファイル監視・プロファイル・VS Code風レイアウト切替 */}
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

        <span className="hidden lg:inline-block px-2 py-0.5 rounded bg-[#181818] border border-[#2f2f32] text-[#9cdcfe]">
          {profileName}
        </span>

        <div className="h-4 w-px bg-[#333333]" />

        {/* VS Code 本家風レイアウト切替3連ボタン */}
        <div className="flex items-center gap-0.5 bg-[#181818] border border-[#2b2b2b] rounded p-0.5">
          <button
            onClick={onToggleSidebar}
            className={`p-1 rounded transition-colors ${
              sidebarOpen
                ? "bg-[#2d2d30] text-[#e2e8f0]"
                : "text-[#6e7681] hover:text-[#cccccc] hover:bg-[#252526]"
            }`}
            title="左サイドバーの表示切替 (Cmd/Ctrl+B)"
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleEditor}
            className={`p-1 rounded transition-colors ${
              editorOpen
                ? "bg-[#2d2d30] text-[#e2e8f0]"
                : "text-[#6e7681] hover:text-[#cccccc] hover:bg-[#252526]"
            }`}
            title="NCコードエディタの表示切替 (Cmd/Ctrl+E)"
          >
            <Code2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleBottom}
            className={`p-1 rounded transition-colors ${
              bottomOpen
                ? "bg-[#2d2d30] text-[#e2e8f0]"
                : "text-[#6e7681] hover:text-[#cccccc] hover:bg-[#252526]"
            }`}
            title="下部パネルの表示切替 (Cmd/Ctrl+J)"
          >
            <PanelBottom className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
