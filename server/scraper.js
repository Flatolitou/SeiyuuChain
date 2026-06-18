const fs = require('fs');
const path = require('path');

const URL = 'https://graphql.anilist.co';
const OUTPUT_FILE = path.join(__dirname, '../frontend/public/anilist_data.json');
const STATUS_FILE = path.join(__dirname, 'scraper_status.json');

const MAX_ID = 300000; // Configurable max ID to scan
const SCAN_BATCH_SIZE = 50;
const DETAIL_BATCH_SIZE = 10;

let data = {
  anime: {},
  seiyuus: {}
};

let status = {
  lastScannedId: 0,
  validAnimeIds: {} // ID -> updatedAt
};

function loadDatabase() {
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      console.log(`Loaded existing DB: ${Object.keys(data.anime).length} anime, ${Object.keys(data.seiyuus).length} seiyuus.`);
    } catch (e) {
      console.error("Failed to load existing data, starting fresh.");
    }
  }
}

function saveDatabase() {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data));
}

function loadStatus() {
  if (fs.existsSync(STATUS_FILE)) {
    try {
      const fileData = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
      if (fileData.lastScannedId !== undefined) {
        status = fileData;
        console.log(`Loaded status: scanned up to ID ${status.lastScannedId}, found ${Object.keys(status.validAnimeIds).length} valid anime.`);
      } else {
        console.log("Old status format detected, starting fresh ID scanner status.");
      }
    } catch (e) {
      console.error("Failed to load status, starting from scratch.");
    }
  }
}

function saveStatus() {
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
}

function cleanupDatabase() {
  console.log("Running database cleanup pass...");
  let removedAnime = 0;
  for (const id in data.anime) {
    const anime = data.anime[id];
    if (!anime.s || Object.keys(anime.s).length === 0) {
      delete data.anime[id];
      removedAnime++;
    }
  }
  
  // Rebuild active seiyuu set
  const activeSeiyuus = new Set();
  for (const id in data.anime) {
    const anime = data.anime[id];
    for (const sId in anime.s) {
      activeSeiyuus.add(sId);
    }
  }
  
  let removedSeiyuus = 0;
  for (const sId in data.seiyuus) {
    if (!activeSeiyuus.has(sId)) {
      delete data.seiyuus[sId];
      removedSeiyuus++;
    }
  }
  
  console.log(`Cleanup finished. Removed ${removedAnime} anime with no seiyuus. Cleaned up ${removedSeiyuus} orphaned seiyuus.`);
}

async function fetchScannerBatch(ids) {
  const query = `
    query ($ids: [Int]) {
      Page(page: 1, perPage: 50) {
        media(id_in: $ids, type: ANIME) {
          id
          updatedAt
        }
      }
    }
  `;

  const response = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { ids } })
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After') || 60;
    console.log(`Rate limited! Retrying after ${retryAfter}s...`);
    return { error: 'rate-limit', retryAfter: parseInt(retryAfter) };
  }

  // Handle low rate limit remaining proactively
  const remaining = parseInt(response.headers.get('x-ratelimit-remaining'));
  if (!isNaN(remaining) && remaining < 10) {
    console.log(`Rate limit remaining is low (${remaining}). Sleeping for 5s...`);
    await new Promise(r => setTimeout(r, 5000));
  }

  const json = await response.json();
  if (json.errors) {
    console.error("GraphQL Errors:", JSON.stringify(json.errors, null, 2));
    return { error: 'api-error' };
  }

  return json.data.Page;
}

const characterFields = `
  pageInfo { hasNextPage total }
  edges {
    node { name { full } }
    voiceActors(language: JAPANESE, sort: RELEVANCE) {
      id
      name { full }
    }
  }
`;

// Generate 20 aliases (1,000 characters total)
let aliasGroups = '';
for (let i = 1; i <= 20; i++) {
  aliasGroups += `p${i}: characters(page: ${i}, perPage: 50, sort: [ROLE, RELEVANCE]) { ${characterFields} }\n`;
}

const detailQuery = `
  query ($ids: [Int]) {
    Page(page: 1, perPage: 10) {
      media(id_in: $ids, type: ANIME) {
        id
        title { romaji english }
        coverImage { medium }
        updatedAt
        ${aliasGroups}
      }
    }
  }
`;

async function fetchDetailBatch(ids) {
  const response = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: detailQuery, variables: { ids } })
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After') || 60;
    console.log(`Rate limited! Retrying after ${retryAfter}s...`);
    return { error: 'rate-limit', retryAfter: parseInt(retryAfter) };
  }

  // Handle low rate limit remaining proactively
  const remaining = parseInt(response.headers.get('x-ratelimit-remaining'));
  if (!isNaN(remaining) && remaining < 10) {
    console.log(`Rate limit remaining is low (${remaining}). Sleeping for 5s...`);
    await new Promise(r => setTimeout(r, 5000));
  }

  const json = await response.json();
  if (json.errors) {
    console.error("GraphQL Errors:", JSON.stringify(json.errors, null, 2));
    return { error: 'api-error' };
  }

  return json.data.Page;
}

function processAnime(mediaList) {
  let addedOrUpdated = 0;
  for (const media of mediaList) {
    const animeSeiyuus = {};
    
    // Collect edges from all aliases (p1 to p20)
    for (let i = 1; i <= 20; i++) {
      const pageData = media[`p${i}`];
      if (!pageData || !pageData.edges) continue;

      pageData.edges.forEach(edge => {
        const vaList = edge.voiceActors || [];
        if (vaList.length > 0) {
          const charName = edge.node?.name?.full;
          vaList.forEach(va => {
            if (!data.seiyuus[va.id]) {
              data.seiyuus[va.id] = va.name.full;
            }
            if (!animeSeiyuus[va.id]) {
              animeSeiyuus[va.id] = [];
            }
            if (charName && !animeSeiyuus[va.id].includes(charName)) {
              animeSeiyuus[va.id].push(charName);
            }
          });
        }
      });

      // If an alias shows no more pages, stop collecting for this anime
      if (!pageData.pageInfo.hasNextPage) break;
    }

    // Skip/exclude if no Japanese seiyuus found
    if (Object.keys(animeSeiyuus).length === 0) {
      console.log(`Skipping ${media.title.romaji || 'Unknown'} (ID: ${media.id}) - No Japanese seiyuus found.`);
      if (data.anime[media.id]) {
        delete data.anime[media.id];
      }
      continue;
    }

    // Update or insert into data.anime
    data.anime[media.id] = {
      t: { 
        r: media.title.romaji, 
        e: media.title.english || media.title.romaji 
      },
      i: media.coverImage.medium,
      u: media.updatedAt,
      s: animeSeiyuus
    };
    addedOrUpdated++;
  }
  return addedOrUpdated;
}

async function scrape() {
  console.log("--- Starting AniList Scraper Rework ---");
  
  // 1. Load scanner status
  loadStatus();

  // 2. Phase 1: Valid Anime ID Scanner
  if (status.lastScannedId < MAX_ID) {
    console.log(`Phase 1: Scanning IDs ${status.lastScannedId + 1} to ${MAX_ID}...`);
    while (status.lastScannedId < MAX_ID) {
      const start = status.lastScannedId + 1;
      const end = Math.min(start + SCAN_BATCH_SIZE - 1, MAX_ID);
      
      const ids = [];
      for (let i = start; i <= end; i++) {
        ids.push(i);
      }

      console.log(`Scanning batch of IDs ${start} to ${end}...`);
      const pageData = await fetchScannerBatch(ids);

      if (pageData && pageData.error === 'rate-limit') {
        await new Promise(r => setTimeout(r, (pageData.retryAfter + 1) * 1000));
        continue;
      }

      if (!pageData || pageData.error) {
        console.error("API error during scan. Retrying in 5 seconds...");
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      if (pageData.media) {
        pageData.media.forEach(media => {
          status.validAnimeIds[media.id] = media.updatedAt;
        });
      }

      status.lastScannedId = end;
      saveStatus();

      // Breath delay between scanner requests
      await new Promise(r => setTimeout(r, 700));
    }
    console.log("Phase 1 complete! All IDs scanned.");
  } else {
    console.log("Phase 1: ID scanning is already complete.");
  }

  // 3. Load database & clean up empty/orphaned records
  loadDatabase();
  cleanupDatabase();
  saveDatabase();

  // 4. Phase 2: Detail Scraper & Update Engine
  console.log("Phase 2: Identifying missing or outdated entries...");
  const missingIds = [];
  for (const id in status.validAnimeIds) {
    const aniListUpdatedAt = status.validAnimeIds[id];
    const localEntry = data.anime[id];
    if (!localEntry || !localEntry.u || aniListUpdatedAt > localEntry.u) {
      missingIds.push(parseInt(id));
    }
  }

  console.log(`Found ${missingIds.length} missing or outdated anime entries to fetch/update.`);

  if (missingIds.length > 0) {
    let batchIndex = 0;
    while (batchIndex < missingIds.length) {
      const batchIds = missingIds.slice(batchIndex, batchIndex + DETAIL_BATCH_SIZE);
      console.log(`Fetching details for batch ${Math.floor(batchIndex / DETAIL_BATCH_SIZE) + 1}/${Math.ceil(missingIds.length / DETAIL_BATCH_SIZE)} (IDs: ${batchIds.join(', ')})...`);
      
      const pageData = await fetchDetailBatch(batchIds);

      if (pageData && pageData.error === 'rate-limit') {
        await new Promise(r => setTimeout(r, (pageData.retryAfter + 1) * 1000));
        continue;
      }

      if (!pageData || pageData.error) {
        console.error("API error during details fetch. Retrying in 5 seconds...");
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      if (pageData.media) {
        const processed = processAnime(pageData.media);
        console.log(`Processed details for ${pageData.media.length} media. Added/updated ${processed} entries.`);
      }

      batchIndex += DETAIL_BATCH_SIZE;
      
      // Save database periodically
      saveDatabase();
      
      // Breath delay between detail scraper requests
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  // Final database cleanup & save
  cleanupDatabase();
  saveDatabase();
  console.log("--- AniList Scraper Concluded Successfully ---");
  console.log(`Final Database Stats: ${Object.keys(data.anime).length} anime, ${Object.keys(data.seiyuus).length} seiyuus.`);
}

scrape().catch(console.error);
