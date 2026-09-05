import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        status: {
          present: "#16a34a",
          absent: "#dc2626",
          late: "#d97706",
          review: "#ea580c",
          unrecorded: "#6b7280",
        },
      },
    },
  },
  plugins: [],
};

export default config;
