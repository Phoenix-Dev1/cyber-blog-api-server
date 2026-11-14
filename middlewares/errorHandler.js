import mongoose from "mongoose";
import { HttpError } from "../lib/httpError.js";

// Response shape for errors. Today's client reads `{ message }` on the /auth routes and shows the bare body
// everywhere else (an object there would break its toasts), so the other routes keep sending a JSON string
// until the client reads `{ message }` everywhere (client PR C-1).
export const sendError = (req, res, status, message) =>
  res.status(status).json(req.originalUrl.startsWith("/auth/") ? { message } : message);

export const notFound = (req, res) => sendError(req, res, 404, "Not found");

// The details of unexpected errors go to the log only; the client gets a generic message.
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  let status = 500;
  let message = "Something went wrong. Please try again.";

  if (err instanceof HttpError) {
    ({ status, message } = err);
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = "Invalid id";
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = "Invalid data";
  } else if (err?.code === 11000) {
    status = 409;
    message = "Already exists";
  } else if (err?.type === "entity.too.large") {
    status = 413;
    message = "Request too large";
  } else if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 500) {
    // body parser errors (invalid JSON, wrong charset, …)
    status = err.status;
    message = "Bad request";
  }

  if (status >= 500) {
    // The path without the query: OAuth callbacks carry a one-time code there
    console.error(`${req.method} ${req.originalUrl.split("?")[0]} failed:`, err);
  }
  if (res.headersSent) return;
  sendError(req, res, status, message);
};
