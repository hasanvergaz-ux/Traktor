// One Web Audio graph for the whole game:
//   sources -> engine / sfx buses -> master -> limiter -> speakers
// Engine: a looped idle recording plus a "loaded" version of it, pitched by RPM,
// with a synthesized firing-frequency rumble underneath. Horn: a deep three-tone air horn.
import { asset } from "../assets";

type EngineParams = {
  rpm: number;
  load: number;
  running: boolean;
  working: number; // 0..1 cultivator in the soil, scaled by speed
  speed: number;
  rough: number; // 0..1 how rough the ground under the tyres is
  hydraulic: number; // -1 lowering, 0, +1 raising
};

const IDLE_REC_RPM = 850;

export class GameAudio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private engineBus!: GainNode;
  private sfx!: GainNode;
  analyser!: AnalyserNode;
  private idleSrc: AudioBufferSourceNode | null = null;
  private loadSrc: AudioBufferSourceNode | null = null;
  private gIdle!: GainNode;
  private gLoad!: GainNode;
  private eFilter!: BiquadFilterNode;
  private eGain!: GainNode;
  private sub!: OscillatorNode;
  private subGain!: GainNode;
  private soilGain!: GainNode;
  private soilFilter!: BiquadFilterNode;
  private roadGain!: GainNode;
  private hyd!: OscillatorNode;
  private hydGain!: GainNode;
  private horn: { oscs: OscillatorNode[]; gain: GainNode; hiss: AudioBufferSourceNode } | null = null;
  private noise!: AudioBuffer;
  private crankBuf!: AudioBuffer;
  private loading = false;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    if (this.loading) return;
    this.loading = true;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      this.ctx = ctx;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 6;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.2;
      this.master = ctx.createGain();
      this.master.gain.value = 0.85;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.master.connect(limiter);
      limiter.connect(this.analyser);
      this.analyser.connect(ctx.destination);
      this.engineBus = ctx.createGain();
      this.engineBus.connect(this.master);
      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);

      this.noise = this.makeNoise(2.5, true);
      this.crankBuf = this.makeCrank();

      // engine chain
      this.eFilter = ctx.createBiquadFilter();
      this.eFilter.type = "lowpass";
      this.eFilter.frequency.value = 1500;
      this.eFilter.Q.value = 0.6;
      this.eGain = ctx.createGain();
      this.eGain.gain.value = 0;
      this.eFilter.connect(this.eGain);
      this.eGain.connect(this.engineBus);
      this.gIdle = ctx.createGain();
      this.gLoad = ctx.createGain();
      this.gIdle.gain.value = 1;
      this.gLoad.gain.value = 0;
      this.gIdle.connect(this.eFilter);
      this.gLoad.connect(this.eFilter);

      // firing-frequency rumble gives the recording diesel weight under load
      this.sub = ctx.createOscillator();
      this.sub.type = "sawtooth";
      this.sub.frequency.value = 28;
      const subLp = ctx.createBiquadFilter();
      subLp.type = "lowpass";
      subLp.frequency.value = 150;
      this.subGain = ctx.createGain();
      this.subGain.gain.value = 0;
      this.sub.connect(subLp);
      subLp.connect(this.subGain);
      this.subGain.connect(this.eGain);
      this.sub.start();

      // soil being torn by the tines
      const soil = ctx.createBufferSource();
      soil.buffer = this.noise;
      soil.loop = true;
      this.soilFilter = ctx.createBiquadFilter();
      this.soilFilter.type = "bandpass";
      this.soilFilter.frequency.value = 420;
      this.soilFilter.Q.value = 0.7;
      this.soilGain = ctx.createGain();
      this.soilGain.gain.value = 0;
      soil.connect(this.soilFilter);
      this.soilFilter.connect(this.soilGain);
      this.soilGain.connect(this.sfx);
      soil.start();

      // tyre rumble on rough ground
      const road = ctx.createBufferSource();
      road.buffer = this.noise;
      road.loop = true;
      road.playbackRate.value = 0.7;
      const roadF = ctx.createBiquadFilter();
      roadF.type = "lowpass";
      roadF.frequency.value = 260;
      this.roadGain = ctx.createGain();
      this.roadGain.gain.value = 0;
      road.connect(roadF);
      roadF.connect(this.roadGain);
      this.roadGain.connect(this.sfx);
      road.start(0, 1.1);

      // hydraulic pump whine
      this.hyd = ctx.createOscillator();
      this.hyd.type = "sawtooth";
      this.hyd.frequency.value = 190;
      const hydF = ctx.createBiquadFilter();
      hydF.type = "bandpass";
      hydF.frequency.value = 760;
      hydF.Q.value = 3;
      this.hydGain = ctx.createGain();
      this.hydGain.gain.value = 0;
      this.hyd.connect(hydF);
      hydF.connect(this.hydGain);
      this.hydGain.connect(this.sfx);
      this.hyd.start();

      void this.loadEngine();
    } catch {
      this.ctx = null;
    }
  }

  private async loadEngine() {
    const ctx = this.ctx;
    if (!ctx) return;
    const get = async (name: string) => {
      const res = await fetch(asset(name));
      return ctx.decodeAudioData(await res.arrayBuffer());
    };
    try {
      const [idle, load] = await Promise.all([get("engine_idle.wav"), get("engine_load.wav")]);
      const mk = (buf: AudioBuffer, out: GainNode) => {
        const s = ctx.createBufferSource();
        s.buffer = buf;
        s.loop = true;
        s.connect(out);
        s.start(0, Math.random() * buf.duration);
        return s;
      };
      this.idleSrc = mk(idle, this.gIdle);
      this.loadSrc = mk(load, this.gLoad);
    } catch (e) {
      console.warn("engine sound failed to load", e);
    }
  }

  private makeNoise(seconds: number, brown: boolean) {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return b;
  }

  /** Starter motor cranking the diesel until it catches. */
  private makeCrank() {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const D = 2.3;
    const N = Math.floor(sr * D);
    const b = ctx.createBuffer(1, N, sr);
    const d = b.getChannelData(0);
    let t = 0.05;
    let iv = 0.34;
    let k = 0;
    while (t < D - 0.3) {
      const n0 = Math.floor(t * sr);
      const L = Math.floor(iv * sr * 0.9);
      const f = 70 + k * 9;
      for (let i = 0; i < L && n0 + i < N; i++) {
        const u = i / sr;
        const e = Math.sin((Math.PI * i) / L);
        d[n0 + i]! += 0.22 * e * (((u * f) % 1) * 2 - 1) + 0.6 * Math.sin(6.283 * 48 * u) * Math.exp(-u / 0.05) + 0.18 * (Math.random() * 2 - 1) * Math.exp(-u / 0.018);
      }
      t += iv;
      iv = Math.max(0.17, iv * 0.9);
      k++;
    }
    // starter whine
    for (let i = 0; i < N; i++) {
      const u = i / sr;
      d[i]! += 0.05 * Math.sin(6.283 * (260 + u * 60) * u) * Math.min(1, u * 5) * (u > D - 0.25 ? (D - u) / 0.25 : 1);
    }
    return b;
  }

  crank() {
    const ctx = this.ctx;
    if (!ctx) return;
    const s = ctx.createBufferSource();
    s.buffer = this.crankBuf;
    const g = ctx.createGain();
    g.gain.value = 0.85;
    s.connect(g);
    g.connect(this.sfx);
    s.start();
  }

  hornOn() {
    this.unlock();
    const ctx = this.ctx;
    if (!ctx || this.horn) return;
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(0.5, now + 0.07);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 2.6);
    }
    shaper.curve = curve;
    const body = ctx.createBiquadFilter();
    body.type = "peaking";
    body.frequency.value = 360;
    body.Q.value = 1.1;
    body.gain.value = 9;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2300;
    shaper.connect(body);
    body.connect(lp);
    lp.connect(out);
    out.connect(this.sfx);
    // deep A-major chord, like a truck / ship air horn
    const oscs = [110, 138.6, 164.8].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f * 0.86, now);
      o.frequency.exponentialRampToValueAtTime(f, now + 0.16);
      o.detune.value = (i - 1) * 4;
      const g = ctx.createGain();
      g.gain.value = 0.28;
      o.connect(g);
      g.connect(shaper);
      o.start(now);
      return o;
    });
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noise;
    hiss.loop = true;
    const hf = ctx.createBiquadFilter();
    hf.type = "bandpass";
    hf.frequency.value = 2600;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.18, now);
    hg.gain.exponentialRampToValueAtTime(0.02, now + 0.3);
    hiss.connect(hf);
    hf.connect(hg);
    hg.connect(out);
    hiss.start(now);
    this.horn = { oscs, gain: out, hiss };
  }

  hornOff() {
    const ctx = this.ctx;
    const h = this.horn;
    if (!ctx || !h) return;
    const now = ctx.currentTime;
    h.gain.gain.cancelScheduledValues(now);
    h.gain.gain.setValueAtTime(h.gain.gain.value, now);
    h.gain.gain.linearRampToValueAtTime(0, now + 0.28);
    for (const o of h.oscs) {
      o.frequency.setTargetAtTime(o.frequency.value * 0.95, now, 0.15);
      o.stop(now + 0.32);
    }
    h.hiss.stop(now + 0.32);
    this.horn = null;
  }

  /** Metallic clunk of the hitch hooks / an implement dropping. */
  clunk(strength = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 900;
    f.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9 * strength, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    s.start(now, Math.random());
    s.stop(now + 0.15);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(180, now);
    o.frequency.exponentialRampToValueAtTime(60, now + 0.2);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.6 * strength, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    o.connect(og);
    og.connect(this.sfx);
    o.start(now);
    o.stop(now + 0.3);
  }

  thud(strength = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(90, now);
    o.frequency.exponentialRampToValueAtTime(38, now + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(1, 0.35 * strength), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    o.connect(g);
    g.connect(this.sfx);
    o.start(now);
    o.stop(now + 0.4);
  }

  update(p: EngineParams) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const tc = 0.06;
    const rate = Math.max(0.35, Math.min(2.6, p.rpm / IDLE_REC_RPM));
    this.idleSrc?.playbackRate.setTargetAtTime(rate, now, tc);
    this.loadSrc?.playbackRate.setTargetAtTime(rate, now, tc);
    const on = p.running ? 1 : Math.min(1, p.rpm / 500);
    this.eGain.gain.setTargetAtTime(0.95 * on, now, p.running ? 0.08 : 0.25);
    this.gIdle.gain.setTargetAtTime(1 - p.load * 0.55, now, tc);
    this.gLoad.gain.setTargetAtTime(0.15 + p.load * 0.95, now, tc);
    this.eFilter.frequency.setTargetAtTime(900 + p.rpm * 1.4 + p.load * 1600, now, tc);
    this.sub.frequency.setTargetAtTime(Math.max(8, (p.rpm / 60) * 2), now, tc);
    this.subGain.gain.setTargetAtTime((0.1 + p.load * 0.32) * on, now, tc);
    this.soilGain.gain.setTargetAtTime(0.5 * p.working, now, 0.1);
    this.soilFilter.frequency.setTargetAtTime(320 + p.speed * 40, now, 0.1);
    this.roadGain.gain.setTargetAtTime(Math.min(0.5, p.speed * 0.06) * p.rough, now, 0.1);
    this.hydGain.gain.setTargetAtTime(p.hydraulic !== 0 && p.running ? 0.05 : 0, now, 0.05);
    this.hyd.frequency.setTargetAtTime(p.hydraulic > 0 ? 210 : 170, now, 0.1);
  }

  /** Peak level of the master bus (for checks). */
  level() {
    if (!this.analyser) return 0;
    const a = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(a);
    let m = 0;
    for (const v of a) m = Math.max(m, Math.abs(v));
    return m;
  }
}

export const gameAudio = new GameAudio();
