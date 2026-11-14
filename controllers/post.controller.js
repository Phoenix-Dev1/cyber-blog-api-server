import { createHash, timingSafeEqual } from "node:crypto";
import ImageKit from "imagekit";
import Post from "../models/post.model.js";
import User from "../models/user.model.js";
import Comment from "../models/comment.model.js";
import { env } from "../config/env.js";
import { httpError } from "../lib/httpError.js";
import { escapeRegex } from "../lib/text.js";
import { uniqueSlug } from "../lib/slug.js";

// The only post fields a client may set. The server owns the rest (user, slug, isFeatured, visit, timestamps):
// spreading req.body let any logged-in user feature their own post, fake its visit count or move it to
// another user. isFeatured changes only through featurePost (admins).
const POST_FIELDS = ["title", "desc", "category", "content", "img"];
const pickPostFields = (body = {}) =>
  Object.fromEntries(
    POST_FIELDS.filter((key) => body[key] !== undefined).map((key) => [key, body[key]])
  );

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  // _id breaks ties, so pages don't repeat or skip posts with the same visit count
  popular: { visit: -1, _id: -1 },
  trending: { visit: -1, _id: -1 },
};
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// List posts (query checked by listPostsQuery: limit is at most 50). Lists leave out `content`.
export const getPosts = async (req, res) => {
  const { page, limit, cat, author, search, sort, featured } = req.valid.query;

  const query = {};
  if (cat) query.category = cat;
  // Title search; the text is matched literally
  if (search) query.title = { $regex: escapeRegex(search), $options: "i" };
  if (featured && !["false", "0"].includes(featured)) query.isFeatured = true;
  if (sort === "trending") query.createdAt = { $gte: new Date(Date.now() - WEEK_MS) };

  if (author) {
    const user = await User.findOne({ username: author }).select("_id");
    if (!user) {
      throw httpError(404, "No posts found");
    }
    query.user = user._id;
  }

  const [posts, totalPosts] = await Promise.all([
    Post.find(query)
      .select("-content")
      .populate("user", "username")
      .sort(SORTS[sort] ?? SORTS.newest)
      .skip((page - 1) * limit)
      .limit(limit),
    Post.countDocuments(query),
  ]);

  res.status(200).json({ posts, hasMore: page * limit < totalPosts });
};

// One post. A missing post answers 200 null for now, because that's what today's client shows as
// "Post Not Found"; it becomes a 404 together with the client's 404 page (follow-up S-1b).
export const getPost = async (req, res) => {
  const post = await Post.findOne({ slug: req.params.slug }).populate("user", "username img");
  res.status(200).json(post);
};

// Counts one visit. Meant to be called once per page view. GET /posts/:slug still counts too, until the
// client calls this instead (follow-up S-1b).
export const countView = async (req, res) => {
  const { matchedCount } = await Post.updateOne({ slug: req.params.slug }, { $inc: { visit: 1 } });
  if (!matchedCount) {
    throw httpError(404, "Post not found");
  }
  res.status(204).end();
};

// Create a post (body checked by createPostBody)
export const createPost = async (req, res) => {
  const fields = pickPostFields(req.body);
  const post = await Post.create({
    ...fields,
    user: req.user._id,
    slug: await uniqueSlug(fields.title),
  });
  res.status(201).json(post);
};

const sha256 = (value) => createHash("sha256").update(String(value)).digest();
const isDeletePassword = (password) =>
  Boolean(env.deletePostPassword) &&
  typeof password === "string" &&
  timingSafeEqual(sha256(password), sha256(env.deletePostPassword));

// Delete a post: its author or an admin. Its comments and every user's bookmark of it go too.
export const deletePost = async (req, res) => {
  // Decision Q2: only the shared demo account has to type the delete password
  if (req.user.isDemo && !isDeletePassword(req.body.password)) {
    throw httpError(403, "Invalid deletion password. Deletion prevented in demo environment.");
  }

  const post = await Post.findById(req.params.id);
  if (!post) {
    throw httpError(404, "Post not found");
  }
  if (req.user.role !== "admin" && !post.user.equals(req.user._id)) {
    throw httpError(403, "Not your post to delete");
  }

  await post.deleteOne();
  await Promise.all([
    Comment.deleteMany({ post: post._id }),
    User.updateMany({ savedPosts: post.id }, { $pull: { savedPosts: post.id } }),
  ]);

  res.status(200).json("Post has been deleted");
};

// Edit a post: its author or an admin (body checked by editPostBody). The slug never changes.
export const editPost = async (req, res) => {
  const filter = { slug: req.params.slug };
  if (req.user.role !== "admin") filter.user = req.user._id;

  const post = await Post.findOneAndUpdate(
    filter,
    { $set: pickPostFields(req.body) },
    { new: true, runValidators: true }
  );

  if (!post) {
    const exists = await Post.exists({ slug: req.params.slug });
    throw exists ? httpError(403, "Not your post to edit") : httpError(404, "Post not found");
  }

  res.status(200).json(post);
};

// Feature or un-feature a post (admins only: requireAdmin on the route)
export const featurePost = async (req, res) => {
  const post = await Post.findById(req.body.postId).select("isFeatured");
  if (!post) {
    throw httpError(404, "Post not found");
  }

  const updatedPost = await Post.findByIdAndUpdate(
    post._id,
    { isFeatured: !post.isFeatured },
    { new: true }
  );
  res.status(200).json(updatedPost);
};

const imagekit = new ImageKit(env.imagekit);

// Signs an ImageKit upload from the browser (logged-in users only: requireAuth on the route)
export const uploadAuth = (req, res) => {
  res.send(imagekit.getAuthenticationParameters());
};
