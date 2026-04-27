const schedulingService = require('../services/schedulingService');
const { sendSuccess } = require('../utils/response');

/**
 * GET /content/live/:teacherId
 * Public endpoint — returns the currently active content for a teacher.
 * Optional query: ?subject=maths
 *
 * Edge cases handled:
 * - Teacher does not exist → "No content available"
 * - No approved content → "No content available"
 * - Approved but outside time window → "No content available"
 * - Invalid/nonexistent subject → "No content available" (not error)
 */
const getLiveContent = async (req, res, next) => {
  try {
    const { teacherId } = req.params;
    const { subject } = req.query;

    // Validate teacherId is numeric
    const parsedId = parseInt(teacherId);
    if (isNaN(parsedId) || parsedId <= 0) {
      return sendSuccess(
        res,
        { available: false, message: 'No content available.', items: [] },
        'No content available.'
      );
    }

    const result = await schedulingService.getLiveContent(parsedId, subject || null);

    return sendSuccess(res, result, result.available ? 'Live content fetched.' : 'No content available.');
  } catch (err) {
    next(err);
  }
};

module.exports = { getLiveContent };
