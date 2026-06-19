import { defineConfig } from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
		},
		include: ["test/**/*.test.ts"],
	},
	resolve: {
		alias: {
			"@": "/src",
		},
	},
})
