# 保存するデータ

Google Sheetsには「Raw Sessions」シートだけを使い、1セッションを1行で記録します。分析用シートや集計値は自動作成しません。記録をそのまま使い、必要な分析はご自身で追加できます。

| 列 | 内容 |
| --- | --- |
| `session_id` | 端末で発行する一意ID。再送時の二重登録を防止 |
| `local_date` | 開始時の現地日付 |
| `learning_method` | `material` / `vocabulary` / `ai` / `other` |
| `start_at`, `end_at` | UTC形式の開始・終了時刻 |
| `study_seconds` | 一時停止を除いた学習秒数 |
| `pause_seconds` | 一時停止秒数 |
| `elapsed_seconds` | 開始から終了までの経過秒数 |
| `skills` | `listening` / `speaking` / `reading` / `writing` の配列。複数・未選択に対応 |
| `focus_mode` | `off` / `self_reported`。FOCUSを手動で使ったか |
| `timezone` | 開始時のタイムゾーン |
| `recorded_at` | Apps Scriptが初回受信時に記録する時刻 |

日付・曜日・週・月・時間帯などの派生列や、詳細な操作履歴はSheetsへ送信しません。アプリは未送信ログを端末に保持し、接続後に再送します。Apps Scriptは既存の旧形式の行を上記の列構成へ移す際、セッションID・日時・時間を保ち、旧データを削除しません。`setup` はこのアプリ旧版が作った分析タブだけを削除し、その他のタブには触れません。
