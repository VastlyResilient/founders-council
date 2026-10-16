/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      transitionDuration: { 400: "400ms" },
      colors: { ink: "#18161B", night: "#0A0B11", cream: "#F4F0ED", imessage: "#0A84FF", bubble: "#E9E9EB" },
    },
  },
  plugins: [],
};
