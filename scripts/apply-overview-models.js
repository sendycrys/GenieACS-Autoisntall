const { MongoClient } = require('/usr/lib/node_modules/genieacs/node_modules/mongodb');

const newConfigs = [
  // 1. Define Chart "ont-model" (TIPE PERANGKAT)
  { _id: "ui.overview.charts.ont-model.label", value: "'Tipe Perangkat'" },
  
  // Slices for ont-model
  { _id: "ui.overview.charts.ont-model.slices.1_F663NV3a.label", value: "'F663NV3a'" },
  { _id: "ui.overview.charts.ont-model.slices.1_F663NV3a.color", value: "'#00DBFF'" },
  { _id: "ui.overview.charts.ont-model.slices.1_F663NV3a.filter", value: 'DeviceID.ProductClass = "F663NV3a" OR DeviceID.ProductClass = "F663NV3A" OR DeviceID.ProductClass = "F663NV3a-XPON" OR DeviceID.ProductClass = "ZX-F663NV3a XPON"' },

  { _id: "ui.overview.charts.ont-model.slices.2_F663NV9.label", value: "'F663NV9'" },
  { _id: "ui.overview.charts.ont-model.slices.2_F663NV9.color", value: "'#5BFF00'" },
  { _id: "ui.overview.charts.ont-model.slices.2_F663NV9.filter", value: 'DeviceID.ProductClass = "F663NV9" OR DeviceID.ProductClass = "F663NV9 XPON"' },

  { _id: "ui.overview.charts.ont-model.slices.3_F477V2.label", value: "'F477V2'" },
  { _id: "ui.overview.charts.ont-model.slices.3_F477V2.color", value: "'#FBF104'" },
  { _id: "ui.overview.charts.ont-model.slices.3_F477V2.filter", value: 'DeviceID.ProductClass = "F477V2 EPON" OR DeviceID.ProductClass = "F477V2" OR DeviceID.ProductClass = "ZXHN F477V2"' },

  { _id: "ui.overview.charts.ont-model.slices.4_XSF609.label", value: "'XSF609'" },
  { _id: "ui.overview.charts.ont-model.slices.4_XSF609.color", value: "'#A400FF'" },
  { _id: "ui.overview.charts.ont-model.slices.4_XSF609.filter", value: 'DeviceID.ProductClass = "XSF609"' },

  { _id: "ui.overview.charts.ont-model.slices.5_GM219.label", value: "'GM219'" },
  { _id: "ui.overview.charts.ont-model.slices.5_GM219.color", value: "'#FB0489'" },
  { _id: "ui.overview.charts.ont-model.slices.5_GM219.filter", value: 'DeviceID.ProductClass = "GM219"' },

  { _id: "ui.overview.charts.ont-model.slices.6_H1s.label", value: "'H1s-3 / CMDC'" },
  { _id: "ui.overview.charts.ont-model.slices.6_H1s.color", value: "'#0066FF'" },
  { _id: "ui.overview.charts.ont-model.slices.6_H1s.filter", value: 'DeviceID.ProductClass = "H1s-3" OR DeviceID.ProductClass = "H3-2S XPON"' },

  { _id: "ui.overview.charts.ont-model.slices.7_Other.label", value: "'Lainnya'" },
  { _id: "ui.overview.charts.ont-model.slices.7_Other.color", value: "'#D65315'" },
  { _id: "ui.overview.charts.ont-model.slices.7_Other.filter", value: 'DeviceID.ProductClass <> "F663NV3a" AND DeviceID.ProductClass <> "F663NV3A" AND DeviceID.ProductClass <> "F663NV3a-XPON" AND DeviceID.ProductClass <> "ZX-F663NV3a XPON" AND DeviceID.ProductClass <> "F663NV9" AND DeviceID.ProductClass <> "F663NV9 XPON" AND DeviceID.ProductClass <> "F477V2 EPON" AND DeviceID.ProductClass <> "F477V2" AND DeviceID.ProductClass <> "ZXHN F477V2" AND DeviceID.ProductClass <> "XSF609" AND DeviceID.ProductClass <> "GM219" AND DeviceID.ProductClass <> "H1s-3" AND DeviceID.ProductClass <> "H3-2S XPON"' },

  // 2. Also improve "ont-type" (Merk Perangkat) to properly include RTEG, ZICG, ZTEG under ZTE, and CMDC
  { _id: "ui.overview.charts.ont-type.slices.5_ZTE.filter", value: 'DeviceID.Manufacturer = "ZTE" OR DeviceID.Manufacturer = "ZTEG" OR DeviceID.Manufacturer = "ZICG" OR DeviceID.Manufacturer = "RTEG"' },
  { _id: "ui.overview.charts.ont-type.slices.3_CMDC.label", value: "'China Mobile'" },
  { _id: "ui.overview.charts.ont-type.slices.3_CMDC.color", value: "'#0066FF'" },
  { _id: "ui.overview.charts.ont-type.slices.3_CMDC.filter", value: 'DeviceID.Manufacturer = "CMDC"' },
  { _id: "ui.overview.charts.ont-type.slices.1_Huawei.filter", value: 'DeviceID.Manufacturer = "Huawei Technologies Co., Ltd" OR DeviceID.Manufacturer = "EcomTech Technologies Co., Ltd" OR DeviceID.Manufacturer = "HWTC"' },
  { _id: "ui.overview.charts.ont-type.slices.7_Other.filter", value: 'DeviceID.Manufacturer <> "ZTE" AND DeviceID.Manufacturer <> "ZTEG" AND DeviceID.Manufacturer <> "ZICG" AND DeviceID.Manufacturer <> "RTEG" AND DeviceID.Manufacturer <> "CMDC" AND DeviceID.Manufacturer <> "Huawei Technologies Co., Ltd" AND DeviceID.Manufacturer <> "EcomTech Technologies Co., Ltd" AND DeviceID.Manufacturer <> "HWTC" AND DeviceID.Manufacturer <> "FiberHome" AND DeviceID.Manufacturer <> "ZIONCOM" AND DeviceID.Manufacturer <> "MikroTik"' },

  // 3. Layout overview groups:
  // Group 2: Tipe Perangkat, Merk Perangkat, Optical Temperatur
  { _id: "ui.overview.groups.2_register.charts.0", value: "'ont-model'" },
  { _id: "ui.overview.groups.2_register.charts.1", value: "'ont-type'" },
  { _id: "ui.overview.groups.2_register.charts.2", value: "'temp'" },

  // Group 3: Devices Register
  { _id: "ui.overview.groups.3_register.label", value: "'Registrasi & Aktivasi Perangkat'" },
  { _id: "ui.overview.groups.3_register.charts.0", value: "'devreg'" }
];

async function run() {
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();
  const db = client.db('genieacs');

  for (const c of newConfigs) {
    await db.collection('config').replaceOne({ _id: c._id }, c, { upsert: true });
  }

  console.log('Successfully saved ' + newConfigs.length + ' overview chart configs to MongoDB!');
  await client.close();
}

run().catch(console.error);
