const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { generateToken } = require('../utils/jwt');

const register = async ({ name, email, password, role }) => {
  if (!name || !email || !password || !role) {
    const err = new Error('Name, email, password and role are required.');
    err.statusCode = 400;
    throw err;
  }

  if (!['principal', 'teacher'].includes(role)) {
    const err = new Error('Role must be either principal or teacher.');
    err.statusCode = 400;
    throw err;
  }

  const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  if (existing.rows.length > 0) {
    const err = new Error('Email already registered.');
    err.statusCode = 409;
    throw err;
  }

  const saltRounds = 10;
  const password_hash = await bcrypt.hash(password, saltRounds);

  const result = await query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role, created_at`,
    [name.trim(), email.toLowerCase().trim(), password_hash, role]
  );

  return result.rows[0];
};

const login = async ({ email, password }) => {
  if (!email || !password) {
    const err = new Error('Email and password are required.');
    err.statusCode = 400;
    throw err;
  }

  const result = await query(
    'SELECT id, name, email, password_hash, role FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );

  if (result.rows.length === 0) {
    const err = new Error('Invalid credentials.');
    err.statusCode = 401;
    throw err;
  }

  const user = result.rows[0];
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    const err = new Error('Invalid credentials.');
    err.statusCode = 401;
    throw err;
  }

  const token = generateToken({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
};

module.exports = { login, register };
