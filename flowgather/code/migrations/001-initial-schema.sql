-- Up

-- Unique Sources
CREATE TABLE datasources (
  id INTEGER PRIMARY KEY,
  hardwareAddress BLOB,
  primaryAddress TEXT,
  interfaceName TEXT,
  hostName TEXT,
  description TEXT
);

-- Unique endpoints
-- ISO8601 for times

CREATE TABLE endpoints (
  id INTEGER PRIMARY KEY,
  type INTEGER,
  raw BLOB,
  discoveryTime TEXT,
  description TEXT,
  datasrcId INTEGER,
  FOREIGN KEY(datasrcId) REFERENCES sources(id)
);

-- Biflows

CREATE TABLE biflows (
  id INTEGER PRIMARY KEY,
  type INTEGER,
  aEid INTEGER,
  bEid INTEGER,
  bidir INTEGER,
  parentBiflowId INTEGER,
  discoveryTime TEXT,
  description TEXT,
  datasrcId INTEGER,
  FOREIGN KEY(aEid) REFERENCES endpoints(id),
  FOREIGN KEY(bEid) REFERENCES endpoints(id)
  FOREIGN KEY(parentBiflowId) REFERENCES biflows(id)
  FOREIGN KEY(datasrcId) REFERENCES sources(id)
);

CREATE TABLE dnsReplies (
  id INTEGER PRIMARY KEY,
  parentBiflowId INTEGER,
  responseCode TEXT,
  questions TEXT,
  answers TEXT,
  FOREIGN KEY(parentBiflowId) REFERENCES biflows(id)
);

CREATE TABLE tlsClientFingerprints (
  id INTEGER PRIMARY KEY,
  parentBiflowId INTEGER,
  fingerprint TEXT,
  fingerprintMD5 TEXT,
  FOREIGN KEY(parentBiflowId) REFERENCES biflows(id)
);

CREATE TABLE tlsServerFingerprints (
  id INTEGER PRIMARY KEY,
  parentBiflowId INTEGER,
  fingerprint TEXT,
  fingerprintMD5 TEXT,
  FOREIGN KEY(parentBiflowId) REFERENCES biflows(id)
);
-- Down
