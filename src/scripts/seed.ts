import "dotenv/config"
import { db } from "../db/index.js"
import { profiles } from "../db/schemas/auth.js"

async function seed() {
	console.log("🌱 Seeding started...")

	// Generate 1 to 3 random users
	const numUsers = Math.floor(Math.random() * 3) + 1
	const today = new Date()

	const newProfiles = []
	for (let i = 0; i < numUsers; i++) {
		const randomStr = Math.random().toString(36).substring(7)
		newProfiles.push({
			email: `mockuser_${randomStr}@example.com`,
			username: `mock_${randomStr}`,
			description: `Mock user generated on ${today.toDateString()}`,
			url: `https://example.com/${randomStr}`,
		})
	}

	try {
		const inserted = await db.insert(profiles).values(newProfiles).returning()
		console.log(`✅ Successfully inserted ${inserted.length} profiles:`)
		inserted.forEach((p) => console.log(`  - ${p.username} (${p.email})`))
	} catch (e) {
		console.error("❌ Error inserting profiles:", e)
	}

	console.log("🌱 Seeding complete.")
	process.exit(0)
}

seed()
