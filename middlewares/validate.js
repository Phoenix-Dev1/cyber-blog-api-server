import { httpError } from "../lib/httpError.js";

export const firstIssue = (error) => {
  const issue = error.issues[0];
  return issue?.message || "Invalid request";
};

// Checks the request against zod schemas: { params, query, body }. Parsed values replace req.params and
// req.body (unknown fields are dropped). req.query is read-only in Express 5, so the parsed query is
// req.valid.query.
export const validate = (schemas) => (req, res, next) => {
  req.valid = {};
  for (const part of ["params", "query", "body"]) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (!result.success) {
      throw httpError(400, firstIssue(result.error));
    }
    req.valid[part] = result.data;
    if (part !== "query") req[part] = result.data;
  }
  next();
};
