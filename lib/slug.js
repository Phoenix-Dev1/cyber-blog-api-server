import Post from "../models/post.model.js";

// Client routes that a post slug must not shadow ("/:slug" comes last in the client's router)
const RESERVED = new Set(["about", "contact", "posts", "write", "edit", "settings", "login", "register"]);

// "Hello, World? #1 / 100%" → "hello-world-1-100". Letters of any language and digits are kept; everything
// else becomes "-", so a slug never breaks a URL and never starts with "@" (that's a profile link).
export const slugify = (title) => {
  const slug = String(title ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return slug || "post";
};

// "title", then "title-2", "title-3", … (existing slugs never change)
export const uniqueSlug = async (title) => {
  const base = slugify(title);
  const isTaken = async (slug) => RESERVED.has(slug) || Boolean(await Post.exists({ slug }));

  let slug = base;
  for (let n = 2; await isTaken(slug); n++) {
    slug = `${base}-${n}`;
  }
  return slug;
};
