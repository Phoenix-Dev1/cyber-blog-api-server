import express from "express";
import {
  getPosts,
  getPost,
  createPost,
  deletePost,
  uploadAuth,
  featurePost,
  editPost,
} from "../controllers/post.controller.js";
import increaceVisits from "../middlewares/increaseVisits.js";
import { authenticateJWT } from "../middlewares/jwtAuth.js";

const router = express.Router();

router.get("/upload-auth", uploadAuth);
router.get("/", getPosts);
router.get("/:slug", increaceVisits, getPost);
router.post("/", authenticateJWT, createPost);
router.delete("/:id", authenticateJWT, deletePost);
router.patch("/feature", authenticateJWT, featurePost);
router.patch("/edit/:slug", authenticateJWT, editPost);

export default router;
