"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Timeline } from "@/components/studio/Timeline";
import { wordsFromText, type Character, type Pack, type VoRegion, validatePack } from "@/lib/pack";
import {
  bufferToWav,
  detectVoRegions,
  extractAudioFromFile,
  liveContext,
  safeCloseContext,
  sliceBuffer,
  splitStems,
} from "@/lib/audio/engine";
import { capturePoster } from "@/lib/audio/engine";
import { exportVoCsv, importVoCsv } from "@/lib/voCsv";
import { getStoredPack, saveStoredPack } from "@/lib/storage";

const palette = ["#d6ff3f", "#3df0ff", "#ff3d8a", "#ffb703", "#c77dff", "#ef476f"];

export function StudioApp({ editId }: { editId?: string }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("Untitled scene");
  const [tagline, setTagline] = useState("A custom dub pack");
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(20000);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(20000);
  const [playhead, setPlayhead] = useState(0);
  const [characters, setCharacters] = useState<Character[]>([
    { id: "a", name: "Character A", color: palette[0] },
    { id: "b", name: "Character B", color: palette[1] },
  ]);
  const [regions, setRegions] = useState<VoRegion[]>([]);
  const [status, setStatus] = useState("Import a clip. We’ll pull audio, then you mark who speaks when.");
  const [busy, setBusy] = useState(false);
  const [rights, setRights] = useState(false);
  const [bedBlob, setBedBlob] = useState<Blob | null>(null);
  const [dialogueBlob, setDialogueBlob] = useState<Blob | null>(null);
  const [fullAudio, setFullAudio] = useState<AudioBuffer | null>(null);
  const [solo, setSolo] = useState<"mix" | "bed" | "dialogue">("mix");
  const [soloUrl, setSoloUrl] = useState<string | null>(null);
  const [packId, setPackId] = useState(() => editId || `lib-${Date.now().toString(36)}`);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!editId) return;
    void getStoredPack(editId).then(async (stored) => {
      if (!stored) {
        setStatus("Could not load that pack in this browser.");
        return;
      }
      const p = stored.pack;
      setPackId(p.id);
      setTitle(p.title);
      setTagline(p.tagline);
      setRights(true);
      setCharacters(p.characters);
      const trim = p.trimStartMs ?? 0;
      setTrimStart(trim);
      if (stored.video) {
        const f = new File([stored.video], `${p.id}.mp4`, { type: stored.video.type || "video/mp4" });
        setFile(f);
        const url = URL.createObjectURL(stored.video);
        setVideoUrl(url);
        const v = document.createElement("video");
        v.src = url;
        await new Promise<void>((res) => {
          v.onloadedmetadata = () => res();
          v.onerror = () => res();
        });
        const full = Math.round((v.duration && Number.isFinite(v.duration) ? v.duration : p.durationMs / 1000) * 1000);
        setDurationMs(full);
        setTrimEnd(trim + p.durationMs);
      } else {
        setDurationMs(p.durationMs);
        setTrimEnd(trim + p.durationMs);
      }
      setRegions(
        p.voRegions.map((r) => ({
          ...r,
          startMs: r.startMs + trim,
          endMs: r.endMs + trim,
        })),
      );
      if (stored.bed) setBedBlob(stored.bed);
      if (stored.dialogue) setDialogueBlob(stored.dialogue);
      setStatus("Loaded pack. Edit, then save again.");
    });
  }, [editId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      togglePlay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }

  const packPreview: Pack = useMemo(
    () => ({
      id: packId,
      title,
      tagline,
      durationMs: Math.max(0, trimEnd - trimStart),
      trimStartMs: trimStart,
      tags: ["custom"],
      origin: "library",
      characters,
      voRegions: regions
        .map((r) => ({
          ...r,
          startMs: r.startMs - trimStart,
          endMs: r.endMs - trimStart,
        }))
        .filter((r) => r.endMs > 0 && r.startMs < trimEnd - trimStart)
        .map((r) => ({
          ...r,
          startMs: Math.max(0, r.startMs),
          endMs: Math.min(trimEnd - trimStart, r.endMs),
          words: wordsFromText(r.text, Math.max(0, r.startMs), r.endMs),
        })),
      playDefaults: { muteDialogue: true, bedGain: 0.65, countdownMs: 3000 },
      scene: { kind: "video" as const },
    }),
    [characters, packId, regions, tagline, title, trimEnd, trimStart],
  );

  async function onFile(f: File) {
    setFile(f);
    const url = URL.createObjectURL(f);
    setVideoUrl(url);
    setBedBlob(null);
    setDialogueBlob(null);
    setFullAudio(null);
    setSoloUrl(null);
    if (!editId) setPackId(`lib-${slug(title) || "pack"}-${Date.now().toString(36)}`);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    await new Promise<void>((res) => {
      v.onloadedmetadata = () => res();
      v.onerror = () => res();
    });
    const ms = Math.round((v.duration && Number.isFinite(v.duration) ? v.duration : 20) * 1000);
    setDurationMs(ms);
    setTrimStart(0);
    setTrimEnd(ms);
    setStatus("Clip loaded. Extract audio, then mark VO blocks (or add them by hand).");
  }

  async function extractAndSplit() {
    if (!file) return;
    setBusy(true);
    setStatus("Reading soundtrack…");
    const work = liveContext(null);
    try {
      const decoded = await extractAudioFromFile(file, (p) => {
        setStatus(`Reading soundtrack… ${Math.round(p * 100)}%`);
      });
      setFullAudio(decoded);
      setStatus("Splitting dialogue (center) from bed (sides)…");
      const { dialogue, bed } = splitStems(decoded, work);
      const dBlob = bufferToWav(sliceBuffer(work, dialogue, trimStart, trimEnd));
      const bBlob = bufferToWav(sliceBuffer(work, bed, trimStart, trimEnd));
      setDialogueBlob(dBlob);
      setBedBlob(bBlob);
      const found = detectVoRegions(sliceBuffer(work, dialogue, trimStart, trimEnd), trimEnd - trimStart);
      if (found.length) {
        setRegions(
          found.map((r, i) => ({
            id: `auto-${i}`,
            startMs: r.startMs + trimStart,
            endMs: r.endMs + trimStart,
            characterId: characters[i % characters.length]?.id ?? "a",
            text: `Line ${i + 1}`,
          })),
        );
        setStatus("Draft VO blocks from speech energy. Edit the text, then publish.");
      } else {
        setStatus("Audio is ready. Add VO blocks on the timeline for every line to dub.");
      }
    } catch {
      setStatus("Could not pull audio automatically. You can still add VO blocks and publish — playback will use the clip’s original sound.");
    }
    safeCloseContext(work);
    setBusy(false);
  }

  async function publish() {
    if (!rights) {
      setStatus("Confirm you have rights to this clip.");
      return;
    }
    const errors = validatePack(packPreview);
    if (errors.length) {
      setStatus(errors[0]);
      return;
    }
    if (!file) {
      setStatus("Import a video first.");
      return;
    }
    let bed = bedBlob;
    let dialogue = dialogueBlob;
    if (!bed && fullAudio) {
      const work = liveContext(null);
      bed = bufferToWav(sliceBuffer(work, fullAudio, trimStart, trimEnd));
      safeCloseContext(work);
    }
    let poster: Blob | undefined;
    if (videoRef.current) {
      poster = (await capturePoster(videoRef.current, trimStart + 800)) ?? undefined;
    }
    await saveStoredPack({
      pack: packPreview,
      video: file,
      bed: bed ?? undefined,
      dialogue: dialogue ?? undefined,
      poster,
    });
    router.push(`/dub/${packPreview.id}`);
  }

  function seek(ms: number) {
    setPlayhead(ms);
    if (videoRef.current) videoRef.current.currentTime = ms / 1000;
  }

  function downloadCsv() {
    const csv = exportVoCsv({ characters, regions });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug(title)}-vo-blocks.csv`;
    a.click();
    setStatus("Exported VO blocks + character names as CSV.");
  }

  function onCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = importVoCsv(String(reader.result ?? ""), characters, palette);
      setCharacters(parsed.characters);
      setRegions(parsed.regions);
      setStatus(`Imported ${parsed.regions.length} VO blocks and ${parsed.characters.length} characters.`);
    };
    reader.readAsText(file);
  }

  const listenModes = [
    {
      id: "mix" as const,
      label: "Original",
      hint: "Voices + music together, like the clip you uploaded.",
    },
    {
      id: "bed" as const,
      label: "Music bed",
      hint: "Music and sound effects only — this is what plays under your dub.",
    },
    {
      id: "dialogue" as const,
      label: "Original voices",
      hint: "Spoken lines only. The game mutes this so you can replace it.",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-[#ff3d8a]">Pack Studio</p>
          <h1 className="font-[family-name:var(--font-display)] text-5xl">Build a pack</h1>
          <p className="mt-2 max-w-xl text-white/60">
            Import a scene, mark every line you want voiced, then save and play.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-full border border-white/20 px-4 py-3 text-sm" onClick={downloadCsv} disabled={!regions.length}>
            Export CSV
          </button>
          <button className="rounded-full border border-white/20 px-4 py-3 text-sm" onClick={() => csvInputRef.current?.click()}>
            Import CSV
          </button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onCsvFile(f);
              e.currentTarget.value = "";
            }}
          />
          <button
            disabled={busy}
            onClick={() => void publish()}
            className="rounded-full bg-[#d6ff3f] px-6 py-3 font-semibold text-black disabled:opacity-50"
          >
            Save & play
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.85fr]">
        <section className="space-y-4">
          <div
            className="overflow-hidden rounded-[28px] border border-white/10 bg-black"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) void onFile(f);
            }}
          >
            {videoUrl ? (
              <>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="aspect-video w-full object-cover"
                  onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime * 1000)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                />
                <div className="flex items-center gap-3 border-t border-white/10 bg-black/60 px-4 py-3">
                  <button
                    type="button"
                    className="rounded-full bg-[#d6ff3f] px-5 py-2 text-sm font-semibold text-black"
                    onClick={togglePlay}
                  >
                    {playing ? "Pause" : "Play"}
                  </button>
                  <span className="text-xs text-white/50">Space bar also plays and pauses</span>
                </div>
              </>
            ) : (
              <label className="grid aspect-video cursor-pointer place-items-center px-6 text-center text-white/50">
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onFile(f);
                  }}
                />
                Drop MP4 / MOV / WebM here, or click to import
              </label>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5">
          <label className="block text-xs text-white/50">Title</label>
          <input className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="block text-xs text-white/50">Tagline</label>
          <input className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2" value={tagline} onChange={(e) => setTagline(e.target.value)} />

          <button
            className="w-full rounded-full bg-white/10 px-4 py-3 text-sm font-semibold disabled:opacity-40"
            disabled={!file || busy}
            onClick={() => void extractAndSplit()}
          >
            {busy ? "Working…" : "Extract audio + draft VO blocks"}
          </button>

          <div>
            <p className="text-xs font-semibold text-white/80">Listen to a layer</p>
            <p className="mt-1 text-xs text-white/45">Preview only. Does not change the pack until you save.</p>
            <div className="mt-3 grid gap-2">
              {listenModes.map((mode) => (
                <button
                  key={mode.id}
                  className={`rounded-2xl border px-3 py-2 text-left ${solo === mode.id ? "border-[#d6ff3f] bg-[#d6ff3f]/10" : "border-white/10 bg-black/20"}`}
                  onClick={() => {
                    setSolo(mode.id);
                    const blob = mode.id === "bed" ? bedBlob : mode.id === "dialogue" ? dialogueBlob : file;
                    if (blob) {
                      if (soloUrl) URL.revokeObjectURL(soloUrl);
                      setSoloUrl(URL.createObjectURL(blob));
                    }
                  }}
                >
                  <span className="block text-sm font-semibold">{mode.label}</span>
                  <span className="block text-xs text-white/50">{mode.hint}</span>
                </button>
              ))}
            </div>
            {solo !== "mix" && !bedBlob && (
              <p className="mt-2 text-xs text-[#ff3d8a]">Extract audio first to hear the split layers.</p>
            )}
            {soloUrl && <audio className="mt-3 w-full" controls src={soloUrl} />}
          </div>
        </section>
      </div>

      <section className="mt-8 space-y-4">
        <Timeline
          durationMs={durationMs}
          regions={regions}
          characters={characters}
          trimStart={trimStart}
          trimEnd={trimEnd}
          playheadMs={playhead}
          onChange={setRegions}
          onTrim={(s, e) => {
            setTrimStart(s);
            setTrimEnd(e);
          }}
          onSeek={seek}
        />
        <p className="text-sm text-[#3df0ff]">{status}</p>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-sm font-semibold">Characters</h3>
          {characters.map((c, i) => (
            <div key={c.id} className="flex gap-2">
              <input
                className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
                value={c.name}
                onChange={(e) =>
                  setCharacters(characters.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))
                }
              />
              <span className="h-10 w-10 rounded-xl" style={{ background: c.color }} />
            </div>
          ))}
          <button
            className="text-sm text-[#d6ff3f]"
            onClick={() =>
              setCharacters([
                ...characters,
                {
                  id: crypto.randomUUID().slice(0, 6),
                  name: `Character ${characters.length + 1}`,
                  color: palette[characters.length % palette.length],
                },
              ])
            }
          >
            + Add character
          </button>
        </div>
        <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-sm font-semibold">VO lines</h3>
          <div className="max-h-80 space-y-2 overflow-auto">
            {regions.map((r) => (
              <div key={r.id} className="rounded-xl border border-white/10 p-3">
                <div className="mb-2 flex gap-2">
                  <select
                    className="rounded-lg bg-black/40 text-xs"
                    value={r.characterId}
                    onChange={(e) =>
                      setRegions(regions.map((x) => (x.id === r.id ? { ...x, characterId: e.target.value } : x)))
                    }
                  >
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                    <option value="all">Everyone</option>
                  </select>
                  <span className="text-[11px] text-white/40">
                    {Math.round(r.startMs)}–{Math.round(r.endMs)} ms
                  </span>
                  <button className="ml-auto text-xs text-white/40" onClick={() => setRegions(regions.filter((x) => x.id !== r.id))}>
                    Remove
                  </button>
                </div>
                <textarea
                  className="w-full rounded-lg bg-black/40 p-2 text-sm"
                  rows={2}
                  value={r.text}
                  onChange={(e) => setRegions(regions.map((x) => (x.id === r.id ? { ...x, text: e.target.value } : x)))}
                />
              </div>
            ))}
          </div>
          <label className="flex items-start gap-2 text-xs text-white/60">
            <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />
            I have the right to use this clip. The pack stays in this browser until you publish it into a room.
          </label>
        </div>
      </section>
    </div>
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pack";
}
