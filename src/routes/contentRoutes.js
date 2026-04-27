const express = require('express');
const router = express.Router();
const contentController = require('../controllers/contentController');
const broadcastController = require('../controllers/broadcastController');
const { authenticate, authorize } = require('../middlewares/auth');
const { handleUpload } = require('../middlewares/upload');
const rateLimit = require('express-rate-limit');

// Rate limiter for public broadcasting endpoint
const liveRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute
  max: 60,                    // 60 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down.',
  },
});

// ─── Public Routes ────────────────────────────────────────────────────────────

// GET /content/live/:teacherId  — students access live content
router.get('/live/:teacherId', liveRateLimit, broadcastController.getLiveContent);

// ─── Protected Routes ─────────────────────────────────────────────────────────

// POST /content/upload — teacher uploads content
router.post(
  '/upload',
  authenticate,
  authorize('teacher'),
  handleUpload,
  contentController.uploadContent
);

// GET /content/my — teacher views their own content
router.get(
  '/my',
  authenticate,
  authorize('teacher'),
  contentController.getMyContent
);

// GET /content — principal views all content
router.get(
  '/',
  authenticate,
  authorize('principal'),
  contentController.getAllContent
);

// GET /content/:id — principal or teacher views single item
router.get(
  '/:id',
  authenticate,
  authorize('principal', 'teacher'),
  contentController.getContentById
);

// PATCH /content/:id/approve — principal approves
router.patch(
  '/:id/approve',
  authenticate,
  authorize('principal'),
  contentController.approveContent
);

// PATCH /content/:id/reject — principal rejects
router.patch(
  '/:id/reject',
  authenticate,
  authorize('principal'),
  contentController.rejectContent
);

module.exports = router;
