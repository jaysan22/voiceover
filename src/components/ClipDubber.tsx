"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Pack, VoRegion } from "@/lib/pack";
import { characterMap } from "@/lib/pack";
import { SceneStage } from "@/components/SceneStage";
import {
  extractAudioFromFile,
  liveContext,
  peaksFromBuffer,
  safeCloseContext,
  synthesizeBed,
} from "@/lib/audio/engine";

type Phase = "idle" | "listen" | "ready" | "countdown" | "record" | "review" | "done";

type Take = { blob: Blob; url: string; peaks: number[] };

type Props = {
  pack: Pack;
  videoUrl?: string | null;
  bedUrl?: string | null;
  dialogueUrl?: string | null;
};

function pickMime(kind: "audio" | "video") {
  const cands =
    kind === "video"
      ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
      : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const t of cands) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return kind === "video" ? "video/webm" : "audio/webm";
}

export function ClipDubber({ pack, videoUrl, bedUrl, dialogueUrl }: Props) {
  const clips = useMemo(
    () => [...pack.voRegions].sort((a, b) => a.startMs - b.startMs),
    [pack.voRegions],
  );
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [takes, setTakes] = useState<Record<string, Take>>({});
  const [livePeaks, setLivePeaks] = useState<number[]>([]);
  const [origPeaks, setOrigPeaks] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [origBuffer, setOrigBuffer] = useState<AudioBuffer | null>(null);
  const [origVol, setOrigVol] = useState(0.85);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const bedElRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef(0);
  const liveRef = useRef<number[]>([]);
  const takesRef = useRef(takes);
  takesRef.current = takes;

  const trimStart = pack.trimStartMs ?? 0;
  const clip: VoRegion | undefined = clips[index];
  const chars = characterMap(pack);
  const clipDur = Math.max(400, (clip?.endMs ?? 0) - (clip?.startMs ?? 0));
  const origOffsetMs = dialogueUrl ? 0 : trimStart;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const ctx = liveContext(null);
        if (dialogueUrl) {
          const buf = await ctx.decodeAudioData(await (await fetch(dialogueUrl)).arrayBuffer());
          if (!cancelled) setOrigBuffer(buf);
        } else if (videoUrl) {
          const blob = await (await fetch(videoUrl)).blob();
          const buf = await extractAudioFromFile(blob);
          if (!cancelled) setOrigBuffer(buf);
        } else if (!cancelled) {
          setOrigBuffer(synthesizeBed(ctx, pack.durationMs, pack.id));
        }
      } catch {
        /* waveform optional */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [dialogueUrl, pack.durationMs, pack.id, videoUrl]);

  useEffect(() => {
    if (!clip || !origBuffer) {
      setOrigPeaks([]);
      return;
    }
    setOrigPeaks(peaksFromBuffer(origBuffer, origOffsetMs + clip.startMs, origOffsetMs + clip.startMs + clipDur, 220));
  }, [clip, clipDur, origBuffer, origOffsetMs]);

  useEffect(() => {
    const next = clips[index + 1];
    if (!next || !origBuffer || !videoRef.current) return;
    const t = (trimStart + next.startMs) / 1000;
    const probe = document.createElement("video");
    probe.preload = "auto";
    probe.muted = true;
    probe.src = videoRef.current.currentSrc || videoUrl || "";
    probe.currentTime = t;
  }, [clips, index, origBuffer, trimStart, videoUrl]);

  const stopAll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const rec = recRef.current;
    if (rec && rec.state === "recording") rec.stop();
    recRef.current = null;
    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;
    videoRef.current?.pause();
    bedElRef.current?.pause();
    bedElRef.current = null;
    safeCloseContext(ctxRef.current);
    ctxRef.current = null;
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  function absStart() {
    if (!clip) return 0;
    return (trimStart + clip.startMs) / 1000;
  }

  function playPicture(muted: boolean) {
    const v = videoRef.current;
    if (!v || !clip) return;
    v.muted = muted;
    v.volume = muted ? 0 : origVol;
    v.currentTime = absStart();
    void v.play();
  }

  function runClock(onDone: () => void) {
    const started = performance.now();
    const tick = () => {
      const elapsed = performance.now() - started;
      const p = Math.min(1, elapsed / clipDur);
      setProgress(p);
      const v = videoRef.current;
      if (v && v.currentTime >= absStart() + clipDur / 1000 - 0.04) v.pause();
      if (p >= 1) onDone();
      else rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  async function hearOriginal() {
    if (!clip) return;
    stopAll();
    setError(null);
    setPhase("listen");
    setProgress(0);
    playPicture(false);
    runClock(() => {
      videoRef.current?.pause();
      setPhase("ready");
      setProgress(1);
    });
  }

  async function cueBeep(ctx: AudioContext) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 784;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.18);
    await new Promise((r) => setTimeout(r, 1000));
  }

  async function listMics() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setMics(all.filter((d) => d.kind === "audioinput"));
    } catch {
      /* ignore */
    }
  }

  async function startRecord() {
    if (!clip) return;
    stopAll();
    setLivePeaks([]);
    liveRef.current = [];
    setError(null);
    setPhase("countdown");
    setProgress(0);

    try {
      const ctx = liveContext(null);
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();

      const mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: micId ? { exact: micId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      micRef.current = mic;
      void listMics();
      await cueBeep(ctx);

      const src = ctx.createMediaStreamSource(mic);
      const recDest = ctx.createMediaStreamDestination();
      const monitor = ctx.createGain();
      monitor.gain.value = 0.9;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.3;
      src.connect(analyser);
      src.connect(recDest);
      src.connect(monitor).connect(ctx.destination);

      const recStream = recDest.stream.getAudioTracks().length
        ? recDest.stream
        : new MediaStream(mic.getAudioTracks().map((t) => t.clone()));

      const rec = new MediaRecorder(recStream, { mimeType: pickMime("audio") });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        mic.getTracks().forEach((t) => t.stop());
        if (!blob.size) {
          setError("Nothing was captured. Pick a different mic in Settings.");
          setPhase("ready");
          return;
        }
        try {
          const buf = await ctx.decodeAudioData(await blob.slice(0).arrayBuffer());
          const data = buf.getChannelData(0);
          let peak = 0;
          for (let i = 0; i < data.length; i += 8) peak = Math.max(peak, Math.abs(data[i] ?? 0));
          if (peak < 0.008) {
            setError("The take is basically silent. In the address-bar site settings, set Microphone to Allow and choose the right headset.");
          }
          const peaks = peaksFromBuffer(buf, 0, buf.duration * 1000, 220);
          const url = URL.createObjectURL(blob);
          setTakes((t) => ({ ...t, [clip.id]: { blob, url, peaks } }));
        } catch {
          const url = URL.createObjectURL(blob);
          setTakes((t) => ({ ...t, [clip.id]: { blob, url, peaks: liveRef.current } }));
        }
        setPhase("review");
      };

      recRef.current = rec;
      setPhase("record");
      playPicture(true);
      if (bedUrl) {
        const bed = new Audio(bedUrl);
        bedElRef.current = bed;
        bed.currentTime = clip.startMs / 1000;
        void bed.play();
      }
      rec.start(80);

      const buckets = 220;
      const live = new Array(buckets).fill(0);
      const data = new Uint8Array(analyser.fftSize);
      const started = performance.now();
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
        const elapsed = performance.now() - started;
        const p = Math.min(1, elapsed / clipDur);
        const i = Math.min(buckets - 1, Math.floor(p * buckets));
        live[i] = Math.max(live[i], peak);
        if (i + 1 < buckets) live[i + 1] = Math.max(live[i + 1], peak * 0.4);
        liveRef.current = live;
        setLivePeaks(live.slice());
        setProgress(p);
        if (p >= 1) {
          if (rec.state === "recording") rec.stop();
          videoRef.current?.pause();
          bedElRef.current?.pause();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setError("Mic permission is required. Click the padlock in the address bar → Microphone → Allow.");
      setPhase("ready");
    }
  }

  function stopRecord() {
    if (recRef.current?.state === "recording") recRef.current.stop();
    videoRef.current?.pause();
    bedElRef.current?.pause();
  }

  function playTake() {
    const take = clip ? takes[clip.id] : null;
    if (!take || !clip) return;
    stopAll();
    playPicture(true);
    const voice = new Audio(take.url);
    void voice.play();
    if (bedUrl) {
      const bed = new Audio(bedUrl);
      bedElRef.current = bed;
      bed.currentTime = clip.startMs / 1000;
      void bed.play();
    }
    runClock(() => {
      voice.pause();
      videoRef.current?.pause();
      bedElRef.current?.pause();
    });
  }

  function goNext() {
    stopAll();
    if (index >= clips.length - 1) {
      setPhase("done");
      return;
    }
    setIndex((i) => i + 1);
    setPhase("idle");
    setProgress(0);
    setLivePeaks([]);
  }

  async function compile() {
    if (!videoUrl) {
      setExportError("Need the scene video to compile.");
      return;
    }
    setExporting(true);
    setExportError(null);
    setExportUrl(null);
    const video = document.createElement("video");
    video.src = videoUrl;
    video.playsInline = true;
    video.muted = true;
    video.preload = "auto";
    try {
      await new Promise<void>((res, rej) => {
        video.onloadedmetadata = () => res();
        video.onerror = () => rej(new Error("Could not load the scene video."));
      });
      const ctx = liveContext(null);
      if (ctx.state === "suspended") await ctx.resume();
      const dest = ctx.createMediaStreamDestination();
      const master = ctx.createGain();
      master.connect(dest);
      master.connect(ctx.destination);

      const origGain = ctx.createGain();
      origGain.gain.value = origVol;
      origGain.connect(master);
      const t0 = ctx.currentTime + 0.15;
      if (origBuffer && !bedUrl) {
        const src = ctx.createBufferSource();
        src.buffer = origBuffer;
        src.connect(origGain);
        origGain.gain.setValueAtTime(origVol, t0);
        for (const c of clips) {
          const a = t0 + c.startMs / 1000;
          const b = t0 + c.endMs / 1000;
          origGain.gain.setValueAtTime(origVol, Math.max(t0, a - 0.03));
          origGain.gain.linearRampToValueAtTime(0.0001, a);
          origGain.gain.setValueAtTime(0.0001, b - 0.03);
          origGain.gain.linearRampToValueAtTime(origVol, b);
        }
        src.start(t0, origOffsetMs / 1000, pack.durationMs / 1000);
      }
      if (bedUrl) {
        const bedBuf = await ctx.decodeAudioData(await (await fetch(bedUrl)).arrayBuffer());
        const bedSrc = ctx.createBufferSource();
        bedSrc.buffer = bedBuf;
        const g = ctx.createGain();
        g.gain.value = 0.7;
        bedSrc.connect(g).connect(master);
        bedSrc.start(t0);
      }
      for (const c of clips) {
        const take = takesRef.current[c.id];
        if (!take) continue;
        const buf = await ctx.decodeAudioData(await take.blob.slice(0).arrayBuffer());
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(master);
        src.start(t0 + c.startMs / 1000);
      }

      video.currentTime = trimStart / 1000;
      await new Promise<void>((res) => {
        video.onseeked = () => res();
      });
      await video.play();
      const capture = video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
      const vStream = capture.captureStream?.() ?? capture.mozCaptureStream?.();
      if (!vStream) throw new Error("This browser can’t capture video for export. Try Chrome.");
      const mixed = new MediaStream([...vStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const rec = new MediaRecorder(mixed, { mimeType: pickMime("video") });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      const finished = new Promise<Blob>((resolve) => {
        rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || "video/webm" }));
      });
      rec.start(100);
      await new Promise((r) => setTimeout(r, pack.durationMs + 300));
      video.pause();
      rec.stop();
      const blob = await finished;
      setExportUrl(URL.createObjectURL(blob));
      safeCloseContext(ctx);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Could not compile this browser’s video export.");
    }
    setExporting(false);
  }

  async function shareExport() {
    if (!exportUrl) return;
    const blob = await (await fetch(exportUrl)).blob();
    const file = new File([blob], `${pack.id}-dub.webm`, { type: blob.type || "video/webm" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: pack.title });
      return;
    }
    const a = document.createElement("a");
    a.href = exportUrl;
    a.download = file.name;
    a.click();
  }

  if (!clip && phase !== "done") {
    return <p className="px-5 py-16 text-center text-white/60">This pack has no VO blocks yet. Edit it in Pack Studio.</p>;
  }

  const who = clip ? (chars[clip.characterId]?.name ?? "Everyone") : "";
  const take = clip ? takes[clip.id] : undefined;
  const overlay = phase === "record" || phase === "countdown" ? livePeaks : take?.peaks ?? [];
  const showScript = phase === "ready" || phase === "countdown" || phase === "record" || phase === "review";
  const heardOnce = phase !== "idle";

  if (phase === "done") {
    return (
      <div className="mx-auto max-w-3xl px-5 py-10 text-center">
        <p className="text-[11px] uppercase tracking-[0.25em] text-[#d6ff3f]">Scene complete</p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-5xl">Your dub</h2>
        <p className="mt-3 text-white/60">Picture plus your takes, with original voices ducked on those lines.</p>
        <div className="mt-8 overflow-hidden rounded-[28px] border border-white/10 bg-black">
          {exportUrl ? (
            <video src={exportUrl} controls className="aspect-video w-full" />
          ) : (
            <div className="grid aspect-video place-items-center text-white/50">
              {exporting ? "Mixing…" : "Compile to watch the full take"}
            </div>
          )}
        </div>
        {exportError && <p className="mt-3 text-sm text-[#ff3d8a]">{exportError}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            className="rounded-full bg-[#d6ff3f] px-6 py-3 font-semibold text-black disabled:opacity-40"
            disabled={exporting}
            onClick={() => void compile()}
          >
            {exportUrl ? "Compile again" : "Compile full video"}
          </button>
          {exportUrl && (
            <>
              <a className="rounded-full border border-white/20 px-6 py-3" href={exportUrl} download={`${pack.id}-dub.webm`}>
                Download
              </a>
              <button className="rounded-full bg-[#ff3d8a] px-6 py-3 font-semibold" onClick={() => void shareExport()}>
                Share
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div>
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            playsInline
            preload="auto"
            className="aspect-video w-full rounded-[28px] border border-white/10 bg-black object-cover"
          />
        ) : (
          <SceneStage pack={pack} timeMs={(clip?.startMs ?? 0) + progress * clipDur} className="aspect-video" />
        )}
        {phase === "countdown" && (
          <div className="mt-4 text-center font-[family-name:var(--font-display)] text-4xl text-[#d6ff3f]">Get ready…</div>
        )}
        <p
          className={`mt-5 min-h-16 text-center text-2xl font-medium leading-snug transition-opacity duration-700 ${showScript ? "opacity-100" : "opacity-0"}`}
        >
          {clip?.text}
        </p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-[#3df0ff]/40 bg-black/40 px-3 py-4">
          <Waveform original={origPeaks} overlay={overlay} progress={progress} />
          <div className="mt-2 flex justify-between text-[10px] uppercase tracking-widest text-white/40">
            <span>Original</span>
            <span>{phase === "record" ? "Your mic (live)" : take ? "Your take" : "Waiting"}</span>
          </div>
        </div>
      </div>
      <aside className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#3df0ff]">
              On clip {index + 1} of {clips.length}
            </p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl">{pack.title}</h2>
            <p className="mt-1 text-sm text-white/55">
              {who} · {Math.round(clipDur / 100) / 10}s
            </p>
          </div>
          <button className="rounded-full border border-white/15 px-3 py-1 text-xs" onClick={() => setSettingsOpen((o) => !o)}>
            Settings
          </button>
        </div>
        {settingsOpen && (
          <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-black/30 p-3">
            <label className="block text-xs text-white/50">Original volume {Math.round(origVol * 100)}%</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={origVol}
              className="w-full accent-[#d6ff3f]"
              onChange={(e) => {
                const v = Number(e.target.value);
                setOrigVol(v);
                if (videoRef.current && !videoRef.current.muted) videoRef.current.volume = v;
              }}
            />
            <label className="block text-xs text-white/50">Microphone</label>
            <select
              className="w-full rounded-lg bg-black/50 px-2 py-2 text-sm"
              value={micId}
              onChange={(e) => setMicId(e.target.value)}
              onClick={() => void listMics()}
            >
              <option value="">Default</option>
              {mics.map((m) => (
                <option key={m.deviceId} value={m.deviceId}>
                  {m.label || "Mic"}
                </option>
              ))}
            </select>
          </div>
        )}
        <p className="mt-4 text-sm text-white/60">
          {phase === "idle" || phase === "listen"
            ? "Hear the original first. The line appears when it finishes."
            : phase === "countdown"
              ? "One beat, then we record."
              : phase === "ready"
                ? "Original voices stay off while you record."
                : phase === "record"
                  ? "Cyan should jump as you speak."
                  : "Play your take, retake, or go to the next line."}
        </p>
        {error && <p className="mt-3 text-sm text-[#ff3d8a]">{error}</p>}
        <div className="mt-6 grid gap-2">
          <button
            className={`rounded-2xl px-4 py-3 text-left font-semibold disabled:opacity-35 ${heardOnce ? "bg-white/10" : "bg-[#d6ff3f] text-black"}`}
            disabled={phase === "record" || phase === "countdown"}
            onClick={() => void hearOriginal()}
          >
            {heardOnce ? "Hear clip again" : "Play original"}
          </button>
          {phase === "record" || phase === "countdown" ? (
            <button className="rounded-2xl bg-[#ff3d8a] px-4 py-3 font-semibold" onClick={stopRecord} disabled={phase === "countdown"}>
              Stop recording
            </button>
          ) : (
            <button
              className="rounded-2xl bg-[#d6ff3f] px-4 py-3 font-semibold text-black disabled:opacity-35"
              disabled={phase === "listen"}
              onClick={() => void startRecord()}
            >
              {take ? "Retake" : "Record"}
            </button>
          )}
          <button
            className="rounded-2xl bg-white/10 px-4 py-3 font-semibold disabled:opacity-35"
            disabled={!take || phase === "record" || phase === "listen" || phase === "countdown"}
            onClick={playTake}
          >
            Watch / hear my take
          </button>
          <button
            className="rounded-2xl bg-white/10 px-4 py-3 font-semibold disabled:opacity-35"
            disabled={!take || phase === "record" || phase === "countdown"}
            onClick={goNext}
          >
            {index >= clips.length - 1 ? "Finish scene" : "Next"}
          </button>
        </div>
        <p className="mt-3 text-xs text-white/40">Headphones recommended. If cyan stays flat, use Settings to pick your headset mic.</p>
      </aside>
    </div>
  );
}

function Waveform({
  original,
  overlay,
  progress,
}: {
  original: number[];
  overlay: number[];
  progress: number;
}) {
  const w = 640;
  const h = 120;
  const n = Math.max(original.length, overlay.length, 2);
  const bar = w / n;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-28 w-full">
      {original.map((p, i) => (
        <rect
          key={`o-${i}`}
          x={i * bar}
          y={(h - p * h * 0.9) / 2}
          width={Math.max(1, bar - 0.6)}
          height={Math.max(1, p * h * 0.9)}
          fill="#ff4fd8"
          opacity={0.85}
        />
      ))}
      {overlay.map((p, i) => (
        <rect
          key={`l-${i}`}
          x={i * bar}
          y={(h - p * h * 0.72) / 2}
          width={Math.max(1, bar - 0.6)}
          height={Math.max(1, p * h * 0.72)}
          fill="#3df0ff"
          opacity={0.8}
        />
      ))}
      <line x1={progress * w} x2={progress * w} y1="0" y2={h} stroke="#ff3d4a" strokeWidth="3" />
    </svg>
  );
}
