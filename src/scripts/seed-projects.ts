import "dotenv/config";
import { randomUUID } from "crypto";
import { db } from "../db/index.js";
import { profiles } from "../db/schemas/auth.js";
import { projectLedger, projects } from "../db/schemas/project.js";
import { DB_RULES } from "../config/index.js";

function generateRefId() {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let result = DB_RULES.prefixProjectRefId;
	for (let i = 0; i < DB_RULES.lengthProjectRefId; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

async function seedProjects() {
	const args = process.argv.slice(2);
	const year = parseInt(args[0]) || new Date().getFullYear();
	const month = parseInt(args[1]) || new Date().getMonth() + 1; // 1-12

	console.log(`🌱 Generating projects for ${year}-${String(month).padStart(2, "0")}`);

	const allProfiles = await db.select({ id: profiles.id }).from(profiles);
	if (allProfiles.length === 0) {
		console.error("❌ No profiles found. Please run 'npm run db:seed' first to create users.");
		process.exit(1);
	}

	const daysInMonth = new Date(year, month, 0).getDate();

	const totalLedgers = [];
	const totalProjects = [];

	// Use random string as part of URL to ensure uniqueness
	const runId = Math.random().toString(36).substring(2, 6);

	for (let day = 1; day <= daysInMonth; day++) {
		const numProjects = Math.floor(Math.random() * DB_RULES.limitDailySlots) + 1;
		const showcaseDateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

		for (let i = 0; i < numProjects; i++) {
			const profile = allProfiles[Math.floor(Math.random() * allProfiles.length)];
			const ledgerId = randomUUID();
			const projectId = randomUUID();
			
			// ensure unique URL per project
			const primaryUrl = `https://mock-project-${runId}-${day}-${i}.com`;

			const statuses = ["draft", "incomplete", "ready", "showcased", "canceled"] as const;
			const status = statuses[Math.floor(Math.random() * statuses.length)];

			totalLedgers.push({
				id: ledgerId,
				profileId: profile.id,
				primaryUrl,
				lastShowcaseDate: showcaseDateStr,
			});

			totalProjects.push({
				id: projectId,
				referenceId: generateRefId(),
				ledgerId,
				showcaseDate: showcaseDateStr,
				status,
				name: `Mock Project ${day}/${month} #${i}`,
				category: "Tech",
				primaryPlatform: "Web",
				primaryUrl,
				description: "This is a mock project generated for testing.",
				tags: ["mock", "test", `day-${day}`],
			});
		}
	}

	console.log(`Prepared ${totalProjects.length} mock projects in memory. Inserting...`);

	// Batch insert in chunks to avoid query too large errors and memory bloat
	const CHUNK_SIZE = 2500;
	try {
		for (let i = 0; i < totalLedgers.length; i += CHUNK_SIZE) {
			const chunk = totalLedgers.slice(i, i + CHUNK_SIZE);
			await db.insert(projectLedger).values(chunk);
			process.stdout.write(`\rInserted ledgers: ${Math.min(i + CHUNK_SIZE, totalLedgers.length)}/${totalLedgers.length}`);
		}
		console.log("");

		for (let i = 0; i < totalProjects.length; i += CHUNK_SIZE) {
			const chunk = totalProjects.slice(i, i + CHUNK_SIZE);
			await db.insert(projects).values(chunk);
			process.stdout.write(`\rInserted projects: ${Math.min(i + CHUNK_SIZE, totalProjects.length)}/${totalProjects.length}`);
		}
		console.log("\n✅ Projects seeding complete.");
	} catch (e) {
		console.error("\n❌ Error during insertion:", e);
	}
	
	process.exit(0);
}

seedProjects();
