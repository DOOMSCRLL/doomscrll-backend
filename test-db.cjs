const postgres = require("postgres")
const sql = postgres("postgres://postgres:postgres@localhost:5432/doomscrll")
sql`SELECT category, status, COUNT(*) FROM projects GROUP BY category, status`.then((res) => {
	console.log(res)
	process.exit(0)
})
