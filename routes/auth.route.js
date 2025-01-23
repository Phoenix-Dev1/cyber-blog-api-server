import express from "express";
import passport from "passport";
import {
  registerUser,
  loginUser,
  getUserData,
  githubCallback,
  googleCallback,
} from "../controllers/auth.controller.js";

const router = express.Router();

// Local registration
router.post("/register", registerUser);

// Local login
router.post("/login", loginUser);

// User data
router.get("/me", getUserData);

// OAuth Login/Register (GitHub)
router.get(
  "/github",
  passport.authenticate("github", { scope: ["user:email"], session: false }) // Disable session
);

// GitHub Callback
router.get(
  "/github/callback",
  passport.authenticate("github", {
    failureRedirect: "/login",
    session: false,
  }), // Disable session
  githubCallback
);

// Google OAuth
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);

// Google OAuth Callback
router.get(
  "/google/callback",
  (req, res, next) => {
    console.log("Google callback hit:", req.query);
    next();
  },
  passport.authenticate("google", {
    failureRedirect: "/login",
    session: false,
  }),
  googleCallback
);

export default router;
