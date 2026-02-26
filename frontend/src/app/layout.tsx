import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/lib/providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GraveShift | Resurrect Your Dead Ethereum Assets",
  description: "Cross-chain revival of dead Ethereum assets into Solana afterlife.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>)
{
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.className} bg-zinc-950 text-slate-100 antialiased min-h-screen selection:bg-purple-900`}
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
