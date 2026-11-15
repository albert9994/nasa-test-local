import { Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "latin-ext"] });
/** Cinematic display face for the landing headlines (condensed, uppercase; covers ș/ț). */
const display = Barlow_Condensed({ variable: "--font-display-face", subsets: ["latin", "latin-ext"], weight: ["600", "700"] });
export const fontClasses = `${sans.variable} ${mono.variable} ${display.variable}`;
