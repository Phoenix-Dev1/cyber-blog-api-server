// Loads and checks the environment once. Every module that needs a setting imports `env` from here, so
// nothing depends on import order any more (before, the env only loaded because post.controller.js
// happened to call dotenv.config() early).
import dotenv from "dotenv";

// Tests set their own environment and must never read the local .env, whose MONGO is the live database.
if (process.env.NODE_ENV !== "test") dotenv.config();

const REQUIRED = [
  "MONGO",
  "JWT_SECRET",
  "CLIENT_URL",
  "BACKEND_URL",
  "IK_URL_ENDPOINT",
  "IK_PUBLIC_KEY",
  "IK_PRIVATE_KEY",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
];

// Fails fast, naming the missing keys (never their values).
export const checkEnv = (source = process.env) => {
  const missing = REQUIRED.filter((key) => !source[key]?.trim());
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  const backendUrl = source.BACKEND_URL.trim();
  return {
    port: Number(source.PORT) || 5432,
    isProduction: source.NODE_ENV === "production",
    mongo: source.MONGO.trim(),
    jwtSecret: source.JWT_SECRET,
    // CORS needs the exact origin: no trailing slash
    clientUrl: source.CLIENT_URL.trim().replace(/\/+$/, ""),
    // The Google callback is built as `${backendUrl}auth/google/callback`: needs the trailing slash
    backendUrl: backendUrl.endsWith("/") ? backendUrl : `${backendUrl}/`,
    imagekit: {
      urlEndpoint: source.IK_URL_ENDPOINT,
      publicKey: source.IK_PUBLIC_KEY,
      privateKey: source.IK_PRIVATE_KEY,
    },
    github: { clientID: source.GITHUB_CLIENT_ID, clientSecret: source.GITHUB_CLIENT_SECRET },
    google: { clientID: source.GOOGLE_CLIENT_ID, clientSecret: source.GOOGLE_CLIENT_SECRET },
    // Only the shared demo account has to type it to delete a post. Unset = the demo account can't delete.
    deletePostPassword: source.DELETE_POST_PASSWORD || null,
  };
};

export const env = checkEnv();
