"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Character, VoRegion } from "@/lib/pack";
import { formatTime } from "@/lib/pack";

type Drag =
  | { kind: "in" }
  | { kind: "out" }
  | { kind: "draw"; from: number }
  | { kind: "region"; id: string; edge: "start" | "end" | "move"; ox: number };

type Props = {
  durationMs: number;
  regions: VoRegion[];
  characters: Character[];
  trimStart: number;
  trimEnd: number;
  playheadMs?: number;
  onChange: (regions: VoRegion[]) => void;
  onTrim: (start: number, end: number) => void;
  onSeek?: (ms: number) => void;
};

export function Timeline({
  durationMs,
  regions,
  characters,
  trimStart,
  trimEnd,
  playheadMs = 0,
  onChange,
  onTrim,
  onSeek,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const regionsRef = useRef(regions);
  const trimRef = useRef({ trimStart, trimEnd });
  const dragRef = useRef<Drag | null>(null);
  const [pxPerSec, setPxPerSec] = useState(120);
  const [tall, setTall] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  regionsRef.current = regions;
  trimRef.current = { trimStart, trimEnd };
  dragRef.current = drag;

  const dur = Math.max(durationMs, 1);
  const width = Math.max(640, (dur / 1000) * pxPerSec);
  const msToX = (ms: number) => (ms / dur) * width;
  const xToMs = (x: number) => Math.max(0, Math.min(dur, (x / width) * dur));
  const color = useMemo(() => Object.fromEntries(characters.map((c) => [c.id, c.color])), [characters]);
  const ticks = useMemo(() => {
    const step = pxPerSec >= 180 ? 500 : pxPerSec >= 90 ? 1000 : 5000;
    const out: number[] = [];
    for (let t = 0; t <= dur; t += step) out.push(t);
    return out;
  }, [dur, pxPerSec]);

  function clientToMs(clientX: number) {
    const el = scrollerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return xToMs(clientX - rect.left + el.scrollLeft);
  }

  function zoomAt(clientX: number, factor: number) {
    const el = scrollerRef.current;
    if (!el) return;
    const ms = clientToMs(clientX);
    const next = Math.min(420, Math.max(28, pxPerSec * factor));
    setPxPerSec(next);
    requestAnimationFrame(() => {
      const w = Math.max(640, (dur / 1000) * next);
      const rect = el.getBoundingClientRect();
      el.scrollLeft = (ms / dur) * w - (clientX - rect.left);
    });
  }

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.deltaY > 0 ? 0.86 : 1.16);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dur, pxPerSec]);

  useEffect(() => {
    if (!drag) return;
    const move = (e: MouseEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const ms = clientToMs(e.clientX);
      const { trimStart: ts, trimEnd: te } = trimRef.current;
      if (current.kind === "in") {
        onTrim(Math.min(ms, te - 400), te);
        return;
      }
      if (current.kind === "out") {
        onTrim(ts, Math.max(ms, ts + 400));
        return;
      }
      if (current.kind === "draw") {
        const a = Math.min(current.from, ms);
        const b = Math.max(current.from, ms);
        const next = regionsRef.current.filter((r) => r.id !== "drawing");
        if (b - a > 80) {
          next.push({
            id: "drawing",
            startMs: a,
            endMs: b,
            characterId: characters[0]?.id ?? "all",
            text: "New line",
          });
        }
        onChange(next);
        return;
      }
      onChange(
        regionsRef.current.map((r) => {
          if (r.id !== current.id) return r;
          if (current.edge === "start") {
            if (ms >= r.endMs - 80) return { ...r, startMs: r.endMs - 120, endMs: Math.max(r.endMs, ms) };
            return { ...r, startMs: Math.max(0, Math.min(ms, r.endMs - 120)) };
          }
          if (current.edge === "end") {
            if (ms <= r.startMs + 80) return { ...r, startMs: Math.min(r.startMs, ms), endMs: r.startMs + 120 };
            return { ...r, endMs: Math.min(dur, Math.max(ms, r.startMs + 120)) };
          }
          const span = r.endMs - r.startMs;
          const start = Math.max(0, Math.min(dur - span, ms - current.ox));
          return { ...r, startMs: start, endMs: start + span };
        }),
      );
    };
    const up = () => {
      const current = dragRef.current;
      if (current?.kind === "draw") {
        onChange(regionsRef.current.map((r) => (r.id === "drawing" ? { ...r, id: crypto.randomUUID().slice(0, 8) } : r)));
      }
      setDrag(null);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, characters, dur, onChange, onTrim]);

  const laneH = tall ? 168 : 96;
  const trimH = 36;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-white/40">Timeline</p>
          <p className="text-xs text-white/55">
            Scroll wheel zooms. Drag on the lane to paint a block. Drag either edge to grow or shrink it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-full border border-white/15 px-3 py-1 text-xs" onClick={() => setPxPerSec((z) => Math.max(28, z / 1.35))}>
            Zoom out
          </button>
          <button className="rounded-full border border-white/15 px-3 py-1 text-xs" onClick={() => setPxPerSec((z) => Math.min(420, z * 1.35))}>
            Zoom in
          </button>
          <button className="rounded-full border border-white/15 px-3 py-1 text-xs" onClick={() => setTall((v) => !v)}>
            {tall ? "Shorter" : "Taller"}
          </button>
        </div>
      </div>

      <div ref={scrollerRef} className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0c0c14]">
        <div className="relative select-none" style={{ width, height: trimH + laneH + 28 }}>
          <div className="absolute inset-x-0 top-0 h-7 text-[10px] text-white/35">
            {ticks.map((t) => (
              <span key={t} className="absolute -translate-x-1/2" style={{ left: msToX(t) }}>
                {formatTime(t)}
              </span>
            ))}
          </div>
          <div
            className="absolute left-0 right-0"
            style={{ top: 28, height: trimH }}
            onMouseDown={(e) => {
              const ms = clientToMs(e.clientX);
              if (Math.abs(ms - trimStart) < dur * 0.012) setDrag({ kind: "in" });
              else if (Math.abs(ms - trimEnd) < dur * 0.012) setDrag({ kind: "out" });
              else onSeek?.(ms);
            }}
          >
            <div className="absolute inset-x-0 top-2 h-5 rounded bg-white/10" />
            <div
              className="absolute top-2 h-5 rounded bg-[#d6ff3f]/30 ring-1 ring-[#d6ff3f]"
              style={{ left: msToX(trimStart), width: Math.max(8, msToX(trimEnd) - msToX(trimStart)) }}
            />
          </div>
          <div
            className="absolute left-0 right-0 cursor-crosshair"
            style={{ top: 28 + trimH, height: laneH }}
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).closest("[data-block]")) return;
              const ms = clientToMs(e.clientX);
              onSeek?.(ms);
              setDrag({ kind: "draw", from: ms });
            }}
          >
            <div className="absolute inset-0 rounded-xl bg-white/[0.04]" />
            {regions.map((r) => {
              const left = msToX(r.startMs);
              const w = Math.max(18, msToX(r.endMs) - left);
              const name = characters.find((c) => c.id === r.characterId)?.name ?? r.characterId;
              const selected = selectedId === r.id;
              return (
                <div
                  key={r.id}
                  data-block
                  className={`absolute top-2 overflow-hidden rounded-xl text-black shadow-lg ${selected ? "ring-2 ring-white" : ""}`}
                  style={{ left, width: w, height: laneH - 16, background: color[r.characterId] ?? "#fff" }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelectedId(r.id);
                    const rect = e.currentTarget.getBoundingClientRect();
                    const local = e.clientX - rect.left;
                    const edge: "start" | "end" | "move" = local < 18 ? "start" : local > w - 18 ? "end" : "move";
                    const ms = clientToMs(e.clientX);
                    setDrag({ kind: "region", id: r.id, edge, ox: ms - r.startMs });
                    onSeek?.(edge === "end" ? r.endMs : r.startMs);
                  }}
                >
                  <div className="absolute inset-y-0 left-0 z-10 w-4 cursor-ew-resize bg-black/30" />
                  <div className="absolute inset-y-0 right-0 z-10 w-4 cursor-ew-resize bg-black/30" />
                  <div className="pointer-events-none px-5 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{name}</p>
                    <p className="line-clamp-2 text-sm font-semibold leading-tight">{r.text}</p>
                    <p className="mt-1 text-[10px] opacity-70">
                      {formatTime(r.startMs)} – {formatTime(r.endMs)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-[#ff3d8a]" style={{ left: msToX(playheadMs) }} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <button
          className="rounded-full border border-white/15 px-3 py-1.5"
          onClick={() => {
            const start = Math.max(trimStart, playheadMs);
            onChange([
              ...regions,
              {
                id: crypto.randomUUID().slice(0, 8),
                startMs: start,
                endMs: Math.min(trimEnd, start + 2500),
                characterId: characters[0]?.id ?? "all",
                text: "New line",
              },
            ]);
          }}
        >
          Add block at playhead
        </button>
        <button className="rounded-full border border-white/15 px-3 py-1.5" onClick={() => onTrim(0, durationMs)}>
          Keep full clip
        </button>
        {selectedId && (
          <button
            className="rounded-full border border-white/15 px-3 py-1.5 text-[#ff3d8a]"
            onClick={() => {
              onChange(regions.filter((r) => r.id !== selectedId));
              setSelectedId(null);
            }}
          >
            Delete selected
          </button>
        )}
      </div>
    </div>
  );
}
