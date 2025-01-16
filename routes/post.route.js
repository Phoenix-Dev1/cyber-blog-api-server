import express from "express";
import {
  getPosts,
  getPost,
  createPost,
  deletePost,
  uploadAuth,
  featurePost,
} from "../controllers/post.controller.js";
import increaceVisits from "../middlewares/increaseVisits.js";

const router = express.Router();

// To prevent upload-auth is a slug it's the first route
router.get("/upload-auth", uploadAuth);
router.get("/", getPosts);
router.get("/:slug", increaceVisits, getPost);
router.post("/", createPost);
router.delete("/:id", deletePost);
router.patch("/feature", featurePost);

export default router;
