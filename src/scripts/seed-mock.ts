import "dotenv/config"
import { randomUUID } from "crypto"
import { db } from "../db/index.js"
import { profiles, otpCodes, sessions } from "../db/schemas/auth.js"
import { projectLedger, projects, receipts } from "../db/schemas/project.js"
import { DB_RULES } from "../config/index.js"

const COVER_IMAGES = [
	"https://images.unsplash.com/photo-1588815375466-e7d21013ddd3",
	"https://images.unsplash.com/photo-1638140481609-ec648a2edbea",
	"https://images.unsplash.com/photo-1599385549907-a8a47fb6e402",
	"https://images.unsplash.com/photo-1594476664296-8c552053aef3",
	"https://images.unsplash.com/photo-1602015103066-f45732e2aa84",
	"https://images.unsplash.com/photo-1604922824961-87cefb2e4b07",
	"https://images.unsplash.com/photo-1549021179-127b81585b60",
	"https://images.unsplash.com/photo-1751538337209-2a78381e00e0",
]

const SCREENSHOT_IMAGES = [
	"https://images.unsplash.com/photo-1512850183-6d7990f42385",
	"https://images.unsplash.com/photo-1526512340740-9217d0159da9",
	"https://images.unsplash.com/photo-1631217755100-9891edcea587",
	"https://images.unsplash.com/photo-1544376798-89aa6b82c6cd",
	"https://images.unsplash.com/photo-1580803098287-984ba5d159de",
	"https://images.unsplash.com/photo-1564754943164-e83c08469116",
	"https://plus.unsplash.com/premium_photo-1669741909456-61b8b9b3f329",
	"https://images.unsplash.com/photo-1505521377774-103a8cc2f735",
	"https://plus.unsplash.com/premium_photo-1719896332851-2e14f690281b",
	"https://images.unsplash.com/photo-1608788985372-cc240a27e269",
	"https://images.unsplash.com/photo-1579099816874-e02eaf257e2a",
]

const CATEGORY_DATA = {
	"Video Games": {
		platforms: ["Steam", "itch.io", "Epic Games Store", "GOG", "PlayStation", "Xbox", "Nintendo Switch"],
		tags: [
			"#action",
			"#adventure",
			"#rpg",
			"#indie",
			"#strategy",
			"#simulation",
			"#puzzle",
			"#roguelike",
			"#metroidvania",
			"#deckbuilder",
			"#cozy",
			"#pixel-art",
			"#sci-fi",
			"#cyberpunk",
			"#fantasy",
		],
		features: [
			"Early Access",
			"Free to Play",
			"Demo Available",
			"Singleplayer",
			"Multiplayer",
			"Online Co-op",
			"Full Controller Support",
			"Cloud Saves",
			"Achievements",
			"Playable in Browser",
		],
		titles: [
			"Hollow Knight",
			"Celeste",
			"Dead Cells",
			"Stardew Valley",
			"Slay the Spire",
			"Vampire Survivors",
			"Balatro",
			"Hades",
			"Risk of Rain 2",
			"Outer Wilds",
			"Terraria",
			"Factorio",
			"Inscryption",
			"Into the Breach",
			"Disco Elysium",
			"Tunic",
			"Baba Is You",
			"Pizza Tower",
			"Katana Zero",
			"Cuphead",
			"Dredge",
			"Dave the Diver",
			"Cocoon",
			"Return of the Obra Dinn",
			"Frostpunk",
		],
	},
	Tabletop: {
		platforms: ["DriveThruRPG", "The Game Crafter", "Amazon"],
		tags: ["#strategy", "#co-op", "#fantasy", "#adventure", "#party", "#social-deduction", "#mythology", "#medieval"],
		features: [
			"Print and Play",
			"Digital PDF",
			"Print on Demand",
			"VTT Integrated",
			"Core Rulebook",
			"Adventure Module",
			"Maps Included",
			"Solo Playable",
			"Cooperative",
		],
		titles: [
			"Gloomhaven",
			"Root",
			"Wingspan",
			"Scythe",
			"Everdell",
			"Arkham Horror",
			"Betrayal at House on the Hill",
			"King of Tokyo",
			"Catan",
			"Codenames",
		],
	},
	"Software & Tools": {
		platforms: ["GitHub", "GitLab", "Product Hunt", "F-Droid"],
		tags: ["#tool", "#open-source", "#automation", "#sandbox", "#building", "#sci-fi"],
		features: [
			"Windows Compatible",
			"Mac Compatible",
			"Linux Compatible",
			"Browser Based",
			"Open Source",
			"API Access",
			"Plugin Architecture",
			"Cloud Sync",
			"Offline Use",
		],
		titles: [
			"Aseprite",
			"Godot Engine",
			"Blender",
			"Figma",
			"Obsidian",
			"Raycast",
			"Ghostty",
			"Zed Editor",
			"Krita",
			"Tiled",
		],
	},
	"Digital Assets": {
		platforms: ["Fab", "Gumroad", "ArtStation", "Unity Asset Store", "Figma Community", "Sketchfab", "Itchio"],
		tags: ["#pixel-art", "#cozy", "#sci-fi", "#cyberpunk", "#fantasy", "#building", "#space"],
		features: [
			"Commercial Use Allowed",
			"Royalty Free",
			"CC0 / Public Domain",
			"Source Files Included",
			"Game Engine Ready",
			"Seamless Textures",
			"Animated",
			"Low Poly",
			"Modular",
		],
		titles: [
			"Universal Fantasy UI",
			"Polygon Dungeon Pack",
			"Pixel Heroes Sprite Pack",
			"Low Poly Sci-Fi Environment",
			"Retro Sound Effects Pack",
			"Hand Painted Cartoon Texture Pack",
			"Modular RPG Audio Bundle",
		],
	},
	Publishing: {
		platforms: ["Apple Books", "Google Play Books", "Audible", "Amazon"],
		tags: ["#story-rich", "#interactive-fiction", "#fantasy", "#sci-fi", "#mystery", "#detective", "#historical"],
		features: [
			"PDF Included",
			"EPUB Included",
			"MOBI Included",
			"Interactive Elements",
			"Audiobook Version Included",
			"Print on Demand",
			"Full Color",
			"Illustrated",
		],
		titles: [
			"The Indie Game Developer Handbook",
			"Worldbuilding for Fantasy Realms",
			"Art of Modern Pixel Animation",
			"Interactive Fiction & Narrative Design",
			"Tabletop Rulebook Design Guide",
			"Digital Sound Design Mastery",
		],
	},
} as const

type ActiveCategory = keyof typeof CATEGORY_DATA
const ACTIVE_CATEGORIES: ActiveCategory[] = [
	"Video Games",
	"Tabletop",
	"Software & Tools",
	"Digital Assets",
	"Publishing",
]

const DESCRIPTIONS = [
	"Experience a groundbreaking journey filled with dynamic challenges, rich storytelling, and engaging mechanics tailored for enthusiasts and newcomers alike.",
	"An innovative project crafted with meticulous attention to detail and creative depth, exploring unique themes through intuitive interfaces and responsive design.",
	"Discover a vibrant world brimming with interactive possibilities, intricate puzzles, and compelling aesthetics that reward curiosity and strategic exploration.",
	"Designed from the ground up to offer a refined experience, combining modern aesthetics with robust performance and versatile community features.",
	"A captivating exploration of form and function, delivering polished visuals, immersive audio design, and hours of engaging entertainment.",
]

function sample<T>(array: readonly T[]): T {
	return array[Math.floor(Math.random() * array.length)]
}

function sampleMany<T>(array: readonly T[], count: number): T[] {
	const copy = [...array]
	const result: T[] = []
	for (let i = 0; i < Math.min(count, array.length); i++) {
		const idx = Math.floor(Math.random() * copy.length)
		result.push(copy[idx])
		copy.splice(idx, 1)
	}
	return result
}

function generateRefId() {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	let result = DB_RULES.prefixProjectRefId
	for (let i = 0; i < DB_RULES.lengthProjectRefId; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length))
	}
	return result
}

async function seedMock() {
	console.log("🗑️ Cleaning existing test database...")
	await db.delete(receipts)
	await db.delete(projects)
	await db.delete(projectLedger)
	await db.delete(sessions)
	await db.delete(otpCodes)
	await db.delete(profiles)

	console.log("🌱 Generating mock user accounts...")
	const numUsers = Math.floor(Math.random() * 3) + 4
	const firstWords = [
		"Aether",
		"Chronos",
		"Nebula",
		"Valkyrie",
		"Hyperion",
		"Solstice",
		"Obsidian",
		"Echo",
		"Zenith",
		"Arcana",
	]
	const secondWords = [
		"Studios",
		"Labs",
		"Interactive",
		"Collective",
		"Creations",
		"Forge",
		"Works",
		"Media",
		"Games",
		"Foundry",
	]

	const mockProfiles = []
	for (let i = 0; i < numUsers; i++) {
		const name = `${sample(firstWords)} ${sample(secondWords)}`
		const slug = name.toLowerCase().replace(/\s+/g, "-") + "-" + Math.random().toString(36).substring(2, 6)
		mockProfiles.push({
			id: randomUUID(),
			email: `contact@${slug}.example.com`,
			username: slug,
			description: "Independent creator crafting immersive digital experiences and interactive narratives.",
			url: `https://${slug}.example.com`,
		})
	}
	await db.insert(profiles).values(mockProfiles)
	console.log(`✅ Inserted ${mockProfiles.length} creator profiles.`)

	const now = new Date()
	const tomorrow = new Date(now)
	tomorrow.setDate(tomorrow.getDate() + 1)
	const targetDates = [now, tomorrow]

	const totalLedgers = []
	const totalProjects = []
	let urlCounter = 1

	for (const date of targetDates) {
		const year = date.getFullYear()
		const month = String(date.getMonth() + 1).padStart(2, "0")
		const day = String(date.getDate()).padStart(2, "0")
		const showcaseDateStr = `${year}-${month}-${day}`

		console.log(`🌱 Generating ${DB_RULES.limitDailySlots} projects for ${showcaseDateStr}...`)

		const numCategories = Math.floor(Math.random() * 3) + 2
		const selectedCategories = sampleMany(ACTIVE_CATEGORIES, numCategories)

		const distribution: number[] = []
		let remaining = DB_RULES.limitDailySlots
		const ratios = numCategories === 2 ? [0.6, 0.4] : numCategories === 3 ? [0.5, 0.3, 0.2] : [0.45, 0.25, 0.15, 0.15]

		for (let i = 0; i < selectedCategories.length; i++) {
			if (i === selectedCategories.length - 1) {
				distribution.push(remaining)
			} else {
				const count = Math.round(DB_RULES.limitDailySlots * ratios[i])
				distribution.push(count)
				remaining -= count
			}
		}

		for (let c = 0; c < selectedCategories.length; c++) {
			const category = selectedCategories[c]
			const count = distribution[c]
			const data = CATEGORY_DATA[category]

			for (let i = 0; i < count; i++) {
				const profile = sample(mockProfiles)
				const ledgerId = randomUUID()
				const projectId = randomUUID()

				const rawTitle = sample(data.titles)
				const name = count > data.titles.length && i >= data.titles.length ? `${rawTitle} ${i + 1}` : rawTitle
				const slug = name
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, "-")
					.replace(/^-|-$/g, "")
				const primaryUrl = `https://${slug}-${urlCounter++}.example.com`

				const numTags = Math.floor(Math.random() * 5) + 1
				const numFeatures = Math.floor(Math.random() * 8) + 1
				const numScreenshots = Math.floor(Math.random() * 7) + 2

				totalLedgers.push({
					id: ledgerId,
					profileId: profile.id,
					primaryUrl,
					lastShowcaseDate: showcaseDateStr,
				})

				totalProjects.push({
					id: projectId,
					referenceId: generateRefId(),
					ledgerId,
					showcaseDate: showcaseDateStr,
					status: "ready" as const,
					name,
					category,
					primaryPlatform: sample(data.platforms),
					primaryUrl,
					description: sample(DESCRIPTIONS),
					tags: sampleMany(data.tags, numTags),
					features: sampleMany(data.features, numFeatures),
					coverImagePath: sample(COVER_IMAGES),
					screenshotPaths: sampleMany(SCREENSHOT_IMAGES, numScreenshots),
				})
			}
		}
	}

	await db.insert(projectLedger).values(totalLedgers)
	await db.insert(projects).values(totalProjects)
	console.log(`✅ Successfully seeded ${totalProjects.length} projects across ${targetDates.length} days.`)

	process.exit(0)
}

seedMock().catch((e) => {
	console.error("❌ Error during seeding:", e)
	process.exit(1)
})
