const cloudinary = require('cloudinary').v2;

// Reads CLOUDINARY_URL automatically; the three separate variables work too.
if (process.env.CLOUDINARY_CLOUD_NAME) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
}
cloudinary.config({ secure: true });

const FOLDER = process.env.CLOUDINARY_FOLDER || 'kabahs-blog';

function isConfigured() {
    const { cloud_name, api_key, api_secret } = cloudinary.config();
    return Boolean(cloud_name && api_key && api_secret);
}

// Uploads an image buffer. Resolves with what we store in the File table.
function uploadImage(buffer, { filename, mimetype } = {}) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: FOLDER, resource_type: 'image' },
            (error, result) => {
                if (error) return reject(error);
                resolve({
                    publicId: result.public_id,
                    // Delivered resized and in the best format for each browser, not the raw upload.
                    url: cloudinary.url(result.public_id, {
                        secure: true,
                        urlAnalytics: false,
                        version: result.version,
                        transformation: [
                            { width: 1600, crop: 'limit' },
                            { fetch_format: 'auto', quality: 'auto' },
                        ],
                    }),
                    storedName: `${result.public_id}.${result.format}`,
                    name: filename || `${result.public_id}.${result.format}`,
                    size: result.bytes,
                    type: mimetype || `image/${result.format}`,
                });
            },
        );
        stream.end(buffer);
    });
}

// Copies an image from a public URL into Cloudinary under a fixed public ID (re-running overwrites it).
async function uploadFromUrl(sourceUrl, { publicId }) {
    const result = await cloudinary.uploader.upload(sourceUrl, {
        folder: FOLDER,
        public_id: publicId,
        overwrite: true,
        resource_type: 'image',
    });
    return {
        publicId: result.public_id,
        url: cloudinary.url(result.public_id, {
            secure: true,
            urlAnalytics: false,
            version: result.version,
            transformation: [
                { width: 1600, crop: 'limit' },
                { fetch_format: 'auto', quality: 'auto' },
            ],
        }),
        storedName: `${result.public_id}.${result.format}`,
        size: result.bytes,
        type: result.format === 'jpg' ? 'image/jpeg' : `image/${result.format}`,
    };
}

// Best effort: a failed delete leaves an unused image in Cloudinary but must not fail the request.
async function deleteImages(publicIds) {
    for (const id of publicIds.filter(Boolean)) {
        try {
            await cloudinary.uploader.destroy(id, { resource_type: 'image' });
        } catch (error) {
            console.error(`Could not delete Cloudinary image ${id}:`, error.message || error);
        }
    }
}

module.exports = { isConfigured, uploadImage, uploadFromUrl, deleteImages, FOLDER };
