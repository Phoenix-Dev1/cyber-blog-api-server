import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { sendError } from "./errorHandler.js";

// Behind Cloudflare the visitor's address is in CF-Connecting-IP (Cloudflare sets it and overwrites any value a
// client sends); otherwise req.ip ("trust proxy" is 1). ipKeyGenerator groups IPv6 addresses by /56.
const clientKey = (req) => ipKeyGenerator(req.headers["cf-connecting-ip"] || req.ip);

const limiter = (windowMinutes, limit, options = {}) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: clientKey,
    handler: (req, res) => sendError(req, res, 429, "Too many requests. Please try again later."),
    ...options,
  });

// Everything (generous: a page view makes a handful of requests)
export const generalLimit = limiter(15, 1000);
// Password guessing: only failed logins count
export const loginLimit = limiter(15, 10, { skipSuccessfulRequests: true });
export const registerLimit = limiter(60, 5);
export const commentLimit = limiter(10, 10);
export const postWriteLimit = limiter(60, 30);
export const uploadLimit = limiter(60, 60);
