import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/user.model.js";
import { env } from "../config/env.js";
import { httpError } from "../lib/httpError.js";

export const signToken = (user) =>
  jwt.sign({ id: String(user._id), role: user.role }, env.jwtSecret, { expiresIn: "3h" });

// "Authorization: Bearer <jwt>". Loads the user on every request, so a deleted account or a role change
// applies at once (the role inside the token isn't trusted).
// req.user = the user document (plain object, no password) + `id` as a string.
export const requireAuth = async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (!/^Bearer$/i.test(scheme) || !token) {
    throw httpError(401, "Please log in first");
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
  } catch {
    throw httpError(401, "Your session has expired. Please log in again.");
  }

  const user = mongoose.isValidObjectId(payload.id) ? await User.findById(payload.id).lean() : null;
  if (!user) {
    throw httpError(401, "Please log in first");
  }

  req.user = { ...user, id: String(user._id) };
  next();
};

// Use after requireAuth
export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    throw httpError(403, "Only admins can do that");
  }
  next();
};
