/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      transitionDuration: { 400: "400ms" },
      colors: { ink: "rgb(var(--ink) / <alpha-value>)", paper: "rgb(var(--paper) / <alpha-value>)", night: "#0A0B11", cream: "rgb(var(--cream) / <alpha-value>)", imessage: "#0A84FF", bubble: "#E9E9EB" },
    },
  },
  plugins: [],
};
