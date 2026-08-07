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

interface PlatformDefinition {
	platform: string
	getUrl: (slug: string, id: number) => string
}

const CATEGORY_DATA: Record<
	string,
	{
		platforms: PlatformDefinition[]
		tags: string[]
		features: string[]
		titles: string[]
	}
> = {
	"Video Games": {
		platforms: [
			{ platform: "steam", getUrl: (_slug, id) => `https://store.steampowered.com/app/${100000 + id}` },
			{ platform: "itchio", getUrl: (slug, id) => `https://${slug}-${id}.itch.io/game` },
			{ platform: "gog", getUrl: (slug, id) => `https://www.gog.com/en/game/${slug}-${id}` },
			{ platform: "epicGames", getUrl: (slug, id) => `https://store.epicgames.com/p/${slug}-${id}` },
			{ platform: "playstation", getUrl: (slug, id) => `https://store.playstation.com/concept/${slug}-${id}` },
			{ platform: "xbox", getUrl: (slug, id) => `https://www.xbox.com/games/store/${slug}/${id}` },
			{ platform: "switch", getUrl: (slug, id) => `https://www.nintendo.com/us/store/products/${slug}-${id}-switch` },
		],
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
		platforms: [
			{ platform: "driveThru", getUrl: (_slug, id) => `https://www.drivethrurpg.com/product/${200000 + id}` },
			{ platform: "gameCrafter", getUrl: (slug, id) => `https://www.thegamecrafter.com/games/${slug}-${id}` },
			{ platform: "amazon", getUrl: (_slug, id) => `https://www.amazon.com/dp/B0${id}00000` },
			{ platform: "itchio", getUrl: (slug, id) => `https://${slug}-${id}.itch.io/tabletop` },
		],
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
		platforms: [
			{ platform: "github", getUrl: (slug, id) => `https://github.com/doomscrll/${slug}-${id}` },
			{ platform: "gitlab", getUrl: (slug, id) => `https://gitlab.com/doomscrll/${slug}-${id}` },
			{ platform: "productHunt", getUrl: (slug, id) => `https://www.producthunt.com/posts/${slug}-${id}` },
			{ platform: "fdroid", getUrl: (slug, id) => `https://f-droid.org/packages/com.doomscrll.${slug}.${id}` },
			{ platform: "appStore", getUrl: (_slug, id) => `https://apps.apple.com/app/id${300000 + id}` },
			{
				platform: "playStore",
				getUrl: (slug, id) => `https://play.google.com/store/apps/details?id=com.doomscrll.${slug}.${id}`,
			},
		],
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
		platforms: [
			{ platform: "fab", getUrl: (slug, id) => `https://www.fab.com/listings/${slug}-${id}` },
			{ platform: "gumroad", getUrl: (slug, id) => `https://gumroad.com/l/${slug}-${id}` },
			{ platform: "artstation", getUrl: (slug, id) => `https://www.artstation.com/marketplace/p/${slug}-${id}` },
			{
				platform: "unityAssetStore",
				getUrl: (_slug, id) => `https://assetstore.unity.com/packages/slug-${400000 + id}`,
			},
			{ platform: "figma", getUrl: (slug, id) => `https://www.figma.com/community/file/${slug}-${id}` },
			{ platform: "sketchfab", getUrl: (slug, id) => `https://sketchfab.com/3d-models/${slug}-${id}` },
			{ platform: "itchio", getUrl: (slug, id) => `https://${slug}-${id}.itch.io/assets` },
		],
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
		platforms: [
			{ platform: "appleBooks", getUrl: (_slug, id) => `https://books.apple.com/us/book/id${500000 + id}` },
			{
				platform: "googlePlayBooks",
				getUrl: (_slug, id) => `https://play.google.com/store/books/details?id=book_${id}`,
			},
			{ platform: "audible", getUrl: (slug, id) => `https://www.audible.com/pd/${slug}-${id}-audiobook` },
			{ platform: "amazon", getUrl: (_slug, id) => `https://www.amazon.com/dp/B0${id}11111` },
		],
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
	Audio: {
		platforms: [
			{ platform: "bandcamp", getUrl: (slug, id) => `https://${slug}-${id}.bandcamp.com/album/soundtrack` },
			{ platform: "spotify", getUrl: (_slug, id) => `https://open.spotify.com/album/${id}abc` },
			{ platform: "soundcloud", getUrl: (slug, id) => `https://soundcloud.com/creators/${slug}-${id}` },
			{ platform: "appleMusic", getUrl: (_slug, id) => `https://music.apple.com/us/album/${id}` },
		],
		tags: ["#soundtrack", "#ambient", "#chiptune", "#synthwave", "#lofi"],
		features: ["FLAC Included", "MP3 Included", "Stems Included", "Royalty Free License"],
		titles: ["Subterranean Synthwave", "Chiptune Odyssey", "Lofi Dungeon Beats", "Ambient Nebula Vol 1"],
	},
	Video: {
		platforms: [
			{ platform: "youtube", getUrl: (_slug, id) => `https://www.youtube.com/watch?v=vid_${id}` },
			{ platform: "vimeo", getUrl: (_slug, id) => `https://vimeo.com/${600000 + id}` },
			{ platform: "nebula", getUrl: (slug, id) => `https://nebula.tv/videos/${slug}-${id}` },
		],
		tags: ["#documentary", "#devlog", "#animation", "#tutorial"],
		features: ["4K Resolution", "Subtitles Included", "Behind the Scenes", "Director Commentary"],
		titles: ["The Making of an Indie Gem", "Pixel Art Masterclass", "100 Days of Game Dev", "Synth Aesthetics"],
	},
	Goods: {
		platforms: [
			{ platform: "etsy", getUrl: (_slug, id) => `https://www.etsy.com/listing/${700000 + id}` },
			{ platform: "bigCartel", getUrl: (slug, id) => `https://${slug}-${id}.bigcartel.com/product/item` },
			{ platform: "redBubble", getUrl: (slug, id) => `https://www.redbubble.com/i/sticker/${slug}-${id}` },
		],
		tags: ["#merch", "#craft", "#pin", "#apparel", "#sticker"],
		features: ["Worldwide Shipping", "Handcrafted", "Limited Edition", "Eco Friendly Packaging"],
		titles: ["Enamel Boss Pin Set", "Retro Arcade Hoodie", "Pixel Heart Vinyl Sticker Pack"],
	},
	Food: {
		platforms: [{ platform: "web", getUrl: (slug, id) => `https://${slug}-${id}.food.example.com` }],
		tags: ["#craft-snack", "#beverage", "#artisan"],
		features: ["Organic Ingredients", "Vegan Option"],
		titles: ["Health Potion Energy Drink", "Pixel Cookie Box"],
	},
	Local: {
		platforms: [{ platform: "web", getUrl: (slug, id) => `https://${slug}-${id}.local.example.com` }],
		tags: ["#arcade", "#meetup", "#event"],
		features: ["Wheelchair Accessible", "Free Entry"],
		titles: ["Indie Arcade Night", "Retro Game Jam Meetup"],
	},
	Internal_Socials: {
		platforms: [
			{ platform: "discord", getUrl: (slug, id) => `https://discord.gg/${slug}-${id}` },
			{ platform: "bsky", getUrl: (slug, id) => `https://bsky.app/profile/${slug}-${id}.bsky.social` },
			{ platform: "twitter", getUrl: (slug, id) => `https://x.com/${slug}-${id}` },
			{ platform: "youtube", getUrl: (slug, id) => `https://www.youtube.com/@${slug}-${id}` },
		],
		tags: ["#community", "#social"],
		features: ["Official Channel"],
		titles: ["Official Discord Server", "Creator Community Hub"],
	},
	Internal_Crowdfunding: {
		platforms: [
			{ platform: "kickstarter", getUrl: (slug, id) => `https://www.kickstarter.com/projects/doomscrll/${slug}-${id}` },
			{ platform: "indiegogo", getUrl: (slug, id) => `https://www.indiegogo.com/projects/${slug}-${id}` },
			{ platform: "backerkit", getUrl: (slug, id) => `https://www.backerkit.com/c/projects/doomscrll/${slug}-${id}` },
		],
		tags: ["#crowdfunding", "#campaign"],
		features: ["Physical Rewards", "Early Backer Tiers"],
		titles: ["Board Game Deluxe Edition Campaign", "Indie Game Physical Release"],
	},
}

const ACTIVE_CATEGORIES = Object.keys(CATEGORY_DATA)

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

async function seed() {
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

				// Pick primary platform definition
				const primaryPlatformDef = sample(data.platforms)
				const primaryPlatform = primaryPlatformDef.platform
				const primaryUrl = primaryPlatformDef.getUrl(slug, urlCounter++)

				// Pick 2-4 distinct secondary platforms
				const otherPlatforms = data.platforms.filter((p) => p.platform !== primaryPlatform)
				const numSecondary = Math.min(Math.floor(Math.random() * 3) + 2, otherPlatforms.length)
				const chosenSecondaryDefs = sampleMany(otherPlatforms, numSecondary)
				const secondaryPlatforms = chosenSecondaryDefs.map((p) => ({
					platform: p.platform,
					url: p.getUrl(slug, urlCounter++),
				}))

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
					primaryPlatform,
					primaryUrl,
					description: sample(DESCRIPTIONS),
					tags: sampleMany(data.tags, numTags),
					features: sampleMany(data.features, numFeatures),
					coverImagePath: sample(COVER_IMAGES),
					screenshotPaths: sampleMany(SCREENSHOT_IMAGES, numScreenshots),
					secondaryPlatforms,
				})
			}
		}
	}

	await db.insert(projectLedger).values(totalLedgers)
	await db.insert(projects).values(totalProjects)
	console.log(`✅ Successfully seeded ${totalProjects.length} projects across ${targetDates.length} days.`)

	process.exit(0)
}

seed().catch((e) => {
	console.error("❌ Error during seeding:", e)
	process.exit(1)
})
