import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#4C6ED7",
          secondary: "#8C52FF",
          accent: "#FF6B6B"
        },
        sidebar: {
          bg: "#ffffff",
          icon: "#0f172a"
        }
      },
      boxShadow: {
        glass: "0 20px 45px rgba(15, 23, 42, 0.12)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.6)"
      },
      borderRadius: {
        xl: "1rem"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Helvetica", "Arial", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
