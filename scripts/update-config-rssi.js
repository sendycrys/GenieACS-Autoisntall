const { MongoClient } = require('/usr/lib/node_modules/genieacs/node_modules/mongodb');

async function run() {
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();
  const db = client.db('genieacs');
  const query = { _id: { $regex: '^ui\\.device\\.14\\.components\\.[0-9]+\\.components\\.1\\.childParameters\\.2\\.parameter$' } };
  const val = 'COALESCE(AssociatedDeviceRssi, X_HW_RSSI, X_ZTE-COM_RSSI, AssociatedDeviceAuthenticationState)';
  const res = await db.collection('config').updateMany(query, { $set: { value: val } });
  console.log('Updated config count:', res.modifiedCount);
  await client.close();
}
run().catch(console.error);
