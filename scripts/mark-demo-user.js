// One-off, idempotent: marks the shared demo login (pre-filled on the client's login page) as the demo account
// (isDemo: locked profile; deleting its posts needs DELETE_POST_PASSWORD). Run it before deploying the
// version that reads isDemo, or the demo account is briefly an ordinary account.
//
//   node scripts/mark-demo-user.js           only reports (no changes)
//   node scripts/mark-demo-user.js --apply   sets isDemo on that account
//
// Uses MONGO from .env, which is the live database. Prints counts only, never user data.
import { env } from "../config/env.js";
import mongoose from "mongoose";

const DEMO_EMAIL = "visitor@cyber-blog";
const apply = process.argv.includes("--apply");

await mongoose.connect(env.mongo);
try {
  const users = mongoose.connection.collection("users");
  const filter = { email: DEMO_EMAIL };
  console.log(`database: ${mongoose.connection.db.databaseName}`);
  console.log(`accounts with the demo e-mail: ${await users.countDocuments(filter)}`);
  console.log(`accounts already marked isDemo: ${await users.countDocuments({ isDemo: true })}`);

  if (apply) {
    const result = await users.updateOne(filter, { $set: { isDemo: true } });
    console.log(`matched ${result.matchedCount}, modified ${result.modifiedCount}`);
  } else {
    console.log("dry run: nothing changed (add --apply)");
  }
} finally {
  await mongoose.disconnect();
}
