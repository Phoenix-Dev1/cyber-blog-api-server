import express from "express";
import {
  getUser,
  getUserSavedPosts,
  savePost,
  updateSettings,
} from "../controllers/user.controller.js";
import { authenticateJWT } from "../middlewares/jwtAuth.js";

const router = express.Router();

router.get("/saved", authenticateJWT, getUserSavedPosts);
router.patch("/save", authenticateJWT, savePost);
router.get("/:username", getUser);
router.patch("/settings", authenticateJWT, updateSettings);

export default router;
