const errorHandler = (err, req, res, next) => {
  console.error('Unhandled error:', err);

  // Postgres errors
  if (err.code === '23505') {
    return res.status(409).json({ success: false, message: 'Duplicate entry. Resource already exists.' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ success: false, message: 'Referenced resource does not exist.' });
  }
  if (err.code === '22P02') {
    return res.status(400).json({ success: false, message: 'Invalid data format.' });
  }

  const statusCode = err.statusCode || err.status || 500;
  const message =
    process.env.NODE_ENV === 'production'
      ? 'An internal server error occurred.'
      : err.message || 'An internal server error occurred.';

  return res.status(statusCode).json({ success: false, message });
};

module.exports = { errorHandler };
