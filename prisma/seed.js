const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {

    // Create Categories
    const categories = await prisma.category.createMany({
        data: [
            { id: 'cat1', name: 'Programming' },
            { id: 'cat2', name: 'Databases' },
            { id: 'cat3', name: 'Web Development' },
        ],
    });

    // Create Tags
    const tags = await prisma.tag.createMany({
        data: [
            { id: 'tag1', name: 'JavaScript' },
            { id: 'tag2', name: 'Prisma' },
            { id: 'tag3', name: 'Node.js' },
            { id: 'tag4', name: 'SQL' },
            { id: 'tag5', name: 'Docker' },
        ],
    });

    // Create Posts with Categories, Tags, and Files
    const post1 = await prisma.post.create({
        data: {
            id: 'post1',
            title: 'Introduction to JavaScript',
            content: 'JavaScript is a versatile programming language...',
            published: true,
            authorId: "cm9de9isr00006v5bgaq12zqk",
            categories: {
                connect: [{ id: 'cat1' }],
            },
            tags: {
                connect: [{ id: 'tag1' }],
            },
            files: {
                create: [
                    {
                        name: 'javascript_guide.png',
                        storedName: 'javascript_guide_123.png',
                        url: 'https://picsum.photos/400/300',
                        publicId: 'js_guide_123',
                        size: 2048,
                        type: 'image/png',
                    },
                ],
            },
        },
    });

    const post2 = await prisma.post.create({
        data: {
            id: 'post2',
            title: 'Understanding Prisma ORM',
            content: 'Prisma is a modern ORM for Node.js...',
            published: true,
            authorId: "cm9de9isr00006v5bgaq12zqk",
            categories: {
                connect: [{ id: 'cat2' }],
            },
            tags: {
                connect: [{ id: 'tag2' }, { id: 'tag4' }],
            },
            files: {
                create: [
                    {
                        name: 'prisma_diagram.png',
                        storedName: 'prisma_diagram_456.png',
                        url: 'https://picsum.photos/400/300',
                        publicId: 'prisma_diag_456',
                        size: 1024,
                        type: 'image/png',
                    },
                ],
            },
        },
    });

    const post3 = await prisma.post.create({
        data: {
            id: 'post3',
            title: 'Top 10 VS Code Extensions',
            content: 'Here are the top 10 VS Code extensions...',
            published: true,
            authorId: "cm9de9isr00006v5bgaq12zqk",
            categories: {
                connect: [{ id: 'cat3' }],
            },
            tags: {
                connect: [{ id: 'tag3' }, { id: 'tag5' }],
            },
            files: {
                create: [
                    {
                        name: 'vscode_extensions.png',
                        storedName: 'vscode_extensions_789.png',
                        url: 'https://picsum.photos/400/300',
                        publicId: 'vscode_ext_789',
                        size: 512,
                        type: 'image/png',
                    },
                ],
            },
        },
    });
}

main()
    .then(() => console.log('Database seeded!'))
    .catch((e) => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });