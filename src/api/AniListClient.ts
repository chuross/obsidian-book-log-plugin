import { requestUrl, RequestUrlParam } from 'obsidian';
import { MediaNode } from './types';

const ANILIST_API_URL = 'https://graphql.anilist.co';

export class AniListClient {

    private async query<T>(query: string, variables: Record<string, any> = {}): Promise<T> {
        const options: RequestUrlParam = {
            url: ANILIST_API_URL,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                query,
                variables
            })
        };

        const response = await requestUrl(options);

        if (response.status >= 400) {
            console.error('AniList API Request Failed:', response);
            throw new Error(`AniList API Request failed with status ${response.status}`);
        }

        const json = response.json;
        if (json.errors) {
            console.error('AniList GraphQL Errors:', json.errors);
            throw new Error('AniList GraphQL Error');
        }

        return json as T;
    }

    async searchManga(search: string, genre?: string, tag?: string, sort: string = 'POPULARITY_DESC', format?: string): Promise<MediaNode[]> {
        const query = `
        query ($search: String, $genre: String, $tag: String, $sort: [MediaSort], $format: MediaFormat) {
            Page(perPage: 50) {
                media(search: $search, type: MANGA, genre: $genre, tag: $tag, sort: $sort, format: $format) {
                    id
                    title {
                        romaji
                        english
                        native
                    }
                    coverImage {
                        medium
                        large
                    }
                    status
                    volumes
                    chapters
                    popularity
                    averageScore
                    favourites
                }
            }
        }
        `;

        const variables: any = { sort: [sort] };
        if (search) variables.search = search;
        if (genre) variables.genre = genre;
        if (tag) variables.tag = tag;
        if (format) variables.format = format;

        try {
            const data = await this.query<any>(query, variables);
            return data.data.Page.media;
        } catch (e) {
            console.error('Failed to search manga', e);
            return [];
        }
    }

    async getMangaDetails(id: number): Promise<MediaNode | null> {
        const query = `
        query ($id: Int) {
            Media(id: $id, type: MANGA) {
                id
                title {
                    romaji
                    english
                    native
                }
                coverImage {
                    medium
                    large
                }
                status
                volumes
                chapters
                popularity
                averageScore
                favourites
                genres
                tags {
                    name
                    rank
                }
                staff {
                    edges {
                        node {
                            name {
                                full
                            }
                        }
                        role
                    }
                }
                recommendations(sort: RATING_DESC, perPage: 10) {
                    nodes {
                        mediaRecommendation {
                            id
                            title {
                                romaji
                                native
                            }
                            coverImage {
                                medium
                            }
                        }
                    }
                }
                relations {
                    edges {
                        node {
                            id
                            title {
                                romaji
                                native
                            }
                            type
                            coverImage {
                                medium
                            }
                        }
                        relationType
                    }
                }
                stats {
                    statusDistribution {
                        status
                        amount
                    }
                }
            }
        }
        `;

        try {
            const data = await this.query<any>(query, { id });
            return data.data.Media;
        } catch (e) {
            console.error('Failed to get manga details', e);
            return null;
        }
    }
}
