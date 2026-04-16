const fs = require('fs');
const path = require('path');

const URL = 'https://graphql.anilist.co';
const DATA_FILE = path.join(__dirname, '../frontend/public/anilist_data.json');
const PATCH_FILE = path.join(__dirname, 'patch_ids.txt');

// Load existing data
let data = { anime: {}, seiyuus: {} };
if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    console.log(`Loaded existing DB with ${Object.keys(data.anime).length} anime.`);
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

// Generate 20 aliases (1,000 characters total) to stay consistent with scraper.js
let aliasGroups = '';
for (let i = 1; i <= 20; i++) {
    aliasGroups += `p${i}: characters(page: ${i}, perPage: 50, sort: [ROLE, RELEVANCE]) { ${characterFields} }\n`;
}

const query = `
    query ($id: Int) {
        Media(id: $id, type: ANIME) {
            id
            title { romaji english }
            coverImage { medium }
            ${aliasGroups}
        }
    }
`;

async function fetchAnime(id) {
    console.log(`Fetching ID: ${id}...`);
    const response = await fetch(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { id: parseInt(id) } })
    });

    if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || 60;
        console.log(`Rate limited! Waiting ${retryAfter}s...`);
        await new Promise(r => setTimeout(r, (parseInt(retryAfter) + 1) * 1000));
        return fetchAnime(id);
    }

    const json = await response.json();
    if (json.errors) {
        console.error(`Error for ID ${id}:`, JSON.stringify(json.errors[0].message));
        return null;
    }

    return json.data.Media;
}

function processAnime(media) {
    if (!media) return false;

    const animeSeiyuus = {};
    for (let i = 1; i <= 20; i++) {
        const pageData = media[`p${i}`];
        if (!pageData || !pageData.edges) continue;

        pageData.edges.forEach(edge => {
            const vaList = edge.voiceActors || [];
            if (vaList.length > 0) {
                const charName = edge.node?.name?.full;
                vaList.forEach(va => {
                    // Update global seiyuu master list
                    if (!data.seiyuus[va.id]) {
                        data.seiyuus[va.id] = va.name.full;
                    }
                    // Add to this anime's seiyuu list
                    if (!animeSeiyuus[va.id]) {
                        animeSeiyuus[va.id] = [];
                    }
                    if (charName && !animeSeiyuus[va.id].includes(charName)) {
                        animeSeiyuus[va.id].push(charName);
                    }
                });
            }
        });

        if (!pageData.pageInfo.hasNextPage) break;
    }

    if (Object.keys(animeSeiyuus).length === 0) {
        console.log(`Skipping ${media.title.romaji} - No seiyuus found.`);
        return false;
    }

    data.anime[media.id] = {
        t: { 
            r: media.title.romaji, 
            e: media.title.english || media.title.romaji 
        },
        i: media.coverImage.medium,
        s: animeSeiyuus
    };

    return true;
}

async function runPatch() {
    if (!fs.existsSync(PATCH_FILE)) {
        console.error(`Patch file not found: ${PATCH_FILE}`);
        return;
    }

    const ids = fs.readFileSync(PATCH_FILE, 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

    console.log(`Found ${ids.length} IDs to patch.`);
    let addedCount = 0;

    for (const id of ids) {
        // Optional: Skip if already exists (unless we add a force flag)
        if (data.anime[id]) {
            console.log(`ID ${id} already in DB. Skipping...`);
            continue;
        }

        const media = await fetchAnime(id);
        if (processAnime(media)) {
            addedCount++;
            console.log(`Successfully added: ${media.title.romaji}`);
        }

        // Delay to be nice to API
        await new Promise(r => setTimeout(r, 1000));
    }

    if (addedCount > 0) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data));
        console.log(`Done! Added ${addedCount} new entries. Total DB size: ${Object.keys(data.anime).length}`);
    } else {
        console.log("No new entries were added.");
    }
}

runPatch().catch(console.error);
