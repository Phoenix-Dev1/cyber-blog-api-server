// Request schemas (zod). Messages are shown to the user as-is.
import { z } from "zod";
import { USERNAME_MAX, USERNAME_MIN, USERNAME_PATTERN } from "../lib/text.js";

// A field that must be text: wrong types (e.g. a {"$ne": …} object) fail with the same message.
const text = (name) => z.string({ error: `${name} is required` });

const objectId = z.string({ error: "Invalid id" }).regex(/^[a-f\d]{24}$/i, "Invalid id");

// ImageKit file path ("/x.jpg"), a full https URL (Google/GitHub avatars), or empty
const imageRef = z
  .string({ error: "Invalid image" })
  .trim()
  .max(500, "Invalid image")
  .refine((value) => !/^\s*(javascript|data|vbscript):/i.test(value), "Invalid image");

export const username = text("Username")
  .trim()
  .min(USERNAME_MIN, `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters`)
  .max(USERNAME_MAX, `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters`)
  .regex(USERNAME_PATTERN, "Username can use letters, digits, spaces, '.', '_' and '-'");

// Lenient query numbers: junk → default, out of range → clamped (never a 400)
const queryInt = (fallback, min, max) =>
  z.coerce
    .number()
    .int()
    .catch(fallback)
    .transform((n) => Math.min(Math.max(n, min), max));
const queryText = (max) =>
  z
    .string()
    .transform((s) => s.trim().slice(0, max))
    .optional()
    .catch(undefined);

// ---- auth
export const registerBody = z.object({
  username,
  email: text("Email")
    .trim()
    .toLowerCase()
    .max(254, "Enter a valid email address")
    .pipe(z.email("Enter a valid email address")),
  password: text("Password")
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password can be at most 72 characters"),
});

// Not an e-mail format check: the shared demo login is "visitor@cyber-blog"
export const loginBody = z.object({
  email: text("Email").trim().min(1, "Email is required").max(254, "Invalid email or password"),
  password: text("Password").min(1, "Password is required").max(200, "Invalid email or password"),
});

// ---- users
export const usernameParams = z.object({ username: z.string().max(100) });

// The username's format is checked in the controller, and only when it changes (some older accounts
// have names the new rule wouldn't allow; they can still save their bio).
export const settingsBody = z.object({
  username: z.string({ error: "Invalid username" }).trim().max(100, "Invalid username").optional(),
  bio: z.string({ error: "Invalid bio" }).trim().max(500, "Bio can be at most 500 characters").optional(),
  img: imageRef.optional(),
});

export const postIdBody = z.object({ postId: objectId });

// ---- posts
export const slugParams = z.object({ slug: z.string().min(1).max(300) });
export const idParams = z.object({ id: objectId });

export const listPostsQuery = z.object({
  page: queryInt(1, 1, 10000),
  limit: queryInt(2, 1, 50),
  cat: queryText(40),
  author: queryText(100),
  search: queryText(100),
  sort: z.enum(["newest", "oldest", "popular", "trending"]).optional().catch(undefined),
  featured: queryText(10),
});

const postFields = {
  title: text("Title").trim().min(1, "Title is required").max(200, "Title can be at most 200 characters"),
  desc: z.string({ error: "Invalid description" }).trim().max(1000, "Description can be at most 1,000 characters").nullish(),
  category: z
    .string({ error: "Invalid category" })
    .trim()
    .regex(/^[a-z0-9-]{1,40}$/, "Invalid category")
    .optional(),
  content: text("Content").min(1, "Content is required").max(250000, "The post is too long"),
  img: imageRef.nullish(),
};
export const createPostBody = z.object(postFields);
export const editPostBody = z.object(postFields).partial();

export const deletePostBody = z.object({
  password: z.string().max(200).optional().catch(undefined),
});

// ---- comments
export const postIdParams = z.object({ postId: objectId });
export const commentBody = z.object({
  desc: text("Comment")
    .trim()
    .min(1, "Comment can't be empty")
    .max(2000, "A comment can be at most 2,000 characters"),
});
