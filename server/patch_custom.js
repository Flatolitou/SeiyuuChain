const fs = require('fs');
const path = require('path');

const URL = 'https://graphql.anilist.co';
const BASE_DB_FILE = path.join(__dirname, '../frontend/public/anilist_data.json');
const GAME_DB_FILE = path.join(__dirname, '../frontend/public/anilist_data_game.json');
const PATCHES_FILE = path.join(__dirname, 'custom_patches.json');

// GraphQL queries
const ANIME_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      title { romaji english }
      coverImage { medium }
      characters(page: 1, perPage: 50, sort: [ROLE, RELEVANCE]) {
        edges {
          node { name { full } }
          voiceActors(language: JAPANESE, sort: RELEVANCE) {
            id
            name { full }
          }
        }
      }
    }
  }
`;

const STAFF_QUERY = `
  query ($id: Int) {
    Staff(id: $id) {
      id
      name { full }
    }
  }
`;

async function fetchFromAniList(query, variables) {
  try {
    const response = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    });

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After')) || 5;
      console.log(`Rate limited by AniList. Sleeping for ${retryAfter}s before retrying...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return fetchFromAniList(query, variables);
    }

    const json = await response.json();
    if (json.errors) {
      console.error(`AniList API Error:`, json.errors[0].message);
      return null;
    }
    return json.data;
  } catch (err) {
    console.error(`Network error querying AniList:`, err);
    return null;
  }
}

async function run() {
  console.log("Starting custom database patching script...");

  // 1. Load Base DB
  if (!fs.existsSync(BASE_DB_FILE)) {
    console.error(`Error: Base database not found at ${BASE_DB_FILE}`);
    process.exit(1);
  }
  const db = JSON.parse(fs.readFileSync(BASE_DB_FILE, 'utf8'));
  console.log(`Loaded base DB: ${Object.keys(db.anime).length} anime, ${Object.keys(db.seiyuus).length} seiyuus.`);

  // 2. Load custom patches
  if (!fs.existsSync(PATCHES_FILE)) {
    // Create an empty patches file with instructions
    const samplePatches = {
      description: "Put custom anime or voice actor additions here. If titles/coverImage are left blank for a new show, the script will attempt to fetch them from AniList by ID.",
      anime: [
        {
          id: 16498,
          titleRomaji: "Shingeki no Kyojin Season 2",
          titleEnglish: "Attack on Titan Season 2",
          coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx16498-755106-cover.png",
          seiyuus: [
            {
              id: 95067,
              name: "Yuki Kaji",
              characters: ["Eren Yeager"]
            }
          ]
        }
      ]
    };
    fs.writeFileSync(PATCHES_FILE, JSON.stringify(samplePatches, null, 2));
    console.log(`Created template custom patch file at ${PATCHES_FILE}. Please fill it out and run the script again.`);
    process.exit(0);
  }

  const patchData = JSON.parse(fs.readFileSync(PATCHES_FILE, 'utf8'));
  const patches = patchData.anime || [];
  console.log(`Loaded ${patches.length} patches from custom_patches.json.`);

  let customShowsAdded = 0;
  let customSeiyuusAdded = 0;

  for (const patch of patches) {
    const animeId = parseInt(patch.id);
    if (isNaN(animeId)) {
      console.warn("Skipping patch with invalid or missing ID:", patch);
      continue;
    }

    const animeIdStr = animeId.toString();

    // CASE 1: Show already exists in the database
    if (db.anime[animeIdStr]) {
      console.log(`Patching existing show [ID: ${animeIdStr}]: ${db.anime[animeIdStr].t.r || db.anime[animeIdStr].t.e}`);
      const anime = db.anime[animeIdStr];

      for (const seiyuuPatch of (patch.seiyuus || [])) {
        const sId = parseInt(seiyuuPatch.id);
        if (isNaN(sId)) continue;
        const sIdStr = sId.toString();

        // Ensure character names is an array
        const charList = Array.isArray(seiyuuPatch.characters) ? seiyuuPatch.characters : (seiyuuPatch.characters ? [seiyuuPatch.characters] : []);

        if (anime.s[sIdStr]) {
          // Merge characters
          const mergedChars = Array.from(new Set([...anime.s[sIdStr], ...charList]));
          anime.s[sIdStr] = mergedChars;
        } else {
          // Resolve name
          let name = seiyuuPatch.name;
          if (!name && db.seiyuus[sIdStr]) {
            name = db.seiyuus[sIdStr];
          }
          if (!name) {
            console.log(`Fetching name for missing Seiyuu ID ${sIdStr} from AniList...`);
            const staffResult = await fetchFromAniList(STAFF_QUERY, { id: sId });
            if (staffResult && staffResult.Staff) {
              name = staffResult.Staff.name.full;
            }
          }
          if (!name) {
            name = `Unknown Voice Actor (${sIdStr})`;
          }

          db.seiyuus[sIdStr] = name;
          anime.s[sIdStr] = charList;
          customSeiyuusAdded++;
        }
      }
    } 
    // CASE 2: Show does NOT exist in the database
    else {
      console.log(`Creating new show [ID: ${animeIdStr}]...`);

      let titleR = patch.titleRomaji;
      let titleE = patch.titleEnglish;
      let img = patch.coverImage;
      const patchSeiyuus = patch.seiyuus || [];

      let fetchedSeiyuusDict = {};

      // If missing metadata, try to fetch from AniList
      if (!titleR && !titleE) {
        console.log(`Metadata missing for show ID ${animeIdStr}. Fetching from AniList...`);
        const animeResult = await fetchFromAniList(ANIME_QUERY, { id: animeId });
        if (animeResult && animeResult.Media) {
          const media = animeResult.Media;
          titleR = media.title.romaji || titleR;
          titleE = media.title.english || titleE;
          img = media.coverImage.medium || img;

          // Parse characters and voice actors from AniList
          if (media.characters && media.characters.edges) {
            media.characters.edges.forEach(edge => {
              const charName = edge.node.name.full;
              const voiceActors = edge.voiceActors || [];
              voiceActors.forEach(va => {
                const vaIdStr = va.id.toString();
                // Add name to global list
                db.seiyuus[vaIdStr] = va.name.full;
                // Add character
                if (!fetchedSeiyuusDict[vaIdStr]) {
                  fetchedSeiyuusDict[vaIdStr] = [];
                }
                fetchedSeiyuusDict[vaIdStr].push(charName);
              });
            });
          }
        }
      }

      // If we still don't have titles, we can't create it
      if (!titleR && !titleE) {
        console.error(`Error: Could not resolve title for new show ID ${animeIdStr}. Please provide titleRomaji/titleEnglish in custom_patches.json.`);
        continue;
      }

      // Create show object
      const newAnimeObj = {
        t: { r: titleR || '', e: titleE || '' },
        i: img || '',
        s: fetchedSeiyuusDict
      };

      // Add/merge custom seiyuus from the patch
      for (const seiyuuPatch of patchSeiyuus) {
        const sId = parseInt(seiyuuPatch.id);
        if (isNaN(sId)) continue;
        const sIdStr = sId.toString();

        const charList = Array.isArray(seiyuuPatch.characters) ? seiyuuPatch.characters : (seiyuuPatch.characters ? [seiyuuPatch.characters] : []);

        if (newAnimeObj.s[sIdStr]) {
          newAnimeObj.s[sIdStr] = Array.from(new Set([...newAnimeObj.s[sIdStr], ...charList]));
        } else {
          let name = seiyuuPatch.name;
          if (!name && db.seiyuus[sIdStr]) {
            name = db.seiyuus[sIdStr];
          }
          if (!name) {
            console.log(`Fetching name for missing Seiyuu ID ${sIdStr} from AniList...`);
            const staffResult = await fetchFromAniList(STAFF_QUERY, { id: sId });
            if (staffResult && staffResult.Staff) {
              name = staffResult.Staff.name.full;
            }
          }
          if (!name) {
            name = `Unknown Voice Actor (${sIdStr})`;
          }

          db.seiyuus[sIdStr] = name;
          newAnimeObj.s[sIdStr] = charList;
          customSeiyuusAdded++;
        }
      }

      db.anime[animeIdStr] = newAnimeObj;
      customShowsAdded++;
    }
  }

  // 3. Filter database: VERY IMPORTANT - remove shows with only 1 voice actor
  console.log("Filtering out shows with <= 1 voice actors...");
  let showsRemoved = 0;
  for (const id in db.anime) {
    const anime = db.anime[id];
    const vaCount = Object.keys(anime.s).length;
    if (vaCount < 2) {
      delete db.anime[id];
      showsRemoved++;
    }
  }
  console.log(`Removed ${showsRemoved} shows with only 1 (or 0) voice actors.`);

  // 4. Clean up orphaned seiyuus (no shows reference them)
  const referencedSeiyuus = new Set();
  for (const id in db.anime) {
    const anime = db.anime[id];
    for (const sId in anime.s) {
      referencedSeiyuus.add(sId);
    }
  }

  let seiyuusCleaned = 0;
  for (const sId in db.seiyuus) {
    if (!referencedSeiyuus.has(sId)) {
      delete db.seiyuus[sId];
      seiyuusCleaned++;
    }
  }
  console.log(`Removed ${seiyuusCleaned} orphaned voice actors.`);

  // 5. Save Game DB
  fs.writeFileSync(GAME_DB_FILE, JSON.stringify(db));
  console.log(`\nSuccess! Patched database saved to: ${GAME_DB_FILE}`);
  console.log(`Custom shows added: ${customShowsAdded}`);
  console.log(`Custom voice actors added: ${customSeiyuusAdded}`);
  console.log(`Final Database Stats: ${Object.keys(db.anime).length} anime, ${Object.keys(db.seiyuus).length} voice actors.`);
}

run();
