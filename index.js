require('dotenv').config();
const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { body, validationResult, ExpressValidator } = require("express-validator");
const cors = require('cors');
const app = express();


// Middleware
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

// Passport
const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.ACCESS_TOKEN_SECRET
};

passport.use(new JwtStrategy(jwtOptions, (payload, done) => {
    const user = prisma.user.findUnique({
        where: {
            id: payload.sub
        }
    });
    if (user) {
        return done(null, user);
    } else {
        return done(null, false);
    }
}));

// Generate Tokens
function generateTokens(user) {
    const accessToken = jwt.sign({ sub: user.id }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ sub: user.id }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
    return { accessToken, refreshToken };
}

//user validation
const validateUser = [
    body('username').trim()
        .isLength({ min: 3, max: 20 }).withMessage('Username must be 3-20 characters long')
        .isAlphanumeric().withMessage('Username must contain only letters and numbers')
        .not().isEmpty().withMessage('Username is required'),

    body('email')
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail()
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
    res.json(['Hello World!']);
});

app.post('/register', async (req, res) => {
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
        // Hash password
        const hashedPassword = bcrypt.hashSync(password, 10);
        const user = await prisma.user.create({
            data: {
                username,
                email,
                password: hashedPassword
            }
        });
        res.status(201).json(user);
    } catch (error) {
        console.error("register error: ", error);
        res.status(500).json({ message: 'Internal server error' });
    }
}
);

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await prisma.user.findUnique({
            where: {
                email
            }
        });
        if (user && bcrypt.compareSync(password, user.password)) {
            const tokens = generateTokens(user);
            await prisma.refreshToken.create({
                data: {
                    token: tokens.refreshToken,
                    userId: user.id,
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                }
            });
            res.json(tokens);
        }
    } catch (error) {
        console.error("login error: ", error);
        res.status(401).json({ message: 'Invalid credentials' });
    }
});

app.post("/refresh-token", async (req, res) => {
    try {
        const { refreshToken } = req.body; // Get token from request body

        if (!refreshToken) {
            return res.status(401).json({ message: "Refresh token is required" });
        }

        // Check if refresh token exists in database
        const storedToken = await prisma.refreshToken.findUnique({
            where: { token: refreshToken }
        });

        if (!storedToken) {
            return res.status(403).json({ message: "Invalid refresh token" });
        }

        // Verify token
        jwt.verify(refreshToken, REFRESH_SECRET, async (err, payload) => {
            if (err) {
                return res.status(403).json({ message: "Invalid token" });
            }

            // Find user
            const user = await prisma.user.findUnique({
                where: { id: storedToken.userId }
            });

            if (!user) {
                return res.status(403).json({ message: "User not found" });
            }

            // Generate new tokens
            const newTokens = generateTokens(user);

            // Delete old refresh token and store the new one
            await prisma.refreshToken.delete({ where: { token: refreshToken } });
            await prisma.refreshToken.create({
                data: {
                    token: newTokens.refreshToken,
                    userId: user.id,
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days expiry
                }
            });
            res.json(newTokens);
        });
    } catch (error) {
        console.error("refresh-token error: ", error);
        res.status(401).json({ message: "Invalid token" });
    }
});

// Protected Route
app.get('/protected', passport.authenticate('jwt', { session: false }), (req, res) => {
    res.json({ message: 'You have accessed a protected route', user: req.user });
})


// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});