import { Schema } from "mongoose";
import mongoose from "mongoose";

const userSchema = new Schema(
  {
    authProvider: {
      type: String,
      enum: ["github", "google", "local"], // Add 'local' for email/password users
      required: true,
    },
    providerId: {
      type: String,
      unique: true, // Required for OAuth users (GitHub/Google)
      sparse: true, // Allows null values for local users
    },
    username: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: function () {
        return this.authProvider === "local";
      }, // Password is only required for local users
      select: false, // Exclude password from queries by default
    },
    img: {
      type: String,
      default: null, // Optional profile image
    },
    savedPosts: {
      type: [String],
      default: [], // IDs of saved posts
    },
    role: {
      type: String,
      default: "user",
    },
    bio: {
      type: String,
      default: "",
    },
    // The shared demo login on the login page (set once with scripts/mark-demo-user.js): its profile is
    // locked and deleting its posts needs DELETE_POST_PASSWORD.
    isDemo: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
