import dts from "vite-plugin-dts";
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: {
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, "src/main.ts"),
      name: "Safejs",
      // the proper extensions will be added
      fileName: "safejs",
    },
    rollupOptions: {
      // External deps to the project.
      external: [],
      output: {},
    },
  },
});
