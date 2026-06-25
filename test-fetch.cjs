const fastify = require("fastify")({ logger: false })
fastify.get("/", (req, res) => {
	res.send({ url: req.url, category: req.query.category })
})
fastify.listen({ port: 3002 }, async () => {
	try {
		const resp = await fetch("http://localhost:3002/?date=2026-06-25&category=Video Games")
		const data = await resp.json()
		console.log("Response:", data)
	} catch (err) {
		console.log("Error:", err.message)
	}
	process.exit(0)
})
