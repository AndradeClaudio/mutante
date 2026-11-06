// Original soundtrack synthesized with Web Audio, so the video carries no third-party music.
// Shape: a quiet minor pad all along; a machine pulse starts when the purchases begin and builds,
// through a riser, to an impact on the climax (the verdicts the network discarded); then it resolves.
// Every sound is scheduled ahead on the audio clock from the cue times the scenes declare.
(() => {
  const PROGRESSION = [ // A minor, F, C, G (Hz)
    [110.0, 130.81, 164.81, 220.0],
    [87.31, 110.0, 130.81, 174.61],
    [130.81, 164.81, 196.0, 261.63],
    [98.0, 123.47, 146.83, 196.0],
  ];
  const CHORD_SECONDS = 8;
  const BEAT_SECONDS = 60 / 96;
  const RISER_SECONDS = 8;

  window.scheduleSoundtrack = (audio, output, startAt, cues, total) => {
    const at = (t) => startAt + t;
    const cue = (kind) => cues.find((c) => c.kind === kind)?.at;
    const impact = cue('impact');
    const pulseStart = cue('pulse') ?? impact - 30;
    const resolveAt = cue('resolve') ?? total - 15;
    const noise = noiseBuffer(audio);

    const master = audio.createGain();
    const compressor = audio.createDynamicsCompressor();
    master.connect(compressor).connect(output);
    master.gain.setValueAtTime(0, at(0));
    master.gain.linearRampToValueAtTime(0.85, at(2));
    master.gain.setValueAtTime(0.85, at(total - 4));
    master.gain.linearRampToValueAtTime(0, at(total - 0.2));

    // Pad: darker before the climax, brighter after it.
    for (let t = 0, i = 0; t < resolveAt; t += CHORD_SECONDS, i++) {
      const bright = t >= impact;
      pad(audio, master, at(t), CHORD_SECONDS + 1.5, PROGRESSION[i % PROGRESSION.length], bright ? 1600 : 700, bright ? 0.05 : 0.035);
    }
    pad(audio, master, at(resolveAt), total - resolveAt, [110.0, 164.81, 220.0, 246.94, 329.63], 1200, 0.05); // A minor add9

    // Machine pulse: one kick per beat, growing until a breath of silence before the impact.
    const pulseEnd = impact - 1;
    for (let t = pulseStart; t < pulseEnd; t += BEAT_SECONDS) {
      const growth = (t - pulseStart) / (pulseEnd - pulseStart);
      kick(audio, master, at(t), 0.25 + 0.45 * growth);
      if (growth > 0.35) tick(audio, master, noise, at(t + BEAT_SECONDS / 2), 0.04 + 0.08 * growth);
    }
    riser(audio, master, noise, at(impact - RISER_SECONDS), RISER_SECONDS);
    boom(audio, master, noise, at(impact));
    // The pulse comes back softer after the impact, then stops before the closing scene.
    for (let t = impact + 4; t < resolveAt - 2; t += BEAT_SECONDS * 2) kick(audio, master, at(t), 0.18);

    for (const c of cues) {
      if (c.kind === 'glitch') glitch(audio, master, at(c.at));
      if (c.kind === 'ping') ping(audio, master, at(c.at));
    }
  };

  function pad(audio, out, start, length, frequencies, cutoff, level) {
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + 2);
    gain.gain.setValueAtTime(level, start + length - 2);
    gain.gain.linearRampToValueAtTime(0, start + length);
    filter.connect(gain).connect(out);
    for (const f of frequencies) {
      for (const detune of [-7, 7]) {
        const osc = audio.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(start);
        osc.stop(start + length + 0.1);
      }
    }
  }

  function kick(audio, out, start, level) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.setValueAtTime(110, start);
    osc.frequency.exponentialRampToValueAtTime(42, start + 0.18);
    gain.gain.setValueAtTime(level, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(start + 0.32);
  }

  function tick(audio, out, noise, start, level) {
    const source = audio.createBufferSource();
    source.buffer = noise;
    const filter = audio.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(level, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.05);
    source.connect(filter).connect(gain).connect(out);
    source.start(start);
    source.stop(start + 0.06);
  }

  function riser(audio, out, noise, start, length) {
    const source = audio.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const filter = audio.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 3;
    filter.frequency.setValueAtTime(300, start);
    filter.frequency.exponentialRampToValueAtTime(7000, start + length);
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(0.35, start + length - 0.05);
    gain.gain.linearRampToValueAtTime(0, start + length);
    source.connect(filter).connect(gain).connect(out);
    source.start(start);
    source.stop(start + length);

    const tone = audio.createOscillator();
    tone.type = 'sawtooth';
    tone.frequency.setValueAtTime(110, start);
    tone.frequency.exponentialRampToValueAtTime(880, start + length);
    const toneGain = audio.createGain();
    toneGain.gain.setValueAtTime(0.001, start);
    toneGain.gain.exponentialRampToValueAtTime(0.06, start + length - 0.05);
    toneGain.gain.linearRampToValueAtTime(0, start + length);
    tone.connect(toneGain).connect(out);
    tone.start(start);
    tone.stop(start + length);
  }

  function boom(audio, out, noise, start) {
    const sub = audio.createOscillator();
    const subGain = audio.createGain();
    sub.frequency.setValueAtTime(65, start);
    sub.frequency.exponentialRampToValueAtTime(30, start + 2.5);
    subGain.gain.setValueAtTime(1, start);
    subGain.gain.exponentialRampToValueAtTime(0.001, start + 3);
    sub.connect(subGain).connect(out);
    sub.start(start);
    sub.stop(start + 3.1);

    const crash = audio.createBufferSource();
    crash.buffer = noise;
    const crashFilter = audio.createBiquadFilter();
    crashFilter.type = 'lowpass';
    crashFilter.frequency.setValueAtTime(5000, start);
    crashFilter.frequency.exponentialRampToValueAtTime(400, start + 1.5);
    const crashGain = audio.createGain();
    crashGain.gain.setValueAtTime(0.4, start);
    crashGain.gain.exponentialRampToValueAtTime(0.001, start + 1.8);
    crash.connect(crashFilter).connect(crashGain).connect(out);
    crash.start(start);
    crash.stop(start + 1.9);

    // A wide A minor stab ringing over the badge.
    const stabGain = audio.createGain();
    stabGain.gain.setValueAtTime(0.12, start);
    stabGain.gain.exponentialRampToValueAtTime(0.001, start + 4);
    stabGain.connect(out);
    for (const f of [55, 110, 164.81, 220, 261.63, 329.63]) {
      const osc = audio.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      osc.connect(stabGain);
      osc.start(start);
      osc.stop(start + 4.1);
    }
  }

  function glitch(audio, out, start) {
    const pitches = [1760, 440, 2637, 330, 1318, 587];
    pitches.forEach((f, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'square';
      osc.frequency.value = f;
      const t = start + i * 0.04;
      gain.gain.setValueAtTime(0.07, t);
      gain.gain.setValueAtTime(0, t + 0.03);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + 0.035);
    });
  }

  function ping(audio, out, start) {
    for (const [f, level] of [[880, 0.08], [1320, 0.03]]) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = f;
      gain.gain.setValueAtTime(level, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 1.2);
      osc.connect(gain).connect(out);
      osc.start(start);
      osc.stop(start + 1.25);
    }
  }

  function noiseBuffer(audio) {
    const buffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
    const samples = buffer.getChannelData(0);
    let seed = 7; // fixed seed: the same noise on every recording
    for (let i = 0; i < samples.length; i++) {
      seed = (seed * 16807) % 2147483647;
      samples[i] = (seed / 2147483647) * 2 - 1;
    }
    return buffer;
  }
})();
