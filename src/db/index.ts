import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import * as schema from "./schema"

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
	throw new Error("FATAL: DATABASE_URL environment variable is missing.")
}

const queryClient = postgres(connectionString, { max: 10 })
export const db = drizzle(queryClient, { schema })
