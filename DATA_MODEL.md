# データ設計

## Raw Sessions

1セッションを1行で保存します。端末側は終了時にIndexedDBへ確定し、Apps Scriptは `session_id` をキーとして再送を冪等に処理します。Raw列に年月や曜日などの派生値を重複保存しません。

| 列 | 内容 |
| --- | --- |
| `session_id` | UUID v4。端末で発行する一意ID |
| `local_date` | 開始時のタイムゾーンで見た日付 |
| `learning_method` | `material` / `vocabulary` / `ai` / `other` |
| `start_at`, `end_at` | UTC ISO 8601の絶対時刻 |
| `study_seconds` | 一時停止を除いた学習秒数 |
| `pause_seconds` | 一時停止秒数 |
| `elapsed_seconds` | 開始から終了までの総秒数 |
| `skills` | `listening` 等の固定技能コードをJSON配列で格納。複数選択・空配列に対応 |
| `focus_mode` | `off` / `self_reported` |
| `focus_seconds` | 手動FOCUS ONの合計秒数 |
| `timezone` | 開始時のIANAタイムゾーン |
| `recorded_at` | Apps Scriptが初回受信時に付けるUTC時刻 |
| `events` | 開始・一時停止・再開・FOCUS切替・終了の時刻履歴。再計算と一時停止回数の分析に使う |

Apps Scriptの初回接続時にRaw見出しを更新します。以前の列名や、一部見出しが異なる旧形式からの移行では、行のID・日付・時刻・時間を保持し、旧技能を認識できる場合のみ技能へ移します。旧形式に学習方法・FOCUS・イベント時刻がない場合は `other` / `off` / 空履歴として補います。

## 端末保存と同期

IndexedDBには、進行中セッション、終了後の技能選択待ち記録、完了ログ、接続設定、未送信状態を保存します。バックアップJSONには接続トークンを含めません。未送信の記録は最大20件ずつ送信し、Apps Scriptから各IDの確認応答を受けた場合だけ端末の未送信状態を解除します。認証・通信エラー時は削除せず保持します。

## 分析シート

Apps Scriptの「分析シートを更新」で、Rawから次の表を再生成します。

- `Daily` / `Weekly` / `Monthly`：日・月曜日始まりの週・月ごとのセッション数と秒数
- `Methods`：教材/単語/AI/その他ごとの時間と平均
- `Skills`：技能別の時間。複数技能のセッション時間は技能数で均等配分します
- `Method Skills`：`AI × speaking` のような組み合わせ。技能ごとの均等配分を使います
- `Weekdays` / `Hours`：開始日の曜日と開始時刻別の時間
- `Focus` / `Summary`：FOCUS利用、総学習時間、活動日平均、現在・最長継続日数、一時停止率など
- `Analysis Sessions`：Rawを分析しやすい形に展開した確認用ビュー

日跨ぎのセッションは開始日に全量を計上します。週は月曜日の日付で識別します。技能が複数選択された場合のSkills/Method Skills合計はRaw全体の学習時間と一致するよう整数秒を配ります。技能なしのセッションはMethodsやDailyには含まれますが、Skillsには計上しません。

一時停止率は `合計pause_seconds ÷ 合計elapsed_seconds`、活動日平均は `合計study_seconds ÷ 学習秒数が正の日数` です。曜日・時間帯の値はセッション全体を開始時点に帰属させます。セッションを深夜や一時停止境界で厳密分割する分析には、将来 `Session Segments` のような子テーブルを追加する必要があります。
