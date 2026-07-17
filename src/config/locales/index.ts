import en from "./en.js"
import tr from "./tr.js"

export type Dictionary = typeof en

export function getDictionaryFor(locale?: "en" | "tr") {
	if (locale === "tr") return tr
	else return en
}
