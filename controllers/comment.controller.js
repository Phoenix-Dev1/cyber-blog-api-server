import Comment from "../models/comment.model.js";
import User from "../models/user.model.js";

// Get Post Comments
export const getPostComments = async (req, res) => {
  try {
    const comments = await Comment.find({ post: req.params.postId })
      .populate("user", "username img")
      .sort({ createdAt: -1 });

    res.json(comments);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch comments", error: err.message });
  }
};

// Add Comment
export const addComment = async (req, res) => {
  try {
    const userId = req.user.id; // Extracted from JWT (ensure auth middleware is in use)
    const postId = req.params.postId;

    if (!userId) {
      return res.status(401).json("Not authenticated!");
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json("User not found!");
    }

    const newComment = new Comment({
      ...req.body,
      user: user._id,
      post: postId,
    });

    const savedComment = await newComment.save();

    // Optional delay for demonstration purposes
    setTimeout(() => {
      res.status(201).json(savedComment);
    }, 3000);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to add comment", error: err.message });
  }
};

// Delete Comment
export const deleteComment = async (req, res) => {
  try {
    const userId = req.user.id; // Extracted from JWT
    const id = req.params.id;

    if (!userId) {
      return res.status(401).json("Not authenticated!");
    }

    const role = req.user.role || "user"; // Role extracted from JWT (ensure auth middleware is in use)

    // If the user is an admin, skip user ownership verification
    if (role === "admin") {
      await Comment.findByIdAndDelete(id);
      return res.status(200).json("Comment has been deleted");
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json("User not found!");
    }

    const deletedComment = await Comment.findOneAndDelete({
      _id: id,
      user: user._id,
    });

    if (!deletedComment) {
      return res.status(403).json("You can delete only your comment!");
    }

    res.status(200).json("Comment deleted");
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to delete comment", error: err.message });
  }
};
