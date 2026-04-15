const fs = require('fs');
const path = require('path');

const URL = 'https://graphql.anilist.co';
const OUTPUT_FILE = path.join(__dirname, '../frontend/public/anilist_data.json');
const STATUS_FILE = path.join(__dirname, 'scraper_status.json');

// Using a slightly smaller batch size to keep query complexity under control with 20 aliases
const BATCH_SIZE = 10; 
const TARGET_COUNT = 30000; // Effectively "Everything"

let data = {
  anime: {},
  seiyuus: {}
};

let status = {
  currentPage: 1,
  totalScraped: 0,
  isFinished: false
};

if (fs.existsSync(OUTPUT_FILE)) {
  try {
    data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
  } catch (e) {
    console.error("Failed to load existing data, starting fresh.");
  }
}

if (fs.existsSync(STATUS_FILE)) {
  try {
    status = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
  } catch (e) {
    console.error("Failed to load status, starting from page 1.");
  }
}

function save() {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data));
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
}

async function fetchPage(page) {
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

    const query = `
        query ($page: Int, $perPage: Int) {
            Page(page: $page, perPage: $perPage) {
                pageInfo { hasNextPage total }
                media(type: ANIME, sort: POPULARITY_DESC) {
                    id
                    title { romaji english }
                    coverImage { medium }
                    ${aliasGroups}
                }
            }
        }
    `;

    const response = await fetch(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { page, perPage: BATCH_SIZE } })
    });

    if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || 60;
        console.log(`Rate limited! Retrying after ${retryAfter}s...`);
        return { error: 'rate-limit', retryAfter: parseInt(retryAfter) };
    }

    const json = await response.json();
    if (json.errors) {
        console.error("GraphQL Errors:", JSON.stringify(json.errors, null, 2));
        return { error: 'api-error' };
    }

    return json.data.Page;
}

function processAnime(animeList) {
    let count = 0;
    for (const media of animeList) {
        // Skip if already processed (we allow re-processing if target count increases)
        if (data.anime[media.id]) continue;

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

        if (Object.keys(animeSeiyuus).length === 0) {
            console.log(`Skipping ${media.title.romaji} (ID: ${media.id}) - No seiyuus found.`);
            continue;
        }

        data.anime[media.id] = {
            t: { 
                r: media.title.romaji, 
                e: media.title.english || media.title.romaji 
            },
            i: media.coverImage.medium,
            s: animeSeiyuus
        };
        count++;
    }
    return count;
}

async function scrape() {
    console.log(`Starting DEEP scraping from page ${status.currentPage}...`);
    
    while (!status.isFinished && status.totalScraped < TARGET_COUNT) {
        const pageData = await fetchPage(status.currentPage);

        if (pageData.error === 'rate-limit') {
            await new Promise(r => setTimeout(r, (pageData.retryAfter + 1) * 1000));
            continue;
        }

        if (pageData.error) {
            console.log("Stopping due to API error. Will retry from this page later.");
            break;
        }

        const processed = processAnime(pageData.media);
        status.totalScraped += processed;
        console.log(`Page ${status.currentPage} finished. Scraped ${processed} new anime. Total now: ${status.totalScraped}`);

        if (!pageData.pageInfo.hasNextPage) {
            status.isFinished = true;
            console.log("Reached final page of AniList! Scraping completed.");
        } else {
            status.currentPage++;
        }

        // Save progress every page
        save();

        // Breath delay
        await new Promise(r => setTimeout(r, 1500));
    }

    save();
    console.log(`Scrape session concluded. Total anime: ${Object.keys(data.anime).length}, Total seiyuus: ${Object.keys(data.seiyuus).length}`);
}

scrape().catch(console.error);
