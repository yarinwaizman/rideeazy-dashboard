import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Production build is served at https://<user>.github.io/rideeazy-dashboard/,
// so only the build needs the base path — dev should stay at "/".
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/rideeazy-dashboard/" : "/",
}));
