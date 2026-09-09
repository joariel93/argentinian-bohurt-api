const cloudinary = require('cloudinary').v2;
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const uploadController = {
  uploadImage: [
    upload.single('image'),
    async (req, res) => {
      try {
        if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
          return res.status(500).json({ error: 'Cloudinary no está configurado' });
        }

        if (!req.file) {
          return res.status(400).json({ error: 'No se recibió ninguna imagen' });
        }

        const folder = process.env.CLOUDINARY_FOLDER || 'buhurt-argentina';
        const uploadOptions = {
          folder,
          resource_type: 'image',
          transformation: [{ width: 1200, height: 1200, crop: 'limit' }],
        };

        const streamUpload = (buffer) => {
          return new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
              if (error) return reject(error);
              resolve(result);
            });
            stream.end(buffer);
          });
        };

        const result = await streamUpload(req.file.buffer);

        res.json({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
        });
      } catch (error) {
        console.error('Error subiendo imagen a Cloudinary:', error);
        res.status(500).json({ error: 'Error al subir la imagen' });
      }
    },
  ],
};

module.exports = uploadController;
