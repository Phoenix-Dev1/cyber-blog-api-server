import express from "express";
import {
  getUser,
  getUserSavedPosts,
  savePost,
  updateSettings,
} from "../controllers/user.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { postIdBody, settingsBody, usernameParams } from "../validation/schemas.js";

const router = express.Router();

router.get("/saved", requireAuth, getUserSavedPosts);
router.patch("/save", requireAuth, validate({ body: postIdBody }), savePost);
router.get("/:username", validate({ params: usernameParams }), getUser);
router.patch("/settings", requireAuth, validate({ body: settingsBody }), updateSettings);

export default router;
