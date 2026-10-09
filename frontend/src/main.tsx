import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { Providers } from "@/app/providers";
import AppRoutes from "./routes";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <AppRoutes />
    </Providers>
  </StrictMode>,
);
