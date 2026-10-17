import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { FounderProvider } from "./council/Founder";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FounderProvider>
      <App />
    </FounderProvider>
  </StrictMode>,
);
