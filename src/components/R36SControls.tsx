import React from 'react';

export type R36SButton =
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'A'
  | 'B'
  | 'X'
  | 'Y'
  | 'SELECT'
  | 'START'
  | 'L1'
  | 'R1'
  | 'L2'
  | 'R2';

export function R36SControls({
  onPress,
}: {
  onPress: (btn: R36SButton) => void;
}) {
  const btnCls =
    'active:scale-95 transition-transform select-none cursor-pointer flex items-center justify-center font-bold shadow-md';

  return (
    <div className="w-full max-w-[680px] flex items-center justify-between gap-4 px-5 py-3.5 rounded-2xl bg-[#15171d] border border-white/10 shadow-xl">
      {/* Left: L1/L2 + D-Pad */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => onPress('L1')}
            title="L1 (Anterior / [ )"
            className={`${btnCls} px-3 py-1.5 rounded-lg bg-[#232732] hover:bg-[#2d3240] text-xs text-zinc-200 border border-white/10`}
          >
            L1
          </button>
          <button
            type="button"
            onClick={() => onPress('L2')}
            title="L2 (Voltar música no Mini-Player / PageUp)"
            className={`${btnCls} px-3 py-1.5 rounded-lg bg-[#1c202a] hover:bg-[#2d3240] text-xs text-zinc-300 border border-white/10`}
          >
            L2
          </button>
        </div>

        <div className="grid grid-cols-3 grid-rows-3 gap-1 w-[92px] h-[92px]">
          <div />
          <button
            type="button"
            onClick={() => onPress('UP')}
            title="Cima (↑)"
            className={`${btnCls} rounded-t-md bg-[#232732] hover:bg-[#313646] text-zinc-200 text-xs`}
          >
            ▲
          </button>
          <div />
          <button
            type="button"
            onClick={() => onPress('LEFT')}
            title="Esquerda (←)"
            className={`${btnCls} rounded-l-md bg-[#232732] hover:bg-[#313646] text-zinc-200 text-xs`}
          >
            ◀
          </button>
          <div className="rounded-sm bg-[#1c1f28]" />
          <button
            type="button"
            onClick={() => onPress('RIGHT')}
            title="Direita (→)"
            className={`${btnCls} rounded-r-md bg-[#232732] hover:bg-[#313646] text-zinc-200 text-xs`}
          >
            ▶
          </button>
          <div />
          <button
            type="button"
            onClick={() => onPress('DOWN')}
            title="Baixo (↓)"
            className={`${btnCls} rounded-b-md bg-[#232732] hover:bg-[#313646] text-zinc-200 text-xs`}
          >
            ▼
          </button>
          <div />
        </div>
      </div>

      {/* Center: SELECT / START + R36S branding */}
      <div className="flex flex-col items-center gap-2.5">
        <span className="text-[10px] font-semibold tracking-[0.22em] text-zinc-500 uppercase">
          R36S • PortMaster
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onPress('SELECT')}
            title="SELECT (Opções / Tab)"
            className={`${btnCls} px-3.5 py-1.5 rounded-full bg-[#232732] hover:bg-[#313646] text-[10px] tracking-wider text-zinc-300 border border-white/10`}
          >
            SELECT
          </button>
          <button
            type="button"
            onClick={() => onPress('START')}
            title="START (Pausar / P)"
            className={`${btnCls} px-3.5 py-1.5 rounded-full bg-[#232732] hover:bg-[#313646] text-[10px] tracking-wider text-zinc-300 border border-white/10`}
          >
            START
          </button>
        </div>
        <span className="text-[10px] text-zinc-500 hidden sm:inline">
          Setas • Enter(B) • Backspace(A) • Espaço(X) • M(Y) • Tab(SELECT)
        </span>
      </div>

      {/* Right: ABXY + R1 */}
      <div className="flex items-center gap-4">
        <div className="grid grid-cols-3 grid-rows-3 gap-1 w-[92px] h-[92px]">
          <div />
          <button
            type="button"
            onClick={() => onPress('X')}
            title="X (Espaço)"
            className={`${btnCls} rounded-full bg-[#232732] hover:bg-[#313646] text-sky-300 text-xs border border-white/10`}
          >
            X
          </button>
          <div />
          <button
            type="button"
            onClick={() => onPress('Y')}
            title="Y (M)"
            className={`${btnCls} rounded-full bg-[#232732] hover:bg-[#313646] text-amber-300 text-xs border border-white/10`}
          >
            Y
          </button>
          <div />
          <button
            type="button"
            onClick={() => onPress('A')}
            title="A — Voltar (Backspace)"
            className={`${btnCls} rounded-full bg-[#232732] hover:bg-[#313646] text-rose-400 text-xs border border-white/10`}
          >
            A
          </button>
          <div />
          <button
            type="button"
            onClick={() => onPress('B')}
            title="B — Confirmar (Enter)"
            className={`${btnCls} rounded-full bg-[#1db954] hover:bg-[#22d361] text-[#0c140e] text-xs border border-white/10`}
          >
            B
          </button>
          <div />
        </div>

        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => onPress('R1')}
            title="R1 (Próxima / ] )"
            className={`${btnCls} px-3 py-1.5 rounded-lg bg-[#232732] hover:bg-[#2d3240] text-xs text-zinc-200 border border-white/10`}
          >
            R1
          </button>
          <button
            type="button"
            onClick={() => onPress('R2')}
            title="R2 (SELECT+R2 Mini-Player / Pular música / PageDown)"
            className={`${btnCls} px-3 py-1.5 rounded-lg bg-[#1c202a] hover:bg-[#2d3240] text-xs text-zinc-300 border border-white/10`}
          >
            R2
          </button>
        </div>
      </div>
    </div>
  );
}
