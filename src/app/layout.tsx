import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ferreteria 10 Mil Productos",
  description: "Sistema simple para administrar ferreterias por sucursal.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="density-compact min-h-full flex flex-col">{children}</body>
    </html>
  );
}
