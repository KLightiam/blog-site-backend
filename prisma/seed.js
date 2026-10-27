// Sample content for local development. Safe to run more than once: every record is upserted.
//
//   npm run seed
//
// The author account is an ADMIN. Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env to choose
// its login; without a password, a random one is generated and printed once.
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const cover = (slug) => `https://picsum.photos/seed/${slug}/1200/800`;
const paragraphs = (...p) => p.join('\n\n');

const categories = [
    { id: 'cat1', name: 'Programming' },
    { id: 'cat2', name: 'Databases' },
    { id: 'cat3', name: 'Web Development' },
    { id: 'cat4', name: 'Travel' },
    { id: 'cat5', name: 'Photography' },
    { id: 'cat6', name: 'Lifestyle' },
];

const tags = [
    { id: 'tag1', name: 'JavaScript' },
    { id: 'tag2', name: 'Prisma' },
    { id: 'tag3', name: 'Node.js' },
    { id: 'tag4', name: 'SQL' },
    { id: 'tag5', name: 'Docker' },
    { id: 'tag6', name: 'React' },
    { id: 'tag7', name: 'Ghana' },
    { id: 'tag8', name: 'Productivity' },
    { id: 'tag9', name: 'Cameras' },
];

const posts = [
    {
        id: 'post1',
        title: 'Introduction to JavaScript',
        category: 'cat1',
        tags: ['tag1'],
        date: daysAgo(54),
        content: paragraphs(
            'JavaScript is a versatile programming language that runs in every web browser and, through Node.js, on servers too. It started as a way to make pages interactive and has grown into one of the most widely used languages in the world.',
            'Three ideas make the rest of the language easier to understand. Variables hold values, and in modern code you declare them with const when they will not change and let when they will. Functions package up steps you want to reuse, and they can be passed around like any other value.',
            'The third idea is the event loop. JavaScript runs one piece of code at a time, but it does not wait around for slow work like network requests. It hands that work off, carries on, and comes back to it when the result is ready. Promises and the async and await keywords are how you write code that works with that model without getting lost.',
            'If you are starting out, open the browser console and try small things: add numbers, join strings, write a function that greets you by name. Short experiments teach more than long reading sessions.'
        ),
    },
    {
        id: 'post2',
        title: 'Understanding Prisma ORM',
        category: 'cat2',
        tags: ['tag2', 'tag4'],
        date: daysAgo(47),
        content: paragraphs(
            'Prisma is a modern ORM for Node.js and TypeScript. Instead of writing SQL strings by hand, you describe your data once in a schema file and Prisma generates a client with a method for every query you need.',
            'The schema is the centre of everything. Each model becomes a table, each field a column, and relations such as a post belonging to an author are written in plain terms. When the schema changes, prisma migrate creates a migration file so every copy of the database can be brought up to date the same way.',
            'The generated client knows your models, so mistakes like asking for a field that does not exist show up in your editor before the code runs. Queries read close to how you would describe them: find the published posts, newest first, with their categories included.',
            'Prisma is not a replacement for understanding SQL. It is worth knowing what a join or an index does, because that is what your queries turn into. But for everyday reads and writes it removes a lot of repetitive code.'
        ),
    },
    {
        id: 'post3',
        title: 'Top 10 VS Code Extensions',
        category: 'cat3',
        tags: ['tag3', 'tag5'],
        date: daysAgo(40),
        content: paragraphs(
            'A good editor setup saves small amounts of time hundreds of times a day. These are extensions that earn their place in a web developer’s VS Code.',
            'ESLint and Prettier come first: one catches mistakes as you type, the other formats code so you never argue about spacing again. GitLens shows who changed a line and why, right next to the code. Error Lens puts error messages on the line where they happen instead of in a panel you have to open.',
            'For front-end work, Tailwind CSS IntelliSense completes class names and shows what they do. Auto Rename Tag keeps opening and closing HTML tags in step. For the back end, the Prisma extension highlights schema files, and the Docker extension lets you start and inspect containers without leaving the editor.',
            'Round out the list with REST Client, which sends HTTP requests from a plain text file, and Code Spell Checker, which catches typos in names and comments. Install a few at a time and remove anything you stop using; too many extensions slow the editor down.'
        ),
    },
    {
        id: 'post4',
        title: 'Designing a database schema you will not regret',
        category: 'cat2',
        tags: ['tag4', 'tag2'],
        date: daysAgo(31),
        content: paragraphs(
            'Most schema regrets come from a handful of early shortcuts: storing a list inside a single text column, skipping foreign keys to move faster, and naming tables after screens instead of the things they hold.',
            'Start by writing down the nouns your product cares about and how they relate, as plain sentences. A post has one author. A post can be in several categories, and a category holds many posts. Those sentences turn almost directly into tables and join tables.',
            'Next, add the rules your code already assumes. If every username must be unique, make the database enforce it rather than relying on a check in the sign-up form. Constraints are documentation that cannot go out of date, and they stop bad data at the door.',
            'Finally, keep a migration for every change. When something goes wrong months later, a clear history of what changed and when is the fastest way to understand it.'
        ),
    },
    {
        id: 'post5',
        title: 'Running PostgreSQL locally with Docker',
        category: 'cat2',
        tags: ['tag5', 'tag4'],
        date: daysAgo(24),
        content: paragraphs(
            'Installing a database directly on your laptop works until two projects need different versions. Running PostgreSQL in a container keeps each project’s database separate, and you can throw it away and start fresh in seconds.',
            'One command starts a server: docker run with the postgres image, a password set through an environment variable, and port 5432 published to your machine. Add a named volume so your data survives when the container restarts.',
            'Point your application at it with a connection string such as postgresql://postgres:yourpassword@localhost:5432/postgres, run your migrations, and you have a working database that matches production far more closely than a file-based substitute.',
            'When you are done, docker stop pauses it and docker rm removes it. Nothing is left behind on your system.'
        ),
    },
    {
        id: 'post6',
        title: 'A weekend guide to Cape Coast',
        category: 'cat4',
        tags: ['tag7'],
        date: daysAgo(16),
        content: paragraphs(
            'Cape Coast is about three hours west of Accra by road, which makes it an easy weekend away. The town sits on the Atlantic, with a busy fishing harbour, colonial-era buildings and some of the most important historical sites in West Africa.',
            'Plan to spend a morning at Cape Coast Castle. The guided tour takes you through the dungeons where enslaved people were held before being shipped across the Atlantic, and it is a sobering, essential visit. Elmina Castle, a short drive further west, tells the same history and is just as moving.',
            'For something different, Kakum National Park lies about 30 kilometres inland. Its canopy walkway hangs high above the rainforest floor; go early, when it is cooler and the birds are most active.',
            'Evenings are for the beach and grilled fish from one of the small restaurants along the shore. Bring cash, sunscreen and comfortable shoes, and leave room in the schedule: Cape Coast rewards taking it slowly.'
        ),
    },
    {
        id: 'post7',
        title: 'Five ways to take better photos with your phone',
        category: 'cat5',
        tags: ['tag9'],
        date: daysAgo(9),
        content: paragraphs(
            'You do not need an expensive camera to take good pictures. Most of the difference between a forgettable phone photo and a striking one comes down to a few habits.',
            'First, clean the lens. Phones live in pockets and bags, and a smudged lens turns every photo soft and hazy. Second, find the light: stand so the light falls on your subject rather than behind it, and try shooting in the hour after sunrise or before sunset, when light is warm and gentle.',
            'Third, tap the screen where your subject is to set focus and brightness, then slide your finger to make the picture lighter or darker before you take it. Fourth, get closer instead of zooming; digital zoom throws away detail.',
            'Finally, turn on the grid in your camera settings and place your subject on one of the lines rather than dead centre. It is a simple rule that makes compositions feel balanced.'
        ),
    },
    {
        id: 'post8',
        title: 'Building a writing routine that sticks',
        category: 'cat6',
        tags: ['tag8'],
        date: daysAgo(3),
        content: paragraphs(
            'Most writing routines fail because they are too ambitious. A plan to write for two hours every morning rarely survives the first busy week.',
            'Start smaller than feels useful. Twenty minutes at the same time each day is enough to build the habit, and on good days twenty minutes often turns into an hour. Protect the time the way you would a meeting, and keep your phone in another room.',
            'Separate writing from editing. Get a rough draft down without stopping to fix sentences, then come back to it later with fresh eyes. Trying to do both at once is the quickest way to stall.',
            'Keep a running list of ideas so you never sit down to a blank page wondering what to write about. When an idea arrives, write it down straight away, even if it is only a few words.'
        ),
    },
    {
        id: 'draft1',
        title: 'Coming soon: notes from the Volta Region',
        category: 'cat4',
        tags: ['tag7'],
        date: daysAgo(1),
        published: false,
        content: 'A draft that should not appear on the public site until it is published.',
    },
];

async function seedAuthor() {
    const email = (process.env.SEED_ADMIN_EMAIL || 'admin@example.com').toLowerCase();
    let password = process.env.SEED_ADMIN_PASSWORD;
    const generated = !password;
    if (generated) password = `${crypto.randomBytes(9).toString('base64url')}!A1`;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        if (existing.role !== 'ADMIN') {
            await prisma.user.update({ where: { id: existing.id }, data: { role: 'ADMIN' } });
        }
        return existing;
    }

    const author = await prisma.user.create({
        data: {
            username: process.env.SEED_ADMIN_USERNAME || 'kabah',
            email,
            password: await bcrypt.hash(password, 10),
            role: 'ADMIN',
        },
    });
    console.log(`Created admin ${email}${generated ? ` with password ${password} (set SEED_ADMIN_PASSWORD to choose your own)` : ''}`);
    return author;
}

async function main() {
    const author = await seedAuthor();

    for (const c of categories) {
        await prisma.category.upsert({ where: { id: c.id }, update: { name: c.name }, create: c });
    }
    for (const t of tags) {
        await prisma.tag.upsert({ where: { id: t.id }, update: { name: t.name }, create: t });
    }

    for (const p of posts) {
        const data = {
            title: p.title,
            content: p.content,
            published: p.published ?? true,
            date: p.date,
            author: { connect: { id: author.id } },
            categories: { set: [{ id: p.category }] },
            tags: { set: p.tags.map((id) => ({ id })) },
        };
        await prisma.post.upsert({
            where: { id: p.id },
            update: data,
            create: {
                ...data,
                id: p.id,
                categories: { connect: [{ id: p.category }] },
                tags: { connect: p.tags.map((id) => ({ id })) },
            },
        });

        // One cover image per post, replaced on each run.
        await prisma.file.deleteMany({ where: { postId: p.id } });
        await prisma.file.create({
            data: {
                name: `${p.id}-cover.jpg`,
                storedName: `${p.id}-cover.jpg`,
                url: cover(p.id),
                publicId: `${p.id}-cover`,
                type: 'image/jpeg',
                post: { connect: { id: p.id } },
            },
        });
    }

    const published = posts.filter((p) => p.published !== false).length;
    console.log(`Seeded ${categories.length} categories, ${tags.length} tags, ${published} published posts and ${posts.length - published} draft.`);
}

main()
    .then(() => console.log('Database seeded!'))
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
