const { MongoClient } = require('/usr/lib/node_modules/genieacs/node_modules/mongodb');

async function run() {
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();
  const db = client.db('genieacs');
  const devs = await db.collection('devices').find({}, { projection: { _deviceId: 1 } }).toArray();
  const models = {};
  const manufacturers = {};

  devs.forEach(d => {
    const pc = d._deviceId?._ProductClass || 'Unknown';
    const m = d._deviceId?._Manufacturer || 'Unknown';
    models[pc] = (models[pc] || 0) + 1;
    manufacturers[m] = (manufacturers[m] || 0) + 1;
  });

  console.log('=== Manufacturers ===');
  console.log(JSON.stringify(manufacturers, null, 2));
  console.log('=== ProductClass (Models) ===');
  console.log(JSON.stringify(models, null, 2));

  await client.close();
}
run().catch(console.error);
