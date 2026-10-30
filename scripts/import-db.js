#!/usr/bin/env node

/**
 * GenieACS Database Importer
 * Safely imports configuration, provisions, presets, virtual parameters, permissions, and users.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Locate mongodb driver from genieacs module or global node_modules
let MongoClient;
const candidatePaths = [
  '/usr/lib/node_modules/genieacs/node_modules/mongodb',
  '/usr/local/lib/node_modules/genieacs/node_modules/mongodb',
  'mongodb'
];

for (const p of candidatePaths) {
  try {
    MongoClient = require(p).MongoClient;
    break;
  } catch (e) {}
}

if (!MongoClient) {
  console.error('Error: Could not load MongoDB driver. Ensure genieacs is installed.');
  process.exit(1);
}

// Parse CLI args
const args = process.argv.slice(2);
let mongoUrl = 'mongodb://127.0.0.1:27017/genieacs';
let adminUser = null;
let adminPass = null;
let serverIp = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--mongo-url' && args[i + 1]) {
    mongoUrl = args[i + 1];
    i++;
  } else if (args[i] === '--admin-user' && args[i + 1]) {
    adminUser = args[i + 1];
    i++;
  } else if (args[i] === '--admin-pass' && args[i + 1]) {
    adminPass = args[i + 1];
    i++;
  } else if (args[i] === '--server-ip' && args[i + 1]) {
    serverIp = args[i + 1];
    i++;
  }
}

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 10000, 128, 'sha512', (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey.toString('hex'));
    });
  });
}

async function run() {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    console.error(`Error: Data directory not found at ${dataDir}`);
    process.exit(1);
  }

  console.log(`Connecting to MongoDB at ${mongoUrl}...`);
  const client = await MongoClient.connect(mongoUrl);
  const db = client.db();

  const collections = ['config', 'provisions', 'presets', 'virtualParameters', 'permissions', 'users'];

  for (const colName of collections) {
    const filePath = path.join(dataDir, `${colName}.json`);
    if (!fs.existsSync(filePath)) {
      console.warn(`Warning: ${filePath} does not exist, skipping.`);
      continue;
    }

    let rawContent = fs.readFileSync(filePath, 'utf8');

    // Replace server IP placeholder if specified
    if (serverIp && colName === 'provisions') {
      console.log(`Updating ACS/STUN IP in provisions to: ${serverIp}`);
      rawContent = rawContent.replace(/192\.168\.8\.253/g, serverIp);
    }

    const items = JSON.parse(rawContent);
    console.log(`Importing ${items.length} records into "${colName}"...`);

    const col = db.collection(colName);
    for (const item of items) {
      // Safe upsert by _id
      await col.replaceOne({ _id: item._id }, item, { upsert: true });
    }
  }

  // Handle custom admin credentials if provided
  if (adminUser && adminPass) {
    console.log(`Setting up admin user "${adminUser}"...`);
    const salt = crypto.randomBytes(64).toString('hex');
    const hashedPassword = await hashPassword(adminPass, salt);

    await db.collection('users').replaceOne(
      { _id: adminUser },
      {
        _id: adminUser,
        roles: 'admin',
        password: hashedPassword,
        salt: salt
      },
      { upsert: true }
    );
    console.log(`Admin user "${adminUser}" configured successfully.`);
  }

  console.log('Database import completed successfully.');
  await client.close();
}

run().catch((err) => {
  console.error('Fatal error during database import:', err);
  process.exit(1);
});
