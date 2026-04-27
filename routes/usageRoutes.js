const express = require("express");
const { getRequestLogs, getUsageSummary } = require("../controllers/usageController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/summary", protect, getUsageSummary);
router.get("/logs", protect, getRequestLogs);

module.exports = router;
