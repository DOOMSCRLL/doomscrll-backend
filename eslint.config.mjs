// @ts-check

import js from "@eslint/js"
import prettierConfig from "eslint-config-prettier"
import { defineConfig } from "eslint/config"
import ts from "typescript-eslint"

export default defineConfig(
	js.configs.recommended,
	ts.configs.strict,
	ts.configs.stylistic,
	{
		rules: {
			"no-undef": "off",
			"@typescript-eslint/no-unused-vars": "warn",
			"@typescript-eslint/no-require-imports": "warn",
			"@typescript-eslint/consistent-type-definitions": "warn",
		},
	},
	prettierConfig,
)
