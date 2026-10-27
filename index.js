require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { body, validationResult } = require('express-validator');
const cors = require('cors');

// Fail fast with a clear message instead of an obscure error on the first request.
for (const name of ['DATABASE_URL', 'ACCESS_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET']) {
    if (!process.env[name]) {
        console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
        process.exit(1);
    }
}

const prisma = require('./lib/prisma');
const adminRouter = require('./routes/admin');
const app = express();

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Fields that are safe to send back about a user (never the password hash).
const publicUser = { id: true, username: true, email: true, role: true };
const toPublicUser = ({ id, username, email, role }) => ({ id, username, email, role });

// Middleware
app.use(express.json());
// Set CORS_ORIGIN (comma-separated) to only accept requests from your own sites.
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : '*' }));
app.use(express.urlencoded({ extended: true }));


//Admin section

// Passport
const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.ACCESS_TOKEN_SECRET
};

passport.use(new JwtStrategy(jwtOptions, async (payload, done) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: payload.sub },
            select: publicUser,
        });
        if (user && user.role === 'ADMIN') {
            return done(null, user);
        }
        return done(null, false);
    } catch (error) {
        return done(error, false);
    }
}));

// Generate Tokens. Each token gets a unique jwtid: without it, two tokens issued to the same user
// in the same second are identical, so a replaced refresh token would still look valid.
function generateTokens(user) {
    const accessToken = jwt.sign({ sub: user.id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m', jwtid: crypto.randomUUID() });
    const refreshToken = jwt.sign({ sub: user.id }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d', jwtid: crypto.randomUUID() });
    return { accessToken, refreshToken };
}

// The schema allows one refresh token per user, so a new login replaces the previous one.
function saveRefreshToken(userId, token) {
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    return prisma.refreshToken.upsert({
        where: { userId },
        update: { token, expiresAt },
        create: { token, userId, expiresAt },
    });
}

//user validation
const validateUser = [
    body('username').trim()
        .isLength({ min: 3, max: 20 }).withMessage('Username must be 3-20 characters long')
        .isAlphanumeric().withMessage('Username must contain only letters and numbers')
        .not().isEmpty().withMessage('Username is required'),

    body('email')
        .trim()
        .isEmail().withMessage('Invalid email format')
        .toLowerCase()
        .custom(async (value) => {
            const user = await prisma.user.findUnique({
                where: {
                    email: value
                }
            });
            if (user) {
                throw new Error('Email already exists');
            }
        }),

    body('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
        .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
        .matches(/[0-9]/).withMessage('Password must contain at least one number')
        .matches(/[!@#$%^&*]/).withMessage('Password must contain at least one special character')
        .not().isEmpty().withMessage('Password is required'),

    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Passwords do not match');
            }
            return true;
        })
];

// Routes
app.get('/', (req, res) => {
    res.json([`Welcome to Kabah's Blog!`]);
});

app.post('/register', validateUser, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { username, email, password } = req.body;
        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: {
                username
            }
        });
        if (existingUser) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                username,
                email,
                password: hashedPassword
            },
            select: publicUser,
        });
        res.status(201).json(user);
    } catch (error) {
        console.error("register error: ", error);
        res.status(500).json({ message: 'Internal server error' });
    }
}
);

// Emails are stored trimmed and lower-cased (see validateUser), so look them up the same way.
const normaliseLoginEmail = body('email').if(body('email').isString()).trim().toLowerCase();

app.post('/login', normaliseLoginEmail, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (typeof email !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ message: 'Email and password are required' });
        }
        const user = await prisma.user.findUnique({
            where: {
                email
            }
        });
        // Same answer for an unknown email and a wrong password, so accounts can't be probed.
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const tokens = generateTokens(user);
        await saveRefreshToken(user.id, tokens.refreshToken);
        res.json(tokens);
    } catch (error) {
        console.error("login error: ", error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post("/refresh-token", async (req, res) => {
    try {
        const { refreshToken } = req.body; // Get token from request body

        if (!refreshToken) {
            return res.status(401).json({ message: "Refresh token is required" });
        }

        // Verify the signature and expiry first
        let payload;
        try {
            payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        } catch {
            return res.status(403).json({ message: "Invalid token" });
        }

        // Then make sure it is the token we issued last (not logged out or already rotated)
        const storedToken = await prisma.refreshToken.findUnique({
            where: { token: refreshToken }
        });
        if (!storedToken || storedToken.userId !== payload.sub || storedToken.expiresAt < new Date()) {
            return res.status(403).json({ message: "Invalid refresh token" });
        }

        // Find user
        const user = await prisma.user.findUnique({
            where: { id: payload.sub }
        });

        if (!user) {
            return res.status(403).json({ message: "User not found" });
        }

        // Generate new tokens and replace the old refresh token
        const newTokens = generateTokens(user);
        await saveRefreshToken(user.id, newTokens.refreshToken);
        res.json(newTokens);
    } catch (error) {
        console.error("refresh-token error: ", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.post('/logout', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(401).json({ message: 'Refresh token is required' });
        }
        // deleteMany doesn't throw when the token is already gone, so logging out twice is fine.
        await prisma.refreshToken.deleteMany({
            where: {
                token: refreshToken
            }
        });
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error("logout error: ", error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Protected Route. The admin site calls this to check who is signed in.
const requireAdmin = passport.authenticate('jwt', { session: false });

app.get('/admin', requireAdmin, (req, res) => {
    res.json({ message: 'You have accessed a protected route', user: toPublicUser(req.user) });
})

// Admin API (posts, cover images, categories). Registered before /api/v1/:category/posts,
// which would otherwise treat "admin" as a category name.
app.use('/api/v1/admin', requireAdmin, adminRouter);




//Client section

const postInclude = {
    categories: true,
    tags: true,
    files: true,
};

// Reads ?page and ?limit, falling back to safe defaults for missing or invalid values.
function pagination(query, { defaultLimit = 5, maxLimit = 50 } = {}) {
    const page = Number.parseInt(query.page, 10);
    const limit = Number.parseInt(query.limit, 10);
    const take = Number.isInteger(limit) && limit > 0 ? Math.min(limit, maxLimit) : defaultLimit;
    const current = Number.isInteger(page) && page > 0 ? page : 1;
    return { skip: (current - 1) * take, take };
}

app.get('/api/v1/trendingposts', async (req, res) => {
    try {
        const { skip, take } = pagination(req.query);

        const posts = await prisma.post.findMany({
            orderBy: {
                date: 'desc'
            },
            where: {
                published: true,
            },
            skip,
            take,
            include: postInclude,
        });

        res.json(posts);
    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}
);

app.get('/api/v1/posts/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Drafts are not public: an unpublished post answers 404, the same as a missing one.
        const post = await prisma.post.findFirst({
            where: {
                id,
                published: true,
            },
            include: postInclude,
        });

        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }

        res.json(post);
    } catch (error) {
        console.error('Error fetching post:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}
);

app.get('/api/v1/categories', async (req, res) => {
    try {
        // Only categories with at least one published post, so every listed topic has stories.
        const categories = await prisma.category.findMany({
            where: {
                posts: {
                    some: { published: true }
                }
            },
            orderBy: {
                name: 'asc'
            },
            include: {
                posts: {
                    where: {
                        published: true
                    },
                    select: {
                        id: true,
                    }
                }
            }
        });
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}
);

app.get('/api/v1/:category/posts', async (req, res) => {
    try {
        const categoryName = req.params.category;

        const posts = await prisma.post.findMany({
            where: {
                categories: {
                    some: {
                        name: categoryName
                    }
                },
                published: true
            },
            orderBy: {
                date: 'desc'
            },
            include: postInclude,
        });

        if (posts.length === 0) {
            return res.status(404).json({ message: 'No posts found for this category' });
        }

        res.json(posts);
    } catch (error) {
        console.error('Error fetching posts by category:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}
);

// Unknown routes answer in JSON like the rest of the API.
app.use((req, res) => {
    res.status(404).json({ message: 'Not found' });
});

// Malformed JSON bodies and any other unhandled error.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ message: 'Request body is not valid JSON' });
    }
    console.error('Unhandled error:', err);
    res.status(500).json({ message: 'Internal server error' });
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
