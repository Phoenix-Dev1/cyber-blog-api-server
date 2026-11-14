import Comment from "../models/comment.model.js";
import Post from "../models/post.model.js";
import { httpError } from "../lib/httpError.js";

// A post's comments, newest first
export const getPostComments = async (req, res) => {
  const comments = await Comment.find({ post: req.params.postId })
    .populate("user", "username img")
    .sort({ createdAt: -1 });

  res.status(200).json(comments);
};

// Add a comment (body checked by commentBody: only `desc` is taken)
export const addComment = async (req, res) => {
  const { postId } = req.params;

  if (!(await Post.exists({ _id: postId }))) {
    throw httpError(404, "Post not found");
  }

  const comment = await Comment.create({ desc: req.body.desc, user: req.user._id, post: postId });
  res.status(201).json(comment);
};

// Delete a comment: its author or an admin
export const deleteComment = async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) {
    throw httpError(404, "Comment not found");
  }

  if (req.user.role !== "admin" && !comment.user.equals(req.user._id)) {
    throw httpError(403, "You can delete only your comment!");
  }

  await comment.deleteOne();
  res.status(200).json("Comment deleted");
};
