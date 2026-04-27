const ApiKey = require("../models/ApiKey");
const RequestLog = require("../models/RequestLog");

const writeRequestLog = async ({
  req,
  statusCode,
  responseTimeMs,
  requestSize,
  responseSize,
  upstream,
  errorMessage,
}) => {
  if (!req.apiKey || !req.meteredUser) return;

  await Promise.all([
    RequestLog.create({
      user: req.meteredUser._id,
      apiKey: req.apiKey._id,
      method: req.method,
      path: req.originalUrl,
      targetBaseUrl: req.apiKey.targetBaseUrl,
      upstreamUrl: upstream?.url,
      upstreamPath: upstream?.path,
      statusCode,
      upstreamStatusCode: upstream?.statusCode,
      responseTimeMs: Math.round(responseTimeMs),
      upstreamResponseTimeMs: upstream?.responseTimeMs
        ? Math.round(upstream.responseTimeMs)
        : undefined,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      contentType: req.get("content-type"),
      errorMessage,
      requestSize: requestSize || Number(req.get("content-length") || 0),
      responseSize: responseSize || 0,
    }),
    ApiKey.findByIdAndUpdate(req.apiKey._id, {
      $inc: { totalRequests: 1 },
      $set: { lastUsedAt: new Date() },
    }),
  ]);
};

const meterRequest = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  const originalSend = res.send;

  res.send = function sendWithMetering(body) {
    res.locals.responseSize = Buffer.byteLength(body ? String(body) : "");
    return originalSend.call(this, body);
  };

  res.on("finish", async () => {
    if (!req.apiKey || !req.meteredUser) return;

    const endedAt = process.hrtime.bigint();
    const responseTimeMs = Number(endedAt - startedAt) / 1000000;

    try {
      await writeRequestLog({
        req,
        statusCode: res.statusCode,
        responseTimeMs,
        responseSize: res.locals.responseSize || Number(res.get("content-length") || 0),
      });
    } catch (error) {
      console.error("Failed to write request meter log", error);
    }
  });

  next();
};

module.exports = { meterRequest, writeRequestLog };
