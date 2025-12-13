import { Plugin } from 'obsidian';
import { AniListClient } from './api/AniListClient';

import { BookFileService } from './services/BookFileService';
import { BookLogProcessor } from './codeblock/BookLogProcessor';
import { SearchModal } from './ui/SearchModal';
import { BookGridModal } from './ui/BookGridModal';
import { MediaNode } from './api/types';

export default class BookLogPlugin extends Plugin {
    aniListClient: AniListClient;
    fileService: BookFileService;

    async onload() {
        console.log('Loading Book Log Plugin');

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
            // new Notice('Book Log Plugin initialization failed. Please check the console.');
        }
    }

    onunload() {
        console.log('Unloading Book Log Plugin');
    }

    openSearchModal() {
        new SearchModal(this.app, (search, genre, tag, format) => {
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
            async (book) => {
                await this.handleBookSelection(book);
            },
            () => {
                // On Back: Re-open search modal? Or keep previous state?
                // For simplicity, re-open search modal formatted empty or could pass prev values if desired.
                // We didn't persist state in SearchModal but we can just open it fresh.
                this.openSearchModal();
            }
        ).open();
    }

    async handleBookSelection(book: MediaNode) {
        const existing = await this.fileService.getBookFile(book.id);
        if (existing) {
            await this.fileService.openFile(existing);
        } else {
            // Fetch detailed info first? 
            // createBookFile uses MediaNode. If search result lacks info (like genre/staff), file might be incomplete.
            // Search result MediaNode has basic info.
            // Ideally we fetch full details here before creating file.
            const fullDetails = await this.aniListClient.getMangaDetails(book.id);
            if (fullDetails) {
                const newFile = await this.fileService.createBookFile(fullDetails);
                await this.fileService.openFile(newFile);
            } else {
                // Fallback
                const newFile = await this.fileService.createBookFile(book);
                await this.fileService.openFile(newFile);
            }
        }
    }
}
