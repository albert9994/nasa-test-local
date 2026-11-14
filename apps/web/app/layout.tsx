import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const serif = Instrument_Serif({
  variable: "--font-instrument-serif", subsets: ["latin", "latin-ext"], weight: "400", style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: { default: "FieldShift: how much climate can your farm take?", template: "%s · FieldShift" },
  description:
    "FieldShift turns 25 years of NASA satellite and weather data into one number for every farm: the Adaptation Margin, how much hotter and drier it can get before your rotation fails. Then it finds rotations that hold.",
  icons: { icon: "/brand/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0c09" },
    { media: "(prefers-color-scheme: light)", color: "#f4efe4" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
