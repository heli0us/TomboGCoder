import React, { useState } from "react";
import {
  CopyPlus,
  Download,
  FolderDown,
  FolderPlus,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { openFolderDialog } from "../../services/ncApi";
import {
  BUILTIN_TOOL_PRESETS,
  type MachineConfig,
  type MachineProfile,
  type ParseResult,
  type SimReplaceRule,
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
  const [subTab, setSubTab] = useState<"t" | "d" | "spec" | "sim">("t");
  const [newMachineName, setNewMachineName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [newTNum, setNewTNum] = useState("");
  const [newTDia, setNewTDia] = useState("10.0");
  const [newTShape, setNewTShape] = useState<ToolShape>("endmill");
  const [newTName, setNewTName] = useState("");
  const [newDNum, setNewDNum] = useState("");
  const [newDia, setNewDia] = useState("10.0");
  const [confirmClearT, setConfirmClearT] = useState(false);
  const [confirmClearD, setConfirmClearD] = useState(false);

  // Sim置換ルール追加フォーム
  const [newSimName, setNewSimName] = useState("");
  const [newSimPattern, setNewSimPattern] = useState("");
  const [newSimReplacement, setNewSimReplacement] = useState("");
  const [newSimRegex, setNewSimRegex] = useState(false);
  // サブフォルダ手動入力
  const [newSubDir, setNewSubDir] = useState("");

  const config = activeProfile.config;
  const subDirs = config.subprogramDirs ?? [];
  const simRules = config.simReplaceRules ?? [];

  const handlePickSubDir = async () => {
    const dir = await openFolderDialog("サブプログラム (M98/G65) 検索フォルダを選択");
    if (!dir || subDirs.includes(dir)) return;
    onUpdateActiveConfig({ ...config, subprogramDirs: [...subDirs, dir] });
  };

  const handleAddSubDirManual = () => {
    const trimmed = newSubDir.trim();
    if (!trimmed || subDirs.includes(trimmed)) return;
    onUpdateActiveConfig({ ...config, subprogramDirs: [...subDirs, trimmed] });
    setNewSubDir("");
  };

  const handleRemoveSubDir = (dir: string) => {
    onUpdateActiveConfig({
      ...config,
      subprogramDirs: subDirs.filter((d) => d !== dir),
    });
  };

  const handleAddSimRule = () => {
    const pat = newSimPattern.trim();
    if (!pat) return;
    const rule: SimReplaceRule = {
      id: `sim-rule-${Date.now()}`,
      name: newSimName.trim() || `${pat} → ${newSimReplacement}`,
      pattern: pat,
      replacement: newSimReplacement,
      useRegex: newSimRegex,
      enabled: true,
    };
    onUpdateActiveConfig({ ...config, simReplaceRules: [...simRules, rule] });
    setNewSimName("");
    setNewSimPattern("");
    setNewSimReplacement("");
  };

  const handleUpdateSimRule = (id: string, patch: Partial<SimReplaceRule>) => {
    onUpdateActiveConfig({
      ...config,
      simReplaceRules: simRules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  };

  const handleDeleteSimRule = (id: string) => {
    onUpdateActiveConfig({
      ...config,
      simReplaceRules: simRules.filter((r) => r.id !== id),
    });
  };

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

  const deleteToolSpec = (tNum: number) => {
    if (config.tools[tNum] === undefined) return;
    const nextTools: Record<number, ToolSpec> = { ...config.tools };
    delete nextTools[tNum];
    onUpdateActiveConfig({
      ...config,
      tools: nextTools,
    });
  };

  const clearAllTools = () => {
    onUpdateActiveConfig({
      ...config,
      tools: {},
    });
    setConfirmClearT(false);
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

  const deleteDiameter = (dNum: number) => {
    if (config.toolDiameters[dNum] === undefined) return;
    const nextDiameters: Record<number, number> = { ...config.toolDiameters };
    delete nextDiameters[dNum];
    onUpdateActiveConfig({
      ...config,
      toolDiameters: nextDiameters,
    });
  };

  const clearAllDiameters = () => {
    onUpdateActiveConfig({
      ...config,
      toolDiameters: {},
    });
    setConfirmClearD(false);
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
          onChange={(e) => {
            setConfirmClearT(false);
            setConfirmClearD(false);
            onSelectProfile(e.target.value);
          }}
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

      {/* 4連サブタブ：T工具 / D径補正 / 機械仕様 / Sim置換 */}
      <div className="grid grid-cols-4 bg-[#1e1e1e] border border-[#2f2f32] rounded-md p-0.5 text-[10.5px]">
        {(
          [
            ["t", `T(${allTNumbers.length})`],
            ["d", `D(${allDNumbers.length})`],
            ["spec", "仕様"],
            ["sim", `Sim置換${simRules.filter((r) => r.enabled).length > 0 ? `(${simRules.filter((r) => r.enabled).length})` : ""}`],
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => {
              setSubTab(tab);
              setConfirmClearT(false);
              setConfirmClearD(false);
            }}
            className={`py-1 rounded font-semibold transition-colors truncate px-0.5 ${
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
            {Object.keys(config.tools).length > 0 &&
              (confirmClearT ? (
                <div className="flex items-center gap-1 text-[10px]">
                  <button
                    onClick={clearAllTools}
                    className="px-1.5 py-0.5 rounded bg-[#b91c1c] hover:bg-[#dc2626] text-white font-semibold"
                    title="このマシンに登録された全T工具を削除します"
                  >
                    全削除実行
                  </button>
                  <button
                    onClick={() => setConfirmClearT(false)}
                    className="px-1 py-0.5 rounded bg-[#2d2d30] hover:bg-[#3e3e42] text-[#cbd5e1]"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClearT(true)}
                  className="text-[10.5px] text-[#8e95a2] hover:text-[#f87171] flex items-center gap-0.5 shrink-0"
                  title="登録済みT工具をすべて削除"
                >
                  <Trash2 className="w-3 h-3" /> 全削除
                </button>
              ))}
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
            {allTNumbers.length === 0 && (
              <p className="text-[11px] text-[#787878] px-1 py-2 text-center">
                登録された工具はありません（下のフォームから追加できます）
              </p>
            )}
            {allTNumbers.map((tNum) => {
              const manualSpec = config.tools[tNum];
              const extractedSpec = parseResult?.extractedTools?.[tNum];
              const usingExtracted = config.autoExtractDiameter && extractedSpec !== undefined;
              const spec: ToolSpec = usingExtracted
                ? extractedSpec
                : (manualSpec ?? { diameter: 6.0, shape: "endmill", name: "" });
              const isUsed = parseResult?.detectedTools.includes(tNum);
              const canDelete = manualSpec !== undefined;

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
                    <div className="flex items-center gap-1">
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
                      <button
                        onClick={() => deleteToolSpec(tNum)}
                        disabled={!canDelete}
                        className={`p-1 rounded transition-colors ${
                          canDelete
                            ? "text-[#8e95a2] hover:text-[#f87171] hover:bg-[#2d2d30]"
                            : "text-[#4b5563] opacity-40 cursor-not-allowed"
                        }`}
                        title={
                          canDelete
                            ? isUsed || extractedSpec !== undefined
                              ? `T${String(tNum).padStart(2, "0")} のマシン登録を削除（NC検出値は残ります）`
                              : `T${String(tNum).padStart(2, "0")} を削除`
                            : "NCプログラムから自動検出された工具（マシン登録なし）"
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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

          <div className="flex items-center justify-between gap-2 px-1">
            <label className="flex items-center gap-2 cursor-pointer text-[11px]">
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
              <span>外角コーナーにロールアラウンド円弧</span>
            </label>
            {Object.keys(config.toolDiameters).length > 0 &&
              (confirmClearD ? (
                <div className="flex items-center gap-1 text-[10px] shrink-0">
                  <button
                    onClick={clearAllDiameters}
                    className="px-1.5 py-0.5 rounded bg-[#b91c1c] hover:bg-[#dc2626] text-white font-semibold"
                    title="このマシンに登録された全D補正を削除します"
                  >
                    全削除実行
                  </button>
                  <button
                    onClick={() => setConfirmClearD(false)}
                    className="px-1 py-0.5 rounded bg-[#2d2d30] hover:bg-[#3e3e42] text-[#cbd5e1]"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClearD(true)}
                  className="text-[10.5px] text-[#8e95a2] hover:text-[#f87171] flex items-center gap-0.5 shrink-0"
                  title="登録済みD補正をすべて削除"
                >
                  <Trash2 className="w-3 h-3" /> 全削除
                </button>
              ))}
          </div>

          <div className="space-y-1.5">
            <div className="grid grid-cols-[54px_1fr_48px_20px] gap-1.5 text-[10.5px] text-[#858585] px-1">
              <span>補正番号</span>
              <span>補正直径 (mm)</span>
              <span className="text-right">半径R</span>
              <span />
            </div>
            {allDNumbers.length === 0 && (
              <p className="text-[11px] text-[#787878] px-1 py-2 text-center">
                登録された径補正はありません（下のフォームから追加できます）
              </p>
            )}
            {allDNumbers.map((dNum) => {
              const manualVal = config.toolDiameters[dNum];
              const extractedVal = parseResult?.extractedToolDiameters[dNum];
              const usingExtracted = config.autoExtractDiameter && extractedVal !== undefined;
              const effectiveVal = usingExtracted
                ? extractedVal
                : (manualVal ?? config.tools[dNum]?.diameter ?? 0);
              const isUsed = parseResult?.detectedDNumbers.includes(dNum);
              const canDelete = manualVal !== undefined;

              return (
                <div
                  key={dNum}
                  className={`grid grid-cols-[54px_1fr_48px_20px] items-center gap-1.5 px-1.5 py-1 rounded border ${
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
                  <button
                    onClick={() => deleteDiameter(dNum)}
                    disabled={!canDelete}
                    className={`p-0.5 rounded flex items-center justify-center transition-colors ${
                      canDelete
                        ? "text-[#8e95a2] hover:text-[#f87171] hover:bg-[#2d2d30]"
                        : "text-[#4b5563] opacity-40 cursor-not-allowed"
                    }`}
                    title={
                      canDelete
                        ? isUsed || extractedVal !== undefined
                          ? `D${String(dNum).padStart(2, "0")} のマシン登録を削除（NC検出値は残ります）`
                          : `D${String(dNum).padStart(2, "0")} を削除`
                        : "NCプログラムから自動検出された補正番号（マシン登録なし）"
                    }
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
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

          {/* サブプログラム呼び出しフォルダ (M98/G65) */}
          <div className="pt-2.5 border-t border-[#2b2b2b] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-semibold text-[#9cdcfe] uppercase tracking-wider">
                サブプログラム検索フォルダ
              </span>
              <button
                onClick={handlePickSubDir}
                className="text-[10.5px] text-[#38bdf8] hover:underline flex items-center gap-1"
                title="外部サブプログラム (M98/G65) の検索先フォルダを追加"
              >
                <FolderPlus className="w-3 h-3" /> フォルダ選択
              </button>
            </div>
            <p className="text-[10px] text-[#787878] leading-snug">
              M98/G65 の呼出先が同ファイルに無い場合、元ファイルと同階層に加えて以下のフォルダを検索します。
            </p>
            {subDirs.length > 0 && (
              <div className="space-y-1">
                {subDirs.map((dir) => (
                  <div
                    key={dir}
                    className="flex items-center justify-between gap-1.5 px-2 py-1 rounded bg-[#1e1e1e] border border-[#2f2f32] text-[10.5px] font-mono"
                    title={dir}
                  >
                    <span className="truncate text-[#cbd5e1]">{dir}</span>
                    <button
                      onClick={() => handleRemoveSubDir(dir)}
                      className="text-[#8e95a2] hover:text-[#f87171] shrink-0"
                      title="フォルダを削除"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1">
              <input
                type="text"
                placeholder="フォルダパスを手入力..."
                value={newSubDir}
                onChange={(e) => setNewSubDir(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddSubDirManual();
                }}
                className="flex-1 min-w-0 bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 font-mono text-[10.5px] text-white focus:outline-none focus:border-[#0078d4]"
              />
              <button
                onClick={handleAddSubDirManual}
                disabled={!newSubDir.trim()}
                className="px-2 py-1 rounded bg-[#0078d4] hover:bg-[#1a8ad4] disabled:opacity-40 text-white"
                title="パスを追加"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* サブタブ4：3Dシミュレーション専用 特殊Gコード置換 */}
      {subTab === "sim" && (
        <div className="space-y-2.5">
          <div className="text-[10.5px] text-[#8e95a2] leading-relaxed bg-[#1e1e1e] border border-[#2f2f32] rounded-md p-2">
            元のNCファイルは書き換えず、3D解析・シミュレーション時のみ内部で特殊Gコードを置換します（例：<code className="text-[#9cdcfe]">G91X650.Y-99.5</code> → <code className="text-[#4ade80]">G91X0.Y0.</code>）。
          </div>

          {simRules.length === 0 ? (
            <p className="text-[11px] text-[#787878] px-1">
              登録されたシミュレーション置換ルールはありません
            </p>
          ) : (
            <div className="space-y-1.5">
              {simRules.map((rule) => (
                <div
                  key={rule.id}
                  className={`p-2 rounded-md border space-y-1.5 ${
                    rule.enabled
                      ? "bg-[#1e1e1e] border-[#0078d4]/60"
                      : "bg-[#19191b] border-[#2a2a2d] opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <label className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) =>
                          handleUpdateSimRule(rule.id, { enabled: e.target.checked })
                        }
                        className="accent-[#0078d4]"
                      />
                      <span className="text-[11px] font-medium text-[#e2e8f0] truncate">
                        {rule.name}
                      </span>
                    </label>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() =>
                          handleUpdateSimRule(rule.id, { useRegex: !rule.useRegex })
                        }
                        className={`px-1 py-0 rounded text-[9.5px] font-mono border ${
                          rule.useRegex
                            ? "bg-[#094771] border-[#0078d4] text-[#7dd3fc]"
                            : "bg-[#252526] border-[#3c3c3c] text-[#787878]"
                        }`}
                        title="正規表現モード切替"
                      >
                        .*
                      </button>
                      <button
                        onClick={() => handleDeleteSimRule(rule.id)}
                        className="text-[#8e95a2] hover:text-[#f87171]"
                        title="ルールを削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-1 font-mono text-[10.5px]">
                    <input
                      type="text"
                      value={rule.pattern}
                      onChange={(e) =>
                        handleUpdateSimRule(rule.id, { pattern: e.target.value })
                      }
                      placeholder="置換前パターン"
                      className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-1.5 py-0.5 text-[#fca5a5]"
                    />
                    <input
                      type="text"
                      value={rule.replacement}
                      onChange={(e) =>
                        handleUpdateSimRule(rule.id, { replacement: e.target.value })
                      }
                      placeholder="置換後 (空欄で無視)"
                      className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-1.5 py-0.5 text-[#86efac]"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 新規ルール追加 */}
          <div className="pt-2 border-t border-[#2b2b2b] space-y-1.5">
            <div className="text-[10.5px] text-[#9cdcfe] font-semibold uppercase tracking-wider">
              Sim置換ルールを追加
            </div>
            <input
              type="text"
              placeholder="ルール名 (例: パレット退避無効化)"
              value={newSimName}
              onChange={(e) => setNewSimName(e.target.value)}
              className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] text-white"
            />
            <input
              type="text"
              placeholder="検索 (例: G91X650.Y-99.5)"
              value={newSimPattern}
              onChange={(e) => setNewSimPattern(e.target.value)}
              className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 font-mono text-[11px] text-white"
            />
            <input
              type="text"
              placeholder="置換後 (例: G91X0.Y0. / 空欄で除去)"
              value={newSimReplacement}
              onChange={(e) => setNewSimReplacement(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddSimRule();
              }}
              className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 font-mono text-[11px] text-white"
            />
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-[#cbd5e1]">
                <input
                  type="checkbox"
                  checked={newSimRegex}
                  onChange={(e) => setNewSimRegex(e.target.checked)}
                  className="accent-[#0078d4]"
                />
                <span>正規表現を使用</span>
              </label>
              <button
                onClick={handleAddSimRule}
                disabled={!newSimPattern.trim()}
                className="px-2.5 py-1 rounded bg-[#0078d4] hover:bg-[#1a8ad4] disabled:opacity-40 text-white text-[11px] flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> 追加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
