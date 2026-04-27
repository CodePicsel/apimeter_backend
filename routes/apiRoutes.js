const express = require("express");
const {
  createApiKey,
  listApiKeys,
  updateApiKey,
  revokeApiKey,
  meteredPing,
  proxyRequest,
} = require("../controllers/apiController");
const { protect } = require("../middleware/authMiddleware");
const { validateApiKey } = require("../middleware/apiKeyMiddleware");
const { meterRequest } = require("../middleware/meterMiddleware");

const router = express.Router();

router.get("/keys", protect, listApiKeys);
router.post("/keys", protect, createApiKey);
router.patch("/keys/:id", protect, updateApiKey);
router.delete("/keys/:id", protect, revokeApiKey);

router.get("/metered/ping", validateApiKey, meterRequest, meteredPing);
router.all("/proxy{/*proxyPath}", validateApiKey, proxyRequest);

module.exports = router;
