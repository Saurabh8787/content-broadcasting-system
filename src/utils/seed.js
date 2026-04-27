require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');

const seed = async () => {
  try {
    console.log('Seeding database...');

    const saltRounds = 10;

    // Create principal
    const principalHash = await bcrypt.hash('principal123', saltRounds);
    const principalResult = await query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, email, role
    `, ['Principal Admin', 'principal@school.com', principalHash, 'principal']);
    console.log('✓ Principal created:', principalResult.rows[0].email);

    // Create teachers
    const teachers = [
      { name: 'Teacher One', email: 'teacher1@school.com' },
      { name: 'Teacher Two', email: 'teacher2@school.com' },
      { name: 'Teacher Three', email: 'teacher3@school.com' },
    ];

    for (const t of teachers) {
      const hash = await bcrypt.hash('teacher123', saltRounds);
      const res = await query(`
        INSERT INTO users (name, email, password_hash, role)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
        RETURNING id, email, role
      `, [t.name, t.email, hash, 'teacher']);
      console.log('✓ Teacher created:', res.rows[0].email);
    }

    console.log('\n✅ Seed completed!');
    console.log('\nCredentials:');
    console.log('  Principal → principal@school.com / principal123');
    console.log('  Teacher 1 → teacher1@school.com / teacher123');
    console.log('  Teacher 2 → teacher2@school.com / teacher123');
    console.log('  Teacher 3 → teacher3@school.com / teacher123');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
};

seed();
