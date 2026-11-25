import { ApiError } from '../utils/ApiError.js';

/** validate({ body, query, params }) - parsed values are placed on req.valid */
export const validate = (schemas) => (req, res, next) => {
  req.valid = {};
  for (const [part, schema] of Object.entries(schemas)) {
    const result = schema.safeParse(req[part] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      throw ApiError.badRequest(details[0].message, 'VALIDATION', details);
    }
    req.valid[part] = result.data;
  }
  next();
};
