const { z } = require("zod");
const ApiKey = require("../models/ApiKey");
const { writeRequestLog } = require("../middleware/meterMiddleware");

const urlSchema = z
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "targetBaseUrl must be an HTTP or HTTPS URL",
  });

const createKeySchema = z.object({
  name: z.string().trim().min(2).max(80),
  targetBaseUrl: urlSchema,
  monthlyLimit: z.number().int().positive().max(10000000).optional(),
});

const updateKeySchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  targetBaseUrl: urlSchema.optional(),
  monthlyLimit: z.number().int().positive().max(10000000).optional(),
});

const hopByHopHeaders = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const normalizeBaseUrl = (value) => value.replace(/\/+$/, "");

const getProxyPath = (req) => {
  const rawPath = req.params.proxyPath;

  if (Array.isArray(rawPath)) {
    return rawPath.join("/");
  }

  return rawPath || "";
};

const buildUpstreamUrl = (targetBaseUrl, proxyPath, queryString) => {
  const baseUrl = normalizeBaseUrl(targetBaseUrl);
  const cleanPath = proxyPath.replace(/^\/+/, "");
  return `${baseUrl}${cleanPath ? `/${cleanPath}` : ""}${queryString ? `?${queryString}` : ""}`;
};

const getProxyBody = (req) => {
  if (["GET", "HEAD"].includes(req.method)) {
    return { body: undefined, requestSize: 0, contentType: undefined };
  }

  if (Buffer.isBuffer(req.body)) {
    return {
      body: req.body,
      requestSize: req.body.length,
      contentType: req.get("content-type"),
    };
  }

  if (typeof req.body === "string") {
    return {
      body: req.body,
      requestSize: Buffer.byteLength(req.body),
      contentType: req.get("content-type") || "text/plain",
    };
  }

  if (req.body && Object.keys(req.body).length > 0) {
    if ((req.get("content-type") || "").includes("application/x-www-form-urlencoded")) {
      const body = new URLSearchParams(req.body).toString();
      return {
        body,
        requestSize: Buffer.byteLength(body),
        contentType: req.get("content-type"),
      };
    }

    const body = JSON.stringify(req.body);
    return {
      body,
      requestSize: Buffer.byteLength(body),
      contentType: req.get("content-type") || "application/json",
    };
  }

  return { body: undefined, requestSize: Number(req.get("content-length") || 0), contentType: undefined };
};

const getForwardHeaders = (req, contentType) => {
  const headers = {};

  for (const [key, value] of Object.entries(req.headers)) {
    const lowerKey = key.toLowerCase();

    if (hopByHopHeaders.has(lowerKey) || lowerKey === "x-api-key") {
      continue;
    }

    headers[key] = value;
  }

  if (contentType) {
    headers["content-type"] = contentType;
  }

  headers["accept-encoding"] = "identity";
  headers["x-apimeter-forwarded-for"] = req.ip;
  return headers;
};

const sendProxyResponse = (res, upstreamResponse, responseBuffer) => {
  upstreamResponse.headers.forEach((value, key) => {
    if (!hopByHopHeaders.has(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  });

  res.setHeader("x-apimeter-tracked", "true");
  res.status(upstreamResponse.status).send(responseBuffer);
};

const createApiKey = async (req, res, next) => {
  try {
    const payload = createKeySchema.parse(req.body);
    const rawKey = ApiKey.generateRawKey();

    const apiKey = await ApiKey.create({
      user: req.user._id,
      name: payload.name,
      monthlyLimit: payload.monthlyLimit,
      targetBaseUrl: normalizeBaseUrl(payload.targetBaseUrl),
      keyHash: ApiKey.hashKey(rawKey),
      keyPreview: ApiKey.previewKey(rawKey),
    });

    res.status(201).json({
      success: true,
      message: "Store this key now. It will not be shown again.",
      data: { apiKey, key: rawKey },
    });
  } catch (error) {
    next(error);
  }
};

const listApiKeys = async (req, res, next) => {
  try {
    const apiKeys = await ApiKey.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, count: apiKeys.length, data: { apiKeys } });
  } catch (error) {
    next(error);
  }
};

const updateApiKey = async (req, res, next) => {
  try {
    const payload = updateKeySchema.parse(req.body);
    const apiKey = await ApiKey.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: payload },
      { new: true, runValidators: true }
    );

    if (!apiKey) {
      return res.status(404).json({ success: false, message: "API key not found" });
    }

    return res.json({ success: true, data: { apiKey } });
  } catch (error) {
    return next(error);
  }
};

const revokeApiKey = async (req, res, next) => {
  try {
    const apiKey = await ApiKey.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: { status: "revoked", revokedAt: new Date() } },
      { new: true }
    );

    if (!apiKey) {
      return res.status(404).json({ success: false, message: "API key not found" });
    }

    return res.json({ success: true, data: { apiKey } });
  } catch (error) {
    return next(error);
  }
};

const meteredPing = (req, res) => {
  res.json({
    success: true,
    message: "Metered request accepted",
    data: {
      apiKey: req.apiKey.keyPreview,
      owner: req.meteredUser.email,
      timestamp: new Date().toISOString(),
    },
  });
};

const proxyRequest = async (req, res, next) => {
  if (!req.apiKey.targetBaseUrl) {
    return res.status(400).json({
      success: false,
      message: "This API key does not have a targetBaseUrl. Create a new key with targetBaseUrl.",
    });
  }

  const startedAt = process.hrtime.bigint();
  const proxyPath = getProxyPath(req);
  const queryString = req.originalUrl.split("?")[1] || "";
  const upstreamUrl = buildUpstreamUrl(req.apiKey.targetBaseUrl, proxyPath, queryString);
  const upstreamPath = `/${proxyPath}`.replace(/\/+$/, "") || "/";
  const { body, requestSize, contentType } = getProxyBody(req);
  const controller = new AbortController();
  const timeoutMs = Number(process.env.PROXY_TIMEOUT_MS || 30000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstreamStartedAt = process.hrtime.bigint();
    const upstreamResponse = await fetch(upstreamUrl, {
      method: req.method,
      headers: getForwardHeaders(req, contentType),
      body,
      signal: controller.signal,
      redirect: "manual",
    });
    const responseArrayBuffer = await upstreamResponse.arrayBuffer();
    const responseBuffer = Buffer.from(responseArrayBuffer);
    const upstreamResponseTimeMs = Number(process.hrtime.bigint() - upstreamStartedAt) / 1000000;
    const responseTimeMs = Number(process.hrtime.bigint() - startedAt) / 1000000;

    await writeRequestLog({
      req,
      statusCode: upstreamResponse.status,
      responseTimeMs,
      requestSize,
      responseSize: responseBuffer.length,
      upstream: {
        url: upstreamUrl,
        path: upstreamPath,
        statusCode: upstreamResponse.status,
        responseTimeMs: upstreamResponseTimeMs,
      },
    });

    return sendProxyResponse(res, upstreamResponse, responseBuffer);
  } catch (error) {
    const responseTimeMs = Number(process.hrtime.bigint() - startedAt) / 1000000;
    const message = error.name === "AbortError" ? "Upstream request timed out" : error.message;

    try {
      await writeRequestLog({
        req,
        statusCode: error.name === "AbortError" ? 504 : 502,
        responseTimeMs,
        requestSize,
        responseSize: Buffer.byteLength(message),
        upstream: {
          url: upstreamUrl,
          path: upstreamPath,
        },
        errorMessage: message,
      });
    } catch (logError) {
      console.error("Failed to write proxy error log", logError);
    }

    return res.status(error.name === "AbortError" ? 504 : 502).json({
      success: false,
      message,
      upstreamUrl,
    });
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = {
  createApiKey,
  listApiKeys,
  updateApiKey,
  revokeApiKey,
  meteredPing,
  proxyRequest,
};
