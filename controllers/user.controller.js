import User from "../models/user.model.js";

// Get all user saved posts
export const getUserSavedPosts = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json("Not Authenticated");
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json("User not found");
    }

    res.status(200).json(user.savedPosts);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch saved posts", error: err.message });
  }
};

// Save or unsave a post for a single user
export const savePost = async (req, res) => {
  try {
    const userId = req.user.id;
    const postId = req.body.postId;

    if (!userId) {
      return res.status(401).json("Not Authenticated");
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json("User not found");
    }

    const isSaved = user.savedPosts.includes(postId);

    if (!isSaved) {
      // If the post isn't saved by the user before
      await User.findByIdAndUpdate(userId, {
        $push: { savedPosts: postId },
      });
    } else {
      // If the post is saved by the user before
      await User.findByIdAndUpdate(userId, {
        $pull: { savedPosts: postId },
      });
    }

    setTimeout(() => {
      res.status(200).json(isSaved ? "Post unsaved" : "Post saved");
    }, 3000);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to save post", error: err.message });
  }
};
