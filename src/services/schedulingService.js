const { query } = require('../config/database');

/**
 * Core Scheduling Logic:
 *
 * For a given teacher, we fetch all their approved content that has a valid
 * time window and where NOW() falls within [start_time, end_time].
 *
 * Content is grouped by subject. Within each subject, items are ordered by
 * rotation_order. The system uses the current time and each item's duration
 * to determine which item is "active" — similar to a round-robin clock:
 *
 *   epoch = some fixed reference (we use the slot's created_at as anchor)
 *   total_cycle = sum of all durations in the slot (in seconds)
 *   position = (now - epoch) % total_cycle
 *
 *   We walk through items in rotation_order and find which item the position falls in.
 *
 * If subject is provided, returns only that subject's active item.
 * Otherwise returns one active item per subject.
 */
const getLiveContent = async (teacherId, subject = null) => {
  // Validate teacher exists
  const teacherCheck = await query(
    'SELECT id, name FROM users WHERE id = $1 AND role = $2',
    [teacherId, 'teacher']
  );

  if (teacherCheck.rows.length === 0) {
    return { available: false, message: 'Teacher not found.', items: [] };
  }

  const now = new Date();

  // Build query for approved, time-active content
  let subjectClause = '';
  const params = [teacherId, now, now];

  if (subject) {
    subjectClause = `AND c.subject = $4`;
    params.push(subject.toLowerCase().trim());
  }

  const result = await query(
    `SELECT
       c.id, c.title, c.description, c.subject, c.file_url, c.file_type,
       c.start_time, c.end_time, c.rotation_duration,
       cs.id AS slot_id, cs.created_at AS slot_created_at,
       csc.rotation_order, csc.duration
     FROM content c
     JOIN content_slots cs ON cs.teacher_id = c.uploaded_by AND cs.subject = c.subject
     JOIN content_schedule csc ON csc.content_id = c.id AND csc.slot_id = cs.id
     WHERE c.uploaded_by = $1
       AND c.status = 'approved'
       AND c.start_time IS NOT NULL
       AND c.end_time IS NOT NULL
       AND c.start_time <= $2
       AND c.end_time >= $3
       ${subjectClause}
     ORDER BY c.subject, csc.rotation_order ASC`,
    params
  );

  if (result.rows.length === 0) {
    return { available: false, message: 'No content available.', items: [] };
  }

  // Group by subject → slot
  const subjectMap = {};
  for (const row of result.rows) {
    if (!subjectMap[row.subject]) {
      subjectMap[row.subject] = {
        slotId: row.slot_id,
        slotCreatedAt: row.slot_created_at,
        items: [],
      };
    }
    subjectMap[row.subject].items.push(row);
  }

  const activeItems = [];

  for (const [subj, slot] of Object.entries(subjectMap)) {
    const activeItem = determineActiveItem(slot.items, slot.slotCreatedAt, now);
    if (activeItem) {
      activeItems.push({
        subject: subj,
        id: activeItem.id,
        title: activeItem.title,
        description: activeItem.description,
        file_url: activeItem.file_url,
        file_type: activeItem.file_type,
        start_time: activeItem.start_time,
        end_time: activeItem.end_time,
        rotation_duration_minutes: activeItem.duration,
      });
    }
  }

  if (activeItems.length === 0) {
    return { available: false, message: 'No content available.', items: [] };
  }

  return {
    available: true,
    teacher: teacherCheck.rows[0].name,
    items: activeItems,
    retrieved_at: now.toISOString(),
  };
};

/**
 * Determines which content item is currently active in the rotation.
 *
 * Uses a fixed epoch (slot creation time) to calculate a deterministic,
 * loop-based rotation position based on current time.
 *
 * @param {Array} items - Sorted by rotation_order ascending
 * @param {Date} epochDate - The slot's created_at timestamp (rotation anchor)
 * @param {Date} now - Current timestamp
 * @returns {Object|null} The currently active content item, or null
 */
const determineActiveItem = (items, epochDate, now) => {
  if (!items || items.length === 0) return null;

  // Convert durations to seconds
  const itemsWithSeconds = items.map((item) => ({
    ...item,
    durationSeconds: (item.duration || 5) * 60,
  }));

  // Total cycle length in seconds
  const totalCycle = itemsWithSeconds.reduce((sum, item) => sum + item.durationSeconds, 0);

  if (totalCycle <= 0) return items[0]; // Fallback: return first item

  // Seconds elapsed since the slot was created (modulo total cycle for looping)
  const epoch = new Date(epochDate);
  const elapsedSeconds = Math.floor((now - epoch) / 1000);

  // Position within the current cycle
  const positionInCycle = ((elapsedSeconds % totalCycle) + totalCycle) % totalCycle;

  // Walk through items to find which one owns this position
  let cursor = 0;
  for (const item of itemsWithSeconds) {
    if (positionInCycle >= cursor && positionInCycle < cursor + item.durationSeconds) {
      return item;
    }
    cursor += item.durationSeconds;
  }

  // Fallback (should not reach here)
  return items[0];
};

module.exports = { getLiveContent };
