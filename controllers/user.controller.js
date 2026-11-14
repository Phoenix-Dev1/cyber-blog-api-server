import Post from "../models/post.model.js";
import User from "../models/user.model.js";
import { httpError } from "../lib/httpError.js";
import { CASE_INSENSITIVE } from "../lib/text.js";
import { firstIssue } from "../middlewares/validate.js";
import { username as usernameSchema } from "../validation/schemas.js";

// The logged-in user's saved post ids
export const getUserSavedPosts = (req, res) => {
  res.status(200).json(req.user.savedPosts ?? []);
};

// Save or unsave a post (body checked by postIdBody)
export const savePost = async (req, res) => {
  const { postId } = req.body;
  const isSaved = (req.user.savedPosts ?? []).includes(postId);

  if (!isSaved && !(await Post.exists({ _id: postId }))) {
    throw httpError(404, "Post not found");
  }

  await User.updateOne(
    { _id: req.user._id },
    isSaved ? { $pull: { savedPosts: postId } } : { $addToSet: { savedPosts: postId } }
  );

  res.status(200).json(isSaved ? "Post unsaved" : "Post saved");
};

// Public profile: only what the profile page shows (no e-mail, role, sign-in provider or saved posts)
export const getUser = async (req, res) => {
  const user = await User.findOne({ username: req.params.username }).select("username img bio createdAt");
  if (!user) {
    throw httpError(404, "User not found");
  }
  res.status(200).json(user);
};

// Update username, bio and avatar (body checked by settingsBody)
export const updateSettings = async (req, res) => {
  // Decision Q1: the shared demo login stays usable, but nobody can rename it or change its avatar/bio
  if (req.user.isDemo) {
    throw httpError(403, "The demo account's profile can't be changed.");
  }

  const { username, bio, img } = req.body;
  const update = {};

  if (username !== undefined && username !== req.user.username) {
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) {
      throw httpError(400, firstIssue(parsed.error));
    }
    const taken = await User.exists({ username: parsed.data, _id: { $ne: req.user._id } }).collation(
      CASE_INSENSITIVE
    );
    if (taken) {
      throw httpError(409, "That username is already taken");
    }
    update.username = parsed.data;
  }
  if (bio !== undefined) update.bio = bio;
  if (img !== undefined) update.img = img;

  const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true });
  res.status(200).json(user);
};
