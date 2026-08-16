import { Bricolage_Grotesque, Outfit } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-body",
  subsets: ["latin"],
});

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata = {
  title: "Voicer Choicer — dub the scene",
  description: "Voice over viral scenes. Keep the music. Share the take. Party with friends.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} ${display.variable} h-full`}>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-body)]">
        <Nav />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
