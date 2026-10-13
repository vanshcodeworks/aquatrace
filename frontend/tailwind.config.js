/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Neutral instrument-panel palette. Cool, desaturated, low-chroma so
        // data and alerts are the only things that carry colour.
        app: "#0c0e11",
        app2: "#0f1215",
        panel: "#14171b",
        elevated: "#1b1f24",
        line: "#262b31",
        "line-strong": "#333a42",
        ink: "#d6dae0",
        muted: "#868f99",
        dim: "#5f6873",
        // Single muted accent, plus semantic signal colours.
        teal: "#5b8fb9",
        cyan: "#6f9dc0",
        healthy: "#5b9e77",
        warning: "#c39a4a",
        critical: "#c35d5d",
      },
      fontFamily: {
        sans: [
          "Segoe UI Variable Text",
          "Segoe UI",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "Cascadia Mono",
          "Cascadia Code",
          "Consolas",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      // Tight radii. Controls and panels read as flat surfaces, not "cards".
      borderRadius: {
        none: "0px",
        sm: "2px",
        DEFAULT: "3px",
        md: "3px",
        lg: "4px",
        xl: "4px",
        "2xl": "4px",
        "3xl": "4px",
        full: "9999px",
      },
      // No drop shadows on panels. Overlays may use a hairline instead.
      boxShadow: {
        panel: "none",
        none: "none",
      },
      letterSpacing: {
        tighter: "-0.02em",
        tight: "-0.01em",
        normal: "0em",
        wide: "0.01em",
        wider: "0.02em",
        widest: "0.03em",
      },
    },
  },
  plugins: [],
};
