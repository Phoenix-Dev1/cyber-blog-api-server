// Test setup: an in-memory MongoDB (mongodb-memory-server) and a fixed test environment.
// The local .env is never read in tests (config/env.js skips it when NODE_ENV=test): its MONGO is live.
import { MongoMemoryServer } from "mongodb-memory-server";

export const TEST_ENV = {
  NODE_ENV: "test",
  PORT: "0",
  MONGO: "mongodb://127.0.0.1:1/not-started-yet",
  JWT_SECRET: "test-jwt-secret-0123456789abcdef",
  CLIENT_URL: "http://client.test/",
  BACKEND_URL: "http://api.test",
  IK_URL_ENDPOINT: "https://ik.imagekit.io/test",
  IK_PUBLIC_KEY: "public_test_key",
  IK_PRIVATE_KEY: "private_test_key",
  GITHUB_CLIENT_ID: "github-client-id",
  GITHUB_CLIENT_SECRET: "github-client-secret",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  DELETE_POST_PASSWORD: "demo-delete-password",
};

// Must run before anything imports config/env.js (use dynamic imports after it)
export const applyTestEnv = () => Object.assign(process.env, TEST_ENV);

export const startTestApp = async () => {
  applyTestEnv();
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO = mongod.getUri("cyberblog_test");

  const { default: mongoose } = await import("mongoose");
  await mongoose.connect(process.env.MONGO);
  // Safety net: only ever write to the local in-memory server
  if (!["127.0.0.1", "localhost"].includes(mongoose.connection.host)) {
    throw new Error("Refusing to run tests against a non-local database");
  }

  const { default: app } = await import("../app.js");
  // Build the unique indexes before the duplicate tests
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  return {
    app,
    mongoose,
    stop: async () => {
      await mongoose.disconnect();
      await mongod.stop();
    },
  };
};

// Each request gets its own visitor address (CF-Connecting-IP), so the rate limits only trip where a test
// means them to.
let ipCounter = 0;
export const freshIp = () => {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
};
