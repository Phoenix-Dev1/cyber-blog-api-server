import express from "express";
import {
  getPostComments,
  addComment,
  deleteComment,
} from "../controllers/comment.controller.js";
import { authenticateJWT } from "../middlewares/jwtAuth.js";

const router = express.Router();

router.get("/:postId", getPostComments);
router.post("/:postId", authenticateJWT, addComment);
router.delete("/:id", authenticateJWT, deleteComment);

export default router;
