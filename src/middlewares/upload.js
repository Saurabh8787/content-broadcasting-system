const multer = require('multer');
const path = require('path');
const fs = require('fs');
const supabase = require('../config/supabase');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif'];
const MAX_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB) || 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const BUCKET_NAME = process.env.SUPABASE_BUCKET || 'content-uploads';

// Local disk storage (temp — file is read then uploaded to Supabase)
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype) || !ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(
      new multer.MulterError(
        'LIMIT_UNEXPECTED_FILE',
        'Invalid file type. Only JPG, PNG, and GIF are allowed.'
      ),
      false
    );
  }
  cb(null, true);
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `content-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES, files: 1 },
});

/**
 * Upload file to Supabase Storage and return the public URL.
 * Deletes the local temp file afterwards.
 */
const uploadToSupabase = async (file) => {
  const fileBuffer = fs.readFileSync(file.path);

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(file.filename, fileBuffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  // Always clean up local temp file
  fs.unlink(file.path, () => {});

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(file.filename);

  return urlData.publicUrl;
};

/**
 * Main upload middleware:
 * 1. multer saves file to local disk (temp)
 * 2. File is streamed to Supabase Storage
 * 3. Public URL is attached to req.file.supabaseUrl
 * 4. Local temp file is deleted
 */
const handleUpload = (req, res, next) => {
  const uploader = upload.single('file');

  uploader(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: `File too large. Maximum allowed size is ${MAX_SIZE_MB}MB.`,
        });
      }
      return res.status(400).json({ success: false, message: err.message || 'File upload error.' });
    }
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'Unknown upload error.' });
    }
    if (!req.file) return next();

    try {
      const publicUrl = await uploadToSupabase(req.file);
      req.file.supabaseUrl = publicUrl;
      next();
    } catch (uploadErr) {
      return res.status(500).json({ success: false, message: uploadErr.message });
    }
  });
};

module.exports = { handleUpload, BUCKET_NAME, MAX_SIZE_MB };
