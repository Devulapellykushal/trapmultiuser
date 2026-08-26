import { QueryProvider } from "@/lib/api";
import { AuthBootstrap } from "@/components/auth";
import "@/styles/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quake Inventory",
  description:
    "Premium inventory, godown, POS, and reporting for retail and wholesale.",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/assets/2d/Quake_Logo.png", type: "image/png", sizes: "any" },
    ],
    shortcut: "/favicon.png",
    apple: [{ url: "/assets/2d/Quake_Logo.png", type: "image/png" }],
  },
};

const themeScript = `
  (function() {
    try {
      const stored = localStorage.getItem('Quake-theme');
      let theme = 'dark';
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.state && parsed.state.theme) {
            theme = parsed.state.theme;
          }
        } catch (e) {
          if (stored === 'light') theme = 'light';
        }
      }
      document.documentElement.setAttribute('data-theme', theme);
    } catch (e) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-bg-primary text-text-primary antialiased font-sans">
        <QueryProvider>
          <AuthBootstrap />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
