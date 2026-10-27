const { PrismaClient } = require('@prisma/client');

// One client for the whole app, shared by the public and admin routes.
module.exports = new PrismaClient();
