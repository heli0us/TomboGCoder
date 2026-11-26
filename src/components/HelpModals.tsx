import React from "react";
import { Cpu, FileCode2, Keyboard, Mouse, X } from "lucide-react";

interface HelpModalProps {
  mode: "shortcuts" | "about";
  isMac: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ mode, isMac, onClose }) => {
  const mod = isMac ? "⌘" : "Ctrl+";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#252526] border border-[#3c3c3c] rounded-lg shadow-2xl overflow-hidden text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[#323233] flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-[#f1f5f9] text-[13px]">
            {mode === "shortcuts" ? (
              <>
                <Keyboard className="w-4 h-4 text-[#38bdf8]" />
                <span>キーボードショートカット &amp; 3Dマウス操作ガイド</span>
              </>
            ) : (
              <>
                <FileCode2 className="w-4 h-4 text-[#38bdf8]" />
                <span>TomboGCoder について</span>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[#8e95a2] hover:text-white hover:bg-[#323233]"
            title="閉じる (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {mode === "shortcuts" ? (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
            <section className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#9cdcfe] flex items-center gap-1.5">
                <Keyboard className="w-3.5 h-3.5" /> ファイル・編集・表示
              </h3>
              <div className="bg-[#1e1e1e] border border-[#2f2f32] rounded-md divide-y divide-[#2a2a2c]">
                {(
                  [
                    ["新規NC作成", `${mod}N`],
                    ["NCファイルを開く", `${mod}O`],
                    ["上書き保存", `${mod}S`],
                    ["名前を付けて保存", `${mod}Shift+S`],
                    ["エディタ内検索・置換", `${mod}F`],
                    ["元に戻す / やり直し", `${mod}Z / ${mod}Y`],
                    ["左サイドバー切替", `${mod}B`],
                    ["NCエディタ切替", `${mod}E`],
                    ["下部パネル切替", `${mod}J`],
                  ] as const
                ).map(([label, key]) => (
                  <div
                    key={label}
                    className="px-2.5 py-1.5 flex items-center justify-between gap-2"
                  >
                    <span className="text-[#cbd5e1]">{label}</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-[#2d2d30] border border-[#3c3c3c] font-mono text-[10.5px] text-[#e2e8f0]">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div className="space-y-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#9cdcfe] flex items-center gap-1.5">
                  <Mouse className="w-3.5 h-3.5" /> 3Dビュー操作 (AutoCAD準拠)
                </h3>
                <div className="bg-[#1e1e1e] border border-[#2f2f32] rounded-md divide-y divide-[#2a2a2c]">
                  {(
                    [
                      ["拡大・縮小 (カーソル基準)", "ホイール上下"],
                      ["画面の平行移動 (パン)", "左 / 中ドラッグ"],
                      ["3D回転 (オービット)", "右 / Shift+中ドラッグ"],
                      ["全体表示へフィット", "中ダブルクリック / F"],
                      ["窓ズーム (範囲拡大)", "ビュー左上 窓ボタン"],
                    ] as const
                  ).map(([label, key]) => (
                    <div
                      key={label}
                      className="px-2.5 py-1.5 flex items-center justify-between gap-2"
                    >
                      <span className="text-[#cbd5e1]">{label}</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-[#2d2d30] border border-[#3c3c3c] font-mono text-[10.5px] text-[#e2e8f0]">
                        {key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#9cdcfe]">
                  シミュレーション再生
                </h3>
                <div className="bg-[#1e1e1e] border border-[#2f2f32] rounded-md divide-y divide-[#2a2a2c]">
                  {(
                    [
                      ["再生 / 一時停止", "Space"],
                      ["次のブロックへコマ送り", "→"],
                      ["前のブロックへコマ戻し", "←"],
                    ] as const
                  ).map(([label, key]) => (
                    <div
                      key={label}
                      className="px-2.5 py-1.5 flex items-center justify-between gap-2"
                    >
                      <span className="text-[#cbd5e1]">{label}</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-[#2d2d30] border border-[#3c3c3c] font-mono text-[10.5px] text-[#e2e8f0]">
                        {key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="p-5 space-y-4 text-[#cbd5e1]">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-[#094771]/60 border border-[#38bdf8]/40 flex items-center justify-center">
                <FileCode2 className="w-6 h-6 text-[#38bdf8]" />
              </div>
              <div>
                <div className="text-base font-bold text-white tracking-tight">TomboGCoder</div>
                <div className="text-[11.5px] text-[#94a3b8]">
                  Version 0.1.0 — FANUC 3軸マシニングセンタ向け NCビューア &amp; 事前検証ツール
                </div>
              </div>
            </div>

            <div className="bg-[#1e1e1e] border border-[#2f2f32] rounded-md p-3 space-y-2 text-[11.5px]">
              <div className="font-semibold text-[#9cdcfe] flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" /> 主な対応仕様
              </div>
              <ul className="list-disc list-inside space-y-1 text-[#cbd5e1]">
                <li>
                  FANUC 3軸 Gコード（G00/G01/G02/G03、平面選択 G17/18/19、G52/G54〜G59、G90/G91）
                </li>
                <li>固定サイクル展開（G73/G81/G82/G83/G84/G85/G86、G98/G99、K0対応）</li>
                <li>工具径補正シミュレーション（G40/G41/G42・内R不足/干渉エラー自動検出）</li>
                <li>
                  カスタムマクロB（変数・演算式・IF/GOTO/WHILE・G65引数展開）および M98/M99・複数O番号DNC
                </li>
                <li>
                  マシンプロファイル統合管理（早送り・ATC・T工具マガジン・D径補正・JSON入出力）
                </li>
                <li>Shift-JIS / UTF-8 自動判別＆元文字コード維持保存・D&amp;Dコード挿入</li>
              </ul>
            </div>

            <div className="text-[11px] text-[#787878] font-mono">
              Powered by Tauri v2 + Rust Core + React 19 + Three.js + CodeMirror 6
            </div>
          </div>
        )}

        <div className="px-4 py-2.5 bg-[#1e1e1e] border-t border-[#323233] flex justify-end">
          <button
            onClick={onClose}
            className="px-3.5 py-1 rounded bg-[#0078d4] hover:bg-[#1a8ad4] text-white font-medium transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
