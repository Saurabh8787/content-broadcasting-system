require('dotenv').config();
const { query } = require('../config/database');

const createTables = async () => {
  try {
    console.log('Running migrations...');

    // Users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('principal', 'teacher')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ users table');

    // Content table
    await query(`
      CREATE TABLE IF NOT EXISTS content (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        subject VARCHAR(100) NOT NULL,
        file_url VARCHAR(500) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        file_size INTEGER NOT NULL,
        uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        rejection_reason TEXT,
        approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        approved_at TIMESTAMPTZ,
        start_time TIMESTAMPTZ,
        end_time TIMESTAMPTZ,
        rotation_duration INTEGER DEFAULT 5,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ content table');

    // Content slots (subject-based groupings per teacher)
    await query(`
      CREATE TABLE IF NOT EXISTS content_slots (
        id SERIAL PRIMARY KEY,
        teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(teacher_id, subject)
      );
    `);
    console.log('✓ content_slots table');

    // Content schedule
    await query(`
      CREATE TABLE IF NOT EXISTS content_schedule (
        id SERIAL PRIMARY KEY,
        content_id INTEGER NOT NULL REFERENCES content(id) ON DELETE CASCADE,
        slot_id INTEGER NOT NULL REFERENCES content_slots(id) ON DELETE CASCADE,
        rotation_order INTEGER NOT NULL DEFAULT 0,
        duration INTEGER NOT NULL DEFAULT 5,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ content_schedule table');

    // Indexes for performance
    await query(`CREATE INDEX IF NOT EXISTS idx_content_teacher ON content(uploaded_by);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_content_status ON content(status);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_content_subject ON content(subject);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_content_times ON content(start_time, end_time);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_schedule_slot ON content_schedule(slot_id, rotation_order);`);
    console.log('✓ indexes created');

    console.log('\n✅ All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

createTables();
