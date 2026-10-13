import { isUtf8 } from "node:buffer";
import type { FastifyInstance } from "fastify";

export const JSON_LIMITS = Object.freeze({ bytes: 65_536, depth: 16, nodes: 4096 });

/** Fixed errors only: neither parser text nor input values cross the boundary. */
export class RequestValidationError extends Error {
  constructor(readonly kind: "invalid_request" | "unsupported_media_type" = "invalid_request") {
    super(kind === "invalid_request" ? "Request is invalid." : "Content type or encoding is not supported.");
  }
}

function checkJson(value: unknown): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError();
  }
  // Walk iteratively so caller-controlled depth never becomes call-stack depth.
  // Depth counts containers, with the root object at depth one. Nodes count
  // every value, including containers and scalars, but not property names.
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 1 }];
  let nodes = 1;
  while (pending.length > 0) {
    const { value: current, depth } = pending.pop()!;
    if (typeof current === "number" && !Number.isFinite(current)) throw new RequestValidationError();
    if (current === null || typeof current !== "object") continue;
    if (depth > JSON_LIMITS.depth) throw new RequestValidationError();
    for (const [key, child] of Object.entries(current)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") throw new RequestValidationError();
      if (++nodes > JSON_LIMITS.nodes) throw new RequestValidationError();
      pending.push({ value: child, depth: depth + 1 });
    }
  }
}

/** Install after authentication and rate limiting, before any application routes. */
export function registerRequestValidation(app: FastifyInstance): void {
  app.addHook("onRequest", async (request) => {
    let contentTypes = 0;
    let contentEncodings = 0;
    for (let index = 0; index < request.raw.rawHeaders.length; index += 2) {
      const field = request.raw.rawHeaders[index]!.toLowerCase();
      if (field === "content-type") contentTypes++;
      if (field === "content-encoding") contentEncodings++;
    }
    if (contentTypes > 1 || contentEncodings > 1) throw new RequestValidationError();
    const encoding = request.headers["content-encoding"];
    if (encoding !== undefined && encoding.toLowerCase() !== "identity") {
      throw new RequestValidationError("unsupported_media_type");
    }
    const contentType = request.headers["content-type"];
    // Accept the JSON media type with an optional UTF-8 charset, including its
    // quoted form. Refuse additional/duplicate parameters instead of guessing.
    if (contentType !== undefined && !/^application\/json(?:[ \t]*;[ \t]*charset[ \t]*=[ \t]*(?:utf-8|"utf-8"))?[ \t]*$/iu.test(contentType)) {
      throw new RequestValidationError("unsupported_media_type");
    }
    if (contentType === undefined && (request.headers["transfer-encoding"] !== undefined
      || (request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0"))) {
      throw new RequestValidationError("unsupported_media_type");
    }
    // Fastify does not parse GET/HEAD/TRACE payloads. Refuse them so there
    // is no unchecked request body on probes or future read-only routes.
    if ((request.method === "GET" || request.method === "HEAD" || request.method === "TRACE")
      && (request.headers["transfer-encoding"] !== undefined
        || (request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0"))) {
      throw new RequestValidationError();
    }
  });
  app.removeAllContentTypeParsers();
  app.addContentTypeParser<Buffer>("application/json", { parseAs: "buffer" }, (_request, body, done) => {
    try {
      if (!isUtf8(body)) throw new RequestValidationError();
      const value: unknown = JSON.parse(body.toString("utf8"));
      checkJson(value);
      done(null, value);
    } catch {
      done(new RequestValidationError());
    }
  });
}
