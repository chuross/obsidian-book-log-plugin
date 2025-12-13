export const TagTranslationMap: Record<string, string> = {
    "4-koma": "4コマ",
    "Action": "アクション",
    "Adventure": "冒険",
    "Comedy": "コメディ",
    "Drama": "ドラマ",
    "Ecchi": "エッチ",
    "Fantasy": "ファンタジー",
    "Harem": "ハーレム",
    "Horror": "ホラー",
    "Isekai": "異世界",
    "Magic": "魔法",
    "Mecha": "メカ",
    "Music": "音楽",
    "Mystery": "ミステリー",
    "Psychological": "心理",
    "Romance": "恋愛",
    "School": "学園",
    "Sci-Fi": "SF",
    "Slice of Life": "日常",
    "Sports": "スポーツ",
    "Supernatural": "超常現象",
    "Thriller": "サスペンス",
    "Yaoi": "ボーイズラブ",
    "Yuri": "百合",
    "Historical": "歴史",
    "Military": "ミリタリー",
    "Police": "警察",
    "Post-Apocalyptic": "ポストアポカリプス",
    "Space": "宇宙",
    "Super Power": "超能力",
    "Vampire": "吸血鬼",
    "Martial Arts": "武道",
    "Demons": "悪魔",
    "Parody": "パロディ",
    "Game": "ゲーム",
    "Hentai": "成人向け",
    "Seinen": "青年",
    "Shoujo": "少女",
    "Shounen": "少年",
    "Josei": "女性",
    "Kids": "子供向け"
};

export class TagTranslator {
    static getDisplayTag(tag: string): string {
        const jp = TagTranslationMap[tag];
        return jp ? `${jp} (${tag})` : tag;
    }

    static getOriginalTag(displayTag: string): string {
        // "日本語 (English)" -> "English"
        const match = displayTag.match(/.*\((.+)\)$/);
        return match ? match[1] : displayTag;
    }
}
