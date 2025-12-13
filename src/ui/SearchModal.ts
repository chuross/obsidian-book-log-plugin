import { App, Modal, Setting } from 'obsidian';
import { AniListClient } from '../api/AniListClient';

export class SearchModal extends Modal {
    onSearch: (search: string, genre: string, tag: string, format: string) => void;
    aniListClient: AniListClient;

    constructor(app: App, aniListClient: AniListClient, onSearch: (search: string, genre: string, tag: string, format: string) => void) {
        super(app);
        this.aniListClient = aniListClient;
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



        // Tag Search
        new Setting(contentEl)
            .setName('タグ')
            .setDesc('タグで検索 (例: Isekai)')
            .addDropdown(async dropdown => {
                dropdown.addOption('', '指定なし');
                const tags = await this.aniListClient.getTags();
                tags.forEach(t => dropdown.addOption(t, t));
                dropdown.onChange(value => searchTag = value);
            });

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
