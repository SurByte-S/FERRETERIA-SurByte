import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "@/components/pwa/register-service-worker";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Ferretería Güemes",
  title: {
    default: "Ferretería Güemes",
    template: "%s | Ferretería Güemes",
  },
  description: "Sistema de gestión para ferretería",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Ferretería Güemes",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#005a9c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="density-compact min-h-full flex flex-col">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
