import express from "express";
import {
  getPostComments,
  addComment,
  deleteComment,
} from "../controllers/comment.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { commentLimit } from "../middlewares/rateLimits.js";
import { validate } from "../middlewares/validate.js";
import { commentBody, idParams, postIdParams } from "../validation/schemas.js";

const router = express.Router();

router.get("/:postId", validate({ params: postIdParams }), getPostComments);
router.post(
  "/:postId",
  requireAuth,
  commentLimit,
  validate({ params: postIdParams, body: commentBody }),
  addComment
);
router.delete("/:id", requireAuth, validate({ params: idParams }), deleteComment);

export default router;
