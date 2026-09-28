import Redis from "ioredis";

// Shared client reserved for caching and rate limiting.
const redis = new Redis(process.env.REDIS_URL);

export default redis;
