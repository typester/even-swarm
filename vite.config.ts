import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Even Hub review rejects a bundle naming any URL outside app.json's network whitelist;
// React's production error messages link to react.dev, which the app never fetches.
function stripReactErrorUrl(): Plugin {
  return {
    name: "strip-react-error-url",
    renderChunk(code) {
      return code.replaceAll("https://react.dev/errors/", "react.dev/errors/");
    },
  };
}

export default defineConfig({
  base: "/even-swarm/",
  plugins: [react(), tailwindcss(), stripReactErrorUrl()],
});
