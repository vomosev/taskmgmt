import "./globals.css";

import { AuthProvider } from "../contexts/AuthContext";

export const metadata = {
  title: {
    default: "Taskmgmt",
    template: "%s | Taskmgmt",
  },
  description:
    "Plan, organize, and track your work with a secure drag-and-drop task management dashboard.",
  applicationName: "Taskmgmt",
  keywords: ["task management", "kanban", "productivity", "dashboard"],
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}