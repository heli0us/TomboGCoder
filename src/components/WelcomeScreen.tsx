import React from "react";
import {
  Clock,
  Cpu,
  FileCode2,
  FilePlus2,
  FolderOpen,
  Keyboard,
  Settings,
  Trash2,
  Upload,
} from "lucide-react";
import type { MachineProfile } from "../types/nc";
import type { RecentFileEntry } from "./TopBar";

interface WelcomeScreenProps {
  isMac: boolean;
  activeMachineProfile: MachineProfile;
  recentFiles: RecentFileEntry[];
  onOpenFile: () => void;
  onNewFile: () => void;
  onOpenRecentFile: (path: string) => void;
  onClearRecentFiles: () => void;
  onOpenMachineSettings: () => void;
  onOpenShortcuts: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  isMac,
  activeMachineProfile,
  recentFiles,
  onOpenFile,
  onNewFile,
  onOpenRecentFile,
  onClearRecentFiles,
  onOpenMachineSettings,
  onOpenShortcuts,
}) => {
  const mod = isMac ? "⌘" : "Ctrl+";
  const cfg = activeMachineProfile.config;

  return (
    <div
      className="relative flex-1 h-full w-full overflow-y-auto flex items-center justify-center p-6 sm:p-10 select-none"
      style={{
        backgroundColor: "#141519",
        backgroundImage:
          "radial-gradient(circle at 22% 18%, rgba(56, 189, 248, 0.08), transparent 44%), radial-gradient(circle at 82% 80%, rgba(14, 165, 233, 0.06), transparent 42%), linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
        backgroundSize: "100% 100%, 100% 100%, 32px 32px, 32px 32px",
      }}
    >
      <div className="w-full max-w-[820px] space-y-7">
        {/* ブランドヘッダー */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#272a33] pb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0ea5e9]/25 to-[#0369a1]/20 border border-[#38bdf8]/40 flex items-center justify-center shadow-[0_0_24px_rgba(56,189,248,0.14)]">
              <FileCode2 className="w-6 h-6 text-[#38bdf8]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#f8fafc] leading-none">
                TomboGCoder
              </h1>
              <p className="text-xs text-[#94a3b8] mt-1.5">
                FANUC 3軸 マシニングセンタ向け NCビューア &amp; 事前検証ツール
              </p>
            </div>
          </div>

          <button
            onClick={onOpenMachineSettings}
            className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1c1e24]/90 hover:bg-[#23262f] border border-[#2f333e] hover:border-[#38bdf8]/50 transition-colors text-left"
            title="マシン設定・工具マガジンを開く"
          >
            <Cpu className="w-4 h-4 text-[#38bdf8] shrink-0" />
            <div className="min-w-0">
              <div className="text-[11.5px] font-medium text-[#e2e8f0] group-hover:text-white truncate max-w-[200px]">
                {cfg.profileName}
              </div>
              <div className="text-[10px] font-mono text-[#7c8594]">
                早送り {(cfg.rapidRateX / 1000).toFixed(0)}m/分 ・ ATC {cfg.toolChangeTimeSec}s
              </div>
            </div>
          </button>
        </div>

        {/* メイン2カラム：左＝開始アクション / 右＝最近開いたファイル */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.15fr] gap-6">
          {/* 左：クイックアクション */}
          <div className="space-y-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#7c8594]">
              開始
            </div>

            <button
              onClick={onOpenFile}
              className="w-full text-left p-4 rounded-xl bg-gradient-to-br from-[#0078d4]/22 to-[#094771]/35 hover:from-[#0078d4]/34 hover:to-[#094771]/50 border border-[#0078d4]/55 hover:border-[#38bdf8]/80 transition-all shadow-lg group"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2.5 font-semibold text-sm text-white">
                  <FolderOpen className="w-4 h-4 text-[#fbbf24]" />
                  NCファイルを開く
                </span>
                <kbd className="px-1.5 py-0.5 rounded bg-[#141519]/75 border border-[#38bdf8]/30 font-mono text-[10px] text-[#9cdcfe]">
                  {mod}O
                </kbd>
              </div>
              <p className="text-[11px] text-[#cbd5e1]/85 mt-1.5 leading-relaxed">
                .nc / .dnc / .tap / .txt（Shift-JIS・UTF-8 自動判別）
              </p>
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={onNewFile}
                className="text-left p-3 rounded-xl bg-[#1b1d23]/90 hover:bg-[#23262f] border border-[#2c303a] hover:border-[#424857] transition-colors space-y-1"
              >
                <div className="flex items-center justify-between">
                  <FilePlus2 className="w-4 h-4 text-[#4ade80]" />
                  <kbd className="font-mono text-[10px] text-[#7c8594]">{mod}N</kbd>
                </div>
                <div className="text-xs font-medium text-[#e2e8f0] pt-0.5">新規NC作成</div>
                <div className="text-[10.5px] text-[#7c8594]">テンプレートから作成</div>
              </button>

              <button
                onClick={onOpenMachineSettings}
                className="text-left p-3 rounded-xl bg-[#1b1d23]/90 hover:bg-[#23262f] border border-[#2c303a] hover:border-[#424857] transition-colors space-y-1"
              >
                <div className="flex items-center justify-between">
                  <Settings className="w-4 h-4 text-[#38bdf8]" />
                  <span className="font-mono text-[10px] text-[#7c8594]">
                    T{Object.keys(cfg.tools).length}
                  </span>
                </div>
                <div className="text-xs font-medium text-[#e2e8f0] pt-0.5">マシン・工具設定</div>
                <div className="text-[10.5px] text-[#7c8594]">プロファイル / Sim置換</div>
              </button>
            </div>

            {/* ドロップ案内 */}
            <div className="rounded-xl border border-dashed border-[#2f3440] bg-[#17191f]/75 px-3.5 py-3 flex items-center gap-2.5 text-[11px] text-[#8e95a2]">
              <Upload className="w-4 h-4 text-[#38bdf8]/80 shrink-0" />
              <span>
                NC / DNC ファイルをこのウィンドウへ<strong className="text-[#cbd5e1] font-medium">ドラッグ＆ドロップ</strong>して直接開けます
              </span>
            </div>
          </div>

          {/* 右：最近開いたファイル */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#7c8594] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                最近開いたファイル
              </span>
              {recentFiles.length > 0 && (
                <button
                  onClick={onClearRecentFiles}
                  className="text-[10.5px] text-[#7c8594] hover:text-[#f87171] flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> 履歴をクリア
                </button>
              )}
            </div>

            <div className="flex-1 rounded-xl bg-[#1b1d23]/80 border border-[#2c303a] overflow-hidden flex flex-col">
              {recentFiles.length === 0 ? (
                <div className="flex-1 min-h-[210px] flex flex-col items-center justify-center p-6 text-center space-y-1.5">
                  <Clock className="w-6 h-6 text-[#3b404d]" />
                  <div className="text-xs text-[#94a3b8]">最近開いたファイルはまだありません</div>
                  <div className="text-[11px] text-[#64748b]">
                    開いた NC プログラムが自動でここに記録されます
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-[#262932] max-h-[272px] overflow-y-auto">
                  {recentFiles.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => onOpenRecentFile(item.path)}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-[#094771]/45 transition-colors flex items-center gap-3 group"
                      title={item.path}
                    >
                      <FileCode2 className="w-4 h-4 text-[#64748b] group-hover:text-[#38bdf8] shrink-0 transition-colors" />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-xs font-medium text-[#e2e8f0] group-hover:text-white truncate">
                          {item.fileName}
                        </div>
                        <div className="font-mono text-[10px] text-[#6e7681] truncate mt-0.5">
                          {item.path}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* フッター：控えめな機能バッジ & 操作ガイド */}
        <div className="pt-4 border-t border-[#23262e] flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#6e7681]">
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
            {["G41/G42 径補正", "固定サイクル", "カスタムマクロB", "M98/M99 サブ", "Shift-JIS / UTF-8"].map(
              (tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-md bg-[#1b1d23] border border-[#292d36] text-[#8e95a2]"
                >
                  {tag}
                </span>
              ),
            )}
          </div>
          <button
            onClick={onOpenShortcuts}
            className="flex items-center gap-1.5 text-[#94a3b8] hover:text-[#38bdf8] transition-colors"
          >
            <Keyboard className="w-3.5 h-3.5" />
            ショートカット &amp; 3D操作ガイド
          </button>
        </div>
      </div>
    </div>
  );
};
