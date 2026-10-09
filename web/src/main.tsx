import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./Shell";
import "./index.css";
import "./redesign.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

