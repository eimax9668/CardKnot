const translations = {
    ja: {
        // ナビゲーション
        "nav.home": "ホーム",
        "nav.help": "使い方",
        "nav.privacy": "プライバシー",
        "nav.app": "アプリを開く",
        
        // ヒーローセクション
        "hero.title": '思考を<span class="gradient-text">結び</span>、<br>アイデアを<span class="gradient-text">解き放つ</span>。',
        "hero.desc": "CardKnotは、無限のキャンバスでアイデアを整理し、<br>直感的につなぎ合わせることができる思考整理ツールです。",
        "hero.cta": "今すぐ始める（無料）",
        
        // 特徴
        "features.title": "CardKnotができること",
        "features.subtitle": "シンプルだけど、パワフルな機能。",
        "feature.1.title": "直感的な接続",
        "feature.1.desc": "カードとカードを線で結ぶだけで、関係性を可視化。複雑なアイデアもスッキリ整理できます。",
        "feature.2.title": "プレゼンテーション",
        "feature.2.desc": "作ったマップをそのままスライドショーに。思考のプロセスをスムーズに共有できます。",
        "feature.3.title": "ローカル保存",
        "feature.3.desc": "データはブラウザに自動保存。サーバーに送信されないので、プライバシーも安心です。",
        "feature.4.title": "共同作業",
        "feature.4.desc": "複数人で同時編集。リアルタイムでアイデアを組み立て、変化を一緒に体験できます。",
        "feature.5.title": "リッチな情報整理",
        "feature.5.desc": "画像やリンク、動画などもカード内に自由に貼り付け、アイディアや資料をひとまとめに整理できます。",
        "feature.6.title": "JSONバックアップ",
        "feature.6.desc": "JSONファイルとして簡単に保存・読み込みでき、大切なデータのバックアップや移行が手軽です。",

        // 詳細
        "detail.1.title": "広大なキャンバスで<br>思考を止めない",
        "detail.1.desc": "スペースを気にする必要はありません。無限に広がるキャンバスに、思いつくままカードを配置しましょう。ミニマップ機能で全体像もすぐに把握できます。",
        "detail.1.li1": "<i class=\"bi bi-check-circle-fill text-blue-500\"></i> ズームイン・アウトで自在に視点操作",
        "detail.1.li2": "<i class=\"bi bi-check-circle-fill text-blue-500\"></i> ドラッグ操作でスムーズな移動",
        "detail.1.li3": "<i class=\"bi bi-check-circle-fill text-blue-500\"></i> ダークモード対応で目に優しい",

        "detail.2.title": "テキストだけじゃない、<br>リッチな情報整理",
        "detail.2.desc": "文字だけでなく、画像や動画、Webリンクのカードが追加可能。参考資料やデザイン案もまとめて管理できます。",
        "detail.2.li1": "<i class=\"bi bi-check-circle-fill text-blue-500\"></i> 画像やYouTube動画を埋め込み再生",
        "detail.2.li2": "<i class=\"bi bi-check-circle-fill text-blue-500\"></i> リンクカードでWebサイトを美しく保存",
        "detail.2.li3": "<i class=\"bi bi-check-circle-fill text-blue-500\"></i> カードのリサイズや色分けで自由に整理",

        // CTA
        "cta.title": "あなたのアイデアを、<br class=\"sp-break\">形にしよう。",
        "cta.desc": "インストール不要。ブラウザですぐに使えます。",
        "cta.btn": "CardKnotを使ってみる",
        
        // フッター
        "footer.github": "GitHub",
        
        // 404ページ
        "404.title": "ページが見つかりません",
        "404.desc": "お探しのページは移動または削除された可能性があります。",
        "404.back": "トップへ戻る"
    },
    en: {
        // Navigation
        "nav.home": "Home",
        "nav.help": "Guide",
        "nav.privacy": "Privacy",
        "nav.app": "Open App",
        
        // Hero
        "hero.title": 'Connect your <span class="gradient-text">Thoughts</span>,<br>Unleash your <span class="gradient-text">Ideas</span>.',
        "hero.desc": "CardKnot is a thinking tool that allows you to organize ideas on an infinite canvas and connect them intuitively.",
        "hero.cta": "Get Started (Free)",
        
        // Features
        "features.title": "",
        "features.subtitle": "",
        "feature.1.title": "",
        "feature.1.desc": "",
        "feature.2.title": "",
        "feature.2.desc": "",
        "feature.3.title": "",
        "feature.3.desc": "",
        "feature.4.title": "",
        "feature.4.desc": "",
        "feature.5.title": "",
        "feature.5.desc": "",
        "feature.6.title": "",
        "feature.6.desc": "",

        // Details
        "detail.1.title": "",
        "detail.1.desc": "",
        "detail.1.li1": "",
        "detail.1.li2": "",
        "detail.1.li3": "",

        "detail.2.title": "",
        "detail.2.desc": "",
        "detail.2.li1": "",
        "detail.2.li2": "",
        "detail.2.li3": "",

        // CTA
        "cta.title": "Shape Your Ideas.",
        "cta.desc": "No installation required. Use it immediately in your browser.",
        "cta.btn": "Try CardKnot",
        
        // Footer
        "footer.github": "GitHub",
        
        // 404
        "404.title": "Page Not Found",
        "404.desc": "The page you are looking for may have been moved or deleted.",
        "404.back": "Back to Top"
    }
};

function setLanguage(lang) {
    document.documentElement.lang = lang;
    localStorage.setItem('cardknot-lang', lang);
    
    // テキストの更新
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang] && translations[lang][key]) {
            if (el.getAttribute('data-i18n-html') === 'true') {
                el.innerHTML = translations[lang][key];
            } else {
                el.innerHTML = translations[lang][key];
            }
        }
    });

    // スイッチャーの表示更新
    document.querySelectorAll('.lang-switch').forEach(el => {
        if (el.getAttribute('data-lang') === lang) {
            el.classList.add('text-blue-600', 'cursor-default');
            el.classList.remove('text-slate-400', 'hover:text-blue-600', 'cursor-pointer');
            el.onclick = (e) => e.preventDefault();
        } else {
            el.classList.remove('text-blue-600', 'cursor-default');
            el.classList.add('text-slate-400', 'hover:text-blue-600', 'cursor-pointer');
            el.onclick = (e) => {
                e.preventDefault();
                setLanguage(el.getAttribute('data-lang'));
            };
        }
    });
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    const savedLang = localStorage.getItem('cardknot-lang') || 'ja';
    setLanguage(savedLang);
});
