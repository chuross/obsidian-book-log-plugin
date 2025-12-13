import { App, Modal, Setting } from 'obsidian';

export class SearchModal extends Modal {
    onSearch: (search: string, genre: string, tag: string, format: string) => void;

    constructor(app: App, onSearch: (search: string, genre: string, tag: string, format: string) => void) {
        super(app);
        this.onSearch = onSearch;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'マンガ・ラノベ検索' });

        let searchQuery = '';
        let selectedGenre = '';
        let searchTag = '';
        let selectedFormat = '';

        // Keyword Search
        new Setting(contentEl)
            .setName('キーワード')
            .setDesc('タイトルなどで検索')
            .addText(text => text
                .setPlaceholder('タイトルを入力...')
                .onChange(value => searchQuery = value));

        // Format Selection
        new Setting(contentEl)
            .setName('形式')
            .addDropdown(dropdown => {
                dropdown.addOption('', '指定なし');
                dropdown.addOption('MANGA', 'マンガ');
                dropdown.addOption('NOVEL', 'ライトノベル');
                dropdown.onChange(value => selectedFormat = value);
            });

        // Genre Selection
        const genres = [
            '', 'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror',
            'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance',
            'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'
        ];

        new Setting(contentEl)
            .setName('ジャンル')
            .addDropdown(dropdown => {
                genres.forEach(g => dropdown.addOption(g.toUpperCase(), g || '指定なし'));
                dropdown.onChange(value => selectedGenre = value === '' ? '' : value);
            });

        // Tag Search
        new Setting(contentEl)
            .setName('タグ')
            .setDesc('タグで検索 (例: Isekai)')
            .addText(text => text
                .setPlaceholder('Tag...')
                .onChange(value => searchTag = value));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('検索')
                .setCta()
                .onClick(() => {
                    this.close();
                    this.onSearch(searchQuery, selectedGenre, searchTag, selectedFormat);
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
