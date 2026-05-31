import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poster Video Generator",
  description:
    "Turn job recruitment posters into animated videos with section reveal and scatter effect",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
