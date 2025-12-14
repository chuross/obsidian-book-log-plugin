import { App, Modal, Notice } from 'obsidian';
import { AniListClient } from '../api/AniListClient';
import { MediaNode } from '../api/types';
import { SearchCache } from '../main';

export class BookGridModal extends Modal {
    apiClient: AniListClient;
    searchQuery: string;
    genre: string;
    tag: string;
    format: string;
    onBookSelect: (book: MediaNode, cache: SearchCache) => void;
    onBack?: () => void;
    initialCache: SearchCache | null = null;

    mediaList: MediaNode[] = [];
    filteredList: MediaNode[] = [];

    currentSort: string = 'POPULARITY_DESC';
    filterFinished: boolean = false;
    filterVolumes: string = 'any'; // 'any', '5', '10', '20', 'more'
    filterDecade: string = 'any'; // 'any', '1990', '2000', '2010', '2020'
    currentPage: number = 1;
    isLoading: boolean = false;
    hasMore: boolean = true;
    controlsVisible: boolean = true;

    constructor(
        app: App,
        apiClient: AniListClient,
        searchQuery: string,
        genre: string,
        tag: string,
        format: string,
        onBookSelect: (book: MediaNode, cache: SearchCache) => void,
        onBack?: () => void,
        initialCache: SearchCache | null = null
    ) {
        super(app);
        this.apiClient = apiClient;
        this.searchQuery = searchQuery;
        this.genre = genre;
        this.tag = tag;
        this.format = format;
        this.onBookSelect = onBookSelect;
        this.onBack = onBack;
        this.initialCache = initialCache;
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

        // Toggle button for search options (right side)
        const toggleBtn = headerDiv.createEl('button', {
            cls: 'anime-grid-controls-toggle',
            text: '🔍 検索オプション'
        });
        toggleBtn.onclick = () => {
            this.controlsVisible = !this.controlsVisible;
            controlsDiv.toggleClass('is-collapsed', !this.controlsVisible);
            toggleBtn.textContent = this.controlsVisible ? '🔍 検索オプション ▲' : '🔍 検索オプション ▼';
        };

        // Controls (Moved out of header for new row)
        const controlsDiv = contentEl.createDiv({ cls: 'anime-grid-controls' });

        // On mobile, start collapsed
        if (document.body.classList.contains('is-mobile')) {
            this.controlsVisible = false;
            controlsDiv.addClass('is-collapsed');
            toggleBtn.textContent = '🔍 検索オプション ▼';
        } else {
            toggleBtn.textContent = '🔍 検索オプション ▲';
        }

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
            this.loadData();
        };

        // Genre Filter
        const genreSelect = controlsDiv.createEl('select');
        const genres = [
            { v: '', l: 'ジャンル: 指定なし' },
            { v: 'ACTION', l: 'アクション' },
            { v: 'ADVENTURE', l: '冒険' },
            { v: 'COMEDY', l: 'コメディ' },
            { v: 'DRAMA', l: 'ドラマ' },
            { v: 'ECCHI', l: 'エッチ' },
            { v: 'FANTASY', l: 'ファンタジー' },
            { v: 'HORROR', l: 'ホラー' },
            { v: 'MAHOU SHOUJO', l: '魔法少女' },
            { v: 'MECHA', l: 'メカ' },
            { v: 'MUSIC', l: '音楽' },
            { v: 'MYSTERY', l: 'ミステリー' },
            { v: 'PSYCHOLOGICAL', l: '心理' },
            { v: 'ROMANCE', l: '恋愛' },
            { v: 'SCI-FI', l: 'SF' },
            { v: 'SLICE OF LIFE', l: '日常' },
            { v: 'SPORTS', l: 'スポーツ' },
            { v: 'SUPERNATURAL', l: '超常現象' },
            { v: 'THRILLER', l: 'サスペンス' }
        ];
        genres.forEach(o => genreSelect.createEl('option', { value: o.v, text: o.l }));
        genreSelect.value = this.genre;
        genreSelect.onchange = (e) => {
            this.genre = (e.target as HTMLSelectElement).value;
            this.currentPage = 1;
            this.mediaList = [];
            this.hasMore = true;
            this.loadData();
        };

        // Filter: Finished
        const finishedLabel = controlsDiv.createEl('label', { text: ' 完結済のみ ' });
        const finishedCheck = finishedLabel.createEl('input', { type: 'checkbox' });
        finishedCheck.checked = this.filterFinished;
        finishedCheck.onchange = (e) => {
            this.filterFinished = (e.target as HTMLInputElement).checked;
            this.currentPage = 1;
            this.mediaList = [];
            this.hasMore = true;
            this.loadData();
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
            this.currentPage = 1;
            this.mediaList = [];
            this.hasMore = true;
            this.loadData();
        };

        // Filter: Decade
        const decadeSelect = controlsDiv.createEl('select');
        [
            { v: 'any', l: '年代: 指定なし' },
            { v: '1990', l: '1990年代' },
            { v: '2000', l: '2000年代' },
            { v: '2010', l: '2010年代' },
            { v: '2020', l: '2020年代〜' }
        ].forEach(o => decadeSelect.createEl('option', { value: o.v, text: o.l }));
        decadeSelect.value = this.filterDecade;
        decadeSelect.onchange = (e) => {
            this.filterDecade = (e.target as HTMLSelectElement).value;
            this.currentPage = 1;
            this.mediaList = [];
            this.hasMore = true;
            this.loadData();
        };


        // Content
        const gridContainer = contentEl.createDiv({ cls: 'anime-grid-container' });
        gridContainer.createDiv({ text: '読み込み中...', cls: 'anime-loading' });

        // Infinite scroll
        gridContainer.addEventListener('scroll', () => {
            if (this.isLoading || !this.hasMore) return;
            const scrollTop = gridContainer.scrollTop;
            const scrollHeight = gridContainer.scrollHeight;
            const clientHeight = gridContainer.clientHeight;
            if (scrollTop + clientHeight >= scrollHeight - 300) {
                this.loadMore();
            }
        });

        await this.loadData();
    }

    async loadData() {
        const gridContainer = this.contentEl.querySelector('.anime-grid-container');
        if (!gridContainer) return;
        gridContainer.empty();

        // Check if we have a cache to restore from
        if (this.initialCache) {
            const scrollToRestore = this.initialCache.scrollPosition;

            // Restore from cache
            this.mediaList = this.initialCache.mediaList;
            this.currentPage = this.initialCache.currentPage;
            this.hasMore = this.initialCache.hasMore;

            // Restore filter options
            this.currentSort = this.initialCache.currentSort;
            this.filterFinished = this.initialCache.filterFinished;
            this.filterVolumes = this.initialCache.filterVolumes;
            this.filterDecade = this.initialCache.filterDecade;

            this.isLoading = false;

            this.renderItems(this.mediaList, true);

            // Restore scroll position after rendering
            if (scrollToRestore > 0) {
                setTimeout(() => {
                    gridContainer.scrollTop = scrollToRestore;
                }, 100);
            }

            // Clear cache after restore
            this.initialCache = null;
            return;
        }

        gridContainer.createDiv({ text: '読み込み中...', cls: 'anime-loading' });

        this.currentPage = 1;
        this.mediaList = [];
        this.hasMore = true;
        this.isLoading = true;

        try {
            const { status, volLess, volGreater, startDateGreater, startDateLesser } = this.getFilterParams();
            const newMedia = await this.apiClient.searchManga(this.searchQuery, this.genre, this.tag, this.currentSort, this.format, this.currentPage, status, volLess, volGreater, startDateGreater, startDateLesser);

            this.mediaList = newMedia;
            this.hasMore = newMedia.length >= 50;
            this.isLoading = false;

            this.renderItems(newMedia, true);
        } catch (e) {
            console.error('Failed to load data', e);
            new Notice('データの読み込みに失敗しました');
            gridContainer.empty();
            gridContainer.createDiv({ text: 'エラーが発生しました' });
            this.isLoading = false;
        }
    }

    async loadMore() {
        if (this.isLoading || !this.hasMore) return;
        this.isLoading = true;
        this.currentPage++;

        const gridContainer = this.contentEl.querySelector('.anime-grid-container');
        const loadingEl = gridContainer?.createDiv({ text: '追加読み込み中...', cls: 'anime-loading' });

        const { status, volLess, volGreater, startDateGreater, startDateLesser } = this.getFilterParams();
        const newMedia = await this.apiClient.searchManga(this.searchQuery, this.genre, this.tag, this.currentSort, this.format, this.currentPage, status, volLess, volGreater, startDateGreater, startDateLesser);

        this.mediaList = [...this.mediaList, ...newMedia];
        this.hasMore = newMedia.length >= 50;
        this.isLoading = false;

        loadingEl?.remove();
        this.renderItems(newMedia, false);
    }

    getFilterParams() {
        const status = this.filterFinished ? 'FINISHED' : undefined;
        let volLess: number | undefined;
        let volGreater: number | undefined;
        let startDateGreater: number | undefined;
        let startDateLesser: number | undefined;

        if (this.filterVolumes !== 'any') {
            if (this.filterVolumes === 'more') {
                volGreater = 20;
            } else {
                volLess = parseInt(this.filterVolumes) + 1;
            }
        }

        if (this.filterDecade !== 'any') {
            const decadeStart = parseInt(this.filterDecade);
            // AniList uses YYYYMMDD format for FuzzyDateInt
            startDateGreater = decadeStart * 10000 + 101; // e.g., 19900101
            startDateLesser = (decadeStart + 10) * 10000 + 101; // e.g., 20000101
        }

        return { status, volLess, volGreater, startDateGreater, startDateLesser };
    }

    renderItems(items: MediaNode[], clear: boolean = false) {
        const gridContainer = this.contentEl.querySelector('.anime-grid-container');
        if (!gridContainer) return;

        if (clear) gridContainer.empty();

        if (items.length === 0 && this.mediaList.length === 0) {
            gridContainer.createDiv({ text: '見つかりませんでした。' });
            return;
        }

        items.forEach(media => this.renderCard(gridContainer, media));

        requestAnimationFrame(() => {
            if (this.hasMore && gridContainer.scrollHeight <= gridContainer.clientHeight) {
                this.loadMore();
            }
        });
    }

    renderCard(container: Element, media: MediaNode) {
        const card = container.createDiv({ cls: 'anime-card' });

        // Image
        const imgContainer = card.createDiv({ cls: 'anime-card-image-container' });
        const imgUrl = media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium;
        if (imgUrl) {
            imgContainer.createEl('img', { attr: { src: imgUrl, referrerpolicy: 'no-referrer' } });
        }

        // Format Badge
        if (media.format) {
            const isNovel = media.format === 'NOVEL';
            const badgeText = isNovel ? 'ノベル' : 'マンガ';
            const badgeCls = isNovel ? 'is-novel' : 'is-manga';
            imgContainer.createDiv({
                cls: `anime-card-format-badge ${badgeCls}`,
                text: badgeText
            });
        }

        // Popularity/Score Badge
        if (media.averageScore) {
            imgContainer.createDiv({
                cls: 'anime-card-popularity',
                text: `${media.averageScore}%`
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
            const scrollPos = this.contentEl.querySelector('.anime-grid-container')?.scrollTop || 0;
            const cache: SearchCache = {
                mediaList: this.mediaList,
                scrollPosition: scrollPos,
                currentPage: this.currentPage,
                hasMore: this.hasMore,
                // Filter options
                currentSort: this.currentSort,
                filterFinished: this.filterFinished,
                filterVolumes: this.filterVolumes,
                filterDecade: this.filterDecade
            };
            this.close();
            this.onBookSelect(media, cache);
        };
    }

    onClose() {
        this.contentEl.empty();
    }
}
