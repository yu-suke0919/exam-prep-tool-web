# Excel 関数トレーニング

MOS Excel 365対策として、表を読み、関数と引数を選んで数式をつくるスマートフォン向けWebアプリ。

現在は最初のイテレーションとして、**SUM・通常モードを1問ずつ練習**できます。
関数→引数の6択、選択直後の判定、引数の説明、戻って選び直す操作、解説、4状態の記録、自動保存・再開を実装しています。
表の行数・売上の列・数値を変え、直前とは異なる正解の範囲を出題します。

IF、ハードモード、5問セット、カテゴリ選択は今後の実装範囲です。
正式な関数のカテゴリ分類とExcelの引数説明文は、公式資料との照合が必要です。

まだ外から開けるURLには公開していません。
スマートフォンで操作するための[確認方法と公開案](docs/preview.md)を用意しています。

## 起動

Node.js 22.12以降とnpmを使います。

```sh
npm ci
npm run dev
```

本番向けの出力は `npm run build` で `dist/` に生成します。
`npm run preview` で生成結果を確認できます。

ViteとJavaScriptの構成で、サーバー・ログイン・環境変数の設定は不要です。
学習記録と回答中の問題は、同じ端末・ブラウザ・オリジンのlocalStorageに保存します。
ブラウザの保存データを削除した場合や別のオリジンで開いた場合は、記録を引き継ぎません。

## 検証

```sh
npm test
npm run test:e2e
npm run build
```

- 単体テスト: 問題生成、採点、記録の遷移、未完成問題の破棄、保存と再試行。
- ブラウザテスト: 画面操作、再読み込み、保存失敗、スマートフォンサイズの配置。

このクラウド環境では `/usr/bin/chromium` を使います。
別の実行ファイルを使う場合は `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` を指定できます。
システムのChromiumがない環境では、先にPlaywrightのブラウザをインストールします。

```sh
npx playwright install chromium
```

## 資料

- [機能全体の仕様](docs/function-practice-spec.md)
- [SUM・IFの操作例](docs/function-practice-examples.md)
- [今回の設計・検証結果](docs/iterations/01-sum-normal.md)

開発は、資料更新→テスト→最小実装→検証→利用者レビューの順に、小さな単位で進めます。
