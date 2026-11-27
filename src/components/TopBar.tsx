import React, { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Cpu,
  FileCode2,
  Minus,
  PanelBottom,
  PanelLeft,
  Radio,
  Settings,
  Square,
  X,
} from "lucide-react";
import { isTauriRuntime } from "../services/ncApi";
import type { CameraPreset, DisplayOptions, MachineProfile } from "../types/nc";

export interface RecentFileEntry {
  path: string;
  fileName: string;
}

type TopMenuKey = "file" | "edit" | "view" | "machine" | "sim" | "help";

interface TopBarProps {
  isMac: boolean;
  hasDocument: boolean;
  fileName: string;
  filePath: string | null;
  encoding: string;
  isDirty: boolean;
  isParsing: boolean;
  watchExternal: boolean;
  recentFiles: RecentFileEntry[];
  machineProfiles: MachineProfile[];
  activeMachineProfile: MachineProfile;
  displayOptions: DisplayOptions;
  isPlaying: boolean;
  isViewportMaximized: boolean;
  breakpointCount: number;
  sidebarOpen: boolean;
  editorOpen: boolean;
  bottomOpen: boolean;
  // ファイル系
  onNewFile: () => void;
  onOpenFile: () => void;
  onOpenRecentFile: (path: string) => void;
  onClearRecentFiles: () => void;
  onSaveFile: () => void;
  onSaveAsFile: () => void;
  onCloseDocument: () => void;
  onToggleEncoding: () => void;
  onToggleWatchExternal: () => void;
  onExportCsv: () => void;
  onExportHtml: () => void;
  onQuitApp: () => void;
  // 編集系
  onEditUndo: () => void;
  onEditRedo: () => void;
  onEditSearch: () => void;
  onEditSelectAll: () => void;
  onInsertExternalFile: () => void;
  onOpenEditToolsPanel: () => void;
  // 表示系
  onToggleSidebar: () => void;
  onToggleEditor: () => void;
  onToggleBottom: () => void;
  onToggleMaximizeViewport: () => void;
  onCameraPreset: (preset: CameraPreset | "fit") => void;
  onUpdateDisplayOptions: (patch: Partial<DisplayOptions>) => void;
  // マシン系
  onSelectMachineProfile: (id: string) => void;
  onOpenMachineSettings: () => void;
  onExportActiveMachineProfile: () => void;
  onExportAllMachineProfiles: () => void;
  onImportMachineProfiles: () => void;
  // シミュレーション系
  onTogglePlay: () => void;
  onRewindSim: () => void;
  onStepSim: (delta: number) => void;
  onClearBreakpoints: () => void;
  onOpenBottomTab: (tab: "cycle" | "problems" | "modal" | "macros") => void;
  // ヘルプ系
  onOpenHelpModal: (mode: "shortcuts" | "about") => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  isMac,
  hasDocument,
  fileName,
  filePath,
  encoding,
  isDirty,
  isParsing,
  watchExternal,
  recentFiles,
  machineProfiles,
  activeMachineProfile,
  displayOptions,
  isPlaying,
  isViewportMaximized,
  breakpointCount,
  sidebarOpen,
  editorOpen,
  bottomOpen,
  onNewFile,
  onOpenFile,
  onOpenRecentFile,
  onClearRecentFiles,
  onSaveFile,
  onSaveAsFile,
  onCloseDocument,
  onToggleEncoding,
  onToggleWatchExternal,
  onExportCsv,
  onExportHtml,
  onQuitApp,
  onEditUndo,
  onEditRedo,
  onEditSearch,
  onEditSelectAll,
  onInsertExternalFile,
  onOpenEditToolsPanel,
  onToggleSidebar,
  onToggleEditor,
  onToggleBottom,
  onToggleMaximizeViewport,
  onCameraPreset,
  onUpdateDisplayOptions,
  onSelectMachineProfile,
  onOpenMachineSettings,
  onExportActiveMachineProfile,
  onExportAllMachineProfiles,
  onImportMachineProfiles,
  onTogglePlay,
  onRewindSim,
  onStepSim,
  onClearBreakpoints,
  onOpenBottomTab,
  onOpenHelpModal,
}) => {
  const [openMenu, setOpenMenu] = useState<TopMenuKey | null>(null);
  const [recentSubOpen, setRecentSubOpen] = useState(false);
  const [machineMenuOpen, setMachineMenuOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const menuBarRef = useRef<HTMLDivElement | null>(null);
  const machineMenuRef = useRef<HTMLDivElement | null>(null);

  const mod = isMac ? "⌘" : "Ctrl+";

  // ウィンドウ最大化状態のリアルタイム同期（Windows/Linux カスタムタイトルバー用）
  useEffect(() => {
    if (!isTauriRuntime() || isMac) return;
    let unlisten: (() => void) | null = null;
    let active = true;
    const win = getCurrentWindow();
    win
      .isMaximized()
      .then((m) => {
        if (active) setIsMaximized(m);
      })
      .catch(() => {});

    win
      .onResized(() => {
        win
          .isMaximized()
          .then((m) => {
            if (active) setIsMaximized(m);
          })
          .catch(() => {});
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});

    return () => {
      active = false;
      unlisten?.();
    };
  }, [isMac]);

  // メニュー外クリック / Esc キーで閉じる
  useEffect(() => {
    if (!openMenu && !machineMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuBarRef.current && !menuBarRef.current.contains(target)) {
        setOpenMenu(null);
        setRecentSubOpen(false);
      }
      if (machineMenuRef.current && !machineMenuRef.current.contains(target)) {
        setMachineMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenMenu(null);
        setRecentSubOpen(false);
        setMachineMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [openMenu, machineMenuOpen]);

  const closeMenus = () => {
    setOpenMenu(null);
    setRecentSubOpen(false);
    setMachineMenuOpen(false);
  };

  const runAction = (fn: () => void) => {
    closeMenus();
    fn();
  };

  const handleToggleMaximizeWindow = () => {
    if (!isTauriRuntime()) return;
    getCurrentWindow()
      .toggleMaximize()
      .catch(() => {});
  };

  const handleMinimizeWindow = () => {
    if (!isTauriRuntime()) return;
    getCurrentWindow()
      .minimize()
      .catch(() => {});
  };

  const menuTabs = useMemo(
    () =>
      [
        ["file", "ファイル"],
        ["edit", "編集"],
        ["view", "表示"],
        ["machine", "マシン"],
        ["sim", "シミュレーション"],
        ["help", "ヘルプ"],
      ] as const,
    [],
  );

  const MenuItem: React.FC<{
    label: string;
    shortcut?: string;
    checked?: boolean;
    disabled?: boolean;
    onClick: () => void;
  }> = ({ label, shortcut, checked, disabled, onClick }) => (
    <button
      onClick={() => !disabled && runAction(onClick)}
      disabled={disabled}
      className="w-full text-left px-2.5 py-1.5 rounded-[3px] hover:bg-[#094771] hover:text-white disabled:opacity-40 disabled:hover:bg-transparent flex items-center justify-between gap-4 text-[12px] text-[#d4d4d4] transition-colors"
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="w-3.5 shrink-0 flex items-center justify-center">
          {checked && <Check className="w-3.5 h-3.5 text-[#38bdf8]" />}
        </span>
        <span className="truncate">{label}</span>
      </span>
      {shortcut && (
        <span className="text-[10.5px] font-mono text-[#8e95a2] shrink-0">{shortcut}</span>
      )}
    </button>
  );

  const MenuDivider = () => <div className="my-1 border-t border-[#323233]" />;

  return (
    <header
      className={`h-[38px] bg-[#181818] border-b border-[#2b2b2b] flex items-center justify-between shrink-0 text-xs select-none ${
        isMac ? "pl-[76px] pr-2.5" : "pl-2.5 pr-0"
      }`}
    >
      {/* 左：アプリロゴ ＋ プロ向けメニューバー */}
      <div className="flex items-center gap-1 min-w-0 shrink-0">
        {!isMac && (
          <div
            data-tauri-drag-region
            onDoubleClick={handleToggleMaximizeWindow}
            className="flex items-center gap-1.5 pr-2 text-[#f1f5f9] font-semibold tracking-tight"
            title="TomboGCoder"
          >
            <FileCode2 className="w-4 h-4 text-[#38bdf8] pointer-events-none" />
          </div>
        )}

        <nav ref={menuBarRef} className="flex items-center gap-0.5 relative">
          {menuTabs.map(([key, label]) => {
            const active = openMenu === key;
            return (
              <div key={key} className="relative">
                <button
                  onClick={() => {
                    setMachineMenuOpen(false);
                    setRecentSubOpen(false);
                    setOpenMenu(active ? null : key);
                  }}
                  onMouseEnter={() => {
                    // メニュー展開中はホバーだけで隣メニューへ切替（ネイティブ挙動）
                    if (openMenu && openMenu !== key) {
                      setRecentSubOpen(false);
                      setOpenMenu(key);
                    }
                  }}
                  className={`px-2 py-1 rounded-[4px] text-[12px] transition-colors ${
                    active
                      ? "bg-[#2d2d30] text-white"
                      : "text-[#cccccc] hover:bg-[#2a2d2e] hover:text-white"
                  }`}
                >
                  {label}
                </button>

                {/* ファイル メニュー */}
                {active && key === "file" && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-2xl p-1">
                    <MenuItem label="新規作成" shortcut={`${mod}N`} onClick={onNewFile} />
                    <MenuItem label="ファイルを開く..." shortcut={`${mod}O`} onClick={onOpenFile} />

                    {/* 最近開いたファイル サブメニュー */}
                    <div
                      className="relative"
                      onMouseEnter={() => setRecentSubOpen(true)}
                      onMouseLeave={() => setRecentSubOpen(false)}
                    >
                      <button
                        onClick={() => setRecentSubOpen((v) => !v)}
                        className="w-full text-left px-2.5 py-1.5 rounded-[3px] hover:bg-[#094771] hover:text-white flex items-center justify-between gap-3 text-[12px] text-[#d4d4d4]"
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-3.5 shrink-0" />
                          <span>最近開いたファイル</span>
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-[#8e95a2]" />
                      </button>

                      {recentSubOpen && (
                        <div className="absolute left-full top-0 ml-0.5 z-50 w-72 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-2xl p-1">
                          {recentFiles.length === 0 ? (
                            <div className="px-3 py-2 text-[11px] text-[#787878] text-center">
                              履歴はありません
                            </div>
                          ) : (
                            <>
                              <div className="max-h-60 overflow-y-auto">
                                {recentFiles.map((item) => (
                                  <button
                                    key={item.path}
                                    onClick={() => runAction(() => onOpenRecentFile(item.path))}
                                    className="w-full text-left px-2.5 py-1.5 rounded-[3px] hover:bg-[#094771] hover:text-white transition-colors"
                                    title={item.path}
                                  >
                                    <div className="font-mono text-[11.5px] text-[#e2e8f0] truncate">
                                      {item.fileName}
                                    </div>
                                    <div className="font-mono text-[10px] text-[#8e95a2] truncate">
                                      {item.path}
                                    </div>
                                  </button>
                                ))}
                              </div>
                              <MenuDivider />
                              <MenuItem label="履歴をクリア" onClick={onClearRecentFiles} />
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <MenuDivider />
                    <MenuItem
                      label="上書き保存"
                      shortcut={`${mod}S`}
                      disabled={!hasDocument}
                      onClick={onSaveFile}
                    />
                    <MenuItem
                      label="名前を付けて保存..."
                      shortcut={`${mod}Shift+S`}
                      disabled={!hasDocument}
                      onClick={onSaveAsFile}
                    />
                    <MenuItem
                      label={`文字コード切替 (現在: ${encoding})`}
                      disabled={!hasDocument}
                      onClick={onToggleEncoding}
                    />
                    <MenuItem
                      label="ファイルを閉じる (スタート画面へ)"
                      shortcut={`${mod}W`}
                      disabled={!hasDocument}
                      onClick={onCloseDocument}
                    />
                    <MenuDivider />
                    <MenuItem
                      label="外部変更の自動監視"
                      checked={Boolean(filePath && watchExternal)}
                      disabled={!filePath}
                      onClick={onToggleWatchExternal}
                    />
                    <MenuDivider />
                    <MenuItem
                      label="CSV加工レポート出力..."
                      disabled={!hasDocument}
                      onClick={onExportCsv}
                    />
                    <MenuItem
                      label="HTML加工レポート出力..."
                      disabled={!hasDocument}
                      onClick={onExportHtml}
                    />
                    <MenuDivider />
                    <MenuItem
                      label="終了"
                      shortcut={isMac ? "⌘Q" : "Alt+F4"}
                      onClick={onQuitApp}
                    />
                  </div>
                )}

                {/* 編集 メニュー */}
                {active && key === "edit" && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-2xl p-1">
                    <MenuItem label="元に戻す" shortcut={`${mod}Z`} onClick={onEditUndo} />
                    <MenuItem
                      label="やり直し"
                      shortcut={isMac ? "⌘Shift+Z" : "Ctrl+Y"}
                      onClick={onEditRedo}
                    />
                    <MenuDivider />
                    <MenuItem label="検索・置換" shortcut={`${mod}F`} onClick={onEditSearch} />
                    <MenuItem label="すべて選択" shortcut={`${mod}A`} onClick={onEditSelectAll} />
                    <MenuDivider />
                    <MenuItem
                      label="外部NCファイルをカーソルへ挿入..."
                      onClick={onInsertExternalFile}
                    />
                    <MenuItem
                      label="正規表現置換ルール & 定型文パネル..."
                      onClick={onOpenEditToolsPanel}
                    />
                  </div>
                )}

                {/* 表示 メニュー */}
                {active && key === "view" && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-2xl p-1">
                    <MenuItem
                      label="左サイドバー"
                      shortcut={`${mod}B`}
                      checked={sidebarOpen}
                      onClick={onToggleSidebar}
                    />
                    <MenuItem
                      label="NCコードエディタ"
                      shortcut={`${mod}E`}
                      checked={editorOpen}
                      onClick={onToggleEditor}
                    />
                    <MenuItem
                      label="下部パネル"
                      shortcut={`${mod}J`}
                      checked={bottomOpen}
                      onClick={onToggleBottom}
                    />
                    <MenuItem
                      label="3Dビュー全画面表示"
                      checked={isViewportMaximized}
                      onClick={onToggleMaximizeViewport}
                    />
                    <MenuDivider />
                    <MenuItem
                      label="全体表示 (フィット)"
                      shortcut="F"
                      onClick={() => onCameraPreset("fit")}
                    />
                    <MenuItem label="等角図 (ISO)" onClick={() => onCameraPreset("iso")} />
                    <MenuItem label="平面図 (XY)" onClick={() => onCameraPreset("top")} />
                    <MenuItem label="正面図 (XZ)" onClick={() => onCameraPreset("front")} />
                    <MenuItem label="右側面図 (YZ)" onClick={() => onCameraPreset("right")} />
                    <MenuItem
                      label="3画面分割 (XY / XZ + 3D)"
                      checked={displayOptions.viewLayout === "triple"}
                      onClick={() =>
                        onUpdateDisplayOptions({
                          viewLayout: displayOptions.viewLayout === "triple" ? "single" : "triple",
                        })
                      }
                    />
                    <MenuItem
                      label="4面図 (XY / XZ / YZ + 3D)"
                      checked={displayOptions.viewLayout === "quad"}
                      onClick={() =>
                        onUpdateDisplayOptions({
                          viewLayout: displayOptions.viewLayout === "quad" ? "single" : "quad",
                        })
                      }
                    />
                    <MenuItem
                      label="透過ストック (素材) を表示"
                      checked={displayOptions.stock.enabled}
                      onClick={() =>
                        onUpdateDisplayOptions({
                          stock: { ...displayOptions.stock, enabled: !displayOptions.stock.enabled },
                        })
                      }
                    />
                    <MenuDivider />
                    <MenuItem
                      label="早送り (G00) を表示"
                      checked={displayOptions.showRapid}
                      onClick={() =>
                        onUpdateDisplayOptions({ showRapid: !displayOptions.showRapid })
                      }
                    />
                    <MenuItem
                      label="径補正後パスを表示"
                      checked={displayOptions.showCompensatedPath}
                      onClick={() =>
                        onUpdateDisplayOptions({
                          showCompensatedPath: !displayOptions.showCompensatedPath,
                        })
                      }
                    />
                    <MenuItem
                      label="プログラムパスを表示"
                      checked={displayOptions.showProgramPath}
                      onClick={() =>
                        onUpdateDisplayOptions({
                          showProgramPath: !displayOptions.showProgramPath,
                        })
                      }
                    />
                    <MenuItem
                      label="3D工具モデルを表示"
                      checked={displayOptions.showToolModel}
                      onClick={() =>
                        onUpdateDisplayOptions({
                          showToolModel: !displayOptions.showToolModel,
                        })
                      }
                    />
                    <MenuItem
                      label="工具番号ごとに色分け"
                      checked={displayOptions.colorByTool}
                      onClick={() =>
                        onUpdateDisplayOptions({
                          colorByTool: !displayOptions.colorByTool,
                        })
                      }
                    />
                  </div>
                )}

                {/* マシン メニュー */}
                {active && key === "machine" && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-68 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-2xl p-1">
                    <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#8e95a2]">
                      使用マシンの切り替え
                    </div>
                    {machineProfiles.map((prof) => (
                      <MenuItem
                        key={prof.id}
                        label={prof.config.profileName}
                        checked={prof.id === activeMachineProfile.id}
                        onClick={() => onSelectMachineProfile(prof.id)}
                      />
                    ))}
                    <MenuDivider />
                    <MenuItem
                      label="マシン設定・工具マガジンを編集..."
                      onClick={onOpenMachineSettings}
                    />
                    <MenuDivider />
                    <MenuItem
                      label="現在のマシンをエクスポート (JSON)..."
                      onClick={onExportActiveMachineProfile}
                    />
                    <MenuItem
                      label="全マシンを一括バックアップ (JSON)..."
                      onClick={onExportAllMachineProfiles}
                    />
                    <MenuItem
                      label="マシン設定をインポート (JSON)..."
                      onClick={onImportMachineProfiles}
                    />
                  </div>
                )}

                {/* シミュレーション メニュー */}
                {active && key === "sim" && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-2xl p-1">
                    <MenuItem
                      label={isPlaying ? "一時停止" : "トレース再生"}
                      shortcut="Space"
                      onClick={onTogglePlay}
                    />
                    <MenuItem label="先頭ブロックへ戻る" onClick={onRewindSim} />
                    <MenuItem
                      label="次のブロックへコマ送り"
                      shortcut="→"
                      onClick={() => onStepSim(1)}
                    />
                    <MenuItem
                      label="前のブロックへコマ戻し"
                      shortcut="←"
                      onClick={() => onStepSim(-1)}
                    />
                    <MenuDivider />
                    <MenuItem
                      label={`ブレイクポイントをすべて解除 (${breakpointCount})`}
                      disabled={breakpointCount === 0}
                      onClick={onClearBreakpoints}
                    />
                    <MenuDivider />
                    <MenuItem
                      label="サイクルタイム・サマリーを表示"
                      onClick={() => onOpenBottomTab("cycle")}
                    />
                    <MenuItem
                      label="問題・干渉チェックリストを表示"
                      onClick={() => onOpenBottomTab("problems")}
                    />
                    <MenuItem
                      label="モーダル状態を表示"
                      onClick={() => onOpenBottomTab("modal")}
                    />
                    <MenuItem
                      label="カスタムマクロ変数を表示"
                      onClick={() => onOpenBottomTab("macros")}
                    />
                  </div>
                )}

                {/* ヘルプ メニュー */}
                {active && key === "help" && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-2xl p-1">
                    <MenuItem
                      label="ショートカット & 3Dマウス操作一覧"
                      onClick={() => onOpenHelpModal("shortcuts")}
                    />
                    <MenuDivider />
                    <MenuItem
                      label="TomboGCoder について"
                      onClick={() => onOpenHelpModal("about")}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* 中央：ドラッグ可能領域 ＋ 現在ファイル表示ピル */}
      <div
        data-tauri-drag-region
        onDoubleClick={handleToggleMaximizeWindow}
        className="flex-1 h-full flex items-center justify-center px-3 min-w-0"
      >
        {hasDocument ? (
          <div
            data-tauri-drag-region
            className="flex items-center gap-2 text-[11.5px] text-[#d4d4d4] font-mono truncate max-w-[380px] bg-[#222224] border border-[#323234] rounded-md px-2.5 py-0.5"
          >
            <span data-tauri-drag-region className="truncate" title={filePath ?? fileName}>
              {fileName}
              {isDirty ? <span className="text-[#fbbf24] ml-1">●</span> : null}
            </span>
            <button
              onClick={onToggleEncoding}
              className="px-1.5 py-0 rounded bg-[#2d2d30] hover:bg-[#3c3c3c] text-[10px] text-[#9cdcfe] shrink-0 transition-colors"
              title="クリックして保存時の文字コードを切替 (UTF-8 ⇔ Shift-JIS)"
            >
              {encoding}
            </button>
            {isParsing && (
              <span className="text-[#38bdf8] text-[10px] animate-pulse shrink-0">解析中...</span>
            )}
          </div>
        ) : (
          <span
            data-tauri-drag-region
            className="text-[11.5px] font-medium text-[#7c8594] tracking-tight"
          >
            TomboGCoder
          </span>
        )}
      </div>

      {/* 右：外部監視・マシン切替トグル・レイアウト3連・Windowsウィンドウ操作 */}
      <div className="flex items-center h-full shrink-0 text-[11px]">
        <div className="flex items-center gap-1.5 pr-2">
          <button
            onClick={onToggleWatchExternal}
            disabled={!filePath}
            className={`px-1.5 py-0.5 rounded border flex items-center gap-1 transition-colors ${
              filePath && watchExternal
                ? "bg-[#14532d]/45 border-[#22c55e]/60 text-[#86efac]"
                : "bg-[#222224] border-[#323234] text-[#787878]"
            } disabled:opacity-40`}
            title={
              filePath
                ? "外部エディタでファイル保存時に自動リロード（クリックでON/OFF）"
                : "ローカルファイルを開くと外部変更の自動監視が有効になります"
            }
          >
            <Radio className="w-3 h-3" />
            <span className="hidden xl:inline">自動監視</span>
          </button>

          {/* マシンプロファイル クイック切替ドロップダウン */}
          <div ref={machineMenuRef} className="relative">
            <button
              onClick={() => {
                setOpenMenu(null);
                setRecentSubOpen(false);
                setMachineMenuOpen((v) => !v);
              }}
              className={`px-2 py-0.5 rounded border flex items-center gap-1.5 transition-colors max-w-[210px] ${
                machineMenuOpen
                  ? "bg-[#094771] border-[#0078d4] text-white"
                  : "bg-[#222224] border-[#323234] hover:border-[#4b5263] text-[#9cdcfe]"
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

          {/* VS Code 本家風レイアウト切替3連ボタン */}
          <div className="flex items-center gap-0.5 bg-[#222224] border border-[#323234] rounded p-0.5">
            <button
              onClick={onToggleSidebar}
              className={`p-1 rounded transition-colors ${
                sidebarOpen
                  ? "bg-[#333338] text-[#e2e8f0]"
                  : "text-[#6e7681] hover:text-[#cccccc] hover:bg-[#2a2d2e]"
              }`}
              title={`左サイドバーの表示切替 (${mod}B)`}
            >
              <PanelLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onToggleEditor}
              className={`p-1 rounded transition-colors ${
                editorOpen
                  ? "bg-[#333338] text-[#e2e8f0]"
                  : "text-[#6e7681] hover:text-[#cccccc] hover:bg-[#2a2d2e]"
              }`}
              title={`NCコードエディタの表示切替 (${mod}E)`}
            >
              <Code2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onToggleBottom}
              className={`p-1 rounded transition-colors ${
                bottomOpen
                  ? "bg-[#333338] text-[#e2e8f0]"
                  : "text-[#6e7681] hover:text-[#cccccc] hover:bg-[#2a2d2e]"
              }`}
              title={`下部パネルの表示切替 (${mod}J)`}
            >
              <PanelBottom className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Windows / Linux 専用：ネイティブ風 最小化・最大化/元に戻す・閉じるボタン */}
        {!isMac && (
          <div className="flex items-center h-full border-l border-[#2b2b2b]">
            <button
              onClick={handleMinimizeWindow}
              className="w-[44px] h-full flex items-center justify-center text-[#cccccc] hover:bg-[#2d2d30] hover:text-white transition-colors"
              title="最小化"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleToggleMaximizeWindow}
              className="w-[44px] h-full flex items-center justify-center text-[#cccccc] hover:bg-[#2d2d30] hover:text-white transition-colors"
              title={isMaximized ? "元に戻す" : "最大化"}
            >
              {isMaximized ? (
                <Copy className="w-3 h-3 rotate-90" />
              ) : (
                <Square className="w-3 h-3" />
              )}
            </button>
            <button
              onClick={onQuitApp}
              className="w-[46px] h-full flex items-center justify-center text-[#cccccc] hover:bg-[#e81123] hover:text-white transition-colors"
              title="閉じる"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
