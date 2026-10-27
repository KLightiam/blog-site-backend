# Kabah’s Blog: backend

The REST API behind [Kabah’s Blog](https://github.com/KLightiam/blog-site-frontend). It serves published stories, categories and tags to the reading site, and powers the admin area where posts are written, given cover images (stored on Cloudinary) and published.

Built with Node.js, Express, Prisma, PostgreSQL and Cloudinary.

## Running it

```sh
npm install
cp .env.example .env          # then fill in DATABASE_URL and the two token secrets
npx prisma migrate deploy     # create the tables (run again after pulling new migrations)
npm run seed                  # optional: sample categories, posts and an admin account
npm run dev                   # http://localhost:3000
```

The server refuses to start if `DATABASE_URL`, `ACCESS_TOKEN_SECRET` or `REFRESH_TOKEN_SECRET` is missing.

### Cover images (Cloudinary)

Cover images uploaded in the admin are stored on [Cloudinary](https://cloudinary.com). In your Cloudinary dashboard, open **Settings → API Keys**, copy the **API environment variable** (`cloudinary://…`) and set it as `CLOUDINARY_URL` in `.env`. Images go into the `kabahs-blog` folder (change it with `CLOUDINARY_FOLDER`) and are served resized to at most 1600 px wide, in the best format for each browser. Replacing or removing a cover, or deleting a post, also deletes the old image from Cloudinary.

Without `CLOUDINARY_URL` the API still runs; uploads answer 503 with a message saying the keys are missing.

`npm run seed` can be run more than once; it updates the sample records instead of duplicating them (and resets any edits made to the sample posts). The sample posts use real photos: two Adam Jones photos from Flickr (Kejetia Market and Cape Coast Castle, CC BY 2.0) and seven from Unsplash, each credited under the cover. With `CLOUDINARY_URL` set, the seed copies them into Cloudinary; otherwise it links to the originals. It creates one admin account. Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env` to choose its login; otherwise a random password is printed when the account is first created.

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

## Admin API

Every route below needs `Authorization: Bearer <accessToken>` from an `ADMIN` account (`npm run seed` creates one). The admin pages in the frontend use these routes.

| Route | Does |
| --- | --- |
| `GET /api/v1/admin/posts?status=all\|published\|draft&search=` | All posts, drafts included, newest first |
| `GET /api/v1/admin/posts/:id` | One post, draft or published |
| `POST /api/v1/admin/posts` | Create: `{ title, content?, published?, categoryId?, tags?: string[] }`. Starts as a draft unless `published` is true. |
| `PUT /api/v1/admin/posts/:id` | Change any of the same fields. `categoryId: null` and `tags: []` clear them. |
| `DELETE /api/v1/admin/posts/:id` | Delete the post and its cover image |
| `POST /api/v1/admin/posts/:id/cover` | Upload the cover: multipart form, file in the `image` field (JPEG, PNG, WebP, GIF or AVIF, up to 5 MB), plus optional `credit`, `creditUrl`, `license`, `licenseUrl`. Replaces any existing cover. |
| `PATCH /api/v1/admin/posts/:id/cover` | Change the photo credit: `{ credit, creditUrl, license, licenseUrl }`. An empty string clears a field; links must be `http(s)`. |
| `DELETE /api/v1/admin/posts/:id/cover` | Remove the cover |
| `GET /api/v1/admin/categories` | All categories, with `postCount` and `publishedCount` |
| `POST /api/v1/admin/categories` · `PUT /…/:id` · `DELETE /…/:id` | Add `{ name }`, rename, delete. Deleting keeps the posts, without a category. |
| `GET /api/v1/admin/tags` | All tags (new ones are created when a post is saved with them) |

Rules: a post needs a title, and text before it can be published. Publishing a draft sets its date to now, so it appears at the top of the blog; editing a live post keeps its date. Tags are up to 10 per post, 30 characters each. Category names are up to 40 characters and unique.

Each user holds one refresh token at a time, so signing in again (for example on another device) signs out the previous session.

Errors always come back as JSON, including unknown routes (404) and malformed request bodies (400).
