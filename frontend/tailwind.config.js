/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Wirely iPad cool mist & porcelain palette (Image 2 & 4)
        app: "#eef2f6", // Cool mist slate canvas
        app2: "#ffffff", // Pure white for cards and panels
        panel: "#ffffff", // Card white surface
        elevated: "#e2e8f0", // Soft interactive fill
        line: "#dbe3eb", // Subtle slate border line
        "line-strong": "#cbd5e1", // Active borders
        ink: "#1e293b", // Slate black primary text
        muted: "#64748b", // Secondary slate text
        dim: "#94a3b8", // Captions & subtle labels
        // Wirely accent colors
        teal: "#2a7de1", // Primary Wirely blue
        cyan: "#38bdf8", // Clean sky blue
        healthy: "#10b981", // Crisp emerald green
        warning: "#f59e0b", // Warm amber
        critical: "#ef4444", // Clean signal red
        navy: "#3a4d62", // Wirely contrast card slate navy
      },
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          "Inter",
          "Segoe UI Variable Text",
          "Segoe UI",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "Cascadia Mono",
          "ui-monospace",
          "monospace",
        ],
      },
      borderRadius: {
        none: "0px",
        sm: "8px",
        DEFAULT: "12px",
        md: "14px",
        lg: "18px",
        xl: "22px",
        "2xl": "28px",
        "3xl": "36px",
        full: "9999px",
      },
      boxShadow: {
        card: "0 10px 30px -5px rgba(38, 61, 87, 0.05), 0 4px 12px -2px rgba(38, 61, 87, 0.03)",
        float: "0 20px 45px -10px rgba(38, 61, 87, 0.08)",
        panel: "0 1px 3px 0 rgba(38, 61, 87, 0.04)",
        none: "none",
      },
      letterSpacing: {
        tighter: "-0.03em",
        tight: "-0.015em",
        normal: "0em",
        wide: "0.015em",
      },
    },
  },
  plugins: [],
};
