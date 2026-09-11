import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="pt-BR"><body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#f5f7fb", color: "#111827" }}>{children}</body></html>;
}
