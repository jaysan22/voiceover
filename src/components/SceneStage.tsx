import type { Pack } from "@/lib/pack";
import { activeRegion, characterMap } from "@/lib/pack";

export function SceneStage({
  pack,
  timeMs,
  className = "",
}: {
  pack: Pack;
  timeMs: number;
  className?: string;
}) {
  const region = activeRegion(pack, timeMs);
  const chars = characterMap(pack);
  const speaking = region ? chars[region.characterId] : null;
  const scene = pack.scene.kind === "procedural" ? pack.scene : null;
  const [a, b] = scene?.backdrop ?? ["#111", "#333"];

  return (
    <div
      className={`relative overflow-hidden rounded-[28px] border border-white/10 shadow-[0_0_80px_rgba(214,255,63,0.08)] ${className}`}
      style={{ background: `linear-gradient(145deg, ${a}, ${b})` }}
    >
      <div className="absolute inset-0 opacity-40 mix-blend-overlay grain" />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 py-4 text-[11px] uppercase tracking-[0.22em] text-white/70">
        <span>{scene?.location ?? "Custom clip"}</span>
        <span className="rounded-full bg-black/40 px-3 py-1 text-[#d6ff3f]">REC SCENE</span>
      </div>
      <div className="relative flex h-full min-h-[280px] items-end justify-center gap-10 px-8 pb-14 pt-16">
        {pack.characters.map((c) => {
          const on = speaking?.id === c.id;
          return (
            <div key={c.id} className="flex flex-col items-center gap-3">
              <div
                className={`h-28 w-20 rounded-[40px] border-2 transition-transform duration-150 ${on ? "scale-110" : "scale-100 opacity-80"}`}
                style={{
                  borderColor: c.color,
                  background: `linear-gradient(180deg, ${c.color}55, #00000088)`,
                  boxShadow: on ? `0 0 32px ${c.color}` : undefined,
                }}
              />
              <div className="text-xs font-semibold tracking-wide" style={{ color: c.color }}>
                {c.name}
              </div>
            </div>
          );
        })}
      </div>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.3em] text-white/50">
        {scene?.mood ?? "user pack"}
      </div>
    </div>
  );
}
