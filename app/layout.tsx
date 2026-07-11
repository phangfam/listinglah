import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ListingLah — AI Property Listing Copy for Malaysian Agents",
  description:
    "Generate compelling property listing copy in English, Bahasa Malaysia and Simplified Chinese in seconds. Built for Malaysian real estate agents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50" suppressHydrationWarning>{children}</body>
    </html>
  );
}
