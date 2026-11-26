import React, { useState } from "react";
import {
  CopyPlus,
  Download,
  FolderDown,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import {
  BUILTIN_TOOL_PRESETS,
  type MachineConfig,
  type MachineProfile,
  type ParseResult,
  type ToolShape,
  type ToolSpec,
  getToolColor,
  toolShapeLabel,
} from "../../types/nc";

interface MachineProfilePanelProps {
  profiles: MachineProfile[];
  activeProfile: MachineProfile;
  parseResult: ParseResult | null;
  onSelectProfile: (id: string) => void;
  onUpdateActiveConfig: (config: MachineConfig) => void;
  onDuplicateProfile: (newName: string) => void;
  onDeleteProfile: (id: string) => void;
  onResetBuiltinProfile: (id: string) => void;
  onExportActiveProfile: () => void;
  onExportAllProfiles: () => void;
  onImportProfiles: () => void;
}

export const MachineProfilePanel: React.FC<MachineProfilePanelProps> = ({
  profiles,
  activeProfile,
  parseResult,
  onSelectProfile,
  onUpdateActiveConfig,
  onDuplicateProfile,
  onDeleteProfile,
  onResetBuiltinProfile,
  onExportActiveProfile,
  onExportAllProfiles,
  onImportProfiles,
}) => {
  const [subTab, setSubTab] = useState<"t" | "d" | "spec">("t");
  const [newMachineName, setNewMachineName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [newTNum, setNewTNum] = useState("");
  const [newTDia, setNewTDia] = useState("10.0");
  const [newTShape, setNewTShape] = useState<ToolShape>("endmill");
  const [newTName, setNewTName] = useState("");
  const [newDNum, setNewDNum] = useState("");
  const [newDia, setNewDia] = useState("10.0");

  const config = activeProfile.config;

  const setToolSpec = (tNum: number, patch: Partial<ToolSpec>) => {
    const baseTools: Record<number, ToolSpec> = { ...config.tools };
    if (config.autoExtractDiameter && parseResult?.extractedTools) {
      for (const [k, v] of Object.entries(parseResult.extractedTools)) {
        const kn = Number(k);
        if (kn > 0) baseTools[kn] = { ...v };
      }
    }
    const current = baseTools[tNum] ?? { diameter: 6.0, shape: "endmill" as ToolShape, name: "" };
    baseTools[tNum] = {
      ...current,
      ...patch,
      diameter: Math.max(0, patch.diameter ?? current.diameter),
    };
    onUpdateActiveConfig({
      ...config,
      autoExtractDiameter: false,
      tools: baseTools,
    });
  };

  const addTEntry = () => {
    const tn = parseInt(newTNum, 10);
    const dia = parseFloat(newTDia);
    if (!Number.isFinite(tn) || tn <= 0 || !Number.isFinite(dia) || dia < 0) return;
    setToolSpec(tn, {
      diameter: dia,
      shape: newTShape,
      name: newTName.trim() || `${toolShapeLabel(newTShape)} Ø${dia}`,
    });
    setNewTNum("");
    setNewTName("");
  };

  const applyToolTemplate = (templateId: string) => {
    const tpl = BUILTIN_TOOL_PRESETS.find((p) => p.id === templateId);
    if (!tpl) return;
    const nextTools: Record<number, ToolSpec> = {};
    const nextDiameters: Record<number, number> = { ...config.toolDiameters };
    for (const [k, spec] of Object.entries(tpl.tools)) {
      const tn = Number(k);
      if (tn > 0) {
        nextTools[tn] = { ...spec };
        nextDiameters[tn] = spec.diameter;
      }
    }
    onUpdateActiveConfig({
      ...config,
      autoExtractDiameter: false,
      tools: nextTools,
      toolDiameters: nextDiameters,
    });
  };

  const setDiameter = (dNum: number, val: number) => {
    const baseDiameters: Record<number, number> = { ...config.toolDiameters };
    if (config.autoExtractDiameter && parseResult?.extractedToolDiameters) {
      for (const [k, v] of Object.entries(parseResult.extractedToolDiameters)) {
        const kn = Number(k);
        if (kn > 0 && Number.isFinite(v)) baseDiameters[kn] = v;
      }
    }
    baseDiameters[dNum] = Math.max(0, val);
    onUpdateActiveConfig({
      ...config,
      autoExtractDiameter: false,
      toolDiameters: baseDiameters,
    });
  };

  const addDEntry = () => {
    const dn = parseInt(newDNum, 10);
    const dia = parseFloat(newDia);
    if (!Number.isFinite(dn) || dn <= 0 || !Number.isFinite(dia) || dia < 0) return;
    setDiameter(dn, dia);
    setNewDNum("");
  };

  const allTNumbers = Array.from(
    new Set([
      ...Object.keys(config.tools).map(Number),
      ...(parseResult?.detectedTools ?? []),
      ...Object.keys(parseResult?.extractedTools ?? {}).map(Number),
    ]),
  )
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  const allDNumbers = Array.from(
    new Set([
      ...Object.keys(config.toolDiameters).map(Number),
      ...(parseResult?.detectedDNumbers ?? []),
      ...Object.keys(parseResult?.extractedToolDiameters ?? {}).map(Number),
    ]),
  )
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  const handleCreate = () => {
    const trimmed = newMachineName.trim();
    if (!trimmed) return;
    onDuplicateProfile(trimmed);
    setNewMachineName("");
    setShowCreateForm(false);
  };

  return (
    <div className="space-y-3">
      {/* マシンプロファイル切替・複製・削除カード */}
      <section className="space-y-2 bg-[#1e1e1e] border border-[#2f2f32] rounded-md p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-semibold text-[#9cdcfe] uppercase tracking-wider">
            アクティブマシン
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowCreateForm((v) => !v)}
              className="text-[10.5px] text-[#38bdf8] hover:underline flex items-center gap-0.5"
              title="現在の設定をベースに新しいマシンを追加"
            >
              <CopyPlus className="w-3 h-3" /> 新規
            </button>
            {activeProfile.builtin ? (
              <button
                onClick={() => onResetBuiltinProfile(activeProfile.id)}
                className="text-[10.5px] text-[#8e95a2] hover:text-white flex items-center gap-0.5"
                title="この内蔵マシンの設定を初期値へ戻す"
              >
                <RotateCcw className="w-3 h-3" /> 初期化
              </button>
            ) : (
              <button
                onClick={() => onDeleteProfile(activeProfile.id)}
                className="text-[10.5px] text-[#f87171] hover:underline flex items-center gap-0.5"
                title="このカスタムマシンを削除"
              >
                <Trash2 className="w-3 h-3" /> 削除
              </button>
            )}
          </div>
        </div>

        <select
          value={activeProfile.id}
          onChange={(e) => onSelectProfile(e.target.value)}
          className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1 text-xs text-[#f1f5f9] focus:outline-none focus:border-[#0078d4]"
        >
          <optgroup label="標準マシン">
            {profiles
              .filter((p) => p.builtin)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.config.profileName}
                </option>
              ))}
          </optgroup>
          {profiles.some((p) => !p.builtin) && (
            <optgroup label="マイマシン (カスタム)">
              {profiles
                .filter((p) => !p.builtin)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.config.profileName}
                  </option>
                ))}
            </optgroup>
          )}
        </select>

        {showCreateForm && (
          <div className="flex items-center gap-1.5 pt-1 border-t border-[#2c2c2e]">
            <input
              type="text"
              placeholder="新マシン名 (例: 1号機 牧野V33)"
              value={newMachineName}
              onChange={(e) => setNewMachineName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              autoFocus
              className="flex-1 min-w-0 bg-[#252526] border border-[#0078d4] rounded px-2 py-1 text-[11px] text-white focus:outline-none"
            />
            <button
              onClick={handleCreate}
              disabled={!newMachineName.trim()}
              className="px-2 py-1 rounded bg-[#0078d4] hover:bg-[#1a8ad4] disabled:opacity-40 text-white text-[11px] shrink-0"
            >
              作成
            </button>
          </div>
        )}

        <div className="text-[10px] text-[#787878] flex items-center justify-between font-mono">
          <span>
            早送り {(config.rapidRateX / 1000).toFixed(0)}m/分 ・ ATC {config.toolChangeTimeSec}s
          </span>
          <span className="text-[#4ade80]">自動保存</span>
        </div>

        {/* インポート / エクスポート アクションバー */}
        <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-[#2c2c2e] text-[10.5px]">
          <button
            onClick={onImportProfiles}
            className="px-1.5 py-1 rounded bg-[#252526] hover:bg-[#2f2f32] border border-[#3c3c3c] text-[#d4d4d4] hover:text-white flex items-center justify-center gap-1 transition-colors"
            title="JSONファイルからマシン設定を読み込む（1台・全機一括どちらも自動判別）"
          >
            <Upload className="w-3 h-3 text-[#38bdf8] shrink-0" />
            <span>読込</span>
          </button>
          <button
            onClick={onExportActiveProfile}
            className="px-1.5 py-1 rounded bg-[#252526] hover:bg-[#2f2f32] border border-[#3c3c3c] text-[#d4d4d4] hover:text-white flex items-center justify-center gap-1 transition-colors"
            title="現在選択中のマシン1台をJSONファイルへ書き出す"
          >
            <Download className="w-3 h-3 text-[#4ade80] shrink-0" />
            <span>1台出力</span>
          </button>
          <button
            onClick={onExportAllProfiles}
            className="px-1.5 py-1 rounded bg-[#252526] hover:bg-[#2f2f32] border border-[#3c3c3c] text-[#d4d4d4] hover:text-white flex items-center justify-center gap-1 transition-colors"
            title={`登録済み全${profiles.length}台のマシンを一括バックアップ出力`}
          >
            <FolderDown className="w-3 h-3 text-[#fbbf24] shrink-0" />
            <span>全機出力</span>
          </button>
        </div>
      </section>

      {/* 3連サブタブ：T工具 / D径補正 / 機械仕様 */}
      <div className="grid grid-cols-3 bg-[#1e1e1e] border border-[#2f2f32] rounded-md p-0.5 text-[11px]">
        {(
          [
            ["t", `T 工具 (${allTNumbers.length})`],
            ["d", `D 補正 (${allDNumbers.length})`],
            ["spec", "機械仕様"],
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={`py-1 rounded font-semibold transition-colors ${
              subTab === tab
                ? "bg-[#0078d4] text-white shadow-sm"
                : "text-[#8e95a2] hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* サブタブ1：T 工具マガジン */}
      {subTab === "t" && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
              <input
                type="checkbox"
                checked={config.autoExtractDiameter}
                onChange={(e) =>
                  onUpdateActiveConfig({
                    ...config,
                    autoExtractDiameter: e.target.checked,
                  })
                }
                className="accent-[#0078d4]"
              />
              <span>NCコメント自動抽出を優先</span>
            </label>
          </div>

          {/* 定番工具セット流し込み */}
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) applyToolTemplate(e.target.value);
            }}
            className="w-full bg-[#1e1e1e] border border-[#2f2f32] rounded px-2 py-1 text-[11px] text-[#94a3b8] focus:outline-none focus:border-[#0078d4]"
          >
            <option value="">定番工具テンプレートをこのマシンへ流し込む...</option>
            {BUILTIN_TOOL_PRESETS.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>

          <div className="space-y-1.5">
            {allTNumbers.map((tNum) => {
              const manualSpec = config.tools[tNum];
              const extractedSpec = parseResult?.extractedTools?.[tNum];
              const usingExtracted = config.autoExtractDiameter && extractedSpec !== undefined;
              const spec: ToolSpec = usingExtracted
                ? extractedSpec
                : (manualSpec ?? { diameter: 6.0, shape: "endmill", name: "" });
              const isUsed = parseResult?.detectedTools.includes(tNum);

              return (
                <div
                  key={tNum}
                  className={`p-2 rounded-md border space-y-1.5 transition-colors ${
                    isUsed
                      ? "bg-[#1e1e1e] border-[#0078d4]/60"
                      : "bg-[#1e1e1e]/60 border-[#2c2c2e]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 font-mono font-semibold text-[#e2e8f0]">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: getToolColor(tNum) }}
                      />
                      <span>T{String(tNum).padStart(2, "0")}</span>
                      {usingExtracted && (
                        <span title="NCコメントから自動抽出">
                          <Sparkles className="w-3 h-3 text-[#fbbf24]" />
                        </span>
                      )}
                    </div>
                    <select
                      value={spec.shape}
                      onChange={(e) => setToolSpec(tNum, { shape: e.target.value as ToolShape })}
                      className="bg-[#252526] border border-[#3c3c3c] rounded px-1.5 py-0.5 text-[10.5px] text-[#e2e8f0] focus:outline-none focus:border-[#0078d4]"
                    >
                      <option value="endmill">フラットEM</option>
                      <option value="ball">ボールEM</option>
                      <option value="drill">ドリル</option>
                      <option value="chamfer">面取/センター</option>
                      <option value="tap">タップ</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-[72px_1fr] gap-1.5 items-center">
                    <div className="relative">
                      <span className="absolute left-1.5 top-1 text-[10px] text-[#858585] font-mono">
                        Ø
                      </span>
                      <input
                        type="number"
                        step={0.5}
                        min={0}
                        value={spec.diameter}
                        onChange={(e) =>
                          setToolSpec(tNum, { diameter: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full bg-[#252526] border border-[#3c3c3c] rounded pl-4 pr-1.5 py-0.5 font-mono text-right text-white text-[11px] focus:outline-none focus:border-[#0078d4]"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="工具メモ"
                      value={spec.name}
                      onChange={(e) => setToolSpec(tNum, { name: e.target.value })}
                      className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-1.5 py-0.5 text-[11px] text-[#cbd5e1] focus:outline-none focus:border-[#0078d4]"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t border-[#2b2b2b] space-y-1.5">
            <div className="text-[10.5px] text-[#9cdcfe] font-semibold uppercase tracking-wider">
              T番号を追加
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="number"
                placeholder="T番号"
                min={1}
                value={newTNum}
                onChange={(e) => setNewTNum(e.target.value)}
                className="bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 font-mono text-xs focus:outline-none focus:border-[#0078d4]"
              />
              <input
                type="number"
                placeholder="直径mm"
                step={0.5}
                min={0}
                value={newTDia}
                onChange={(e) => setNewTDia(e.target.value)}
                className="bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 font-mono text-xs focus:outline-none focus:border-[#0078d4]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={newTShape}
                onChange={(e) => setNewTShape(e.target.value as ToolShape)}
                className="bg-[#1e1e1e] border border-[#3c3c3c] rounded px-1.5 py-1 text-[11px] text-[#e2e8f0]"
              >
                <option value="endmill">フラットEM</option>
                <option value="ball">ボールEM</option>
                <option value="drill">ドリル</option>
                <option value="chamfer">面取</option>
                <option value="tap">タップ</option>
              </select>
              <input
                type="text"
                placeholder="工具名 (任意)"
                value={newTName}
                onChange={(e) => setNewTName(e.target.value)}
                className="flex-1 min-w-0 bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 text-[11px]"
              />
              <button
                onClick={addTEntry}
                className="px-2 py-1 bg-[#0078d4] hover:bg-[#1a8ad4] text-white rounded flex items-center"
                title="T番号を追加"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* サブタブ2：D 径補正 */}
      {subTab === "d" && (
        <div className="space-y-2.5">
          <div className="text-[11px] text-[#8e95a2] leading-relaxed bg-[#1e1e1e] border border-[#2f2f32] rounded-md p-2">
            G41/G42 径補正のオフセット径（mm）。未登録D番号は同番号の T工具径へ自動フォールバックされます。
          </div>

          <label className="flex items-center gap-2 cursor-pointer px-1 text-[11px]">
            <input
              type="checkbox"
              checked={config.cornerArcRollAround}
              onChange={(e) =>
                onUpdateActiveConfig({
                  ...config,
                  cornerArcRollAround: e.target.checked,
                })
              }
              className="accent-[#0078d4]"
            />
            <span>外角コーナーにロールアラウンド円弧を挿入</span>
          </label>

          <div className="space-y-1.5">
            <div className="grid grid-cols-[64px_1fr_54px] gap-2 text-[10.5px] text-[#858585] px-1">
              <span>補正番号</span>
              <span>補正直径 (mm)</span>
              <span className="text-right">半径R</span>
            </div>
            {allDNumbers.map((dNum) => {
              const manualVal = config.toolDiameters[dNum];
              const extractedVal = parseResult?.extractedToolDiameters[dNum];
              const usingExtracted = config.autoExtractDiameter && extractedVal !== undefined;
              const effectiveVal = usingExtracted
                ? extractedVal
                : (manualVal ?? config.tools[dNum]?.diameter ?? 0);
              const isUsed = parseResult?.detectedDNumbers.includes(dNum);

              return (
                <div
                  key={dNum}
                  className={`grid grid-cols-[64px_1fr_54px] items-center gap-2 px-1.5 py-1 rounded border ${
                    isUsed
                      ? "bg-[#1e1e1e] border-[#0078d4]/60"
                      : "bg-[#1e1e1e]/60 border-[#2c2c2e]"
                  }`}
                >
                  <div className="flex items-center gap-1 font-mono font-semibold text-[#e2e8f0]">
                    <span>D{String(dNum).padStart(2, "0")}</span>
                    {usingExtracted && (
                      <span
                        title={`NCコメントから自動抽出: Ø${extractedVal}mm (R${(extractedVal / 2).toFixed(2)})`}
                      >
                        <Sparkles className="w-3 h-3 text-[#fbbf24]" />
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    value={effectiveVal}
                    onChange={(e) => setDiameter(dNum, parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-0.5 font-mono text-right text-white focus:outline-none focus:border-[#0078d4]"
                  />
                  <span className="font-mono text-[11px] text-[#94a3b8] text-right">
                    R{(effectiveVal / 2).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t border-[#2b2b2b] space-y-1.5">
            <div className="text-[10.5px] text-[#9cdcfe] font-semibold uppercase tracking-wider">
              D番号を追加
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                placeholder="D番号"
                min={1}
                value={newDNum}
                onChange={(e) => setNewDNum(e.target.value)}
                className="w-20 bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 font-mono text-xs focus:outline-none focus:border-[#0078d4]"
              />
              <input
                type="number"
                placeholder="直径mm"
                step={0.5}
                min={0}
                value={newDia}
                onChange={(e) => setNewDia(e.target.value)}
                className="flex-1 bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 font-mono text-xs focus:outline-none focus:border-[#0078d4]"
              />
              <button
                onClick={addDEntry}
                className="px-2 py-1 bg-[#0078d4] hover:bg-[#1a8ad4] text-white rounded flex items-center"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* サブタブ3：機械仕様パラメータ */}
      {subTab === "spec" && (
        <div className="space-y-2.5">
          <label className="block space-y-1">
            <span className="text-[11px] text-[#cccccc]">マシン表示名</span>
            <input
              type="text"
              value={config.profileName}
              onChange={(e) =>
                onUpdateActiveConfig({ ...config, profileName: e.target.value })
              }
              className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#0078d4]"
            />
          </label>

          {(
            [
              ["rapidRateX", "X軸 早送り速度 (mm/min)", 1000],
              ["rapidRateY", "Y軸 早送り速度 (mm/min)", 1000],
              ["rapidRateZ", "Z軸 早送り速度 (mm/min)", 1000],
              ["toolChangeTimeSec", "工具交換 ATC時間 (秒)", 0.5],
              ["accelOverheadFactor", "加減速オーバーヘッド係数", 0.02],
              ["minBlockTimeSec", "最小ブロック処理時間 (秒)", 0.005],
              ["defaultFeedRate", "F未指定時の仮送り (mm/min)", 50],
            ] as const
          ).map(([field, label, step]) => (
            <label key={field} className="block space-y-1">
              <span className="text-[11px] text-[#cccccc]">{label}</span>
              <input
                type="number"
                step={step}
                min={0}
                value={config[field]}
                onChange={(e) =>
                  onUpdateActiveConfig({
                    ...config,
                    [field]: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 font-mono text-right text-white focus:outline-none focus:border-[#0078d4]"
              />
            </label>
          ))}

          <label className="flex items-center gap-2 pt-1 cursor-pointer text-[11.5px]">
            <input
              type="checkbox"
              checked={config.optionalBlockSkip}
              onChange={(e) =>
                onUpdateActiveConfig({
                  ...config,
                  optionalBlockSkip: e.target.checked,
                })
              }
              className="accent-[#0078d4]"
            />
            <span>オプショナルブロックスキップ (`/`) 有効</span>
          </label>
        </div>
      )}
    </div>
  );
};
