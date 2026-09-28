export interface AudioState {
  rpm: number;
  collective: number;
  airspeed: number;
  warn: boolean;
}

export class RotorAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private chop: GainNode;
  private chopDepth: GainNode;
  private lfo: OscillatorNode;
  private thump: GainNode;
  private thumpDepth: GainNode;
  private turbine: OscillatorNode;
  private whine: OscillatorNode;
  private turbineGain: GainNode;
  private windGain: GainNode;
  private windFilter: BiquadFilterNode;
  private warnGain: GainNode;
  private muted = false;

  constructor() {
    this.ctx = new AudioContext();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = () => { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.start(); return s; };

    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 0;
    this.lfo.start();

    const chopFilter = ctx.createBiquadFilter();
    chopFilter.type = 'lowpass'; chopFilter.frequency.value = 380; chopFilter.Q.value = 3;
    this.chop = ctx.createGain(); this.chop.gain.value = 0;
    this.chopDepth = ctx.createGain(); this.chopDepth.gain.value = 0;
    src().connect(chopFilter).connect(this.chop).connect(this.master);
    this.lfo.connect(this.chopDepth).connect(this.chop.gain);

    const thumpOsc = ctx.createOscillator();
    thumpOsc.frequency.value = 48; thumpOsc.start();
    this.thump = ctx.createGain(); this.thump.gain.value = 0;
    this.thumpDepth = ctx.createGain(); this.thumpDepth.gain.value = 0;
    thumpOsc.connect(this.thump).connect(this.master);
    this.lfo.connect(this.thumpDepth).connect(this.thump.gain);

    this.turbine = ctx.createOscillator(); this.turbine.type = 'sawtooth'; this.turbine.start();
    this.whine = ctx.createOscillator(); this.whine.type = 'sine'; this.whine.start();
    const tf = ctx.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 1400; tf.Q.value = 1.2;
    this.turbineGain = ctx.createGain(); this.turbineGain.gain.value = 0;
    this.turbine.connect(tf).connect(this.turbineGain);
    const wg = ctx.createGain(); wg.gain.value = 0.25;
    this.whine.connect(wg).connect(this.turbineGain);
    this.turbineGain.connect(this.master);

    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 700; this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    src().connect(this.windFilter).connect(this.windGain).connect(this.master);

    const beep = ctx.createOscillator(); beep.type = 'square'; beep.frequency.value = 760; beep.start();
    this.warnGain = ctx.createGain(); this.warnGain.gain.value = 0;
    beep.connect(this.warnGain).connect(this.master);
  }

  resume() { return this.ctx.resume(); }

  get isMuted() { return this.muted; }

  toggleMute() {
    this.muted = !this.muted;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  update(s: AudioState) {
    const t = this.ctx.currentTime, k = 0.08;
    const rpm = Math.max(0, s.rpm);
    const load = 0.35 + s.collective * 0.9;
    this.lfo.frequency.setTargetAtTime(13 * rpm, t, k);
    const chopAmp = Math.min(1, rpm * 1.1) * 0.45 * load;
    this.chop.gain.setTargetAtTime(chopAmp * 0.55, t, k);
    this.chopDepth.gain.setTargetAtTime(chopAmp * 0.45, t, k);
    const thumpAmp = rpm * 0.35 * load;
    this.thump.gain.setTargetAtTime(thumpAmp * 0.5, t, k);
    this.thumpDepth.gain.setTargetAtTime(thumpAmp * 0.5, t, k);
    this.turbine.frequency.setTargetAtTime(180 + 260 * rpm, t, k);
    this.whine.frequency.setTargetAtTime(900 + 2300 * rpm, t, k);
    this.turbineGain.gain.setTargetAtTime(Math.min(1, rpm * 1.4) * 0.05, t, k);
    this.windGain.gain.setTargetAtTime(Math.min(0.5, s.airspeed / 55 * 0.35), t, k);
    this.windFilter.frequency.setTargetAtTime(500 + s.airspeed * 12, t, k);
    const beepOn = s.warn && Math.floor(t * 3) % 2 === 0;
    this.warnGain.gain.setTargetAtTime(beepOn ? 0.05 : 0, t, 0.01);
  }

  dispose() { void this.ctx.close(); }
}
