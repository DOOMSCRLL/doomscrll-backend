import "dotenv/config"
import { ProjectsService } from "../services/projects.service.js"
async function test() {
	const res = await ProjectsService.getProjectPreviews("2026-06-28", "Video Games")
	console.log(JSON.stringify(res[0], null, 2))
	process.exit(0)
}
test()
