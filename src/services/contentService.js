const path = require('path');
const { query } = require('../config/database');

/**
 * Create a new content record after file upload.
 */
const createContent = async ({ title, description, subject, file, teacherId, startTime, endTime, rotationDuration }) => {
  if (!title || !title.trim()) {
    const err = new Error('Title is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!subject || !subject.trim()) {
    const err = new Error('Subject is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!file) {
    const err = new Error('File is required.');
    err.statusCode = 400;
    throw err;
  }

  // Validate time window if provided
  if (startTime && endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      const err = new Error('Invalid start_time or end_time format. Use ISO 8601.');
      err.statusCode = 400;
      throw err;
    }
    if (start >= end) {
      const err = new Error('start_time must be before end_time.');
      err.statusCode = 400;
      throw err;
    }
  }

  const normalizedSubject = subject.trim().toLowerCase();
  const duration = parseInt(rotationDuration) || 5;
  const fileUrl = file.supabaseUrl || `/uploads/${file.filename}`;

  // Insert content
  const result = await query(
    `INSERT INTO content
      (title, description, subject, file_url, file_path, file_type, file_size,
       uploaded_by, status, start_time, end_time, rotation_duration)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, $11)
     RETURNING id, title, subject, status, file_url, start_time, end_time, rotation_duration, created_at`,
    [
      title.trim(),
      description?.trim() || null,
      normalizedSubject,
      fileUrl,
      file.path,
      file.mimetype,
      file.size,
      teacherId,
      startTime || null,
      endTime || null,
      duration,
    ]
  );

  const content = result.rows[0];

  // Upsert content slot for this teacher+subject combination
  const slotResult = await query(
    `INSERT INTO content_slots (teacher_id, subject)
     VALUES ($1, $2)
     ON CONFLICT (teacher_id, subject) DO UPDATE SET subject = EXCLUDED.subject
     RETURNING id`,
    [teacherId, normalizedSubject]
  );

  const slotId = slotResult.rows[0].id;

  // Get next rotation order for this slot
  const orderResult = await query(
    `SELECT COALESCE(MAX(rotation_order), -1) + 1 AS next_order FROM content_schedule WHERE slot_id = $1`,
    [slotId]
  );
  const nextOrder = orderResult.rows[0].next_order;

  await query(
    `INSERT INTO content_schedule (content_id, slot_id, rotation_order, duration)
     VALUES ($1, $2, $3, $4)`,
    [content.id, slotId, nextOrder, duration]
  );

  return content;
};

/**
 * Get all content (with filters). Used by principal to see everything.
 */
const getAllContent = async ({ status, teacherId, subject, page = 1, limit = 20 } = {}) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (status) {
    conditions.push(`c.status = $${idx++}`);
    params.push(status);
  }
  if (teacherId) {
    conditions.push(`c.uploaded_by = $${idx++}`);
    params.push(teacherId);
  }
  if (subject) {
    conditions.push(`c.subject = $${idx++}`);
    params.push(subject.toLowerCase().trim());
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const result = await query(
    `SELECT
       c.id, c.title, c.description, c.subject, c.file_url, c.file_type, c.file_size,
       c.status, c.rejection_reason, c.start_time, c.end_time, c.rotation_duration, c.created_at,
       u.name AS teacher_name, u.email AS teacher_email,
       ap.name AS approved_by_name,
       c.approved_at
     FROM content c
     JOIN users u ON c.uploaded_by = u.id
     LEFT JOIN users ap ON c.approved_by = ap.id
     ${where}
     ORDER BY c.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) FROM content c ${where}`,
    params
  );

  return {
    content: result.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: parseInt(countResult.rows[0].count),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
    },
  };
};

/**
 * Get content uploaded by a specific teacher.
 */
const getTeacherContent = async (teacherId, { status, subject, page = 1, limit = 20 } = {}) => {
  return getAllContent({ teacherId, status, subject, page, limit });
};

/**
 * Get a single content item by ID.
 */
const getContentById = async (contentId) => {
  const result = await query(
    `SELECT
       c.*, u.name AS teacher_name, u.email AS teacher_email,
       ap.name AS approved_by_name
     FROM content c
     JOIN users u ON c.uploaded_by = u.id
     LEFT JOIN users ap ON c.approved_by = ap.id
     WHERE c.id = $1`,
    [contentId]
  );

  if (result.rows.length === 0) {
    const err = new Error('Content not found.');
    err.statusCode = 404;
    throw err;
  }

  return result.rows[0];
};

/**
 * Approve content - only callable by principal.
 */
const approveContent = async (contentId, principalId) => {
  const result = await query(
    `UPDATE content
     SET status = 'approved', approved_by = $1, approved_at = NOW(), rejection_reason = NULL
     WHERE id = $2 AND status = 'pending'
     RETURNING id, title, status, approved_at`,
    [principalId, contentId]
  );

  if (result.rows.length === 0) {
    // Check if content exists at all
    const check = await query('SELECT id, status FROM content WHERE id = $1', [contentId]);
    if (check.rows.length === 0) {
      const err = new Error('Content not found.');
      err.statusCode = 404;
      throw err;
    }
    const err = new Error(`Content is already in '${check.rows[0].status}' state and cannot be approved.`);
    err.statusCode = 400;
    throw err;
  }

  return result.rows[0];
};

/**
 * Reject content - only callable by principal.
 */
const rejectContent = async (contentId, principalId, reason) => {
  if (!reason || !reason.trim()) {
    const err = new Error('Rejection reason is required.');
    err.statusCode = 400;
    throw err;
  }

  const result = await query(
    `UPDATE content
     SET status = 'rejected', approved_by = $1, approved_at = NOW(), rejection_reason = $2
     WHERE id = $3 AND status = 'pending'
     RETURNING id, title, status, rejection_reason`,
    [principalId, reason.trim(), contentId]
  );

  if (result.rows.length === 0) {
    const check = await query('SELECT id, status FROM content WHERE id = $1', [contentId]);
    if (check.rows.length === 0) {
      const err = new Error('Content not found.');
      err.statusCode = 404;
      throw err;
    }
    const err = new Error(`Content is already in '${check.rows[0].status}' state and cannot be rejected.`);
    err.statusCode = 400;
    throw err;
  }

  return result.rows[0];
};

module.exports = {
  createContent,
  getAllContent,
  getTeacherContent,
  getContentById,
  approveContent,
  rejectContent,
};
