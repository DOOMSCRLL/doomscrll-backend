const fastify = require("fastify")({ logger: false })
fastify.get("/", (req, res) => {
	res.send({ category: req.query.category })
})
fastify.listen({ port: 3003 }, async () => {
	const resp = await fetch("http://localhost:3003/?category=Video+Games")
	const data = await resp.json()
	console.log("Fastify parsed Video+Games as:", data.category)
	process.exit(0)
})
