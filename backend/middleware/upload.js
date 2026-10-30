const multer = require("multer");

// Store uploads in memory because images are streamed directly to Cloudinary instead of disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, WebP and HEIC images are allowed"));
  },
});

module.exports = upload;
