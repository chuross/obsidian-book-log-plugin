import { requestUrl, RequestUrlParam } from 'obsidian';
import { GoogleBook } from './types';

const GOOGLE_BOOKS_API_URL = 'https://www.googleapis.com/books/v1/volumes';

export class GoogleBooksClient {

    async searchBooks(title: string, author?: string): Promise<GoogleBook[]> {
        const queryParts = [`intitle:${title}`];
        if (author) {
            queryParts.push(`inauthor:${author}`);
        }
        const q = queryParts.join('+');

        const url = new URL(GOOGLE_BOOKS_API_URL);
        url.searchParams.append('q', q);
        url.searchParams.append('orderBy', 'relevance'); // 'newest' might be better for finding volumes logic but relevance is usually safer for finding the series. 
        // Logic asked for "oldest" (published date old -> new) for list of volumes. 
        // Google Books API orderBy only supports 'relevance' or 'newest'. 
        // We will fetch by relevance or newest and sort client side if needed, but 'newest' helps get recent ones.
        // Actually user request: "公開日古い順で3列グリッドで並べる" (Display in 3 cols, ordered by publish date oldest first).
        // Since API only supports newest, we can get newest and reverse, or get relevance and sort.
        // Let's use 'relevance' to ensure we get the right books, then we can filter/sort.
        // Also maxResults is 40 (max).
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

            // Client-side sort by publishedDate (oldest first)
            books.sort((a, b) => {
                const dateA = a.volumeInfo.publishedDate || '9999';
                const dateB = b.volumeInfo.publishedDate || '9999';
                return dateA.localeCompare(dateB);
            });

            return books;

        } catch (e) {
            console.error('Failed to search Google Books', e);
            return [];
        }
    }
}
