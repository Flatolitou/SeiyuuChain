import Fuse from 'fuse.js';

let db = {
  anime: {},
  seiyuus: {}
};

let fuse = null;

export async function initDb() {
  if (Object.keys(db.anime).length > 0) return db;

  try {
    let response;
    try {
      response = await fetch('/anilist_data_game.json');
      if (!response.ok) throw new Error("Game DB not found");
    } catch (e) {
      console.log("Failed to load /anilist_data_game.json, falling back to /anilist_data.json");
      response = await fetch('/anilist_data.json');
    }
    db = await response.json();
    
    // Initialize Fuse for searching
    const searchData = Object.entries(db.anime).map(([id, data]) => ({
      id: parseInt(id),
      titleRomaji: data.t.r,
      titleEnglish: data.t.e
    }));

    fuse = new Fuse(searchData, {
      keys: ['titleRomaji', 'titleEnglish'],
      threshold: 0.4,
      ignoreLocation: true
    });

    console.log("Local DB initialized with", Object.keys(db.anime).length, "anime.");
    return db;
  } catch (error) {
    console.error("Failed to load local database:", error);
    return null;
  }
}

export function searchAnimeLocal(query) {
  if (!fuse) return [];
  const results = fuse.search(query, { limit: 15 });
  return results.map(res => {
    const anime = db.anime[res.item.id];
    return {
      id: res.item.id,
      title: { romaji: anime.t.r, english: anime.t.e },
      coverImage: { medium: anime.i }
    };
  });
}

export function getAnimeWithSeiyuusLocal(id) {
  const anime = db.anime[id];
  if (!anime) return null;

  // Reconstruct seiyuus array from IDs
  const seiyuus = Object.entries(anime.s).map(([sId, charNames]) => {
    return {
      id: parseInt(sId),
      name: { full: db.seiyuus[sId] },
      characterNames: charNames
    };
  });

  return {
    id: parseInt(id),
    title: { romaji: anime.t.r, english: anime.t.e },
    coverImage: { medium: anime.i }, // Using medium for both for now to save space
    seiyuus
  };
}

export function getRawDb() {
    return db;
}
