import { App, Modal, ButtonComponent, Notice } from 'obsidian';
import { MediaNode } from '../api/types';
import { BookFileService } from '../services/BookFileService';
import { SaleBonClient } from '../api/SaleBonClient';
import { md5 } from '../utils/md5';
import { AniListClient } from '../api/AniListClient';

export class BookPreviewModal extends Modal {
    book: MediaNode;
    fileService: BookFileService;
    saleBonClient: SaleBonClient;
    aniListClient: AniListClient;
    onRegister: (book: MediaNode) => void;
    onBack?: () => void;

    constructor(app: App, book: MediaNode, aniListClient: AniListClient, fileService: BookFileService, onRegister: (book: MediaNode) => void, onBack?: () => void) {
        super(app);
        this.book = book;
        this.aniListClient = aniListClient;
        this.fileService = fileService;
        this.onRegister = onRegister;
        this.onBack = onBack;
        this.saleBonClient = new SaleBonClient();
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.addClass('book-preview-modal');
        contentEl.empty();

        // Fetch full details if needed (optional, but good for volume info)
        // For speed, let's render with what we have, then update if we fetch more?
        // Actually, let's display what we passed.

        const title = this.book.title.native || this.book.title.romaji || this.book.title.english || 'No Title';
        const isNovel = this.book.format === 'NOVEL';

        // 1. Header with Title
        contentEl.createEl('h2', { text: title });

        // 2. Container for Image + Info
        const container = contentEl.createDiv({ cls: 'preview-container' });

        // Image
        const imgContainer = container.createDiv({ cls: 'preview-image-container' });
        if (this.book.coverImage?.large) {
            imgContainer.createEl('img', {
                attr: {
                    src: this.book.coverImage.large,
                    referrerpolicy: 'no-referrer'
                },
                cls: 'preview-cover-image'
            });
        }

        // Info Column
        const infoContainer = container.createDiv({ cls: 'preview-info-container' });

        // Volumes
        const volText = this.book.volumes ? `全${this.book.volumes}巻` : '巻数不明';
        const volDiv = infoContainer.createDiv({ text: volText, cls: 'preview-volume-info' });

        // Unlimited Badge (Async) - Insert after volume div
        if (!isNovel) {
            this.saleBonClient.getUnlimitedCount(title).then(count => {
                if (count !== null && count > 0) {
                    const badge = createDiv({ cls: 'kindle-unlimited-badge' });
                    badge.createEl('span', { text: `Kindle Unlimited: ${count}巻` });
                    // Insert after volDiv
                    volDiv.insertAdjacentElement('afterend', badge);
                }
            });
        }

        // Kindle Button
        let url = '';
        if (isNovel) {
            url = `https://www.amazon.co.jp/s?k=${encodeURIComponent(title)}&i=digital-text&rh=p_n_feature_nineteen_browse-bin%3A3169286051`;
        } else {
            const hash = md5(title);
            url = `https://sale-bon.com/detail/?series_hash=${hash}`;
        }

        const btnContainer = infoContainer.createDiv({ cls: 'preview-actions' });
        new ButtonComponent(btnContainer)
            .setButtonText('Kindleで確認')
            .onClick(() => {
                window.open(url, '_blank');
            });

        // Register Button
        new ButtonComponent(btnContainer)
            .setButtonText('見たいとして登録')
            .setCta()
            .onClick(() => {
                this.onRegister(this.book);
                this.close();
            });

        // Back Button
        if (this.onBack) {
            new ButtonComponent(btnContainer)
                .setButtonText('戻る')
                .onClick(() => {
                    this.close();
                    this.onBack?.();
                });
        } else {
            new ButtonComponent(btnContainer)
                .setButtonText('閉じる')
                .onClick(() => {
                    this.close();
                });
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
