const contentService = require('../services/contentService');
const { sendSuccess, sendError, sendCreated } = require('../utils/response');

/**
 * POST /content/upload
 * Teacher uploads new content
 */
const uploadContent = async (req, res, next) => {
  try {
    const { title, description, subject, start_time, end_time, rotation_duration } = req.body;

    if (!req.file) {
      return sendError(res, 'File is required.', 400);
    }

    const content = await contentService.createContent({
      title,
      description,
      subject,
      file: req.file,
      teacherId: req.user.id,
      startTime: start_time,
      endTime: end_time,
      rotationDuration: rotation_duration,
    });

    return sendCreated(res, content, 'Content uploaded successfully. Pending approval.');
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    next(err);
  }
};

/**
 * GET /content
 * Principal: all content with optional filters
 */
const getAllContent = async (req, res, next) => {
  try {
    const { status, teacher_id, subject, page, limit } = req.query;
    const result = await contentService.getAllContent({ status, teacherId: teacher_id, subject, page, limit });
    return sendSuccess(res, result, 'Content fetched successfully.');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /content/my
 * Teacher: their own content
 */
const getMyContent = async (req, res, next) => {
  try {
    const { status, subject, page, limit } = req.query;
    const result = await contentService.getTeacherContent(req.user.id, { status, subject, page, limit });
    return sendSuccess(res, result, 'Your content fetched successfully.');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /content/:id
 * Get a single content item
 */
const getContentById = async (req, res, next) => {
  try {
    const content = await contentService.getContentById(req.params.id);

    // Teachers can only view their own content; principal can view all
    if (req.user.role === 'teacher' && content.uploaded_by !== req.user.id) {
      return sendError(res, 'Access denied.', 403);
    }

    return sendSuccess(res, content, 'Content fetched successfully.');
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    next(err);
  }
};

/**
 * PATCH /content/:id/approve
 * Principal approves content
 */
const approveContent = async (req, res, next) => {
  try {
    const content = await contentService.approveContent(req.params.id, req.user.id);
    return sendSuccess(res, content, 'Content approved successfully.');
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    next(err);
  }
};

/**
 * PATCH /content/:id/reject
 * Principal rejects content with a reason
 */
const rejectContent = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const content = await contentService.rejectContent(req.params.id, req.user.id, reason);
    return sendSuccess(res, content, 'Content rejected.');
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    next(err);
  }
};

module.exports = {
  uploadContent,
  getAllContent,
  getMyContent,
  getContentById,
  approveContent,
  rejectContent,
};
