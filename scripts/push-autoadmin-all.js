#!/usr/bin/env node

/**
 * Batch Push Auto Admin Credentials to All Devices via GenieACS NBI API
 * Without resetting the ONT!
 */

const http = require('http');

const ACS_HOST = process.env.ACS_HOST || '127.0.0.1';
const ACS_PORT = process.env.ACS_PORT || 7557;

const SUPER_USER = 'admin';
const SUPER_PASS = 'Arthamedia@123';
const USER_USER = 'user';
const USER_PASS = 'user';

function apiGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://${ACS_HOST}:${ACS_PORT}${path}`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data.substring(0, 100)}`));
        }
      });
    }).on('error', reject);
  });
}

function queueTask(deviceId) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      name: 'setParameterValues',
      parameterValues: [
        ['VirtualParameters.superAdmin', SUPER_USER],
        ['VirtualParameters.superPassword', SUPER_PASS],
        ['VirtualParameters.userAdmin', USER_USER],
        ['VirtualParameters.userPassword', USER_PASS]
      ]
    });

    const req = http.request({
      hostname: ACS_HOST,
      port: ACS_PORT,
      path: `/devices/${encodeURIComponent(deviceId)}/tasks?connection_request`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 10000
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ deviceId, status: res.statusCode, ok: res.statusCode === 200 || res.statusCode === 202 });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ deviceId, status: 408, ok: false, error: 'Timeout' });
    });

    req.on('error', err => {
      resolve({ deviceId, status: 500, ok: false, error: err.message });
    });

    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('====================================================');
  console.log('   BATCH PUSH AUTO ADMIN CREDENTIALS VIA NBI API    ');
  console.log('====================================================');
  console.log(`Target ACS: http://${ACS_HOST}:${ACS_PORT}`);
  console.log(`Super Admin Target: ${SUPER_USER} / ${SUPER_PASS}`);
  console.log(`User Admin Target : ${USER_USER} / ${USER_PASS}`);
  console.log('----------------------------------------------------');

  console.log('Fetching all registered devices from GenieACS...');
  const devices = await apiGet('/devices?projection=_id,_deviceId._Manufacturer,_deviceId._ProductClass');
  console.log(`Found total ${devices.length} devices in database.\n`);

  if (devices.length === 0) {
    console.log('No devices found. Exiting.');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  // Process in small batches with brief delay to avoid overloading CWMP/NBI
  const BATCH_SIZE = 5;
  for (let i = 0; i < devices.length; i += BATCH_SIZE) {
    const batch = devices.slice(i, i + BATCH_SIZE);
    const promises = batch.map((dev, idx) => {
      const overallIdx = i + idx + 1;
      const mfr = dev._deviceId?._Manufacturer || 'Unknown';
      const model = dev._deviceId?._ProductClass || 'Unknown';
      return queueTask(dev._id).then(res => {
        if (res.ok) {
          successCount++;
          console.log(`[${overallIdx}/${devices.length}] OK (HTTP ${res.status}): ${dev._id} [${mfr} ${model}]`);
        } else {
          failCount++;
          console.log(`[${overallIdx}/${devices.length}] FAILED: ${dev._id} [${mfr}] - Status ${res.status} (${res.error || 'Err'})`);
        }
      });
    });

    await Promise.all(promises);
    // 150ms gentle pause between batches
    await new Promise(r => setTimeout(r, 150));
  }

  console.log('\n====================================================');
  console.log('                 PUSH SUMMARY                       ');
  console.log('====================================================');
  console.log(`Total Perangkat   : ${devices.length}`);
  console.log(`Berhasil Diantrikan: ${successCount}`);
  console.log(`Gagal             : ${failCount}`);
  console.log('----------------------------------------------------');
  console.log('Catatan:');
  console.log('1. Perangkat yang ONLINE langsung menerima update via Connection Request.');
  console.log('2. Perangkat yang sedang OFFLINE otomatis menerima update begitu hidup/inform kembali.');
  console.log('====================================================\n');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
