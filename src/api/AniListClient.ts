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

    async searchManga(search: string, genre?: string, tag?: string, sort: string = 'POPULARITY_DESC', format?: string, page: number = 1, status?: string, volumesLess?: number, volumesGreater?: number): Promise<MediaNode[]> {
        const query = `
        query ($search: String, $genre: String, $tag: String, $sort: [MediaSort], $format: MediaFormat, $page: Int, $status: MediaStatus, $volumesLess: Int, $volumesGreater: Int) {
            Page(perPage: 50, page: $page) {
                media(search: $search, type: MANGA, genre: $genre, tag: $tag, sort: $sort, format: $format, status: $status, volumes_lesser: $volumesLess, volumes_greater: $volumesGreater) {
                    id
                    title {
                        romaji
                        english
                        native
                    }
                    coverImage {
                        medium
                        large
                        extraLarge
                    }
                    status
                    format
                    volumes
                    chapters
                    popularity
                    averageScore
                    favourites
                }
            }
        }
        `;

        const variables: any = { sort: [sort], page };
        if (search) variables.search = search;
        if (genre) variables.genre = genre;
        if (tag) variables.tag = tag;
        if (format) variables.format = format;
        if (status) variables.status = status;
        if (volumesLess) variables.volumesLess = volumesLess;
        if (volumesGreater) variables.volumesGreater = volumesGreater;

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
                    extraLarge
                }
                status
                format
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
                                native
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
                            format
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
                            format
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

    async getTags(): Promise<string[]> {
        const query = `
        query {
            MediaTagCollection {
                name
            }
        }
        `;

        try {
            const data = await this.query<any>(query);
            return data.data.MediaTagCollection.map((tag: any) => tag.name);
        } catch (e) {
            console.error('Failed to get tags', e);
            return [];
        }
    }
}
