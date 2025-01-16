import User from "../models/user.model.js";
import Post from "../models/post.model.js";
import Comment from "../models/comment.model.js";
import { Webhook } from "svix";

export const clerkWebHook = async (req, res) => {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error("Webhook secret needed!");
  }

  const payload = req.body;
  const headers = req.headers;

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt;
  try {
    evt = wh.verify(payload, headers);
  } catch (err) {
    res.status(400).json({
      message: "Webhook verification failed!",
    });
  }

  console.log(evt.data);

  if (evt.type === "user.created") {
    const clerkUserId = evt.data.id; // Ensure this field exists
    if (!clerkUserId) {
      console.error("clerkUserId is missing in webhook event data");
      return res.status(400).json({ message: "Invalid Clerk user data" });
    }

    try {
      const newUser = new User({
        clerkUserId: clerkUserId,
        username:
          evt.data.username || evt.data.email_addresses[0]?.email_address,
        email: evt.data.email_addresses[0]?.email_address,
        img: evt.data.profile_img_url,
      });

      await newUser.save();
      console.log("New user saved:", newUser);
      return res
        .status(200)
        .json({ newUser, message: "User created and saved" });
    } catch (err) {
      console.error("Error saving user to database:", err.message);
      return res
        .status(500)
        .json({ message: "Failed to save user to database" });
    }
  }

  /*
  if (evt.type === "user.deleted") {
    const deletedUser = await User.findOneAndDelete({
      clerkUserId: evt.data.id,
    });

    await Post.deleteMany({ user: deletedUser._id });
    await Comment.deleteMany({ user: deletedUser._id });
  }
  */

  return res.status(200).json({ newUser, message: "Webhook received" });
};
