const URL = 'https://graphql.anilist.co';

export async function searchAnimeDropdown(query) {
  const graphqlQuery = `
    query ($search: String) {
      Page (page: 1, perPage: 10) {
        media (search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          title { romaji english native }
          coverImage { medium }
        }
      }
    }
  `;

  const response = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-cache',
    body: JSON.stringify({ query: graphqlQuery, variables: { search: query } })
  });

  const json = await response.json();
  if (response.ok) {
    return json.data.Page.media;
  } else {
    console.error("Anilist API Error:", json);
    return [];
  }
}

export async function getAnimeWithSeiyuus(id) {
  // We fetch up to 100 character edges to find the JPN voice actors
  const graphqlQuery = `
    query ($id: Int) {
      Media (id: $id, type: ANIME) {
        id
        title { romaji english }
        coverImage { large }
        characters (perPage: 50) {
          edges {
            node {
              id
              name { full }
            }
            voiceActors (language: JAPANESE, sort: RELEVANCE) {
              id
              name { full }
            }
          }
        }
      }
    }
  `;

  const response = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-cache',
    body: JSON.stringify({ query: graphqlQuery, variables: { id } })
  });

  const json = await response.json();
  if (response.ok) {
    const media = json.data.Media;
    
    // Flatten seiyuus into a unique array
    const seiyuuMap = new Map();
    if (media.characters && media.characters.edges) {
      media.characters.edges.forEach(edge => {
        if (edge.voiceActors) {
          edge.voiceActors.forEach(va => {
            const charName = edge.node?.name?.full;
            if (!seiyuuMap.has(va.id)) {
              seiyuuMap.set(va.id, { 
                ...va, 
                characterNames: charName ? [charName] : []
              });
            } else {
              const existing = seiyuuMap.get(va.id);
              if (charName && !existing.characterNames.includes(charName)) {
                existing.characterNames.push(charName);
              }
            }
          });
        }
      });
    }

    return {
      id: media.id,
      title: media.title,
      coverImage: media.coverImage,
      seiyuus: Array.from(seiyuuMap.values())
    };
  } else {
    console.error("Anilist API Error:", json);
    return null;
  }
}
