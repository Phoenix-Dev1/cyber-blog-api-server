import ImageKit from "imagekit";
import Post from "../models/post.model.js";
import User from "../models/user.model.js";

// Get all posts from collection
export const getPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 2;

    const query = {};
    const cat = req.query.cat;
    const author = req.query.author;
    const searchQuery = req.query.search;
    const sortQuery = req.query.sort;
    const featured = req.query.featured;

    // Filter by category
    if (cat) {
      query.category = cat;
    }

    // Search by title
    if (searchQuery) {
      query.title = { $regex: searchQuery, $options: "i" };
    }

    // Filter by author
    if (author) {
      const user = await User.findOne({ username: author }).select("_id");
      if (!user) {
        return res.status(404).json("No posts found");
      }
      query.user = user._id;
    }

    // Sorting logic
    let sortObj = { createdAt: -1 };
    if (sortQuery) {
      switch (sortQuery) {
        case "newest":
          sortObj = { createdAt: -1 };
          break;
        case "oldest":
          sortObj = { createdAt: 1 };
          break;
        case "popular":
          sortObj = { visit: -1 };
          break;
        case "trending":
          sortObj = { visit: -1 };
          query.createdAt = {
            $gte: new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000),
          };
          break;
        default:
          break;
      }
    }

    // Featured posts
    if (featured) {
      query.isFeatured = true;
    }

    const posts = await Post.find(query)
      .populate("user", "username")
      .sort(sortObj)
      .limit(limit)
      .skip((page - 1) * limit);

    const totalPosts = await Post.countDocuments();
    const hasMore = page * limit < totalPosts;

    res.status(200).json({ posts, hasMore });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch posts", error: err.message });
  }
};

// Get a single post
export const getPost = async (req, res) => {
  try {
    const post = await Post.findOne({ slug: req.params.slug }).populate(
      "user",
      "username img"
    );
    res.status(200).json(post);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch post", error: err.message });
  }
};

// Create a new post
export const createPost = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json("Not authenticated");
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json("User not found");
    }

    let slug = req.body.title.replace(/ /g, "-").toLowerCase();
    let existingPost = await Post.findOne({ slug });
    let counter = 2;

    while (existingPost) {
      slug = `${slug}-${counter}`;
      existingPost = await Post.findOne({ slug });
      counter++;
    }

    const newPost = new Post({ user: user._id, slug, ...req.body });
    const post = await newPost.save();
    res.status(200).json(post);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to create post", error: err.message });
  }
};

// Delete a single post
export const deletePost = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role || "user";

    if (!userId) {
      return res.status(401).json("Not authenticated");
    }

    if (role === "admin") {
      await Post.findByIdAndDelete(req.params.id);
      return res.status(200).json("Post has been deleted");
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json("User not found");
    }

    const deletedPost = await Post.findOneAndDelete({
      _id: req.params.id,
      user: user._id,
    });

    if (!deletedPost) {
      return res.status(403).json("Not your post to delete");
    }

    await User.updateMany(
      { savedPosts: req.params.id },
      { $pull: { savedPosts: req.params.id } }
    );

    res.status(200).json("Post has been deleted");
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to delete post", error: err.message });
  }
};

// Feature a post
export const featurePost = async (req, res) => {
  console.log(req.user);

  try {
    const role = req.user.role || "user";

    if (role !== "admin") {
      return res.status(403).json("You cannot feature posts");
    }

    const post = await Post.findById(req.body.postId);

    if (!post) {
      return res.status(404).json("Post not found");
    }

    const updatedPost = await Post.findByIdAndUpdate(
      req.body.postId,
      { isFeatured: !post.isFeatured },
      { new: true }
    );

    res.status(200).json(updatedPost);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to feature post", error: err.message });
  }
};

// ImageKit configuration
const imagekit = new ImageKit({
  urlEndpoint: process.env.IK_URL_ENDPOINT,
  publicKey: process.env.IK_PUBLIC_KEY,
  privateKey: process.env.IK_PRIVATE_KEY,
});

// Upload an image
export const uploadAuth = async (req, res) => {
  const result = imagekit.getAuthenticationParameters();
  res.send(result);
};
