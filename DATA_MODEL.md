# データモデルと分析の定義

## Raw Sessions：事実テーブル

1セッション=開始から終了まで。1行は1つの学習セッション。`session_id` が主キー相当です。全セッションはインドネシア語学習を前提とし、言語名を毎行に重複保存しません。時刻文字列はUTC、日付は開始時の現地日付です。

| 列 | 型・例 | 定義 |
| --- | --- | --- |
| session_id | UUID v4 | 端末で開始時に発行し、再送しても同じ値 |
| local_date | 2026-10-04 | 開始時タイムゾーンでの開始日 |
| skill | Listening / Speaking / Reading / Writing | 4技能の固定コード |
| start_at | 2026-10-04T01:00:00.000Z | 端末が記録する開始時刻、UTC ISO 8601 |
| end_at | 2026-10-04T01:32:00.000Z | 端末が記録する終了時刻、UTC ISO 8601 |
| study_seconds | 整数、0以上 | 学習中だった時間、端数切り捨て |
| pause_seconds | 整数、0以上 | elapsed_seconds − study_seconds |
| elapsed_seconds | 整数、0以上 | floor((end_at − start_at)/1000) |
| timezone | Asia/Tokyo / Asia/Jakarta 等 | 開始時のIANAタイムゾーン |
| recorded_at | UTC ISO 8601 | 初回保存時にApps Scriptが生成する時刻 |

`created_at` 相当は `recorded_at` に統一。再送で更新しません。year / month / week / weekday / start_hour はRawに持たず、分析更新時に生成します。local_dateとelapsed_secondsは要求項目として保持し、保存時にタイムスタンプとの整合性を検証します。

例：

```json
{"session_id":"f4d4f365-b29c-45c1-a06b-f9da2c08aebd","local_date":"2026-10-04","skill":"Listening","start_at":"2026-10-04T01:00:00.000Z","end_at":"2026-10-04T01:32:00.000Z","study_seconds":1800,"pause_seconds":120,"elapsed_seconds":1920,"timezone":"Asia/Tokyo","recorded_at":"2026-10-04T01:32:01.000Z"}
```

## 端末側の状態

IndexedDB `four-study-v1` に次を保存します。

- `state/current`：ID、技能、開始時刻、直前の状態変更時刻、active/paused、確定済み学習ミリ秒、開始時タイムゾーン。
- `state/config`：公開エンドポイントと個人用トークン。バックアップには含めません。
- `sessions`：完了セッションと `pending` フラグ。フラグは通信状態でありRawには送信しません。送信後も端末ログはTODAYとバックアップのため保持します。

表示は`Date.now()`との差で再計算。終了時の「完了ログ追加」と「進行中削除」は同じreadwriteトランザクション内で実行します。保存失敗時にはどちらも確定しません。同じ配信元の別タブも同じトランザクションで直列化し、古いID・状態の操作は無視します。画面更新はBroadcastChannelと復帰時再読込で追従します。

## 配信保証

最大20件ずつPOST。応答 `{ok:true,ack:[session_id,...]}` で送信した全IDが確認できた場合だけ端末のpendingを解除します。通信タイムアウト・不明な応答・一部IDのみの応答では全件を保持します。

サーバーはScriptLock内で重複検査→追記→flush。保存後に応答が消えた場合も同じIDの再送で既存行を確認します。同一ID・同一内容は成功、同一ID・別内容は競合エラー。バッチ内の重複も抑止します。この意味でat-least-once送信＋冪等な保存です。Sheets自体はRDBMSのトランザクションDBではありません。外部編集やサービス障害に対する完全なexactly-once保証ではありません。

再送は前面で30秒ごとに試行し、失敗時は10秒から最大5分の間隔で抑制。復帰・起動時にも試行します。手動再送は抑制を解除します。認証失敗なども自動削除せず保留します。永久エラーのあるバッチは後続も止まるため、設定・ログを確認して再試行してください。

## 分析の前提

- 日別：local_dateで学習秒数を合計。日跨ぎは開始日に全量計上。
- 週別：開始日の属する月曜日の日付をキーとする。年をまたいでも衝突しません。
- 月別：local_dateのYYYY-MM。
- 技能配分：各技能のSUM(study_seconds) ÷ 全技能のSUM(study_seconds)。Skillsからグラフ化できます。
- 平均セッション時間：SUM(study_seconds) ÷ セッション数。0秒で終了したセッションも回数に含みます。
- 曜日：local_dateの曜日、月曜=1〜日曜=7。
- 時間帯：start_atを各行のtimezoneに変換した開始時刻の0〜23時。学習時間全体を開始時間帯に計上します。
- 学習日数：study_seconds > 0の記録がある日付の数。
- 最長継続日数：上記の日付が暦日で連続した最大日数。
- 現在継続日数：Sheets設定のタイムゾーンの今日を基準に、今日が学習済みなら今日から、未学習なら昨日から逆算。昨日も未学習なら0。
- 一時停止率：SUM(pause_seconds) ÷ SUM(elapsed_seconds)。分母0は0。セッション別比率の単純平均ではありません。
- 分析更新時点以降の新規Rawは次回更新まで含みません。学習のない日はDailyに行を作らないため、ゼロの日を含むグラフには別途カレンダーテーブルと結合します。

## 正規化・拡張

固定のskill文字列は現時点の小さな列挙型。説明や翻訳を加えるなら `Skills Master(skill_id, label_ja, label_en)` を設け、分析側で結合します。教材は `Materials`、教材との関連は別テーブルで管理します。複数言語・複数ユーザー対応時はlanguage_id/user_idと認証を追加し、既存ログの移行を設計します。

正確な深夜分割や学習した各分の時間帯分析には、現在の集計済み1行だけでは情報が不足します。その要件が出た場合は `Session Segments(session_id, segment_no, mode, start_at, end_at)` を子テーブルとして追加してください。現在のRawから一時停止の発生時刻や回数は復元できません。
