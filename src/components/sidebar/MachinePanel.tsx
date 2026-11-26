import React from "react";
import { RotateCcw } from "lucide-react";
import { DEFAULT_MACHINE_CONFIG, type MachineConfig } from "../../types/nc";

interface MachinePanelProps {
  machineConfig: MachineConfig;
  onUpdateMachineConfig: (config: MachineConfig) => void;
}

export const MachinePanel: React.FC<MachinePanelProps> = ({
  machineConfig,
  onUpdateMachineConfig,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-[#9cdcfe] font-semibold uppercase tracking-wider">
          FANUC 3軸 機械設定
        </span>
        <button
          onClick={() => onUpdateMachineConfig(DEFAULT_MACHINE_CONFIG)}
          className="flex items-center gap-1 text-[10.5px] text-[#8e95a2] hover:text-white transition-colors"
          title="デフォルト設定へ戻す"
        >
          <RotateCcw className="w-3 h-3" /> 初期化
        </button>
      </div>

      <div className="space-y-2.5">
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
              value={machineConfig[field]}
              onChange={(e) =>
                onUpdateMachineConfig({
                  ...machineConfig,
                  [field]: parseFloat(e.target.value) || 0,
                })
              }
              className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 font-mono text-right text-white focus:outline-none focus:border-[#0078d4]"
            />
          </label>
        ))}

        <label className="flex items-center gap-2 pt-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={machineConfig.optionalBlockSkip}
            onChange={(e) =>
              onUpdateMachineConfig({
                ...machineConfig,
                optionalBlockSkip: e.target.checked,
              })
            }
            className="accent-[#0078d4]"
          />
          <span>オプショナルブロックスキップ (`/`) 有効</span>
        </label>
      </div>
    </div>
  );
};
