import express from "express";
import {
  getPosts,
  getPost,
  countView,
  createPost,
  deletePost,
  uploadAuth,
  featurePost,
  editPost,
} from "../controllers/post.controller.js";
import increaseVisits from "../middlewares/increaseVisits.js";
import { requireAdmin, requireAuth } from "../middlewares/auth.js";
import { postWriteLimit, uploadLimit } from "../middlewares/rateLimits.js";
import { validate } from "../middlewares/validate.js";
import {
  createPostBody,
  deletePostBody,
  editPostBody,
  idParams,
  listPostsQuery,
  postIdBody,
  slugParams,
} from "../validation/schemas.js";

const router = express.Router();

// Signs ImageKit uploads: only for logged-in users (every upload button is on a login-only page)
router.get("/upload-auth", requireAuth, uploadLimit, uploadAuth);
router.get("/", validate({ query: listPostsQuery }), getPosts);
router.get("/:slug", validate({ params: slugParams }), increaseVisits, getPost);
router.post("/:slug/view", validate({ params: slugParams }), countView);
router.post("/", requireAuth, postWriteLimit, validate({ body: createPostBody }), createPost);
router.delete("/:id", requireAuth, validate({ params: idParams, body: deletePostBody }), deletePost);
router.patch("/feature", requireAuth, requireAdmin, validate({ body: postIdBody }), featurePost);
router.patch(
  "/edit/:slug",
  requireAuth,
  postWriteLimit,
  validate({ params: slugParams, body: editPostBody }),
  editPost
);

export default router;
