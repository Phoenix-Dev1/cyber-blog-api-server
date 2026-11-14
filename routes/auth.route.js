import express from "express";
import passport from "passport";
import {
  registerUser,
  loginUser,
  getMe,
  oauthDone,
  oauthFailed,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { loginLimit, registerLimit } from "../middlewares/rateLimits.js";
import { validate } from "../middlewares/validate.js";
import { loginBody, registerBody } from "../validation/schemas.js";

const router = express.Router();

router.post("/register", registerLimit, validate({ body: registerBody }), registerUser);
router.post("/login", loginLimit, validate({ body: loginBody }), loginUser);
router.get("/me", requireAuth, getMe);

// Google/GitHub: start → provider → callback. Any failure (cancelled, provider error, DB error) sends the
// browser to the client's login page instead of showing a JSON error.
const oauthCallback = (provider) => (req, res, next) =>
  passport.authenticate(provider, { session: false }, (err, user) => {
    if (err) console.error(`${provider} sign-in failed: ${err.message || err.code || err.name}`);
    if (err || !user) return oauthFailed(req, res);
    req.user = user;
    oauthDone(req, res);
  })(req, res, next);

router.get("/github", passport.authenticate("github", { session: false }));
router.get("/github/callback", oauthCallback("github"));

router.get("/google", passport.authenticate("google", { scope: ["profile", "email"], session: false }));
router.get("/google/callback", oauthCallback("google"));

export default router;
