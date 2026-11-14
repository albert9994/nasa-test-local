import type { Metadata } from "next";
import { AppShell } from "./shell";

export const metadata: Metadata = { title: "App" };

export default function AppPage() {
  return <AppShell />;
}
