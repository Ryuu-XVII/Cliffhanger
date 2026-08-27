/**
 * GraphQL documents kept in one place so the field selections stay consistent
 * and the cache keys line up with what was actually requested.
 */

export const MEDIA_LITE_FRAGMENT = `
fragment MediaLite on Media {
  id
  idMal
  type
  title { romaji english native }
  coverImage { extraLarge large medium color }
  bannerImage
  format
  status
  episodes
  chapters
  volumes
  duration
  season
  seasonYear
  startDate { year month day }
  averageScore
  meanScore
  popularity
  genres
  isAdult
  nextAiringEpisode { id episode airingAt timeUntilAiring }
}
`;

export const SEARCH_QUERY = `
${MEDIA_LITE_FRAGMENT}
query Search($search: String, $page: Int!, $perPage: Int!, $type: MediaType, $isAdult: Boolean, $format: MediaFormat, $genre_in: [String], $tag_in: [String], $season: MediaSeason, $seasonYear: Int, $status: MediaStatus, $sort: [MediaSort]) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage hasNextPage perPage }
    media(search: $search, type: $type, isAdult: $isAdult, format: $format, genre_in: $genre_in, tag_in: $tag_in, season: $season, seasonYear: $seasonYear, status: $status, sort: $sort) {
      ...MediaLite
    }
  }
}
`;

/** Studio's own catalogue - AniList has no studio filter on the Media root query. */
export const STUDIO_SEARCH_QUERY = `
query StudioSearch($search: String, $page: Int!, $perPage: Int!) {
  Page(page: $page, perPage: $perPage) {
    studios(search: $search) {
      id
      name
    }
  }
}
`;

export const STUDIO_MEDIA_QUERY = `
${MEDIA_LITE_FRAGMENT}
query StudioMedia($id: Int!, $page: Int!, $perPage: Int!, $sort: [MediaSort]) {
  Studio(id: $id) {
    name
    media(page: $page, perPage: $perPage, sort: $sort, isMain: true) {
      pageInfo { total currentPage lastPage hasNextPage perPage }
      nodes { ...MediaLite }
    }
  }
}
`;

export const MEDIA_DETAIL_QUERY = `
query MediaDetail($id: Int!) {
  Media(id: $id) {
    id
    idMal
    type
    title { romaji english native }
    coverImage { extraLarge large medium color }
    bannerImage
    description(asHtml: false)
    format
    status
    episodes
    chapters
    volumes
    duration
    season
    seasonYear
    startDate { year month day }
    endDate { year month day }
    averageScore
    meanScore
    popularity
    favourites
    hashtag
    source
    countryOfOrigin
    genres
    synonyms
    isAdult
    nextAiringEpisode { id episode airingAt timeUntilAiring }
    airingSchedule(notYetAired: false, perPage: 50, page: 1) {
      nodes { id episode airingAt timeUntilAiring }
    }
    tags { id name rank isGeneralSpoiler isMediaSpoiler }
    studios { edges { isMain node { id name } } }
    relations {
      edges {
        relationType
        node {
          id idMal type title { romaji english native }
          coverImage { extraLarge large medium color }
          bannerImage format status episodes chapters volumes duration
          season seasonYear startDate { year month day }
          averageScore meanScore popularity genres isAdult
          nextAiringEpisode { id episode airingAt timeUntilAiring }
        }
      }
    }
    recommendations(sort: RATING_DESC, perPage: 12) {
      edges {
        node {
          mediaRecommendation {
            id idMal type title { romaji english native }
            coverImage { extraLarge large medium color }
            bannerImage format status episodes chapters volumes duration
            season seasonYear startDate { year month day }
            averageScore meanScore popularity genres isAdult
            nextAiringEpisode { id episode airingAt timeUntilAiring }
          }
        }
      }
    }
    characters(sort: [ROLE, RELEVANCE], perPage: 12) {
      edges {
        role
        node { id name { full native } image { large } }
        voiceActors(sort: [RELEVANCE]) { id name { full } image { large } languageV2 }
      }
    }
    staff(perPage: 8) {
      edges { role node { id name { full } image { large } } }
    }
    externalLinks { id url site type language icon color }
    streamingEpisodes { title thumbnail url site }
    trailer { id site thumbnail }
  }
}
`;

export const BROWSE_QUERY = `
${MEDIA_LITE_FRAGMENT}
query Browse($page: Int!, $perPage: Int!, $sort: [MediaSort], $season: MediaSeason, $seasonYear: Int, $status: MediaStatus, $format: MediaFormat, $genre: String, $type: MediaType, $isAdult: Boolean) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage hasNextPage perPage }
    media(sort: $sort, season: $season, seasonYear: $seasonYear, status: $status, format: $format, genre: $genre, type: $type, isAdult: $isAdult) {
      ...MediaLite
    }
  }
}
`;

export const BY_IDS_QUERY = `
${MEDIA_LITE_FRAGMENT}
query ByIds($ids: [Int], $page: Int!, $perPage: Int!) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage total currentPage lastPage perPage }
    media(id_in: $ids) { ...MediaLite }
  }
}
`;

export const GENRES_QUERY = `
query Genres {
  GenreCollection
}
`;

export const TAGS_QUERY = `
query MediaTags {
  MediaTagCollection {
    id
    name
    category
    isGeneralSpoiler
    isMediaSpoiler
    isAdult
  }
}
`;

export const VIEWER_QUERY = `
query Viewer {
  Viewer {
    id
    name
    avatar { large }
    options { titleLanguage displayAdultContent }
    mediaListOptions { scoreFormat }
  }
}
`;

export const MEDIA_LIST_COLLECTION_QUERY = `
${MEDIA_LITE_FRAGMENT}
query Collection($userId: Int!, $type: MediaType!) {
  MediaListCollection(userId: $userId, type: $type) {
    lists {
      name
      status
      isCustomList
      entries {
        id
        status
        score(format: POINT_100)
        progress
        progressVolumes
        repeat
        notes
        private
        startedAt { year month day }
        completedAt { year month day }
        updatedAt
        media { ...MediaLite }
      }
    }
  }
}
`;

export const SAVE_MEDIA_LIST_ENTRY_MUTATION = `
mutation Save($mediaId: Int!, $status: MediaListStatus, $score: Float, $progress: Int, $progressVolumes: Int, $repeat: Int, $notes: String, $private: Boolean, $startedAt: FuzzyDateInput, $completedAt: FuzzyDateInput) {
  SaveMediaListEntry(
    mediaId: $mediaId
    status: $status
    scoreRaw: $score
    progress: $progress
    progressVolumes: $progressVolumes
    repeat: $repeat
    notes: $notes
    private: $private
    startedAt: $startedAt
    completedAt: $completedAt
  ) {
    id
    mediaId
    status
    score(format: POINT_100)
    progress
    updatedAt
  }
}
`;

export const DELETE_MEDIA_LIST_ENTRY_MUTATION = `
mutation Delete($id: Int!) {
  DeleteMediaListEntry(id: $id) { deleted }
}
`;

export const AIRING_SCHEDULE_QUERY = `
query Airing($page: Int!, $perPage: Int!, $from: Int!, $to: Int!) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage currentPage lastPage }
    airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
      id
      episode
      airingAt
      timeUntilAiring
      media {
        id
        idMal
        title { romaji english native }
        coverImage { extraLarge large medium color }
        bannerImage
        format
        status
        episodes
      }
    }
  }
}
`;
