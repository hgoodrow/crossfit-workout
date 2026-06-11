import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base must match your repo name for GitHub Pages: https://<user>.github.io/<repo>/
// If you name the repo "crossfit-workout", leave this as-is. Otherwise change "/crossfit-workout/".
export default defineConfig({
  base: "/crossfit-workout/",
  plugins: [react()],
});
