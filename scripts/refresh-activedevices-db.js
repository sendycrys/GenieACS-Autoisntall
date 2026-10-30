const { MongoClient } = require('/usr/lib/node_modules/genieacs/node_modules/mongodb');

async function run() {
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();
  const db = client.db('genieacs');
  const devs = await db.collection('devices').find({}).toArray();
  let updatedCount = 0;
  const now = new Date();

  for (const dev of devs) {
    const wlans = dev?.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration || {};
    let active = 0;

    for (let i = 1; i <= 8; i++) {
      const w = wlans[String(i)];
      if (w) {
        if (typeof w.TotalAssociations?._value === 'number') {
          active += w.TotalAssociations._value;
        } else if (typeof w.WLAN_AssociatedDeviceNumberOfEntries?._value === 'number') {
          active += w.WLAN_AssociatedDeviceNumberOfEntries._value;
        }
      }
    }

    if (active === 0) {
      for (let i = 1; i <= 8; i++) {
        const assoc = wlans[String(i)]?.AssociatedDevice;
        if (assoc) {
          const keys = Object.keys(assoc).filter(k => !k.startsWith('_'));
          active += keys.length;
        }
      }
    }

    await db.collection('devices').updateOne(
      { _id: dev._id },
      {
        $set: {
          'VirtualParameters.activedevices': {
            _object: false,
            _writable: false,
            _type: 'xsd:int',
            _value: active,
            _timestamp: now
          }
        }
      }
    );
    updatedCount++;
  }

  console.log('Successfully refreshed activedevices for all ' + updatedCount + ' devices in database.');
  await client.close();
}

run().catch(console.error);
