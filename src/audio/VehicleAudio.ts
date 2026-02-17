export class VehicleAudio {
  private audioContext: AudioContext | null = null;

  private masterGain: GainNode | null = null;
  private engineOscillator: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private windGain: GainNode | null = null;

  ensureStarted(): void {
    if (this.audioContext) {
      if (this.audioContext.state === "suspended") {
        void this.audioContext.resume();
      }
      return;
    }

    const AudioContextCtor = window.AudioContext;
    if (!AudioContextCtor) {
      return;
    }

    const context = new AudioContextCtor();
    const master = context.createGain();
    master.gain.value = 0.24;
    master.connect(context.destination);

    const engineOsc = context.createOscillator();
    engineOsc.type = "sawtooth";
    engineOsc.frequency.value = 70;

    const engineGain = context.createGain();
    engineGain.gain.value = 0.001;

    engineOsc.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();

    const windSource = context.createBufferSource();
    windSource.buffer = this.buildNoiseBuffer(context, 2.2);
    windSource.loop = true;

    const windFilter = context.createBiquadFilter();
    windFilter.type = "highpass";
    windFilter.frequency.value = 520;

    const windGain = context.createGain();
    windGain.gain.value = 0.0001;

    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSource.start();

    this.audioContext = context;
    this.masterGain = master;
    this.engineOscillator = engineOsc;
    this.engineGain = engineGain;
    this.windGain = windGain;
  }

  update(speedKmh: number, throttle: number, boostActive: boolean): void {
    if (!this.audioContext || !this.engineOscillator || !this.engineGain || !this.windGain) {
      return;
    }

    const clampedSpeed = Math.max(0, Math.min(380, speedKmh));
    const speedRatio = clampedSpeed / 380;

    const targetFreq = 55 + speedRatio * 250 + throttle * 70;
    this.engineOscillator.frequency.setTargetAtTime(
      targetFreq,
      this.audioContext.currentTime,
      0.03
    );

    const baseEngineGain = 0.01 + throttle * 0.06 + speedRatio * 0.025;
    const boostedEngineGain = boostActive ? baseEngineGain * 1.35 : baseEngineGain;

    this.engineGain.gain.setTargetAtTime(
      boostedEngineGain,
      this.audioContext.currentTime,
      0.045
    );

    const targetWind = 0.001 + speedRatio * 0.058;
    this.windGain.gain.setTargetAtTime(targetWind, this.audioContext.currentTime, 0.06);
  }

  playCheckpoint(): void {
    if (!this.audioContext || !this.masterGain) {
      return;
    }

    const osc = this.audioContext.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 720;

    const gain = this.audioContext.createGain();
    gain.gain.value = 0.0001;

    osc.connect(gain);
    gain.connect(this.masterGain);

    const now = this.audioContext.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.085, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  playBoost(): void {
    if (!this.audioContext || !this.masterGain) {
      return;
    }

    const osc = this.audioContext.createOscillator();
    osc.type = "square";
    osc.frequency.value = 340;

    const gain = this.audioContext.createGain();
    gain.gain.value = 0.0001;

    osc.connect(gain);
    gain.connect(this.masterGain);

    const now = this.audioContext.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    osc.frequency.exponentialRampToValueAtTime(560, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    osc.start(now);
    osc.stop(now + 0.18);
  }

  playFinish(): void {
    if (!this.audioContext || !this.masterGain) {
      return;
    }

    const osc = this.audioContext.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 420;

    const gain = this.audioContext.createGain();
    gain.gain.value = 0.0001;

    osc.connect(gain);
    gain.connect(this.masterGain);

    const now = this.audioContext.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.035);
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.18);
    osc.frequency.exponentialRampToValueAtTime(560, now + 0.32);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc.start(now);
    osc.stop(now + 0.38);
  }

  private buildNoiseBuffer(context: AudioContext, durationSeconds: number): AudioBuffer {
    const sampleRate = context.sampleRate;
    const frameCount = Math.floor(sampleRate * durationSeconds);
    const buffer = context.createBuffer(1, frameCount, sampleRate);
    const channel = buffer.getChannelData(0);

    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }

    return buffer;
  }
}
