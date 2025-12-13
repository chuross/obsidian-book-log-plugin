import { App, Modal, Notice } from 'obsidian';
import { AniListClient } from '../api/AniListClient';
import { MediaNode } from '../api/types';

export class BookGridModal extends Modal {
    apiClient: AniListClient;
    searchQuery: string;
    genre: string;
    tag: string;
    format: string;
    onBookSelect: (book: MediaNode) => void;
    onBack?: () => void;

    mediaList: MediaNode[] = [];
    filteredList: MediaNode[] = [];

    // Filter/Sort State
    currentSort: string = 'POPULARITY_DESC';
    filterFinished: boolean = false;
    filterVolumes: string = 'any'; // 'any', '5', '10', '20', 'more'

    constructor(
        app: App,
        apiClient: AniListClient,
        searchQuery: string,
        genre: string,
        tag: string,
        format: string,
        onBookSelect: (book: MediaNode) => void,
        onBack?: () => void
    ) {
        super(app);
        this.apiClient = apiClient;
        this.searchQuery = searchQuery;
        this.genre = genre;
        this.tag = tag;
        this.format = format;
        this.onBookSelect = onBookSelect;
        this.onBack = onBack;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('anime-log-grid-modal'); // Re-use anime log styles or update styles.css

        // Header
        const headerDiv = contentEl.createDiv({ cls: 'anime-grid-header' });

        const titleContainer = headerDiv.createDiv({ cls: 'anime-grid-title-container' });
        if (this.onBack) {
            const backBtn = titleContainer.createEl('button', { cls: 'anime-grid-back-button', text: '← 戻る' });
            backBtn.onclick = () => {
                this.close();
                this.onBack?.();
            };
        }
        titleContainer.createEl('h2', { text: '検索結果' });

        // Controls
        const controlsDiv = headerDiv.createDiv({ cls: 'anime-grid-controls' });

        // Sort
        const sortSelect = controlsDiv.createEl('select');
        [
            { v: 'POPULARITY_DESC', l: '人気順' },
            { v: 'SCORE_DESC', l: 'スコア順' },
            { v: 'FAVOURITES_DESC', l: 'お気に入り順' },
            { v: 'UPDATED_AT_DESC', l: '更新順' }
        ].forEach(o => sortSelect.createEl('option', { value: o.v, text: o.l }));
        sortSelect.value = this.currentSort;
        sortSelect.onchange = async (e) => {
            this.currentSort = (e.target as HTMLSelectElement).value;
            await this.loadData(); // Re-fetch for sorting handled by API or re-sort locally? API supports sorting.
        };

        // Filter: Finished
        const finishedLabel = controlsDiv.createEl('label', { text: ' 完結済のみ ' });
        const finishedCheck = finishedLabel.createEl('input', { type: 'checkbox' });
        finishedCheck.checked = this.filterFinished;
        finishedCheck.onchange = (e) => {
            this.filterFinished = (e.target as HTMLInputElement).checked;
            this.applyFilters();
        };

        // Filter: Volumes
        const volSelect = controlsDiv.createEl('select');
        [
            { v: 'any', l: '巻数: 指定なし' },
            { v: '5', l: '5巻以内' },
            { v: '10', l: '10巻以内' },
            { v: '20', l: '20巻以内' },
            { v: 'more', l: '21巻以上' }
        ].forEach(o => volSelect.createEl('option', { value: o.v, text: o.l }));
        volSelect.value = this.filterVolumes;
        volSelect.onchange = (e) => {
            this.filterVolumes = (e.target as HTMLSelectElement).value;
            this.applyFilters();
        };


        // Content
        const gridContainer = contentEl.createDiv({ cls: 'anime-grid-container' });
        gridContainer.createDiv({ text: '読み込み中...', cls: 'anime-loading' });

        await this.loadData();
    }

    async loadData() {
        const gridContainer = this.contentEl.querySelector('.anime-grid-container');
        if (gridContainer) gridContainer.empty();
        if (gridContainer) gridContainer.createDiv({ text: '読み込み中...', cls: 'anime-loading' });

        this.mediaList = await this.apiClient.searchManga(this.searchQuery, this.genre, this.tag, this.currentSort, this.format);
        this.applyFilters();
    }

    applyFilters() {
        const gridContainer = this.contentEl.querySelector('.anime-grid-container');
        if (!gridContainer) return;
        gridContainer.empty();

        let list = this.mediaList;

        if (this.filterFinished) {
            list = list.filter(m => m.status === 'FINISHED');
        }

        if (this.filterVolumes !== 'any') {
            list = list.filter(m => {
                const vol = m.volumes || 9999; // If unknown, keep it? or hide? Assume unknown is large or small? Let's assume if unknown we can't filter safely, or treat as fits 'more'? Let's strict filter if vol known.
                if (!m.volumes) return false; // Hide unknown volumes if filtering

                const v = parseInt(this.filterVolumes);
                if (this.filterVolumes === 'more') {
                    return m.volumes > 20;
                } else {
                    return m.volumes <= v;
                }
            });
        }

        this.filteredList = list;

        if (list.length === 0) {
            gridContainer.createDiv({ text: '見つかりませんでした。' });
            return;
        }

        list.forEach(media => {
            const card = gridContainer.createDiv({ cls: 'anime-card' });

            // Image
            const imgContainer = card.createDiv({ cls: 'anime-card-image-container' });
            const imgUrl = media.coverImage?.large || media.coverImage?.medium;
            if (imgUrl) {
                imgContainer.createEl('img', { attr: { src: imgUrl } });
            }

            // Popularity/Score Badge?
            if (media.averageScore) {
                imgContainer.createDiv({
                    cls: 'anime-card-popularity',
                    text: `${media.averageScore}%` // Using score instead of popularity rank
                });
            }

            // Title
            const title = media.title.native || media.title.romaji || media.title.english || 'No Title';
            card.createDiv({ cls: 'anime-card-title', text: title });

            // Status/Volumes Subtext
            const statusText = media.status === 'FINISHED' ? '完結' : '連載中';
            const volText = media.volumes ? `全${media.volumes}巻` : '';
            card.createDiv({ text: `${statusText} ${volText}`, attr: { style: 'font-size: 0.8em; color: var(--text-muted); margin-top: 4px;' } });

            card.onclick = () => {
                this.close();
                this.onBookSelect(media);
            };
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
