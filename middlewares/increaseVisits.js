import Post from "../models/post.model.js";

// Counts a visit on every GET /posts/:slug. Kept until the client calls POST /posts/:slug/view once per
// page view instead (follow-up S-1b removes this): refetches and the edit page count as visits today.
const increaseVisits = async (req, res, next) => {
  await Post.updateOne({ slug: req.params.slug }, { $inc: { visit: 1 } });
  next();
};

export default increaseVisits;
