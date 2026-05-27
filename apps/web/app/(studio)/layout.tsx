import { StudioLandingShell } from "@/components/studio/studio-landing-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Studio — 3D product experience",
  description:
    "Design and preview your product in the browser. Explore the 3D configurator and bottle mockup tools.",
};

export default function StudioLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <StudioLandingShell />
      {children}
    </>
  );
}
