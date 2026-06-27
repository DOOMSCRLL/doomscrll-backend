import "dotenv/config"
import { db } from "../db/index.js"
import { projects, projectLedger } from "../db/schemas/project.js"

async function clearProjects() {
	console.log("🗑️ Clearing existing projects and ledgers...")
	try {
		await db.delete(projects)
		await db.delete(projectLedger)
		console.log("✅ Successfully cleared projects and ledgers.")
	} catch (e) {
		console.error("❌ Error clearing projects:", e)
	}
	process.exit(0)
}

clearProjects()
