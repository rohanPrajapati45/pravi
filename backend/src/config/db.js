const provider = (process.env.DB_PROVIDER || "postgres").toLowerCase();

export function getDatabaseConfig() {
  if (provider === "mongo") {
    return { provider: "mongo", connectionString: process.env.MONGODB_URI || "" };
  }

  return { provider: "postgres", connectionString: process.env.DATABASE_URL || "" };
}

export default getDatabaseConfig;
