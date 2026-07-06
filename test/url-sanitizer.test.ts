import { describe, it, expect, vi } from "vitest"
import { UrlSanitizer } from "../src/utils/url-sanitizer.js"

// Mock fetch globally
global.fetch = vi.fn()

describe("UrlSanitizer", () => {
	describe("sanitize()", () => {
		it("should generic clean URLs correctly", () => {
			expect(UrlSanitizer.sanitize("http://www.Example.com/test/?utm_source=twitter")).toBe("https://example.com/test")
			expect(UrlSanitizer.sanitize("https://mygame.com/")).toBe("https://mygame.com")
			expect(UrlSanitizer.sanitize("mygame.com/test#hash")).toBe("https://mygame.com/test")
			expect(UrlSanitizer.sanitize("https://itch.io/game?id=123&ref=home", "itchio")).toBe(
				"https://itch.io/game?id=123",
			)
		})

		it("should strictly parse priority platforms", () => {
			expect(UrlSanitizer.sanitize("https://store.steampowered.com/app/105600/Terraria/", "steam")).toBe(
				"https://s.team/a/105600",
			)
			expect(UrlSanitizer.sanitize("https://apps.apple.com/us/app/angry-birds/id123456", "appStore")).toBe(
				"https://apps.apple.com/app/id123456",
			)
			expect(
				UrlSanitizer.sanitize("https://play.google.com/store/apps/details?id=com.game.test&hl=en", "playStore"),
			).toBe("https://play.google.com/store/apps/details?id=com.game.test")
			expect(UrlSanitizer.sanitize("https://www.meta.com/experiences/123456/", "questStore")).toBe(
				"https://www.meta.com/experiences/123456",
			)
			expect(UrlSanitizer.sanitize("https://www.amazon.com/dp/B08V5QG5P1/", "amazon")).toBe(
				"https://www.amazon.com/dp/B08V5QG5P1",
			)
		})

		it("should fall back to generic if strict parsing fails", () => {
			expect(UrlSanitizer.sanitize("https://store.steampowered.com/curator/123/", "steam")).toBe(
				"https://store.steampowered.com/curator/123",
			)
		})
	})

	describe("validateExists()", () => {
		it("should validate Steam API correctly", async () => {
			vi.mocked(fetch).mockResolvedValueOnce({
				json: async () => ({ "123": { success: true } }),
			} as Response)

			const exists = await UrlSanitizer.validateExists("https://s.team/a/123", "steam")
			expect(exists).toBe(true)
			expect(fetch).toHaveBeenCalledWith("https://store.steampowered.com/api/appdetails?appids=123")
		})

		it("should invalidate Steam API correctly", async () => {
			vi.mocked(fetch).mockResolvedValueOnce({
				json: async () => ({ "123": { success: false } }),
			} as Response)

			const exists = await UrlSanitizer.validateExists("https://s.team/a/123", "steam")
			expect(exists).toBe(false)
		})

		it("should pass generic URL on 200", async () => {
			vi.mocked(fetch).mockResolvedValueOnce({ status: 200 } as Response)
			const exists = await UrlSanitizer.validateExists("https://example.com")
			expect(exists).toBe(true)
		})

		it("should pass generic URL on 403 (bot block)", async () => {
			vi.mocked(fetch).mockResolvedValueOnce({ status: 403 } as Response)
			const exists = await UrlSanitizer.validateExists("https://example.com")
			expect(exists).toBe(true)
		})

		it("should fail generic URL on 404", async () => {
			vi.mocked(fetch).mockResolvedValueOnce({ status: 404 } as Response)
			const exists = await UrlSanitizer.validateExists("https://example.com")
			expect(exists).toBe(false)
		})

		it("should fail generic URL on 400", async () => {
			vi.mocked(fetch).mockResolvedValueOnce({ status: 400 } as Response)
			const exists = await UrlSanitizer.validateExists("https://example.com")
			expect(exists).toBe(false)
		})

		it("should fail generic URL on network error", async () => {
			vi.mocked(fetch).mockRejectedValueOnce(new Error("Network Error"))
			const exists = await UrlSanitizer.validateExists("https://example.com")
			expect(exists).toBe(false)
		})
	})
})
