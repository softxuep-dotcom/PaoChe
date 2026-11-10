// Synthesised feedback, started only after a player's gesture.
export class Sounds {
  enabled = true;
  context = null;
  noiseBuffer = null;

  unlock() {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio || !this.enabled) return;
    try {
      if (!this.context) this.context = new Audio();
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch {
      // Audio is optional on constrained hosts.
    }
  }

  tone(from, to, duration, volume, type = 'sine', delay = 0) {
    const ctx = this.context;
    if (!this.enabled || ctx?.state !== 'running') return;
    const at = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + duration);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + duration);
  }

  noise(duration, volume, frequency) {
    const ctx = this.context;
    if (!this.enabled || ctx?.state !== 'running') return;
    if (!this.noiseBuffer) {
      this.noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .42), ctx.sampleRate);
      const samples = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    const sound = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    sound.buffer = this.noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + duration);
    sound.connect(filter).connect(gain).connect(ctx.destination);
    sound.start();
    sound.stop(ctx.currentTime + duration);
  }

  play(kind) {
    switch (kind) {
      case 'volley':
        this.noise(.19, .19, 1900);
        this.tone(96, 41, .22, .12, 'triangle');
        break;
      case 'crossfire':
        this.noise(.32, .26, 1400);
        this.tone(123, 41, .29, .18, 'triangle');
        this.tone(660, 290, .12, .055, 'sine', .03);
        break;
      case 'damage':
        this.noise(.095, .13, 500);
        this.tone(105, 52, .11, .055, 'triangle');
        break;
      case 'recover':
        this.tone(330, 440, .10, .07, 'triangle');
        this.tone(550, 740, .16, .065, 'triangle', .075);
        break;
      case 'supply':
        this.tone(330, 440, .15, .055, 'triangle');
        this.tone(495, 660, .17, .055, 'triangle', .08);
        break;
      case 'ready':
        this.tone(524, 660, .08, .035, 'sine');
        this.tone(784, 880, .11, .045, 'triangle', .075);
        break;
      case 'tail':
        this.tone(280, 202, .10, .062, 'triangle');
        this.tone(280, 202, .10, .050, 'triangle', .14);
        break;
      case 'warning':
        this.tone(177, 95, .24, .080, 'triangle');
        this.noise(.16, .05, 560);
        break;
      case 'core':
        this.tone(440, 630, .09, .052, 'triangle');
        this.tone(664, 880, .15, .057, 'triangle', .065);
        break;
      case 'win':
        [330, 440, 550, 660].forEach((hz, index) => this.tone(hz, hz, .30, .08, 'triangle', index * .09));
        break;
      case 'loss':
        this.tone(205, 66, .37, .085, 'triangle');
        break;
      case 'click':
        this.tone(550, 330, .08, .035, 'triangle');
        break;
    }
  }
}
