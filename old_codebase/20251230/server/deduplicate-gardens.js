const fs = require('fs');
const path = require('path');

const persistenceFile = path.join(__dirname, 'eden-wallet-persistence.json');

if (!fs.existsSync(persistenceFile)) {
  console.error(`❌ Persistence file not found: ${persistenceFile}`);
  process.exit(1);
}

try {
  const fileContent = fs.readFileSync(persistenceFile, 'utf-8');
  const persisted = JSON.parse(fileContent);
  
  if (!persisted.gardens || !Array.isArray(persisted.gardens)) {
    console.log('✅ No gardens array found - nothing to deduplicate');
    process.exit(0);
  }
  
  const originalCount = persisted.gardens.length;
  const deduplicatedGardens = new Map();
  
  for (const garden of persisted.gardens) {
    const existing = deduplicatedGardens.get(garden.id);
    if (!existing) {
      deduplicatedGardens.set(garden.id, garden);
    } else {
      // Prefer the one with certificate
      const hasCert = !!(garden.certificate);
      const existingHasCert = !!(existing.certificate);
      if (hasCert && !existingHasCert) {
        deduplicatedGardens.set(garden.id, garden);
        console.log(`⚠️  Found duplicate garden ${garden.id} - keeping version with certificate`);
      } else {
        console.log(`⚠️  Found duplicate garden ${garden.id} - keeping existing version`);
      }
    }
  }
  
  const cleanGardens = Array.from(deduplicatedGardens.values());
  persisted.gardens = cleanGardens;
  persisted.lastSaved = new Date().toISOString();
  
  fs.writeFileSync(persistenceFile, JSON.stringify(persisted, null, 2), 'utf-8');
  
  const removed = originalCount - cleanGardens.length;
  if (removed > 0) {
    console.log(`✅ Removed ${removed} duplicate(s) from gardens array (${originalCount} → ${cleanGardens.length})`);
  } else {
    console.log(`✅ No duplicates found - ${cleanGardens.length} gardens are unique`);
  }
} catch (err) {
  console.error(`❌ Error deduplicating gardens: ${err.message}`);
  process.exit(1);
}

