export const VOICE_LINES = {
  missileLaunch: 'Missile launch',
  missile: 'Missile, missile',
  engine1Fire: 'Engine one fire',
  engine2Fire: 'Engine two fire',
  engineOut: 'Engine out',
  landNow: 'Land now',
  bingoFuel: 'Bingo fuel',
  altitude: 'Altitude, altitude',
} as const;

export type VoiceLine = keyof typeof VOICE_LINES;

export const VOICE_COOLDOWN = 5;

export interface VoiceBackend { speak(text: string): void }

interface SynthLike {
  speak(u: unknown): void;
  getVoices(): { lang: string; name: string }[];
}

export function speechBackend(win: unknown = typeof window !== 'undefined' ? window : undefined): VoiceBackend | null {
  const w = win as { speechSynthesis?: SynthLike; SpeechSynthesisUtterance?: new (text: string) => { lang: string; rate: number; voice: unknown } } | undefined;
  const synth = w?.speechSynthesis, Utter = w?.SpeechSynthesisUtterance;
  if (!synth || !Utter) return null;
  return {
    speak(text: string) {
      const u = new Utter(text);
      u.lang = 'en-US';
      u.rate = 1.1;
      const voices = synth.getVoices().filter(v => v.lang.startsWith('en'));
      u.voice = voices.find(v => /female|zira|samantha|susan|karen|victoria/i.test(v.name)) ?? voices[0] ?? null;
      synth.speak(u);
    },
  };
}

export class VoiceWarnings {
  enabled = true;
  private last = new Map<VoiceLine, number>();

  constructor(private backend: VoiceBackend | null, private beep: () => void, private now: () => number) {}

  say(line: VoiceLine) {
    if (!this.enabled) return false;
    const t = this.now();
    if (t - (this.last.get(line) ?? -Infinity) < VOICE_COOLDOWN) return false;
    this.last.set(line, t);
    if (this.backend) this.backend.speak(VOICE_LINES[line]);
    else this.beep();
    return true;
  }
}
