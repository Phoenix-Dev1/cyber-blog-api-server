import express from "express";
import { getUserSavedPosts, savePost } from "../controllers/user.controller.js";
import { authenticateJWT } from "../middlewares/jwtAuth.js";

const router = express.Router();

router.get("/saved", authenticateJWT, getUserSavedPosts);
router.patch("/save", authenticateJWT, savePost);

export default router;
