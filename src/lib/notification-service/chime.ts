/**
 * The two-tone chime a notification plays.
 *
 * Split out of `service.ts` when that file crossed the 250-line ceiling by two
 * lines. An exact piecewise move; the only change from its previous life is that
 * Safari's prefixed constructor is named rather than reached through `any`.
 */
export function playNotificationChime(): void {
  try {
    // Safari's prefixed constructor, named rather than cast through `any`.
    const withWebkit: Window & { webkitAudioContext?: typeof AudioContext } =
      window as Window & { webkitAudioContext?: typeof AudioContext };
    const ctx: AudioContext = new (window.AudioContext || withWebkit.webkitAudioContext!)();
    const oscillator: OscillatorNode = ctx.createOscillator();
    const gain: GainNode = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch {
    // Audio not available
  }
}
