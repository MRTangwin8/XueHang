export default {
  "common": {
    "appName": "学航",
    "save": "保存",
    "cancel": "キャンセル",
    "confirm": "OK",
    "delete": "削除",
    "edit": "編集",
    "add": "追加",
    "create": "新規作成",
    "search": "検索",
    "reset": "リセット",
    "export": "エクスポート",
    "import": "インポート",
    "refresh": "更新",
    "close": "閉じる",
    "back": "戻る",
    "submit": "送信",
    "view": "表示",
    "detail": "詳細",
    "more": "その他",
    "restore": "復元",
    "download": "ダウンロード",
    "upload": "アップロード",
    "operation": "操作",
    "status": "状態",
    "remark": "備考",
    "all": "すべて",
    "yes": "はい",
    "no": "いいえ",
    "none": "なし",
    "loading": "読み込み中…",
    "noData": "データがありません",
    "total": "全 {n} 件",
    "selected": "{n} 件選択中",
    "pleaseSelect": "選択してください",
    "pleaseInput": "入力してください",
    "saved": "保存しました",
    "deleted": "削除しました",
    "operationSuccess": "操作が完了しました",
    "confirmDelete": "「{name}」を削除しますか？",
    "confirmTitle": "確認",
    "campus": "校舎",
    "allCampuses": "すべての校舎",
    "startDate": "開始日",
    "endDate": "終了日",
    "to": "～",
    "today": "今日",
    "recycleBin": "ごみ箱",
    "other": "その他"
  },
  "menu": {
    "home": "情報センター",
    "teacher": "講師センター",
    "crm": "顧客管理",
    "students": "学生管理",
    "schedule": "教務管理",
    "service": "学習サポート",
    "hr": "人事管理",
    "system": "システム設定"
  },
  "layout": {
    "expandMenu": "メニューを展開",
    "collapseMenu": "メニューを折りたたむ",
    "profile": "個人設定",
    "logout": "ログアウト",
    "language": "言語",
    "weakPassword": "現在のパスワードは安全性が不十分です（8文字以上で英字と数字が必要）。アカウント保護のため、お早めに変更してください。",
    "changeNow": "今すぐ変更",
    "studentPortal": "学生ポータル",
    "signOut": "ログアウト"
  },
  "notification": {
    "title": "通知",
    "readAll": "すべて既読にする",
    "empty": "通知はありません"
  },
  "auth": {
    "staffNo": "職員番号",
    "studentNo": "学籍番号",
    "password": "パスワード",
    "login": "ログイン",
    "imStudent": "学生の方はこちら",
    "toStudentLogin": "学生ログインへ",
    "imStaff": "教職員の方はこちら",
    "toStaffLogin": "管理画面のログインへ"
  },
  "forgot": {
    "link": "パスワードをお忘れですか？", "title": "パスワード再設定", "send": "再設定メールを送信",
    "sent": "登録済みのメールアドレスがある場合、再設定メールを送信しました。30分以内に手続きを完了してください。",
    "backToLogin": "ログインに戻る", "requestFailed": "送信できませんでした。後でもう一度お試しください。"
  },
  "reset": {
    "title": "新しいパスワードの設定", "submit": "パスワードを再設定", "success": "パスワードを再設定しました。新しいパスワードでログインしてください。",
    "invalidLink": "再設定リンクが無効です。もう一度申請してください。", "failed": "再設定できませんでした。もう一度申請してください。"
  },
  "install": {
    "title": "初回セットアップ", "subtitle": "基本設定を完了すると、学航をご利用いただけます",
    "steps": { "welcome": "ようこそ", "database": "データベース", "site": "拠点・校舎", "admin": "管理者", "running": "インストール" },
    "welcomeTitle": "学航へようこそ", "tokenHelp": "セットアップコードはサーバーコンソールと server/.install-token で確認できます。",
    "token": "セットアップコード", "tokenRequired": "セットアップコードを入力してください", "environment": "動作環境の確認",
    "environmentBlocked": "動作環境の問題を解消してから再度お試しください。", "nodeVersion": "Node.js バージョン",
    "serverWritable": "サーバーディレクトリへの書き込み", "prismaWritable": "Prisma ディレクトリへの書き込み", "platform": "実行環境",
    "passed": "正常", "failed": "要確認", "databaseTitle": "データベースの選択",
    "sqliteHelp": "設定不要で、試用や小規模運用に適しています。", "mysqlDriverHelp": "初回利用時に MySQL ドライバー（mariadb、LGPL-2.1）を自動インストールします。",
    "host": "ホスト", "port": "ポート", "dbUser": "ユーザー名", "dbPassword": "パスワード", "dbName": "データベース名",
    "dbRequired": "ホストとデータベース名を入力してください", "testConnection": "接続テスト", "dbConnected": "接続しました",
    "testFirst": "先に接続テストを実行してください", "next": "次へ", "siteTitle": "拠点と最初の校舎", "siteName": "拠点名",
    "campusName": "校舎名", "campusCode": "校舎コード", "timezone": "タイムゾーン", "requiredFields": "必須項目を入力してください",
    "adminTitle": "管理者アカウントの作成", "emailOptional": "メールアドレス（任意）", "demoData": "デモデータも登録する", "preset": "業種テンプレート", "presetHint": "教室の種類に合わせて試験の種類・成績テンプレート・学生情報の項目・選択肢を初期設定します。インストール後も「システム設定 → 成績・学生情報設定」で変更・再インポートできます。",
    "start": "インストール開始", "runningTitle": "インストール中", "doneTitle": "インストール完了", "failedTitle": "インストール失敗",
    "waitingLog": "インストールログを待機しています…", "goLogin": "ログインへ", "requestFailed": "通信に失敗しました。後でもう一度お試しください。",
    "defaults": { "siteName": "学航", "campusName": "本校", "adminName": "システム管理者" }
  },
  "profile": {
    "title": "個人設定",
    "name": "氏名",
    "staffNo": "職員番号",
    "campus": "校舎",
    "roles": "役職",
    "changePassword": "パスワード変更",
    "oldPassword": "現在のパスワード",
    "newPassword": "新しいパスワード",
    "confirmPassword": "新しいパスワード（確認）",
    "passwordRule": "英字と数字を含む8～64文字",
    "passwordMismatch": "新しいパスワードが一致しません",
    "passwordChanged": "パスワードを変更しました。他の端末はログアウトされました"
  },
  "validation": {
    "passwordMin": "パスワードは8文字以上で入力してください",
    "passwordMax": "パスワードは64文字以内で入力してください",
    "passwordLetterDigit": "パスワードには英字と数字の両方が必要です"
  },
  "page": {
    "install": "初回セットアップ",
    "forgotPassword": "パスワード再設定",
    "resetPassword": "パスワード再設定",
    "login": "ログイン",
    "studentLogin": "学生ログイン",
    "forbiddenTitle": "アクセス権限がありません",
    "forbiddenDesc": "このページへのアクセス権限がありません。管理者にお問い合わせください。",
    "notFoundDesc": "ページが見つかりません",
    "backHome": "ホームへ戻る"
  },
  "upload": {
    "choose": "ファイルを選択",
    "uploaded": "アップロード済み：{name}",
    "success": "アップロードしました"
  },
  "select": {
    "teacher": "講師を選択",
    "staff": "職員を選択",
    "student": "氏名・学籍番号で検索",
    "room": "教室を選択",
    "campus": "すべての校舎"
  },
  "site": {
    "siteName": "学航",
    "siteSubtitle": "教務管理プラットフォーム",
    "browserTitle": "学航 · 教務管理プラットフォーム",
    "loginTitle": "おかえりなさい",
    "loginSubtitle": "教職員ログイン",
    "heroTitle": "一人ひとりの進学への道を\n見えるかたちに",
    "heroPoints": [
      "教室と授業の予定を一元管理。重複をリアルタイムで通知",
      "VIP授業のコマ数を管理。確認待ちは48時間後に自動確定",
      "顧客対応・入塾手続き・入金・出欠・面談をまとめて管理"
    ],
    "footerText": "© 学航 · 教務管理プラットフォーム",
    "portalTitle": "学生ポータル",
    "portalLoginSubtitle": "授業の残りコマ数確認・面談予約・書類提出・印刷依頼"
  }
}

