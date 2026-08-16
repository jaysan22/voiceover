export function hashSeed(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function safeCloseContext(ctx: AudioContext | null | undefined) {
  if (!ctx || ctx.state === "closed") return;
  void ctx.close().catch(() => {});
}

export function liveContext(existing: AudioContext | null | undefined) {
  if (existing && existing.state !== "closed") return existing;
  return new AudioContext();
}

export async function decodeBlob(ctx: AudioContext, blob: Blob) {
  const buf = await blob.arrayBuffer();
  return ctx.decodeAudioData(buf.slice(0));
}

export function sliceBuffer(ctx: AudioContext, buffer: AudioBuffer, startMs: number, endMs: number) {
  const start = Math.max(0, Math.floor((startMs / 1000) * buffer.sampleRate));
  const end = Math.min(buffer.length, Math.floor((endMs / 1000) * buffer.sampleRate));
  const length = Math.max(1, end - start);
  const out = ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    out.getChannelData(c).set(buffer.getChannelData(c).subarray(start, start + length));
  }
  return out;
}

export async function extractAudioFromFile(
  file: File | Blob,
  onProgress?: (ratio: number) => void,
): Promise<AudioBuffer> {
  const probe = new AudioContext();
  try {
    const decoded = await probe.decodeAudioData((await file.arrayBuffer()).slice(0));
    safeCloseContext(probe);
    onProgress?.(1);
    return decoded;
  } catch {
    safeCloseContext(probe);
  }
  return extractByPlayback(file, onProgress);
}

function extractByPlayback(file: Blob, onProgress?: (ratio: number) => void) {
  return new Promise<AudioBuffer>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video") || !file.type.startsWith("audio");
    const el = document.createElement(isVideo ? "video" : "audio");
    el.src = url;
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    if ("playsInline" in el) el.playsInline = true;

    const ctx = new AudioContext();
    const chunks: Blob[] = [];

    const fail = (err: unknown) => {
      URL.revokeObjectURL(url);
      safeCloseContext(ctx);
      reject(err);
    };

    el.onerror = () => fail(new Error("Could not read audio from this file."));

    el.onloadedmetadata = async () => {
      try {
        if (ctx.state === "suspended") await ctx.resume();
        const src = ctx.createMediaElementSource(el);
        const mute = ctx.createGain();
        mute.gain.value = 0;
        const dest = ctx.createMediaStreamDestination();
        src.connect(dest);
        src.connect(mute).connect(ctx.destination);

        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "audio/mp4";
        const rec = new MediaRecorder(dest.stream, { mimeType: mime });
        rec.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        rec.onstop = async () => {
          try {
            const blob = new Blob(chunks, { type: mime });
            const decodeCtx = liveContext(ctx);
            const buf = await decodeCtx.decodeAudioData(await blob.arrayBuffer());
            URL.revokeObjectURL(url);
            safeCloseContext(decodeCtx);
            onProgress?.(1);
            resolve(buf);
          } catch (err) {
            fail(err);
          }
        };
        el.ontimeupdate = () => {
          if (el.duration) onProgress?.(Math.min(0.99, el.currentTime / el.duration));
        };
        el.onended = () => {
          if (rec.state === "recording") rec.stop();
        };
        rec.start(100);
        el.muted = false;
        el.volume = 1;
        await el.play();
      } catch (err) {
        fail(err);
      }
    };
  });
}

export function bufferToWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const rate = buffer.sampleRate;
  const samples = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = samples * blockAlign;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}

export function synthesizeBed(ctx: AudioContext, durationMs: number, seedStr: string) {
  const seed = hashSeed(seedStr);
  const duration = durationMs / 1000;
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(2, length, sampleRate);
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);
  const root = 110 + (seed % 40);
  const chord = [0, 3, 7, 10].map((s) => root * Math.pow(2, s / 12));
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const beat = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * (1.8 + (seed % 5) * 0.12));
    let pad = 0;
    for (const f of chord) {
      pad += Math.sin(2 * Math.PI * f * t) * 0.12;
      pad += Math.sin(2 * Math.PI * (f * 2.01) * t) * 0.04;
    }
    const hat = ((Math.sin(t * 80 + seed) * 43758.5453) % 1) * 0.04 * (beat > 0.85 ? 1 : 0.15);
    const rumble = Math.sin(2 * Math.PI * 48 * t) * 0.08;
    const env = Math.min(1, t * 4) * Math.min(1, (duration - t) * 4);
    const v = (pad + hat + rumble) * env * 0.9;
    L[i] = v * (0.92 + 0.08 * Math.sin(t * 0.7));
    R[i] = v * (0.92 + 0.08 * Math.cos(t * 0.6));
  }
  return buffer;
}

export function splitStems(buffer: AudioBuffer, ctx: AudioContext) {
  const length = buffer.length;
  const rate = buffer.sampleRate;
  const dialogue = ctx.createBuffer(1, length, rate);
  const bed = ctx.createBuffer(2, length, rate);
  const d = dialogue.getChannelData(0);
  const l = buffer.getChannelData(0);
  const r = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : l;
  const bl = bed.getChannelData(0);
  const br = bed.getChannelData(1);
  for (let i = 0; i < length; i++) {
    const mid = (l[i] + r[i]) * 0.5;
    const side = (l[i] - r[i]) * 0.5;
    d[i] = mid;
    bl[i] = side * 1.4 + mid * 0.12;
    br[i] = -side * 1.4 + mid * 0.12;
  }
  return { dialogue, bed };
}

export function detectVoRegions(buffer: AudioBuffer, durationMs: number) {
  const data = buffer.getChannelData(0);
  const hop = Math.floor(buffer.sampleRate * 0.05);
  const energies: number[] = [];
  for (let i = 0; i < data.length; i += hop) {
    let sum = 0;
    const end = Math.min(data.length, i + hop);
    for (let j = i; j < end; j++) sum += data[j] * data[j];
    energies.push(Math.sqrt(sum / Math.max(1, end - i)));
  }
  const sorted = [...energies].sort((a, b) => a - b);
  const thresh = sorted[Math.floor(sorted.length * 0.62)] ?? 0.02;
  const regions: { startMs: number; endMs: number }[] = [];
  let start: number | null = null;
  energies.forEach((e, idx) => {
    const t = (idx * hop) / buffer.sampleRate;
    if (e > thresh * 1.15) {
      if (start == null) start = t;
    } else if (start != null) {
      const end = t;
      if (end - start >= 0.45) regions.push({ startMs: start * 1000, endMs: end * 1000 });
      start = null;
    }
  });
  if (start != null) {
    regions.push({ startMs: start * 1000, endMs: durationMs });
  }
  return regions.slice(0, 12).map((r, i) => ({
    ...r,
    startMs: Math.max(0, r.startMs - 80),
    endMs: Math.min(durationMs, r.endMs + 120),
    i,
  }));
}

export function duckGain(voiceLevel: number) {
  return Math.max(0.35, 1 - voiceLevel * 0.45);
}

export function peaksFromBuffer(buffer: AudioBuffer, startMs: number, endMs: number, buckets = 180) {
  const data = buffer.getChannelData(0);
  const start = Math.max(0, Math.floor((startMs / 1000) * buffer.sampleRate));
  const end = Math.min(data.length, Math.floor((endMs / 1000) * buffer.sampleRate));
  const span = Math.max(1, end - start);
  const peaks: number[] = [];
  for (let i = 0; i < buckets; i++) {
    const a = start + Math.floor((i / buckets) * span);
    const b = start + Math.floor(((i + 1) / buckets) * span);
    let max = 0;
    for (let j = a; j < b; j++) max = Math.max(max, Math.abs(data[j] ?? 0));
    peaks.push(max);
  }
  const peak = Math.max(...peaks, 0.0001);
  return peaks.map((p) => p / peak);
}

export async function capturePoster(video: HTMLVideoElement, atMs: number) {
  const target = Math.min(Math.max(0.05, atMs / 1000), Math.max(0.1, (video.duration || 1) * 0.35));
  if (Math.abs(video.currentTime - target) > 0.05) {
    video.currentTime = target;
    await new Promise<void>((res) => {
      const done = () => {
        video.removeEventListener("seeked", done);
        res();
      };
      video.addEventListener("seeked", done);
    });
  }
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82));
}
