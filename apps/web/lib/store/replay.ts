"use client";
// Replay state (O4): which year, where the shared calendar cursor is, and play/speed.
// `day` is an integer offset from Oct 1 of the previous year (see components/replay/calendar.ts).
import { create } from "zustand";

export type Speed = 1 | 2 | 4;

interface ReplayState {
  /** null = follow base.worstYear */
  year: number | null;
  farmKey: string | null;
  day: number;
  playing: boolean;
  speed: Speed;
  setYear(y: number | null): void;
  setDay(d: number): void;
  play(): void;
  pause(): void;
  setSpeed(s: Speed): void;
  restart(): void;
  /** called when the farm changes */
  resetFor(farmKey: string | null): void;
}

export const useReplay = create<ReplayState>((set, get) => ({
  year: null,
  farmKey: null,
  day: 0,
  playing: false,
  speed: 1,
  setYear(year) { set({ year, day: 0, playing: false }); },
  setDay(day) { set({ day }); },
  play() { set({ playing: true }); },
  pause() { set({ playing: false }); },
  setSpeed(speed) { set({ speed }); },
  restart() { set({ day: 0, playing: true }); },
  resetFor(farmKey) {
    if (get().farmKey === farmKey) return;
    set({ farmKey, year: null, day: 0, playing: false });
  },
}));
