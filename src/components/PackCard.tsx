"use client";

import Link from "next/link";
import type { Pack } from "@/lib/pack";

export function PackCard({
  pack,
  href,
  posterUrl,
  videoUrl,
  onEdit,
  onDelete,
}: {
  pack: Pack;
  href: string;
  posterUrl?: string | null;
  videoUrl?: string | null;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const scene = pack.scene.kind === "procedural" ? pack.scene : null;
  const [a, b] = scene?.backdrop ?? ["#222", "#444"];
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-3 transition hover:-translate-y-1 hover:border-[#d6ff3f]/50">
      <Link href={href} className="block">
        <div
          className="relative mb-3 aspect-[16/10] overflow-hidden rounded-2xl"
          style={{ background: posterUrl || videoUrl ? "#000" : `linear-gradient(145deg, ${a}, ${b})` }}
        >
          {posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : videoUrl ? (
            <video src={`${videoUrl}#t=0.8`} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 grain opacity-30" />
          )}
          <div className="absolute left-3 top-3 rounded-full bg-black/50 px-2 py-1 text-[10px] uppercase tracking-widest text-[#d6ff3f]">
            {Math.round(pack.durationMs / 1000)}s
          </div>
          <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-1">
            {pack.characters.map((c) => (
              <span
                key={c.id}
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-black"
                style={{ background: c.color }}
              >
                {c.name}
              </span>
            ))}
          </div>
        </div>
        <div className="px-1 pb-1">
          <h3 className="font-[family-name:var(--font-display)] text-xl leading-tight">{pack.title}</h3>
          <p className="mt-1 text-sm text-white/60">{pack.tagline}</p>
        </div>
      </Link>
      {(onEdit || onDelete) && (
        <div className="mt-2 flex gap-2 px-1">
          {onEdit && (
            <button type="button" className="rounded-full bg-white/10 px-3 py-1.5 text-xs" onClick={onEdit}>
              Edit
            </button>
          )}
          {onDelete && (
            <button type="button" className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-[#ff3d8a]" onClick={onDelete}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
