import React from "react";

export interface DroRefs {
  x: React.RefObject<HTMLSpanElement | null>;
  y: React.RefObject<HTMLSpanElement | null>;
  z: React.RefObject<HTMLSpanElement | null>;
  feed: React.RefObject<HTMLSpanElement | null>;
  spindle: React.RefObject<HTMLSpanElement | null>;
  tool: React.RefObject<HTMLSpanElement | null>;
  motion: React.RefObject<HTMLSpanElement | null>;
}

interface MachineDroPanelProps {
  visible: boolean;
  droRefs: DroRefs;
}

/** 左下（トレースバー直上）：実機CNC風 60fps ライブ座標 DRO パネル */
export const MachineDroPanel: React.FC<MachineDroPanelProps> = ({ visible, droRefs }) => (
  <div
    className={`pointer-events-auto absolute bottom-[62px] left-3 z-20 w-48 bg-[#14161b]/88 border border-[#2f3440] rounded-md px-2.5 py-2 shadow-xl backdrop-blur-md font-mono transition-opacity ${
      visible ? "opacity-100" : "opacity-0 pointer-events-none"
    }`}
  >
    <div className="flex items-center justify-between border-b border-[#262a33] pb-1 mb-1.5 text-[10px]">
      <span className="text-[#8e95a2] tracking-wider font-sans font-semibold">MACHINE DRO</span>
      <span
        ref={droRefs.motion}
        className="px-1.5 py-0 rounded bg-[#094771]/70 text-[#7dd3fc] text-[10px]"
      >
        G00
      </span>
    </div>

    <div className="space-y-0.5 text-[13px] leading-tight tracking-tight">
      <div className="flex items-center justify-between">
        <span className="text-[#f87171] font-bold">X</span>
        <span ref={droRefs.x} className="text-[#f1f5f9] tabular-nums">
          0.000
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[#4ade80] font-bold">Y</span>
        <span ref={droRefs.y} className="text-[#f1f5f9] tabular-nums">
          0.000
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[#60a5fa] font-bold">Z</span>
        <span ref={droRefs.z} className="text-[#f1f5f9] tabular-nums">
          0.000
        </span>
      </div>
    </div>

    <div className="mt-1.5 pt-1 border-t border-[#262a33] flex items-center justify-between text-[10.5px] text-[#94a3b8]">
      <span ref={droRefs.tool} className="text-[#fbbf24] font-semibold">
        T00
      </span>
      <span ref={droRefs.feed}>F0</span>
      <span ref={droRefs.spindle}>S0</span>
    </div>
  </div>
);
