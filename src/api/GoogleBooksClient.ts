import { requestUrl, RequestUrlParam } from 'obsidian';
import { GoogleBook } from './types';

const GOOGLE_BOOKS_API_URL = 'https://www.googleapis.com/books/v1/volumes';

export class GoogleBooksClient {

    async searchBooks(title: string, author?: string, format?: string): Promise<GoogleBook[]> {
        const queryParts = [`intitle:${title}`];
        if (author) {
            queryParts.push(`inauthor:${author}`);
        }

        // Add format-specific subject filter
        if (format === 'MANGA') {
            queryParts.push('subject:comics');
        } else if (format === 'NOVEL') {
            queryParts.push('subject:fiction');
        }

        const q = queryParts.join('+');

        const url = new URL(GOOGLE_BOOKS_API_URL);
        url.searchParams.append('q', q);
        url.searchParams.append('orderBy', 'relevance');
        url.searchParams.append('maxResults', '40');

        const options: RequestUrlParam = {
            url: url.toString(),
            method: 'GET'
        };

        try {
            const response = await requestUrl(options);
            if (response.status !== 200) {
                console.error('Google Books API Request Failed:', response);
                return [];
            }

            const data = response.json;
            if (!data.items) return [];

            const books = data.items as GoogleBook[];

            // Sort by volume number extracted from title
            books.sort((a, b) => {
                const volA = this.extractVolumeNumber(a.volumeInfo.title);
                const volB = this.extractVolumeNumber(b.volumeInfo.title);
                return volA - volB;
            });

            return books;

        } catch (e) {
            console.error('Failed to search Google Books', e);
            return [];
        }
    }

    private extractVolumeNumber(title: string): number {
        // Match patterns like "1巻", "(1)", "Vol.1", "第1巻", "1" at end, etc.
        const patterns = [
            /(\d+)\s*巻/,           // 1巻, 第1巻
            /Vol\.?\s*(\d+)/i,      // Vol.1, Vol 1
            /\((\d+)\)/,            // (1)
            /【(\d+)】/,            // 【1】
            /\s(\d+)$/,             // ends with number
            /(\d+)$/                // fallback: last number in string
        ];

        for (const pattern of patterns) {
            const match = title.match(pattern);
            if (match) {
                return parseInt(match[1], 10);
            }
        }

        return 9999; // Unknown volume goes to end
    }
}
