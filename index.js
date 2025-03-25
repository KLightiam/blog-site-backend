require('dotenv').config();
const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Strategy:JwtStrategy, ExtractJwt } = require('passport-jwt');
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
    const user = Prisma.user.findUnique({
        where: {
            id: payload.sub
        }
    });
    if (user) {
        return done(null, user);
    }else {
        return done(null, false);
    }
}));

// Generate Tokens
function generateTokens(user) {
    const accessToken = jwt.sign({ sub: user.id }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ sub: user.id }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
    return { accessToken, refreshToken };
}

// Routes
app.get('/', (req, res) => {
    res.json(['Hello World!']);
});

app.post('/login', async (req, res) => {
    try{
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
            res.json(tokens);}
    }catch (error) {
        console.error("login error: ",error);
        res.status(401).json({ message: 'Invalid credentials' });
    }
});

app.post("/refresh-token", async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken; // Get token from cookies

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
}
);
// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});