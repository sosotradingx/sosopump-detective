/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        heading: ['var(--font-heading)'],
        mono: ['var(--font-mono)'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        pump: {
          strong: "#4CAF50",
          active: "#FF9800",
          weak: "#FFEB3B",
          early: "#2196F3",
          inactive: "#808080",
        },
        chart: {
          green: "#26A69A",
          red: "#EF5350",
          blue: "#2196F3",
          purple: "#9C27B0",
          gold: "#FFD700",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  safelist: [
    "text-pump-strong", "text-pump-active", "text-pump-weak", "text-pump-early", "text-pump-inactive",
    "bg-pump-strong", "bg-pump-active", "bg-pump-weak", "bg-pump-early", "bg-pump-inactive",
    "text-chart-green", "text-chart-red", "text-chart-blue", "text-chart-purple", "text-chart-gold",
    "bg-chart-green", "bg-chart-red", "bg-chart-blue", "bg-chart-purple",
  ],
  plugins: [require("tailwindcss-animate")],
};