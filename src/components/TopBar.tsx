import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Clock,
  Code2,
  Cpu,
  FileCode2,
  FolderOpen,
  PanelBottom,
  PanelLeft,
  Radio,
  Save,
  SaveAll,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { MachineProfile } from "../types/nc";

export interface RecentFileEntry {
  path: string;
  fileName: string;
}

interface TopBarProps {
  fileName: string;
  filePath: string | null;
  encoding: string;
  isDirty: boolean;
  isParsing: boolean;
  watchExternal: boolean;
  recentFiles: RecentFileEntry[];
  machineProfiles: MachineProfile[];
  activeMachineProfile: MachineProfile;
  sidebarOpen: boolean;
  editorOpen: boolean;
  bottomOpen: boolean;
  onOpenFile: () => void;
  onOpenRecentFile: (path: string) => void;
  onClearRecentFiles: () => void;
  onSaveFile: () => void;
  onSaveAsFile: () => void;
  onToggleEncoding: () => void;
  onLoadSample: (mode: "plate" | "macro") => void;
  onToggleWatchExternal: () => void;
  onSelectMachineProfile: (id: string) => void;
  onOpenMachineSettings: () => void;
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
  recentFiles,
  machineProfiles,
  activeMachineProfile,
  sidebarOpen,
  editorOpen,
  bottomOpen,
  onOpenFile,
  onOpenRecentFile,
  onClearRecentFiles,
  onSaveFile,
  onSaveAsFile,
  onToggleEncoding,
  onLoadSample,
  onToggleWatchExternal,
  onSelectMachineProfile,
  onOpenMachineSettings,
  onToggleSidebar,
  onToggleEditor,
  onToggleBottom,
}) => {
  const [recentMenuOpen, setRecentMenuOpen] = useState(false);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const [sampleMenuOpen, setSampleMenuOpen] = useState(false);
  const [machineMenuOpen, setMachineMenuOpen] = useState(false);
  const recentMenuRef = useRef<HTMLDivElement | null>(null);
  const saveMenuRef = useRef<HTMLDivElement | null>(null);
  const sampleMenuRef = useRef<HTMLDivElement | null>(null);
  const machineMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!recentMenuOpen && !saveMenuOpen && !sampleMenuOpen && !machineMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (recentMenuRef.current && !recentMenuRef.current.contains(target)) {
        setRecentMenuOpen(false);
      }
      if (saveMenuRef.current && !saveMenuRef.current.contains(target)) {
        setSaveMenuOpen(false);
      }
      if (sampleMenuRef.current && !sampleMenuRef.current.contains(target)) {
        setSampleMenuOpen(false);
      }
      if (machineMenuRef.current && !machineMenuRef.current.contains(target)) {
        setMachineMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [recentMenuOpen, saveMenuOpen, sampleMenuOpen, machineMenuOpen]);

  const closeAllMenus = () => {
    setRecentMenuOpen(false);
    setSaveMenuOpen(false);
    setSampleMenuOpen(false);
    setMachineMenuOpen(false);
  };

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
          {/* 開く ＋ 最近開いたファイル */}
          <div ref={recentMenuRef} className="relative flex items-center">
            <button
              onClick={() => {
                closeAllMenus();
                onOpenFile();
              }}
              className="px-2 py-1 rounded-l hover:bg-[#2d2d30] flex items-center gap-1.5 text-[#d4d4d4] hover:text-white transition-colors"
              title="NC / DNC ファイルを開く (Cmd/Ctrl+O)"
            >
              <FolderOpen className="w-3.5 h-3.5 text-[#fbbf24]" />
              開く
            </button>
            <button
              onClick={() => {
                const next = !recentMenuOpen;
                closeAllMenus();
                setRecentMenuOpen(next);
              }}
              className={`px-1 py-1 rounded-r transition-colors ${
                recentMenuOpen
                  ? "bg-[#2d2d30] text-white"
                  : "text-[#8e95a2] hover:bg-[#2d2d30] hover:text-white"
              }`}
              title="最近開いたファイル"
            >
              <ChevronDown className="w-3 h-3" />
            </button>

            {recentMenuOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-2xl py-1 text-xs">
                <div className="px-3 py-1 flex items-center justify-between border-b border-[#323233]">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8e95a2] flex items-center gap-1">
                    <Clock className="w-3 h-3" /> 最近開いたファイル
                  </span>
                  {recentFiles.length > 0 && (
                    <button
                      onClick={() => {
                        setRecentMenuOpen(false);
                        onClearRecentFiles();
                      }}
                      className="text-[10px] text-[#8e95a2] hover:text-[#f87171] flex items-center gap-0.5"
                    >
                      <Trash2 className="w-2.5 h-2.5" /> クリア
                    </button>
                  )}
                </div>
                {recentFiles.length === 0 ? (
                  <div className="px-3 py-3 text-[11px] text-[#787878] text-center">
                    まだ履歴がありません
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto py-0.5">
                    {recentFiles.map((item) => (
                      <button
                        key={item.path}
                        onClick={() => {
                          setRecentMenuOpen(false);
                          onOpenRecentFile(item.path);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-[#094771] hover:text-white transition-colors"
                        title={item.path}
                      >
                        <div className="font-mono font-medium text-[#e2e8f0] truncate">
                          {item.fileName}
                        </div>
                        <div className="text-[10px] text-[#8e95a2] truncate font-mono">
                          {item.path}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 保存 ＋ 名前を付けて保存 */}
          <div ref={saveMenuRef} className="relative flex items-center">
            <button
              onClick={() => {
                closeAllMenus();
                onSaveFile();
              }}
              className={`px-2 py-1 rounded-l hover:bg-[#2d2d30] flex items-center gap-1.5 transition-colors ${
                isDirty ? "text-white font-medium" : "text-[#d4d4d4] hover:text-white"
              }`}
              title={
                filePath
                  ? "上書き保存 (Cmd/Ctrl+S)"
                  : "名前を付けて保存 (Cmd/Ctrl+S)"
              }
            >
              <Save
                className={`w-3.5 h-3.5 ${isDirty ? "text-[#fbbf24]" : "text-[#4ade80]"}`}
              />
              保存
            </button>
            <button
              onClick={() => {
                const next = !saveMenuOpen;
                closeAllMenus();
                setSaveMenuOpen(next);
              }}
              className={`px-1 py-1 rounded-r transition-colors ${
                saveMenuOpen
                  ? "bg-[#2d2d30] text-white"
                  : "text-[#8e95a2] hover:bg-[#2d2d30] hover:text-white"
              }`}
              title="保存メニュー（上書き保存 / 名前を付けて保存）"
            >
              <ChevronDown className="w-3 h-3" />
            </button>

            {saveMenuOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 w-56 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-2xl py-1 text-xs">
                <button
                  onClick={() => {
                    setSaveMenuOpen(false);
                    onSaveFile();
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#094771] hover:text-white flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Save className="w-3.5 h-3.5 text-[#4ade80]" />
                    上書き保存
                  </span>
                  <span className="text-[10px] font-mono text-[#8e95a2]">Ctrl+S</span>
                </button>
                <button
                  onClick={() => {
                    setSaveMenuOpen(false);
                    onSaveAsFile();
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#094771] hover:text-white flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <SaveAll className="w-3.5 h-3.5 text-[#38bdf8]" />
                    名前を付けて保存...
                  </span>
                  <span className="text-[10px] font-mono text-[#8e95a2]">Ctrl+Shift+S</span>
                </button>
              </div>
            )}
          </div>

          {/* サンプルNC ドロップダウン */}
          <div ref={sampleMenuRef} className="relative">
            <button
              onClick={() => {
                const next = !sampleMenuOpen;
                closeAllMenus();
                setSampleMenuOpen(next);
              }}
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

      {/* 中央：現在ファイル表示 + 文字コード切替 */}
      <div className="flex items-center gap-2 text-[11.5px] text-[#d4d4d4] font-mono truncate max-w-[30%] bg-[#181818] border border-[#2b2b2b] rounded px-2.5 py-0.5">
        <span className="truncate" title={filePath ?? fileName}>
          {fileName}
          {isDirty ? <span className="text-[#fbbf24] ml-1">●</span> : null}
        </span>
        <button
          onClick={onToggleEncoding}
          className="px-1.5 py-0 rounded bg-[#252526] hover:bg-[#323233] text-[10px] text-[#9cdcfe] shrink-0 transition-colors"
          title="クリックして保存時の文字コードを切替 (UTF-8 ⇔ Shift-JIS)"
        >
          {encoding}
        </button>
        {isParsing && (
          <span className="text-[#38bdf8] text-[10px] animate-pulse shrink-0">解析中...</span>
        )}
      </div>

      {/* 右：外部監視・マシン切替トグル・VS Code風レイアウト切替 */}
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

        {/* マシンプロファイル クイック切替ドロップダウン */}
        <div ref={machineMenuRef} className="relative">
          <button
            onClick={() => {
              const next = !machineMenuOpen;
              closeAllMenus();
              setMachineMenuOpen(next);
            }}
            className={`px-2.5 py-0.5 rounded border flex items-center gap-1.5 transition-colors max-w-[230px] ${
              machineMenuOpen
                ? "bg-[#094771] border-[#0078d4] text-white"
                : "bg-[#181818] border-[#2f2f32] hover:border-[#4b5263] text-[#9cdcfe]"
            }`}
            title="クリックして使用マシン（機械仕様・工具マガジン・径補正）を切替"
          >
            <Cpu className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />
            <span className="truncate font-medium">
              {activeMachineProfile.config.profileName}
            </span>
            <ChevronDown className="w-3 h-3 opacity-75 shrink-0" />
          </button>

          {machineMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-2xl py-1 text-xs">
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#8e95a2] border-b border-[#323233]">
                マシンを切り替え (工具・早送り・ATC連動)
              </div>
              <div className="max-h-64 overflow-y-auto py-0.5">
                {machineProfiles.map((prof) => {
                  const isActive = prof.id === activeMachineProfile.id;
                  const toolCount = Object.keys(prof.config.tools).length;
                  return (
                    <button
                      key={prof.id}
                      onClick={() => {
                        setMachineMenuOpen(false);
                        onSelectMachineProfile(prof.id);
                      }}
                      className={`w-full text-left px-3 py-1.5 flex items-start gap-2 transition-colors ${
                        isActive
                          ? "bg-[#094771]/70 text-white"
                          : "hover:bg-[#2a2d2e] text-[#d4d4d4]"
                      }`}
                    >
                      <span className="w-4 mt-0.5 shrink-0 flex items-center justify-center">
                        {isActive && <Check className="w-3.5 h-3.5 text-[#38bdf8]" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate flex items-center gap-1.5">
                          <span className="truncate">{prof.config.profileName}</span>
                          {!prof.builtin && (
                            <span className="text-[9.5px] px-1 rounded bg-[#38bdf8]/20 text-[#7dd3fc] shrink-0">
                              カスタム
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-[#94a3b8]">
                          早送り {(prof.config.rapidRateX / 1000).toFixed(0)}m/分 ・ ATC{" "}
                          {prof.config.toolChangeTimeSec}s ・ 工具{toolCount}本
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-[#323233] pt-1 mt-0.5 px-1">
                <button
                  onClick={() => {
                    setMachineMenuOpen(false);
                    onOpenMachineSettings();
                  }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-[#2a2d2e] text-[#9cdcfe] flex items-center gap-1.5 text-[11px]"
                >
                  <Settings className="w-3.5 h-3.5" />
                  マシン設定・工具マガジンを編集...
                </button>
              </div>
            </div>
          )}
        </div>

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
