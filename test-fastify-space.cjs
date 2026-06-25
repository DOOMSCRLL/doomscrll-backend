const fastify = require("fastify")({ logger: false })
fastify.get("/", (req, res) => {
	res.send({ category: req.query.category })
})
fastify.listen({ port: 3004 }, async () => {
	const resp = await fetch("http://localhost:3004/?category=Video%20Games")
	const data = await resp.json()
	console.log("Fastify parsed Video%20Games as:", data.category)
	process.exit(0)
})
