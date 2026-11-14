// Starts the API: connect to MongoDB, listen, and shut down cleanly on SIGTERM (docker stop).
import { env } from "./config/env.js";
import mongoose from "mongoose";
import app from "./app.js";

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  process.exit(1);
});

const server = app.listen(env.port, () => {
  console.log(`Server started on Port: ${env.port}`);
});

try {
  await mongoose.connect(env.mongo);
  console.log("MongoDB is connected");
} catch (err) {
  // Exit so Docker restarts the container (and /healthz monitoring alerts) instead of serving 503s forever
  console.error(`MongoDB connection failed: ${err.message}`);
  process.exit(1);
}

// Node runs as PID 1 in the container: without this, `docker stop` waits 10 s and then kills it.
const shutdown = (signal) => {
  console.log(`${signal} received, shutting down`);
  setTimeout(() => process.exit(0), 8000).unref();
  server.close(() => {
    mongoose.disconnect().finally(() => process.exit(0));
  });
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
