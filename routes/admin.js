// Admin API: everything here is mounted behind the ADMIN-only JWT check in index.js.
const express = require('express');
const multer = require('multer');
const { body, param, query, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const images = require('../lib/cloudinary');

const router = express.Router();

const postInclude = { categories: true, tags: true, files: true };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
// "admin" would clash with /api/v1/admin/... on the public /api/v1/:category/posts route.
const RESERVED_CATEGORY_NAMES = ['admin'];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
        if (IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
        const error = new Error('Upload a JPEG, PNG, WebP, GIF or AVIF image');
        error.status = 400;
        cb(error);
    },
});

// Sends 400 with every validation message, or continues.
function validate(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
    }
    next();
}

// Wraps async handlers so thrown errors reach the error handler below.
const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function findPost(id) {
    return prisma.post.findUnique({ where: { id }, include: postInclude });
}

// Turns tag names into tag ids, creating tags that don't exist yet.
async function tagIds(names) {
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    const ids = [];
    for (const name of unique) {
        const tag = await prisma.tag.upsert({ where: { name }, update: {}, create: { name } });
        ids.push(tag.id);
    }
    return ids;
}

const postRules = (isCreate) => [
    (isCreate ? body('title').exists({ values: 'falsy' }).withMessage('Give the post a title') : body('title').optional())
        .isString().trim()
        .isLength({ min: 1, max: 200 }).withMessage('Titles can be up to 200 characters'),
    body('content').optional().isString().isLength({ max: 100000 }).withMessage('The post is too long (100,000 characters at most)'),
    body('published').optional().isBoolean().withMessage('published must be true or false').toBoolean(),
    body('categoryId').optional({ values: 'null' }).isString().withMessage('categoryId must be a string'),
    body('tags').optional().isArray({ max: 10 }).withMessage('Up to 10 tags'),
    body('tags.*').isString().trim().isLength({ min: 1, max: 30 }).withMessage('Tags can be up to 30 characters'),
];

// Builds the Prisma data for a create or update, checking the rules that span several fields.
async function postData(req, existing) {
    const b = req.body;
    const title = b.title ?? existing?.title ?? '';
    const content = b.content ?? existing?.content ?? '';
    const published = b.published ?? existing?.published ?? false;

    if (published && !content.trim()) {
        return { error: 'Write some text before publishing' };
    }

    const data = {};
    if (b.title !== undefined) data.title = title;
    if (b.content !== undefined) data.content = content;
    if (b.published !== undefined) data.published = published;
    // A post's date is when it went live: publishing a draft moves it to the top of the blog.
    if (published && !existing?.published) data.date = new Date();

    if (b.categoryId !== undefined) {
        if (b.categoryId) {
            const category = await prisma.category.findUnique({ where: { id: b.categoryId } });
            if (!category) return { error: 'That category no longer exists' };
            data.categories = { set: [{ id: category.id }] };
        } else {
            data.categories = { set: [] };
        }
    }
    if (b.tags !== undefined) {
        data.tags = { set: (await tagIds(b.tags)).map((id) => ({ id })) };
    }
    return { data };
}

// ---- Posts

router.get(
    '/posts',
    query('status').optional().isIn(['all', 'published', 'draft']),
    query('search').optional().isString(),
    validate,
    handle(async (req, res) => {
        const where = {};
        if (req.query.status === 'published') where.published = true;
        if (req.query.status === 'draft') where.published = false;
        if (req.query.search) where.title = { contains: req.query.search.trim(), mode: 'insensitive' };
        const posts = await prisma.post.findMany({ where, orderBy: { date: 'desc' }, include: postInclude });
        res.json(posts);
    }),
);

router.get(
    '/posts/:id',
    handle(async (req, res) => {
        const post = await findPost(req.params.id);
        if (!post) return res.status(404).json({ message: 'Post not found' });
        res.json(post);
    }),
);

router.post(
    '/posts',
    postRules(true),
    validate,
    handle(async (req, res) => {
        const { data, error } = await postData(req, null);
        if (error) return res.status(400).json({ message: error });
        const post = await prisma.post.create({
            data: {
                ...data,
                title: data.title,
                content: data.content ?? '',
                // create can't use "set", so turn those into "connect"
                categories: data.categories ? { connect: data.categories.set } : undefined,
                tags: data.tags ? { connect: data.tags.set } : undefined,
                author: { connect: { id: req.user.id } },
            },
            include: postInclude,
        });
        res.status(201).json(post);
    }),
);

router.put(
    '/posts/:id',
    postRules(false),
    validate,
    handle(async (req, res) => {
        const existing = await findPost(req.params.id);
        if (!existing) return res.status(404).json({ message: 'Post not found' });
        const { data, error } = await postData(req, existing);
        if (error) return res.status(400).json({ message: error });
        const post = await prisma.post.update({ where: { id: existing.id }, data, include: postInclude });
        res.json(post);
    }),
);

router.delete(
    '/posts/:id',
    handle(async (req, res) => {
        const existing = await findPost(req.params.id);
        if (!existing) return res.status(404).json({ message: 'Post not found' });
        await prisma.$transaction([
            prisma.file.deleteMany({ where: { postId: existing.id } }),
            prisma.post.delete({ where: { id: existing.id } }),
        ]);
        await images.deleteImages(existing.files.map((f) => f.publicId));
        res.status(204).end();
    }),
);

// ---- Cover image (one per post, stored on Cloudinary)

// Optional photo credit sent with an upload or on its own. Empty strings clear a field.
const CREDIT_FIELDS = ['credit', 'creditUrl', 'license', 'licenseUrl'];
const creditRules = [
    body(['credit', 'license']).optional({ values: 'null' }).isString().trim()
        .isLength({ max: 200 }).withMessage('Credits and licence names can be up to 200 characters'),
    body(['creditUrl', 'licenseUrl']).optional({ values: 'falsy' }).isString().trim()
        .isURL({ protocols: ['http', 'https'], require_protocol: true }).withMessage('Links must start with http:// or https://'),
];
const creditData = (b) =>
    Object.fromEntries(CREDIT_FIELDS.filter((k) => b[k] !== undefined).map((k) => [k, b[k] ? String(b[k]).trim() : null]));

router.post(
    '/posts/:id/cover',
    (req, res, next) => {
        if (!images.isConfigured()) {
            return res.status(503).json({
                message: 'Image uploads aren’t set up yet. Add your Cloudinary keys to the server’s .env file.',
            });
        }
        next();
    },
    upload.single('image'),
    creditRules,
    validate,
    handle(async (req, res) => {
        const existing = await findPost(req.params.id);
        if (!existing) return res.status(404).json({ message: 'Post not found' });
        if (!req.file) return res.status(400).json({ message: 'Choose an image to upload' });

        const uploaded = await images.uploadImage(req.file.buffer, { filename: req.file.originalname, mimetype: req.file.mimetype });
        await prisma.$transaction([
            prisma.file.deleteMany({ where: { postId: existing.id } }),
            prisma.file.create({ data: { ...uploaded, ...creditData(req.body), post: { connect: { id: existing.id } } } }),
        ]);
        await images.deleteImages(existing.files.map((f) => f.publicId));
        res.json(await findPost(existing.id));
    }),
);

// Edit the photo credit without uploading the image again.
router.patch(
    '/posts/:id/cover',
    creditRules,
    validate,
    handle(async (req, res) => {
        const existing = await findPost(req.params.id);
        if (!existing) return res.status(404).json({ message: 'Post not found' });
        if (!existing.files.length) return res.status(400).json({ message: 'Add a cover image first' });
        await prisma.file.updateMany({ where: { postId: existing.id }, data: creditData(req.body) });
        res.json(await findPost(existing.id));
    }),
);

router.delete(
    '/posts/:id/cover',
    handle(async (req, res) => {
        const existing = await findPost(req.params.id);
        if (!existing) return res.status(404).json({ message: 'Post not found' });
        await prisma.file.deleteMany({ where: { postId: existing.id } });
        await images.deleteImages(existing.files.map((f) => f.publicId));
        res.json(await findPost(existing.id));
    }),
);

// ---- Categories

const categoryName = body('name')
    .isString().withMessage('Give the category a name').trim()
    .isLength({ min: 1, max: 40 }).withMessage('Category names can be up to 40 characters')
    .custom((v) => !RESERVED_CATEGORY_NAMES.includes(v.toLowerCase())).withMessage('That name is reserved; choose another');

router.get(
    '/categories',
    handle(async (req, res) => {
        const categories = await prisma.category.findMany({
            orderBy: { name: 'asc' },
            include: { posts: { select: { id: true, published: true } } },
        });
        res.json(
            categories.map(({ posts, ...c }) => ({
                ...c,
                postCount: posts.length,
                publishedCount: posts.filter((p) => p.published).length,
            })),
        );
    }),
);

router.post(
    '/categories',
    categoryName,
    validate,
    handle(async (req, res) => {
        const category = await prisma.category.create({ data: { name: req.body.name } });
        res.status(201).json({ ...category, postCount: 0, publishedCount: 0 });
    }),
);

router.put(
    '/categories/:id',
    param('id').isString(),
    categoryName,
    validate,
    handle(async (req, res) => {
        const category = await prisma.category.update({ where: { id: req.params.id }, data: { name: req.body.name } });
        res.json(category);
    }),
);

// Posts in a deleted category stay, just without a category.
router.delete(
    '/categories/:id',
    handle(async (req, res) => {
        await prisma.category.delete({ where: { id: req.params.id } });
        res.status(204).end();
    }),
);

router.get(
    '/tags',
    handle(async (req, res) => {
        res.json(await prisma.tag.findMany({ orderBy: { name: 'asc' } }));
    }),
);

// Errors from this router, answered in the API's usual JSON shape.
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? 'Images can be up to 5 MB' : 'Upload one image in the "image" field';
        return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message });
    }
    if (err.status === 400) return res.status(400).json({ message: err.message });
    if (err.code === 'P2002') return res.status(409).json({ message: 'A category with that name already exists' });
    if (err.code === 'P2025') return res.status(404).json({ message: 'Not found' });
    if (err.http_code || err.name === 'UploadError') {
        console.error('Cloudinary error:', err.message || err);
        return res.status(502).json({ message: 'Cloudinary didn’t accept the image. Check the API keys, then try again.' });
    }
    console.error('Admin route error:', err);
    res.status(500).json({ message: 'Internal server error' });
});

module.exports = router;
