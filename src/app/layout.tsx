import type { Metadata } from "next";
import { Inter } from "next/font/google"; // Using Inter as Geist is specified as variable, but not applied globally
import "./globals.css";
import { Toaster } from "@/components/ui/toaster"; // Import Toaster

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SeedPhrase Auditor",
  description: "Audit balances for multiple seed phrases (Simulation)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        {children}
        <Toaster /> {/* Add Toaster component here */}
      </body>
    </html>
  );
}
