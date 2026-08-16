"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Pack } from "@/lib/pack";
import { activeRegion, characterMap, formatTime } from "@/lib/pack";
import { SceneStage } from "@/components/SceneStage";
import { duckGain, liveContext, safeCloseContext, synthesizeBed } from "@/lib/audio/engine";

type Props = {
  pack: Pack;
  videoUrl?: string | null;
  bedUrl?: string | null;
  dialogueUrl?: string | null;
  claimedCharacterId?: string | null;
  autoStart?: boolean;
  onTakeReady?: (blob: Blob) => void;
};

export function DubPlayer({
  pack,
  videoUrl,
  bedUrl,
  dialogueUrl,
  claimedCharacterId = null,
  autoStart = false,
  onTakeReady,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const bedMediaRef = useRef<HTMLVideoElement | null>(null);
  const videoSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const [timeMs, setTimeMs] = useState(0);
  const [phase, setPhase] = useState<"idle" | "countdown" | "rec" | "review">("idle");
  const [count, setCount] = useState(3);
  const [takeUrl, setTakeUrl] = useState<string | null>(null);
  const [bedGain, setBedGain] = useState(pack.playDefaults.bedGain);
  const [voiceGain, setVoiceGain] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<AudioContext | null>(null);
  const bedBufRef = useRef<AudioBuffer | null>(null);
  const dialogueBufRef = useRef<AudioBuffer | null>(null);
  const nodesRef = useRef<{ bed?: AudioBufferSourceNode; dialogue?: AudioBufferSourceNode; mic?: MediaStream }>({});
  const finishedRef = useRef(false);
  const countTimerRef = useRef<number | null>(null);
  const trimStart = pack.trimStartMs ?? 0;
  const chars = characterMap(pack);

  const region = activeRegion(pack, timeMs);
  const myLine =
    !claimedCharacterId || !region || region.characterId === "all" || region.characterId === claimedCharacterId;

  const ctx = () => {
    const next = liveContext(audioRef.current);
    if (next !== audioRef.current) {
      videoSourceRef.current = null;
      audioRef.current = next;
    }
    return next;
  };

  useEffect(() => {
    return () => {
      if (countTimerRef.current) window.clearInterval(countTimerRef.current);
      stopTransport();
      safeCloseContext(audioRef.current);
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopTransport = () => {
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") rec.stop();
    recorderRef.current = null;
    try {
      nodesRef.current.bed?.stop();
    } catch {
      /* already stopped */
    }
    try {
      nodesRef.current.dialogue?.stop();
    } catch {
      /* already stopped */
    }
    nodesRef.current.mic?.getTracks().forEach((t) => t.stop());
    nodesRef.current = {};
    videoRef.current?.pause();
    bedMediaRef.current?.pause();
  };

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") rec.stop();
    try {
      nodesRef.current.bed?.stop();
    } catch {
      /* already stopped */
    }
    try {
      nodesRef.current.dialogue?.stop();
    } catch {
      /* already stopped */
    }
    videoRef.current?.pause();
    bedMediaRef.current?.pause();
    setPhase("review");
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setTakeUrl(null);
    finishedRef.current = false;
    const audio = ctx();
    if (audio.state === "suspended") await audio.resume();

    try {
      if (bedUrl) {
        const res = await fetch(bedUrl);
        bedBufRef.current = await audio.decodeAudioData(await res.arrayBuffer());
      } else if (!videoUrl) {
        bedBufRef.current = synthesizeBed(audio, pack.durationMs, pack.id);
      } else {
        bedBufRef.current = null;
      }
      if (dialogueUrl) {
        const res = await fetch(dialogueUrl);
        dialogueBufRef.current = await audio.decodeAudioData(await res.arrayBuffer());
      } else {
        dialogueBufRef.current = null;
      }
    } catch {
      setError("Could not load the scene audio bed.");
      setPhase("idle");
      return;
    }

    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Mic permission is required to dub.");
      setPhase("idle");
      return;
    }

    const dest = audio.createMediaStreamDestination();
    const masterBed = audio.createGain();
    masterBed.gain.value = bedGain;
    masterBed.connect(dest);
    masterBed.connect(audio.destination);

    if (bedBufRef.current) {
      const bedSource = audio.createBufferSource();
      bedSource.buffer = bedBufRef.current;
      bedSource.connect(masterBed);
      nodesRef.current.bed = bedSource;
    } else if (videoUrl) {
      if (!bedMediaRef.current) {
        const extra = document.createElement("video");
        extra.src = videoUrl;
        extra.playsInline = true;
        extra.preload = "auto";
        bedMediaRef.current = extra;
      }
      const extra = bedMediaRef.current;
      extra.currentTime = trimStart / 1000;
      if (!videoSourceRef.current) {
        videoSourceRef.current = audio.createMediaElementSource(extra);
      } else {
        try {
          videoSourceRef.current.disconnect();
        } catch {
          /* first connect */
        }
      }
      videoSourceRef.current.connect(masterBed);
      void extra.play();
    }

    if (dialogueBufRef.current && pack.playDefaults.muteDialogue) {
      const dialogueSource = audio.createBufferSource();
      dialogueSource.buffer = dialogueBufRef.current;
      const dialogueGain = audio.createGain();
      dialogueGain.gain.value = 0;
      dialogueSource.connect(dialogueGain).connect(audio.destination);
      nodesRef.current.dialogue = dialogueSource;
    }

    const micSource = audio.createMediaStreamSource(mic);
    const voiceNode = audio.createGain();
    voiceNode.gain.value = voiceGain;
    const analyser = audio.createAnalyser();
    analyser.fftSize = 256;
    micSource.connect(analyser);
    analyser.connect(voiceNode).connect(dest);
    voiceNode.connect(audio.destination);
    nodesRef.current.mic = mic;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const duckLoop = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
      masterBed.gain.value = bedGain * duckGain(peak);
      if (recorderRef.current?.state === "recording") requestAnimationFrame(duckLoop);
    };

    const rec = new MediaRecorder(new MediaStream(dest.stream.getAudioTracks()), { mimeType: pickMime() });
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      mic.getTracks().forEach((t) => t.stop());
      if (!chunksRef.current.length) return;
      const blob = new Blob(chunksRef.current, { type: rec.mimeType });
      setTakeUrl(URL.createObjectURL(blob));
      onTakeReady?.(blob);
    };

    recorderRef.current = rec;
    setTimeMs(0);
    setPhase("rec");
    const v = videoRef.current;
    if (v) {
      v.currentTime = trimStart / 1000;
      v.muted = true;
      void v.play();
    }
    try {
      nodesRef.current.bed?.start(0);
      nodesRef.current.dialogue?.start(0);
    } catch {
      /* start once */
    }
    rec.start();
    requestAnimationFrame(duckLoop);
  }, [bedGain, bedUrl, dialogueUrl, onTakeReady, pack.durationMs, pack.id, pack.playDefaults.muteDialogue, trimStart, videoUrl, voiceGain]);

  const begin = useCallback(() => {
    if (countTimerRef.current) window.clearInterval(countTimerRef.current);
    stopTransport();
    setPhase("countdown");
    let n = Math.max(1, Math.round(pack.playDefaults.countdownMs / 1000));
    setCount(n);
    countTimerRef.current = window.setInterval(() => {
      n -= 1;
      setCount(n);
      if (n <= 0) {
        if (countTimerRef.current) window.clearInterval(countTimerRef.current);
        countTimerRef.current = null;
        void startRecording();
      }
    }, 1000);
  }, [pack.playDefaults.countdownMs, startRecording]);

  useEffect(() => {
    if (autoStart) begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const onVideoTime = () => {
    const v = videoRef.current;
    if (!v || phase !== "rec") return;
    const elapsed = v.currentTime * 1000 - trimStart;
    setTimeMs(Math.max(0, Math.min(pack.durationMs, elapsed)));
    if (elapsed >= pack.durationMs) finish();
  };

  useEffect(() => {
    if (phase !== "rec" || videoRef.current) return;
    const started = performance.now();
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - started;
      setTimeMs(Math.min(elapsed, pack.durationMs));
      if (elapsed >= pack.durationMs) finish();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [finish, pack.durationMs, phase]);

  const progress = useMemo(
    () => (pack.durationMs ? timeMs / pack.durationMs : 0),
    [timeMs, pack.durationMs],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="relative">
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            playsInline
            onTimeUpdate={onVideoTime}
            onEnded={finish}
            className="aspect-video w-full rounded-[28px] border border-white/10 bg-black object-cover"
          />
        ) : (
          <SceneStage pack={pack} timeMs={timeMs} className="aspect-video" />
        )}
        {phase === "countdown" && (
          <div className="absolute inset-0 grid place-items-center rounded-[28px] bg-black/55 text-8xl font-[family-name:var(--font-display)] text-[#d6ff3f]">
            {count}
          </div>
        )}
        {phase === "rec" && (
          <div className="absolute right-4 top-4 rounded-full bg-[#ff3d8a] px-3 py-1 text-xs font-bold tracking-widest">
            REC
          </div>
        )}
        <Karaoke pack={pack} timeMs={timeMs} highlight={myLine} />
      </div>
      <aside className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[#3df0ff]">Your take</p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl">{pack.title}</h2>
        <p className="mt-2 text-sm text-white/60">{pack.tagline}</p>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-[#d6ff3f]" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="mt-2 text-xs text-white/50">
          {formatTime(timeMs)} / {formatTime(pack.durationMs)}
        </div>
        {region ? (
          <div className="mt-4 rounded-2xl border border-white/10 p-4">
            <div className="text-xs uppercase tracking-widest" style={{ color: chars[region.characterId]?.color }}>
              {chars[region.characterId]?.name ?? "Everyone"} {myLine ? "· YOU" : "· listen"}
            </div>
            <p className={`mt-1 text-lg ${myLine ? "text-white" : "text-white/40"}`}>{region.text}</p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-white/40">No VO in this gap — ride the bed.</p>
        )}
        <label className="mt-6 block text-xs text-white/50">Bed {Math.round(bedGain * 100)}%</label>
        <input
          className="w-full accent-[#d6ff3f]"
          type="range"
          min={0.15}
          max={1}
          step={0.01}
          value={bedGain}
          onChange={(e) => setBedGain(Number(e.target.value))}
        />
        <label className="mt-3 block text-xs text-white/50">Voice {Math.round(voiceGain * 100)}%</label>
        <input
          className="w-full accent-[#ff3d8a]"
          type="range"
          min={0.4}
          max={1.6}
          step={0.01}
          value={voiceGain}
          onChange={(e) => setVoiceGain(Number(e.target.value))}
        />
        {error && <p className="mt-3 text-sm text-[#ff3d8a]">{error}</p>}
        <div className="mt-6 flex flex-col gap-3">
          {phase !== "rec" && phase !== "countdown" && (
            <button className="rounded-full bg-[#d6ff3f] px-5 py-3 font-semibold text-black" onClick={begin}>
              {phase === "review" ? "Retake" : "Start dub"}
            </button>
          )}
          {phase === "rec" && (
            <button className="rounded-full border border-white/20 px-5 py-3" onClick={finish}>
              Stop
            </button>
          )}
          {takeUrl && (
            <>
              <audio className="w-full" src={takeUrl} controls />
              <a
                className="rounded-full border border-white/20 px-5 py-2.5 text-center text-sm"
                href={takeUrl}
                download={`${pack.id}-take.webm`}
              >
                Download mix
              </a>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Karaoke({ pack, timeMs, highlight }: { pack: Pack; timeMs: number; highlight: boolean }) {
  const region = activeRegion(pack, timeMs);
  if (!region) {
    return (
      <div className="mt-3 rounded-2xl border border-dashed border-white/15 px-4 py-3 text-center text-sm text-white/40">
        Watch the bed. Next line incoming.
      </div>
    );
  }
  const words = region.words ?? [];
  return (
    <div className={`mt-3 rounded-2xl bg-black/50 px-4 py-4 text-center ${highlight ? "" : "opacity-50"}`}>
      <p className="text-lg leading-relaxed">
        {words.map((w, i) => (
          <span key={`${w.t}-${i}`} className={timeMs >= w.t ? "text-[#d6ff3f]" : "text-white/45"}>
            {w.w}{" "}
          </span>
        ))}
      </p>
    </div>
  );
}

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  return "audio/mp4";
}
