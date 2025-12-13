export interface MediaNode {
    id: number;
    title: {
        romaji: string;
        english?: string;
        native?: string;
    };
    coverImage?: {
        medium?: string;
        large?: string;
        extraLarge?: string;
    };
    status?: 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS';
    volumes?: number;
    chapters?: number;
    popularity?: number;
    averageScore?: number;
    favourites?: number;
    genres?: string[];
    tags?: { name: string; rank: number }[];
    staff?: { edges: { node: { name: { full: string; native?: string } }; role: string }[] };
    recommendations?: { nodes: { mediaRecommendation: MediaNode }[] };
    relations?: { edges: { node: MediaNode; relationType: string }[] };
    stats?: { statusDistribution: { status: string; amount: number }[] };
    type?: string;
    format?: string;
}

export interface GoogleBook {
    id: string;
    volumeInfo: {
        title: string;
        authors?: string[];
        publishedDate?: string;
        imageLinks?: {
            thumbnail?: string;
            smallThumbnail?: string;
        };
    };
}
