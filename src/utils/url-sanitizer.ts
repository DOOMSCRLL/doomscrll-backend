export class UrlSanitizer {
	static readonly ALLOWED_QUERIES = new Set(["id", "page", "v"])

	static readonly PLATFORM_PARSERS: Record<string, (url: URL) => string | null> = {
		steam: (url) => {
			const match = url.pathname.match(/\/app\/(\d+)/)
			if (match) return `https://s.team/a/${match[1]}`
			return null
		},
		playStore: (url) => {
			const id = url.searchParams.get("id")
			if (id) return `https://play.google.com/store/apps/details?id=${id}`
			return null
		},
		appStore: (url) => {
			const match = url.pathname.match(/\/id(\d+)/)
			if (match) return `https://apps.apple.com/app/id${match[1]}`
			return null
		},
		questStore: (url) => {
			const match = url.pathname.match(/\/experiences\/(?:quest\/)?(\d+)/)
			if (match) return `https://www.meta.com/experiences/${match[1]}`
			return null
		},
		amazon: (url) => {
			const match = url.pathname.match(/\/(?:dp|product)\/([A-Z0-9]{10})/i)
			if (match) return `https://www.amazon.com/dp/${match[1].toUpperCase()}`
			return null
		},
	}

	static sanitize(rawUrl: string, platform?: string): string {
		try {
			let urlString = rawUrl.trim()
			if (!urlString.startsWith("http://") && !urlString.startsWith("https://")) {
				urlString = "https://" + urlString
			}

			const url = new URL(urlString)
			if (platform && this.PLATFORM_PARSERS[platform]) {
				const strictUrl = this.PLATFORM_PARSERS[platform](url)
				if (strictUrl) return strictUrl
			}

			return this.commonSanitize(url)
		} catch (_error) {
			return rawUrl.trim()
		}
	}

	private static commonSanitize(url: URL): string {
		let host = url.host.toLowerCase()
		if (host.startsWith("www.")) host = host.slice(4)

		let pathname = url.pathname
		if (pathname === "/") pathname = ""
		else if (pathname.endsWith("/") && pathname.length > 1) pathname = pathname.slice(0, -1)

		url.hash = ""

		const keysToDelete: string[] = []
		url.searchParams.forEach((value, key) => {
			if (!this.ALLOWED_QUERIES.has(key.toLowerCase())) keysToDelete.push(key)
		})
		keysToDelete.forEach((key) => url.searchParams.delete(key))

		const search = url.searchParams.toString() ? `?${url.searchParams.toString()}` : ""
		return `https://${host}${pathname}${search}`
	}

	static readonly PLATFORM_VALIDATORS: Record<string, (url: URL) => Promise<boolean>> = {
		steam: async (url) => {
			// Expected canonical format: https://s.team/a/{appid}
			const appId = url.pathname.split("/").pop()
			if (!appId) return false

			try {
				const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}`)
				const data = await res.json()
				return data[appId]?.success === true
			} catch (error) {
				return true // Benefit of the doubt on network failure
			}
		},
		appStore: async (url) => {
			// Expected canonical format: https://apps.apple.com/app/id{id}
			const id = url.pathname.match(/\/id(\d+)/)?.[1]
			if (!id) return false

			try {
				const res = await fetch(`https://itunes.apple.com/lookup?id=${id}`)
				const data = await res.json()
				return data.resultCount > 0
			} catch (error) {
				return true
			}
		},
	}

	static async validateExists(canonicalUrl: string, platform?: string): Promise<boolean> {
		try {
			const url = new URL(canonicalUrl)

			if (platform && this.PLATFORM_VALIDATORS[platform]) {
				return await this.PLATFORM_VALIDATORS[platform](url)
			}

			const res = await fetch(canonicalUrl, {
				method: "GET", // Many stores block HEAD requests
				redirect: "manual", // Catch redirects instead of blindly following them
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
					Accept: "text/html,application/xhtml+xml",
				},
			})

			// Explicit 404 or 400 means the store confirmed the product does not exist
			if (res.status === 404 || res.status === 400) {
				return false
			}

			// Everything else (200, 301, 302, 403, 503) is considered a pass
			// because it implies the server exists but might be protecting itself from scrapers
			return true
		} catch (_error) {
			// Network failure (e.g., DNS error, invalid host) means the URL is fully broken
			return false
		}
	}
}
