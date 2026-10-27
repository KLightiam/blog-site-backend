# Kabah’s Blog: backend

The REST API behind [Kabah’s Blog](https://github.com/KLightiam/blog-site-frontend). It serves published stories, categories and tags to the reading site, and handles accounts with JWT sign-in for the admin area.

Built with Node.js, Express, Prisma and PostgreSQL.

## Running it

```sh
npm install
cp .env.example .env          # then fill in DATABASE_URL and the two token secrets
npx prisma migrate deploy     # create the tables
npm run seed                  # optional: sample categories, posts and an admin account
npm run dev                   # http://localhost:3000
```

The server refuses to start if `DATABASE_URL`, `ACCESS_TOKEN_SECRET` or `REFRESH_TOKEN_SECRET` is missing.

`npm run seed` can be run more than once; it updates the sample records instead of duplicating them. It creates one admin account. Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env` to choose its login; otherwise a random password is printed when the account is first created.

## Public routes (used by the reading site)

Only published posts are ever returned. Drafts answer 404, as if they don’t exist.

| Route | Returns |
| --- | --- |
| `GET /api/v1/trendingposts?page=1&limit=5` | Published posts, newest first, with categories, tags and files. `limit` defaults to 5 (maximum 50); invalid values fall back to the defaults. |
| `GET /api/v1/posts/:id` | One published post, or 404 |
| `GET /api/v1/categories` | Categories that have at least one published post, A to Z, each with its post IDs |
| `GET /api/v1/:category/posts` | Published posts in a category, newest first, or 404 if it has none |

## Accounts and sign-in

| Route | Body | Notes |
| --- | --- | --- |
| `POST /register` | `username`, `email`, `password`, `confirmPassword` | Validated: username 3 to 20 letters and numbers; password 8+ characters with upper and lower case, a number and one of `!@#$%^&*`. Returns the new user without the password hash. |
| `POST /login` | `email`, `password` | Returns `accessToken` (15 minutes) and `refreshToken` (7 days). Wrong details answer 401. |
| `POST /refresh-token` | `refreshToken` | Returns a new pair and retires the old refresh token, which can’t be used again. |
| `POST /logout` | `refreshToken` | Retires the refresh token. Safe to call twice. |
| `GET /admin` | `Authorization: Bearer <accessToken>` | Only for users with the `ADMIN` role. |

Each user holds one refresh token at a time, so signing in again (for example on another device) signs out the previous session.

Errors always come back as JSON, including unknown routes (404) and malformed request bodies (400).
