import { Plugin } from 'obsidian';
import { AniListClient } from './api/AniListClient';

import { BookFileService } from './services/BookFileService';
import { BookLogProcessor } from './codeblock/BookLogProcessor';
import { SearchModal } from './ui/SearchModal';
import { BookGridModal } from './ui/BookGridModal';
import { BookPreviewModal } from './ui/BookPreviewModal';
import { MediaNode } from './api/types';

export interface SearchCache {
    mediaList: MediaNode[];
    scrollPosition: number;
    currentPage: number;
    hasMore: boolean;
}

export default class BookLogPlugin extends Plugin {
    aniListClient: AniListClient;
    fileService: BookFileService;
    searchCache: SearchCache | null = null;

    async onload() {

        // Add Ribbon Icon - Add this first to ensure it appears
        this.addRibbonIcon('book', 'Open Book Log', () => {
            this.openSearchModal();
        });

        this.addCommand({
            id: 'open-book-log-search',
            name: 'Open Search',
            callback: () => {
                this.openSearchModal();
            }
        });

        try {
            this.aniListClient = new AniListClient();
            this.fileService = new BookFileService(this.app);

            // Register Code Block Processor
            this.registerMarkdownCodeBlockProcessor('bookLog', (source, el, ctx) => {
                BookLogProcessor.postProcess(source, el, ctx, this.app, this.aniListClient, this.fileService);
            });

        } catch (error) {
            console.error('Failed to initialize Book Log Plugin services:', error);
        }
    }

    onunload() {
    }

    openSearchModal() {
        // Clear cache when starting a new search
        this.searchCache = null;
        new SearchModal(this.app, this.aniListClient, (search, genre, tag, format) => {
            this.openGridModal(search, genre, tag, format);
        }).open();
    }

    openGridModal(search: string, genre: string, tag: string, format: string) {
        new BookGridModal(
            this.app,
            this.aniListClient,
            search,
            genre,
            tag,
            format,
            async (book, cache) => {
                // Save cache before leaving
                this.searchCache = cache;
                await this.handleBookSelection(book, () => {
                    this.openGridModal(search, genre, tag, format);
                });
            },
            () => {
                // Clear cache and go back to search
                this.searchCache = null;
                this.openSearchModal();
            },
            this.searchCache
        ).open();
    }

    async handleBookSelection(book: MediaNode, onBack?: () => void) {
        const existing = await this.fileService.getBookFile(book.id);
        if (existing) {
            await this.fileService.openFile(existing);
        } else {
            // Open Preview Modal instead of creating file immediately
            new BookPreviewModal(
                this.app,
                book,
                this.aniListClient,
                this.fileService,
                async (bookToRegister) => {
                    // Fetch full details before creating file
                    const fullDetails = await this.aniListClient.getMangaDetails(bookToRegister.id);
                    const dataToUse = fullDetails || bookToRegister;

                    const newFile = await this.fileService.createBookFile(dataToUse);
                    await this.fileService.openFile(newFile);
                },
                onBack
            ).open();
        }
    }
}
