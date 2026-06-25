const postgres = require("postgres")
const sql = postgres("postgres://postgres:doomscrllrocks@127.0.0.1:5432/postgres")
sql`SELECT category, status, COUNT(*) FROM projects WHERE showcase_date >= '2026-06-25' GROUP BY category, status`
	.then((res) => {
		console.log(res)
		process.exit(0)
	})
	.catch(console.error)
