import type { TranslationLang } from './lang'

type Texts = [string, string, string, string, string, string, string]
export const messages: Record<string, Record<TranslationLang, string>> = Object.create(null)
const codes: TranslationLang[] = ['en', 'ja', 'fr', 'es', 'ru', 'pt', 'de']

function add(source: string, ...texts: Texts) {
  messages[source] = Object.fromEntries(codes.map((code, i) => [code, texts[i]])) as Record<TranslationLang, string>
}

// Shared sentence structures still produce a complete seven-language entry for each Chinese source.
function noun(source: string, ...texts: Texts) {
  add(`${source}不存在`, ...texts.map((text, i) => [
    `${text} not found`, `${text}が見つかりません`, `${text} introuvable`, `No se encuentra: ${text}`,
    `Не найдено: ${text}`, `Não encontrado: ${text}`, `${text} nicht gefunden`,
  ][i]!) as Texts)
}

noun('记录', 'Record', '記録', 'Enregistrement', 'Registro', 'Запись', 'Registro', 'Eintrag')
noun('客户', 'Customer', '顧客', 'Client', 'Cliente', 'Клиент', 'Cliente', 'Kunde')
noun('跟进记录', 'Follow-up record', '対応履歴', 'Suivi', 'Seguimiento', 'Запись контакта', 'Acompanhamento', 'Kontakteintrag')
noun('日报', 'Daily report', '日報', 'Rapport quotidien', 'Informe diario', 'Ежедневный отчёт', 'Relatório diário', 'Tagesbericht')
noun('机构', 'Organization', '提携機関', 'Organisme', 'Organización', 'Организация', 'Organização', 'Organisation')
noun('课程', 'Course', '講座', 'Cours', 'Curso', 'Курс', 'Curso', 'Kurs')
noun('缴费记录', 'Payment record', '入金記録', 'Paiement', 'Pago', 'Запись оплаты', 'Pagamento', 'Zahlungseintrag')
noun('学员', 'Student', '学生', 'Élève', 'Estudiante', 'Учащийся', 'Estudante', 'Schüler')
noun('私塾套餐', 'Tuition package', '受講プラン', 'Forfait de cours', 'Paquete de clases', 'Учебный пакет', 'Pacote de aulas', 'Unterrichtspaket')
noun('订单', 'Order', '申込', 'Commande', 'Pedido', 'Заказ', 'Pedido', 'Auftrag')
noun('教室', 'Classroom', '教室', 'Salle', 'Aula', 'Аудитория', 'Sala', 'Unterrichtsraum')
noun('班课', 'Group class', '集団授業クラス', 'Classe collective', 'Clase grupal', 'Группа', 'Turma', 'Gruppenkurs')
noun('默认教室', 'Default classroom', '既定の教室', 'Salle par défaut', 'Aula predeterminada', 'Аудитория по умолчанию',
  'Sala padrão', 'Standardraum')
noun('任课老师', 'Assigned teacher', '担当講師', 'Enseignant responsable', 'Docente asignado', 'Назначенный преподаватель',
  'Professor responsável', 'Zuständige Lehrkraft')
noun('课次', 'Lesson', '授業', 'Séance', 'Sesión', 'Занятие', 'Aula', 'Unterrichtstermin')
noun('老师', 'Teacher', '講師', 'Enseignant', 'Docente', 'Преподаватель', 'Professor', 'Lehrkraft')
noun('VIP 课时包', 'VIP lesson package', '個別指導の受講時間パック', 'Forfait VIP', 'Paquete VIP', 'Пакет VIP', 'Pacote VIP', 'VIP-Stundenpaket')
noun('校区', 'Campus', '校舎', 'Site', 'Sede', 'Филиал', 'Unidade', 'Standort')
noun('文书申请', 'Document request', '書類添削の申請', 'Demande de correction', 'Solicitud de revisión', 'Заявка на проверку документов',
  'Solicitação de revisão', 'Antrag auf Dokumentenkorrektur')
noun('时间段', 'Time slot', '予約枠', 'Créneau', 'Franja horaria', 'Временной интервал', 'Horário', 'Zeitfenster')
noun('关联的时间段', 'Linked time slot', '関連する予約枠', 'Créneau associé', 'Franja vinculada', 'Связанный интервал',
  'Horário vinculado', 'Verknüpftes Zeitfenster')
noun('主持老师', 'Host teacher', '面談担当講師', 'Enseignant animateur', 'Docente responsable', 'Ведущий преподаватель',
  'Professor responsável', 'Betreuende Lehrkraft')
noun('通知', 'Notice', 'お知らせ', 'Annonce', 'Aviso', 'Уведомление', 'Aviso', 'Mitteilung')
noun('资料', 'Resource', '資料', 'Ressource', 'Recurso', 'Материал', 'Material', 'Material')
noun('打印申请', 'Print request', '印刷申請', "Demande d'impression", 'Solicitud de impresión', 'Заявка на печать',
  'Solicitação de impressão', 'Druckantrag')
noun('员工', 'Staff member', '職員', 'Employé', 'Empleado', 'Сотрудник', 'Funcionário', 'Mitarbeiter')
noun('申报记录', 'Submitted claim', '申請記録', 'Déclaration', 'Declaración', 'Заявка', 'Declaração', 'Antrag')
noun('角色', 'Role', '権限ロール', 'Rôle', 'Rol', 'Роль', 'Perfil', 'Rolle')
noun('工号', 'Staff ID', '職員番号', 'Matricule', 'Número de empleado', 'Табельный номер', 'Matrícula', 'Personalnummer')

function input(source: string, ...texts: Texts) {
  add(`请填写${source}`, ...texts.map((text, i) => [
    `Please enter ${text}`, `${text}を入力してください`, `Veuillez saisir ${text}`, `Introduzca ${text}`,
    `Укажите ${text}`, `Informe ${text}`, `Bitte ${text} eingeben`,
  ][i]!) as Texts)
}
input('客户姓名', 'the customer name', '顧客名', 'le nom du client', 'el nombre del cliente', 'имя клиента', 'o nome do cliente', 'den Kundennamen')
input('跟进内容', 'follow-up notes', '対応内容', 'le suivi', 'el seguimiento', 'содержание контакта', 'o acompanhamento', 'die Kontaktnotizen')
input('今日工作', "today's work", '本日の業務内容', 'le travail du jour', 'el trabajo de hoy', 'работу за сегодня', 'o trabalho de hoje', 'die heutige Arbeit')
input('机构名称', 'the organization name', '機関名', "le nom de l'organisme", 'el nombre de la organización', 'название организации',
  'o nome da organização', 'den Organisationsnamen')
input('渠道名称', 'the channel name', '紹介経路名', 'le nom du canal', 'el nombre del canal', 'название канала', 'o nome do canal', 'den Kanalnamen')
input('缴费金额', 'the payment amount', '入金額', 'le montant du paiement', 'el importe del pago', 'сумму оплаты', 'o valor do pagamento', 'den Zahlbetrag')
input('课程名称', 'the course name', '講座名', 'le nom du cours', 'el nombre del curso', 'название курса', 'o nome do curso', 'den Kursnamen')
input('价格', 'the price', '価格', 'le prix', 'el precio', 'цену', 'o preço', 'den Preis')
input('退费金额', 'the refund amount', '返金額', 'le montant du remboursement', 'el importe del reembolso', 'сумму возврата',
  'o valor do reembolso', 'den Erstattungsbetrag')
input('教室名称', 'the classroom name', '教室名', 'le nom de la salle', 'el nombre del aula', 'название аудитории', 'o nome da sala', 'den Raumnamen')
input('班级名称', 'the class name', 'クラス名', 'le nom de la classe', 'el nombre de la clase', 'название группы', 'o nome da turma', 'den Klassennamen')
input('占用事由（标题）', 'a reason for the reservation (title)', '使用目的（件名）', 'le motif de réservation (titre)',
  'el motivo de la reserva (título)', 'причину бронирования (заголовок)', 'o motivo da reserva (título)', 'den Belegungsgrund (Titel)')
input('授课内容', 'the lesson content', '授業内容', 'le contenu du cours', 'el contenido de la clase', 'содержание занятия',
  'o conteúdo da aula', 'den Unterrichtsinhalt')
input('课时包名称', 'the lesson package name', '受講時間パック名', 'le nom du forfait', 'el nombre del paquete', 'название пакета',
  'o nome do pacote', 'den Stundenpaketnamen')
input('标题', 'a title', '件名', 'un titre', 'un título', 'заголовок', 'um título', 'einen Titel')
input('内容', 'the content', '内容', 'le contenu', 'el contenido', 'содержание', 'o conteúdo', 'den Inhalt')
input('工作内容', 'the work description', '業務内容', 'le travail effectué', 'el trabajo realizado', 'описание работы',
  'a descrição do trabalho', 'die Tätigkeitsbeschreibung')
input('姓名', 'a name', '氏名', 'un nom', 'un nombre', 'имя', 'um nome', 'einen Namen')
input('校区代码', 'the campus code', '校舎コード', 'le code du site', 'el código de la sede', 'код филиала', 'o código da unidade', 'den Standortcode')
input('校区名称', 'the campus name', '校舎名', 'le nom du site', 'el nombre de la sede', 'название филиала', 'o nome da unidade', 'den Standortnamen')
input('角色名称', 'the role name', 'ロール名', 'le nom du rôle', 'el nombre del rol', 'название роли', 'o nome do perfil', 'den Rollennamen')
input('分类', 'a category', '分類', 'une catégorie', 'una categoría', 'категорию', 'uma categoria', 'eine Kategorie')
input('工号', 'a staff ID', '職員番号', 'un matricule', 'un número de empleado', 'табельный номер', 'uma matrícula', 'eine Personalnummer')

function select(source: string, ...texts: Texts) {
  add(`请选择${source}`, ...texts.map((text, i) => [
    `Please select ${text}`, `${text}を選択してください`, `Veuillez sélectionner ${text}`, `Seleccione ${text}`,
    `Выберите ${text}`, `Selecione ${text}`, `Bitte ${text} auswählen`,
  ][i]!) as Texts)
}
select('校区', 'a campus', '校舎', 'un site', 'una sede', 'филиал', 'uma unidade', 'einen Standort')
select('客户', 'a customer', '顧客', 'un client', 'un cliente', 'клиента', 'um cliente', 'einen Kunden')
select('跟进方式', 'a follow-up method', '対応方法', 'un mode de suivi', 'un método de seguimiento', 'способ контакта',
  'um método de acompanhamento', 'eine Kontaktmethode')
select('缴费方式', 'a payment method', '支払方法', 'un mode de paiement', 'un método de pago', 'способ оплаты', 'uma forma de pagamento', 'eine Zahlungsart')
select('私塾套餐', 'a tuition package', '受講プラン', 'un forfait de cours', 'un paquete de clases', 'учебный пакет', 'um pacote de aulas', 'ein Unterrichtspaket')
select('班级分配', 'a class assignment', 'クラス割当', 'une affectation de classe', 'una asignación de clase', 'распределение по группам',
  'uma alocação de turma', 'eine Klassenzuweisung')
select('学员', 'a student', '学生', 'un élève', 'un estudiante', 'учащегося', 'um estudante', 'einen Schüler')
select('学生', 'a student', '学生', 'un élève', 'un estudiante', 'учащегося', 'um estudante', 'einen Schüler')
select('班课', 'a group class', '集団授業クラス', 'une classe collective', 'una clase grupal', 'группу', 'uma turma', 'einen Gruppenkurs')
select(' VIP 课时包', 'a VIP lesson package', '個別指導の受講時間パック', 'un forfait VIP', 'un paquete VIP', 'пакет VIP', 'um pacote VIP', 'ein VIP-Stundenpaket')
select('日期', 'a date', '日付', 'une date', 'una fecha', 'дату', 'uma data', 'ein Datum')
select('星期', 'a weekday', '曜日', 'un jour de la semaine', 'un día de la semana', 'день недели', 'um dia da semana', 'einen Wochentag')
select('课次', 'a lesson', '授業', 'une séance', 'una sesión', 'занятие', 'uma aula', 'einen Unterrichtstermin')
select('申报记录', 'a submitted claim', '申請記録', 'une déclaration', 'una declaración', 'заявку', 'uma declaração', 'einen Antrag')
select('最终学历', 'the highest qualification', '最終学歴', 'le dernier diplôme', 'el nivel educativo más alto', 'уровень образования',
  'a formação mais alta', 'den höchsten Bildungsabschluss')

add('请先登录', 'Please sign in first', 'ログインしてください', "Veuillez d’abord vous connecter", 'Inicie sesión primero',
  'Сначала войдите в систему', 'Entre primeiro', 'Bitte zuerst anmelden')
add('参数错误', 'Invalid parameters', '入力内容に誤りがあります', 'Paramètres invalides', 'Parámetros no válidos',
  'Некорректные параметры', 'Parâmetros inválidos', 'Ungültige Parameter')
add('参数错误（{0}）：{1}', 'Invalid parameter ({0}): {1}', '入力エラー（{0}）：{1}', 'Paramètre invalide ({0}) : {1}',
  'Parámetro no válido ({0}): {1}', 'Некорректный параметр ({0}): {1}', 'Parâmetro inválido ({0}): {1}', 'Ungültiger Parameter ({0}): {1}')
add('参数错误：{0}', 'Invalid parameters: {0}', '入力エラー：{0}', 'Paramètres invalides : {0}', 'Parámetros no válidos: {0}',
  'Некорректные параметры: {0}', 'Parâmetros inválidos: {0}', 'Ungültige Parameter: {0}')
add('数据重复（唯一字段已存在）', 'Duplicate data (a unique value already exists)', 'データが重複しています（一意の項目が既に存在します）',
  'Doublon (une valeur unique existe déjà)', 'Datos duplicados (ya existe un valor único)', 'Дубликат данных (уникальное значение уже существует)',
  'Dados duplicados (um valor único já existe)', 'Doppelte Daten (eindeutiger Wert bereits vorhanden)')
add('存在关联数据，无法操作', 'Related data prevents this operation', '関連データがあるため操作できません',
  'Des données liées empêchent cette opération', 'Los datos relacionados impiden esta operación', 'Связанные данные препятствуют операции',
  'Dados vinculados impedem esta operação', 'Verknüpfte Daten verhindern diesen Vorgang')
add('服务器内部错误', 'Internal server error', 'サーバー内部エラー', 'Erreur interne du serveur', 'Error interno del servidor',
  'Внутренняя ошибка сервера', 'Erro interno do servidor', 'Interner Serverfehler')
add('没有权限执行此操作', 'You do not have permission to perform this operation', 'この操作を行う権限がありません',
  "Vous n’avez pas l’autorisation d’effectuer cette opération", 'No tiene permiso para realizar esta operación',
  'У вас нет прав на эту операцию', 'Você não tem permissão para esta operação', 'Sie haben keine Berechtigung für diesen Vorgang')
add('密码需同时包含字母和数字', 'The password must contain letters and numbers', 'パスワードには英字と数字の両方を含めてください',
  'Le mot de passe doit contenir des lettres et des chiffres', 'La contraseña debe contener letras y números',
  'Пароль должен содержать буквы и цифры', 'A senha deve conter letras e números', 'Das Passwort muss Buchstaben und Zahlen enthalten')
add('密码最多 64 位', 'The password must be at most 64 characters', 'パスワードは64文字以内にしてください',
  'Le mot de passe est limité à 64 caractères', 'La contraseña admite hasta 64 caracteres', 'Пароль должен содержать не более 64 символов',
  'A senha deve ter no máximo 64 caracteres', 'Das Passwort darf höchstens 64 Zeichen enthalten')
add('密码至少 8 位', 'The password must be at least 8 characters', 'パスワードは8文字以上にしてください',
  'Le mot de passe doit contenir au moins 8 caractères', 'La contraseña debe tener al menos 8 caracteres',
  'Пароль должен содержать не менее 8 символов', 'A senha deve ter pelo menos 8 caracteres', 'Das Passwort muss mindestens 8 Zeichen enthalten')
add('登录失败次数过多，请 {0} 分钟后再试', 'Too many failed sign-in attempts. Try again in {0} minutes',
  'ログインの失敗回数が上限に達しました。{0}分後に再度お試しください', 'Trop de tentatives échouées. Réessayez dans {0} minutes',
  'Demasiados intentos fallidos. Vuelva a intentarlo en {0} minutos', 'Слишком много неудачных попыток входа. Повторите через {0} мин.',
  'Muitas tentativas de acesso sem sucesso. Tente novamente em {0} minutos', 'Zu viele fehlgeschlagene Anmeldungen. In {0} Minuten erneut versuchen')
add('未知上传类型 {0}', 'Unknown upload type: {0}', '不明なアップロード種別：{0}', 'Type de téléversement inconnu : {0}',
  'Tipo de carga desconocido: {0}', 'Неизвестный тип загрузки: {0}', 'Tipo de envio desconhecido: {0}', 'Unbekannter Uploadtyp: {0}')
add('没有收到文件', 'No file received', 'ファイルが届いていません', 'Aucun fichier reçu', 'No se ha recibido ningún archivo',
  'Файл не получен', 'Nenhum arquivo recebido', 'Keine Datei empfangen')
add('仅支持 {0} 格式', 'Only {0} formats are supported', '{0}形式のみ対応しています', 'Seuls les formats {0} sont acceptés',
  'Solo se admiten los formatos {0}', 'Поддерживаются только форматы {0}', 'Somente os formatos {0} são aceitos', 'Nur die Formate {0} werden unterstützt')
add('文件过大（上限 20MB）', 'File too large (maximum 20 MB)', 'ファイルが大きすぎます（上限20MB）', 'Fichier trop volumineux (20 Mo maximum)',
  'Archivo demasiado grande (máximo 20 MB)', 'Файл слишком большой (максимум 20 МБ)', 'Arquivo muito grande (máximo de 20 MB)', 'Datei zu groß (maximal 20 MB)')
add('文件内容与扩展名不符', 'The file content does not match its extension', 'ファイルの内容と拡張子が一致しません',
  'Le contenu du fichier ne correspond pas à son extension', 'El contenido del archivo no coincide con su extensión',
  'Содержимое файла не соответствует расширению', 'O conteúdo do arquivo não corresponde à extensão', 'Dateiinhalt und Dateiendung stimmen nicht überein')
add('非法路径', 'Invalid path', '無効なパスです', 'Chemin invalide', 'Ruta no válida', 'Недопустимый путь', 'Caminho inválido', 'Ungültiger Pfad')
add('账号或密码错误', 'Incorrect account or password', 'アカウントまたはパスワードが正しくありません', 'Identifiant ou mot de passe incorrect',
  'Cuenta o contraseña incorrecta', 'Неверная учётная запись или пароль', 'Conta ou senha incorreta', 'Konto oder Passwort falsch')
add('账号或密码错误，已锁定 {0} 分钟', 'Incorrect account or password. Locked for {0} minutes',
  'アカウントまたはパスワードが正しくありません。{0}分間ロックされました', 'Identifiant ou mot de passe incorrect. Blocage de {0} minutes',
  'Cuenta o contraseña incorrecta. Bloqueo de {0} minutos', 'Неверная учётная запись или пароль. Блокировка на {0} мин.',
  'Conta ou senha incorreta. Bloqueio por {0} minutos', 'Konto oder Passwort falsch. Für {0} Minuten gesperrt')
add('账号或密码错误（再错 {0} 次将锁定 {1} 分钟）', 'Incorrect account or password ({0} more failed attempts will lock the account for {1} minutes)',
  'アカウントまたはパスワードが正しくありません（あと{0}回失敗すると{1}分間ロックされます）',
  'Identifiant ou mot de passe incorrect (blocage de {1} minutes après {0} autres échecs)',
  'Cuenta o contraseña incorrecta ({0} fallos más provocarán un bloqueo de {1} minutos)',
  'Неверная учётная запись или пароль (ещё {0} неудачных попыток приведут к блокировке на {1} мин.)',
  'Conta ou senha incorreta (mais {0} falhas causarão bloqueio por {1} minutos)',
  'Konto oder Passwort falsch (nach {0} weiteren Fehlversuchen erfolgt eine Sperre von {1} Minuten)')
add('账号已锁定，请联系管理员', 'Account locked. Contact an administrator', 'アカウントがロックされています。管理者に連絡してください',
  'Compte bloqué. Contactez un administrateur', 'Cuenta bloqueada. Contacte con un administrador', 'Учётная запись заблокирована. Обратитесь к администратору',
  'Conta bloqueada. Entre em contato com o administrador', 'Konto gesperrt. Bitte die Administration kontaktieren')
add('学生端账号未开通', 'Student portal access has not been enabled', '学生用アカウントが有効になっていません',
  "L’accès au portail élève n’est pas activé", 'El acceso al portal del estudiante no está activado',
  'Доступ к порталу учащегося не включён', 'O acesso ao portal do estudante não está ativado', 'Der Zugang zum Schülerportal ist nicht aktiviert')
add('新密码不能与原密码相同', 'The new password must differ from the current password', '新しいパスワードは現在のものと異なるものにしてください',
  'Le nouveau mot de passe doit être différent de l’ancien', 'La nueva contraseña debe ser distinta de la actual',
  'Новый пароль должен отличаться от текущего', 'A nova senha deve ser diferente da atual', 'Das neue Passwort muss sich vom bisherigen unterscheiden')
add('原密码错误', 'Incorrect current password', '現在のパスワードが正しくありません', 'Ancien mot de passe incorrect',
  'Contraseña actual incorrecta', 'Неверный текущий пароль', 'Senha atual incorreta', 'Bisheriges Passwort falsch')
add('没有上传站点 Logo 的权限', 'You do not have permission to upload the site logo', 'サイトロゴをアップロードする権限がありません',
  'Vous ne pouvez pas téléverser le logo du site', 'No tiene permiso para subir el logotipo del sitio', 'У вас нет прав на загрузку логотипа сайта',
  'Você não tem permissão para enviar o logotipo do site', 'Keine Berechtigung zum Hochladen des Website-Logos')

add('回收站仅在「全部客户」中可用', 'The recycle bin is only available under All Customers', 'ゴミ箱は「すべての顧客」でのみ利用できます',
  'La corbeille est accessible uniquement dans Tous les clients', 'La papelera solo está disponible en Todos los clientes',
  'Корзина доступна только в разделе «Все клиенты»', 'A lixeira só está disponível em Todos os clientes', 'Der Papierkorb ist nur unter Alle Kunden verfügbar')
add('无权查看该客户', 'You cannot view this customer', 'この顧客を閲覧する権限がありません', 'Vous ne pouvez pas consulter ce client',
  'No puede ver este cliente', 'У вас нет прав на просмотр клиента', 'Você não pode visualizar este cliente', 'Keine Berechtigung zum Anzeigen dieses Kunden')
add('只有拥有「全部客户」权限才能指定其他负责人', 'The All Customers permission is required to assign another owner',
  '別の担当者を指定するには「すべての顧客」の権限が必要です', 'Le droit Tous les clients est requis pour désigner un autre responsable',
  'Se requiere el permiso Todos los clientes para asignar otro responsable', 'Для назначения другого ответственного нужно право «Все клиенты»',
  'É necessária a permissão Todos os clientes para atribuir outro responsável', 'Für einen anderen Verantwortlichen ist das Recht Alle Kunden erforderlich')
add('只能在本校区新建客户', 'You can only create customers at your campus', '顧客は所属校舎でのみ登録できます',
  'Vous pouvez créer des clients uniquement sur votre site', 'Solo puede crear clientes en su sede', 'Можно создавать клиентов только в своём филиале',
  'Você só pode cadastrar clientes na sua unidade', 'Kunden können nur am eigenen Standort angelegt werden')
add('「已签约」只能通过学员报名自动设置', 'Signed status is set automatically through student enrollment',
  '「契約済み」は学生の入塾手続きにより自動設定されます', 'Le statut Signé est défini automatiquement lors de l’inscription',
  'El estado Contratado se establece automáticamente al inscribir al estudiante', 'Статус «Договор заключён» задаётся автоматически при зачислении',
  'O status Contratado é definido automaticamente pela matrícula', 'Der Status Vertrag abgeschlossen wird bei der Einschreibung automatisch gesetzt')
add('无权把客户转到其他校区', 'You cannot transfer customers to another campus', '顧客を他校舎に移す権限がありません',
  'Vous ne pouvez pas transférer les clients vers un autre site', 'No puede transferir clientes a otra sede', 'Нет прав на перевод клиентов в другой филиал',
  'Você não pode transferir clientes para outra unidade', 'Keine Berechtigung zum Übertragen von Kunden an andere Standorte')
add('已签约客户的状态不能手工修改', 'Signed customer status cannot be changed manually', '契約済みの顧客の状態は手動で変更できません',
  'Le statut d’un client ayant signé ne peut pas être modifié manuellement', 'El estado de un cliente contratado no se puede cambiar manualmente',
  'Статус клиента с договором нельзя менять вручную', 'O status de clientes contratados não pode ser alterado manualmente',
  'Der Status von Kunden mit Vertrag kann nicht manuell geändert werden')
add('该客户已转为学员，不能删除', 'This customer has become a student and cannot be deleted', 'この顧客は学生に移行済みのため削除できません',
  'Ce client est devenu élève et ne peut pas être supprimé', 'Este cliente ya es estudiante y no se puede eliminar',
  'Клиент уже стал учащимся и не может быть удалён', 'Este cliente já se tornou estudante e não pode ser excluído',
  'Dieser Kunde ist bereits Schüler und kann nicht gelöscht werden')
add('无权领取该客户', 'You cannot claim this customer', 'この顧客を担当として引き受ける権限がありません',
  'Vous ne pouvez pas prendre en charge ce client', 'No puede asignarse este cliente', 'Нет прав на принятие клиента',
  'Você não pode assumir este cliente', 'Keine Berechtigung zur Übernahme dieses Kunden')
add('该客户已被他人领取', 'This customer has already been claimed by someone else', 'この顧客は既に他の担当者が引き受けています',
  'Ce client est déjà pris en charge par une autre personne', 'Otra persona ya se ha asignado este cliente',
  'Клиент уже принят другим сотрудником', 'Este cliente já foi assumido por outra pessoa', 'Dieser Kunde wurde bereits von jemand anderem übernommen')
add('负责人不存在或已停用', 'The owner does not exist or is inactive', '担当者が存在しないか無効になっています',
  'Le responsable est introuvable ou inactif', 'El responsable no existe o está inactivo', 'Ответственный не существует или отключён',
  'O responsável não existe ou está inativo', 'Verantwortlicher nicht vorhanden oder deaktiviert')
add('只能删除自己的跟进记录', 'You can only delete your own follow-up records', '自分の対応履歴のみ削除できます',
  'Vous pouvez supprimer uniquement vos propres suivis', 'Solo puede eliminar sus propios seguimientos', 'Можно удалять только свои записи контактов',
  'Você só pode excluir seus próprios acompanhamentos', 'Sie können nur eigene Kontakteinträge löschen')
add('跟进记录超过 24 小时，不能删除', 'Follow-up records older than 24 hours cannot be deleted', '24時間を過ぎた対応履歴は削除できません',
  'Les suivis de plus de 24 heures ne peuvent pas être supprimés', 'No se pueden eliminar seguimientos de más de 24 horas',
  'Записи контактов старше 24 часов нельзя удалять', 'Acompanhamentos com mais de 24 horas não podem ser excluídos',
  'Kontakteinträge können nach 24 Stunden nicht mehr gelöscht werden')
add('今日工作最多 20000 字', "Today's work description is limited to 20,000 characters", '本日の業務内容は20000文字以内にしてください',
  'Le travail du jour est limité à 20 000 caractères', 'El trabajo de hoy admite hasta 20 000 caracteres',
  'Описание работы за сегодня ограничено 20 000 символами', 'O trabalho de hoje deve ter no máximo 20.000 caracteres',
  'Die heutige Arbeitsbeschreibung darf höchstens 20.000 Zeichen enthalten')
add('不能填写未来日期的日报', 'Daily reports cannot be dated in the future', '未来の日付の日報は作成できません',
  'Un rapport quotidien ne peut pas être daté dans le futur', 'No se pueden registrar informes diarios con fechas futuras',
  'Нельзя составить ежедневный отчёт на будущую дату', 'Não é possível registrar relatórios diários com datas futuras',
  'Tagesberichte können nicht für zukünftige Daten erstellt werden')
add('只能补写 30 天内的日报', 'Daily reports can only be backfilled within 30 days', '日報の遡及入力は過去30日以内に限ります',
  'Les rapports peuvent être complétés rétroactivement sur 30 jours seulement', 'Solo se pueden completar informes de los últimos 30 días',
  'Можно дополнять отчёты только за последние 30 дней', 'Só é possível preencher relatórios dos últimos 30 dias',
  'Tagesberichte können nur für die letzten 30 Tage nachgetragen werden')
add('无权查看其他校区的日报', 'You cannot view daily reports from other campuses', '他校舎の日報を閲覧する権限がありません',
  'Vous ne pouvez pas consulter les rapports des autres sites', 'No puede ver informes diarios de otras sedes',
  'Нет прав на просмотр отчётов других филиалов', 'Você não pode visualizar relatórios de outras unidades',
  'Keine Berechtigung zum Anzeigen von Tagesberichten anderer Standorte')
add('返点比例应在 0~100% 之间', 'The commission rate must be between 0 and 100%', '紹介手数料率は0〜100%で指定してください',
  'Le taux de commission doit être compris entre 0 et 100 %', 'La comisión debe estar entre el 0 y el 100 %',
  'Ставка комиссии должна быть от 0 до 100%', 'A comissão deve estar entre 0 e 100%', 'Der Provisionssatz muss zwischen 0 und 100 % liegen')
add('跟进时间不能晚于现在', 'The follow-up time cannot be in the future', '対応日時は現在より後に設定できません',
  'La date du suivi ne peut pas être dans le futur', 'La fecha del seguimiento no puede ser futura',
  'Время контакта не может быть в будущем', 'O acompanhamento não pode ter data futura', 'Der Kontaktzeitpunkt darf nicht in der Zukunft liegen')
add('开始日期不能晚于结束日期', 'The start date cannot be after the end date', '開始日は終了日以前にしてください',
  'La date de début ne peut pas être postérieure à la date de fin', 'La fecha de inicio no puede ser posterior a la de fin',
  'Дата начала не может быть позже даты окончания', 'A data inicial não pode ser posterior à final', 'Das Startdatum darf nicht nach dem Enddatum liegen')
add('统计区间不能超过一年', 'The reporting period cannot exceed one year', '集計期間は1年以内にしてください',
  'La période statistique ne peut pas dépasser un an', 'El período estadístico no puede superar un año',
  'Период статистики не может превышать один год', 'O período estatístico não pode exceder um ano', 'Der Auswertungszeitraum darf ein Jahr nicht überschreiten')
add('日期格式应为 YYYY-MM-DD', 'The date format must be YYYY-MM-DD', '日付はYYYY-MM-DD形式で入力してください',
  'La date doit être au format YYYY-MM-DD', 'La fecha debe tener el formato YYYY-MM-DD', 'Формат даты: YYYY-MM-DD',
  'A data deve estar no formato YYYY-MM-DD', 'Das Datumsformat muss YYYY-MM-DD sein')
add('只能修改自己名下的客户', 'You can only edit customers assigned to you', '自分が担当する顧客のみ編集できます',
  'Vous pouvez modifier uniquement les clients qui vous sont affectés', 'Solo puede editar los clientes que tiene asignados',
  'Можно изменять только закреплённых за вами клиентов', 'Você só pode editar clientes atribuídos a você', 'Sie können nur Ihnen zugewiesene Kunden bearbeiten')

function invalid(source: string, ...texts: Texts) {
  add(`${source}无效`, ...texts.map((text, i) => [
    `Invalid ${text}`, `${text}が無効です`, `${text} invalide`, `${text} no válido`,
    `Недопустимое значение: ${text}`, `${text} inválido`, `${text} ungültig`,
  ][i]!) as Texts)
}
invalid('缴费方式', 'payment method', '支払方法', 'Mode de paiement', 'Método de pago', 'способ оплаты', 'Método de pagamento', 'Zahlungsart')
invalid('缴费类别', 'payment category', '入金区分', 'Type de paiement', 'Tipo de pago', 'категория оплаты', 'Tipo de pagamento', 'Zahlungskategorie')
invalid('课程类型', 'course type', '講座種別', 'Type de cours', 'Tipo de curso', 'тип курса', 'Tipo de curso', 'Kurstyp')
invalid('优惠原因', 'discount reason', '割引理由', 'Motif de remise', 'Motivo del descuento', 'причина скидки', 'Motivo do desconto', 'Rabattgrund')
invalid('追加的单期课程', 'additional single-term course', '追加する単期講座', 'Cours supplémentaire', 'Curso adicional',
  'дополнительный разовый курс', 'Curso adicional', 'Zusätzlicher Einzelkurs')
invalid('退费方式', 'refund method', '返金方法', 'Mode de remboursement', 'Método de reembolso', 'способ возврата',
  'Método de reembolso', 'Erstattungsart')
invalid('状态', 'status', '状態', 'Statut', 'Estado', 'статус', 'Status', 'Status')
invalid('考试类型', 'exam type', '試験種別', "Type d’examen", 'Tipo de examen', 'тип экзамена', 'Tipo de exame', 'Prüfungstyp')

add('缴费金额须大于 0', 'The payment amount must be greater than 0', '入金額は0より大きくしてください',
  'Le paiement doit être supérieur à 0', 'El importe del pago debe ser mayor que 0', 'Сумма оплаты должна быть больше 0',
  'O valor do pagamento deve ser maior que 0', 'Der Zahlbetrag muss größer als 0 sein')
add('金额须为整数', 'The amount must be an integer', '金額は整数で入力してください', 'Le montant doit être un entier',
  'El importe debe ser un número entero', 'Сумма должна быть целым числом', 'O valor deve ser inteiro', 'Der Betrag muss eine ganze Zahl sein')
add('价格不能为负', 'The price cannot be negative', '価格は0以上にしてください', 'Le prix ne peut pas être négatif',
  'El precio no puede ser negativo', 'Цена не может быть отрицательной', 'O preço não pode ser negativo', 'Der Preis darf nicht negativ sein')
add('价格须为整数', 'The price must be an integer', '価格は整数で入力してください', 'Le prix doit être un entier',
  'El precio debe ser un número entero', 'Цена должна быть целым числом', 'O preço deve ser inteiro', 'Der Preis muss eine ganze Zahl sein')
add('套餐只能包含有效的单期课程', 'Packages may only contain active single-term courses', 'プランには有効な単期講座のみ含められます',
  'Les forfaits ne peuvent contenir que des cours unitaires actifs', 'Los paquetes solo pueden incluir cursos individuales activos',
  'Пакеты могут содержать только действующие разовые курсы', 'Pacotes só podem incluir cursos individuais ativos',
  'Pakete dürfen nur aktive Einzelkurse enthalten')
add('不能修改课程类型', 'The course type cannot be changed', '講座種別は変更できません', 'Le type de cours ne peut pas être modifié',
  'No se puede cambiar el tipo de curso', 'Тип курса нельзя изменить', 'Não é possível alterar o tipo de curso', 'Der Kurstyp kann nicht geändert werden')
add('无权操作该订单', 'You cannot modify this order', 'この申込を操作する権限がありません', 'Vous ne pouvez pas modifier cette commande',
  'No puede modificar este pedido', 'Нет прав на изменение заказа', 'Você não pode modificar este pedido', 'Keine Berechtigung zum Bearbeiten dieses Auftrags')
add('只能删除当天登记的缴费记录', 'Only payment records entered today can be deleted', '当日登録した入金記録のみ削除できます',
  'Seuls les paiements enregistrés aujourd’hui peuvent être supprimés', 'Solo se pueden eliminar pagos registrados hoy',
  'Можно удалять только оплаты, зарегистрированные сегодня', 'Só é possível excluir pagamentos registrados hoje',
  'Nur heute erfasste Zahlungen können gelöscht werden')
add('删除后已收金额将少于已退金额，无法删除', 'Deletion would leave receipts below refunds', '削除すると入金済額が返金済額を下回るため削除できません',
  'Suppression impossible : les encaissements seraient inférieurs aux remboursements',
  'No se puede eliminar: los cobros quedarían por debajo de los reembolsos', 'Удаление приведёт к превышению возвратов над оплатами',
  'Não é possível excluir: os recebimentos ficariam abaixo dos reembolsos', 'Löschen würde die Einnahmen unter die Erstattungen senken')
add('优惠金额不能为负', 'The discount cannot be negative', '割引額は0以上にしてください', 'La remise ne peut pas être négative',
  'El descuento no puede ser negativo', 'Скидка не может быть отрицательной', 'O desconto não pode ser negativo', 'Der Rabatt darf nicht negativ sein')
add('优惠金额须为整数', 'The discount must be an integer', '割引額は整数で入力してください', 'La remise doit être un entier',
  'El descuento debe ser un número entero', 'Скидка должна быть целым числом', 'O desconto deve ser inteiro', 'Der Rabatt muss eine ganze Zahl sein')
add('无权为该学员下单', 'You cannot place an order for this student', 'この学生の申込を登録する権限がありません',
  'Vous ne pouvez pas passer de commande pour cet élève', 'No puede crear pedidos para este estudiante', 'Нет прав на создание заказа для этого учащегося',
  'Você não pode criar pedidos para este estudante', 'Keine Berechtigung zum Anlegen eines Auftrags für diesen Schüler')
add('该套餐已停用', 'This package is inactive', 'このプランは無効になっています', 'Ce forfait est désactivé', 'Este paquete está inactivo',
  'Этот пакет отключён', 'Este pacote está inativo', 'Dieses Paket ist deaktiviert')
add('选择 VIP 时请填写 VIP 课时（大于 0）', 'For VIP, enter lesson hours greater than 0', '個別指導を選ぶ場合は0より大きい受講時間を入力してください',
  'Pour VIP, indiquez un nombre d’heures supérieur à 0', 'Para VIP, introduzca horas de clase mayores que 0',
  'Для VIP укажите количество часов больше 0', 'Para VIP, informe horas de aula maiores que 0', 'Für VIP bitte eine Stundenzahl größer als 0 eingeben')
add('选择 VIP 时请填写 VIP 课程内容', 'For VIP, enter the lesson content', '個別指導を選ぶ場合は授業内容を入力してください',
  'Pour VIP, indiquez le contenu du cours', 'Para VIP, introduzca el contenido de la clase', 'Для VIP укажите содержание занятий',
  'Para VIP, informe o conteúdo das aulas', 'Für VIP bitte den Unterrichtsinhalt eingeben')
add('有优惠金额时请选择优惠原因', 'Select a reason when applying a discount', '割引額を入力した場合は割引理由を選択してください',
  'Sélectionnez un motif pour toute remise', 'Seleccione un motivo al aplicar un descuento', 'При скидке выберите её причину',
  'Selecione um motivo ao aplicar um desconto', 'Bei einem Rabatt bitte einen Grund auswählen')
add('优惠金额不能超过应收金额', 'The discount cannot exceed the amount due', '割引額は請求額以下にしてください',
  'La remise ne peut pas dépasser le montant dû', 'El descuento no puede superar el importe pendiente', 'Скидка не может превышать сумму к оплате',
  'O desconto não pode exceder o valor devido', 'Der Rabatt darf den fälligen Betrag nicht überschreiten')
add('销售顾问工号不存在', 'Sales adviser staff ID not found', '営業担当者の職員番号が見つかりません', 'Matricule du conseiller commercial introuvable',
  'No se encuentra el número del asesor comercial', 'Табельный номер консультанта не найден', 'Matrícula do consultor comercial não encontrada',
  'Personalnummer der Vertriebsberatung nicht gefunden')
add('无权查看该订单', 'You cannot view this order', 'この申込を閲覧する権限がありません', 'Vous ne pouvez pas consulter cette commande',
  'No puede ver este pedido', 'Нет прав на просмотр заказа', 'Você não pode visualizar este pedido', 'Keine Berechtigung zum Anzeigen dieses Auftrags')
add('订单已作废', 'The order has been voided', 'この申込は無効化されています', 'La commande a été annulée', 'El pedido está anulado',
  'Заказ аннулирован', 'O pedido foi anulado', 'Der Auftrag wurde storniert')
add('订单已有缴费记录，不能作废（请走退费流程）', 'The order has payments and cannot be voided. Use the refund process',
  '入金記録があるため無効化できません。返金手続きを行ってください', 'La commande comporte des paiements. Utilisez la procédure de remboursement',
  'El pedido tiene pagos y no se puede anular. Use el proceso de reembolso', 'Заказ оплачен и не может быть аннулирован. Оформите возврат',
  'O pedido tem pagamentos e não pode ser anulado. Use o processo de reembolso', 'Der Auftrag enthält Zahlungen. Bitte das Erstattungsverfahren nutzen')
add('该订单的 VIP 课时已有排课，请先取消排课', 'VIP lessons for this order are scheduled. Cancel them first',
  'この申込の個別指導は時間割に登録済みです。先に授業を取り消してください', 'Des séances VIP sont planifiées. Annulez-les d’abord',
  'Hay sesiones VIP programadas para este pedido. Cancélelas primero', 'По заказу запланированы занятия VIP. Сначала отмените их',
  'Há aulas VIP agendadas neste pedido. Cancele-as primeiro', 'VIP-Termine für diesen Auftrag sind geplant. Bitte zuerst absagen')
add('订单已作废，不能登记缴费', 'Payments cannot be recorded for a voided order', '無効化された申込には入金を登録できません',
  'Aucun paiement ne peut être enregistré pour une commande annulée', 'No se pueden registrar pagos para un pedido anulado',
  'Нельзя регистрировать оплату аннулированного заказа', 'Não é possível registrar pagamentos em um pedido anulado',
  'Für einen stornierten Auftrag können keine Zahlungen erfasst werden')
add('退费金额须大于 0', 'The refund must be greater than 0', '返金額は0より大きくしてください', 'Le remboursement doit être supérieur à 0',
  'El reembolso debe ser mayor que 0', 'Сумма возврата должна быть больше 0', 'O reembolso deve ser maior que 0', 'Die Erstattung muss größer als 0 sein')
add('累计退费不能超过已收金额（最多还可退 {0}）', 'Total refunds cannot exceed receipts (remaining refundable amount: {0})',
  '返金総額は入金済額以下にしてください（返金可能な残額：{0}）', 'Les remboursements ne peuvent dépasser les encaissements (reste remboursable : {0})',
  'Los reembolsos no pueden superar los cobros (importe aún reembolsable: {0})', 'Возвраты не могут превышать оплаты (доступно к возврату: {0})',
  'Os reembolsos não podem exceder os recebimentos (saldo reembolsável: {0})', 'Erstattungen dürfen die Einnahmen nicht übersteigen (noch erstattbar: {0})')

add('无权查看其他校区的班课', 'You cannot view group classes at other campuses', '他校舎の集団授業クラスを閲覧する権限がありません',
  'Vous ne pouvez pas consulter les classes des autres sites', 'No puede ver clases grupales de otras sedes', 'Нет прав на просмотр групп других филиалов',
  'Você não pode visualizar turmas de outras unidades', 'Keine Berechtigung zum Anzeigen von Gruppenkursen anderer Standorte')
add('只能查看自己任课的班课', 'You can only view group classes you teach', '自分が担当する集団授業クラスのみ閲覧できます',
  'Vous pouvez consulter uniquement les classes où vous enseignez', 'Solo puede ver las clases grupales que imparte',
  'Можно просматривать только группы, в которых вы преподаёте', 'Você só pode visualizar turmas em que leciona',
  'Sie können nur Gruppenkurse anzeigen, die Sie unterrichten')
add('默认教室不属于所选校区', 'The default classroom is not at the selected campus', '既定の教室は選択した校舎に属していません',
  'La salle par défaut n’appartient pas au site choisi', 'El aula predeterminada no pertenece a la sede seleccionada',
  'Аудитория по умолчанию не относится к выбранному филиалу', 'A sala padrão não pertence à unidade selecionada',
  'Der Standardraum gehört nicht zum gewählten Standort')
add('该班还有 {0} 节未上的课次，请先取消后再删除', 'This class has {0} upcoming lessons. Cancel them before deleting',
  'このクラスには未実施の授業が{0}件あります。先に取り消してから削除してください', 'Cette classe a encore {0} séances à venir. Annulez-les avant de la supprimer',
  'Esta clase tiene {0} sesiones pendientes. Cancélelas antes de eliminarla', 'У группы осталось {0} предстоящих занятий. Отмените их перед удалением',
  'Esta turma tem {0} aulas pendentes. Cancele-as antes de excluir', 'Dieser Kurs hat noch {0} ausstehende Termine. Vor dem Löschen absagen')
add('班课不存在或未删除', 'The group class does not exist or is not deleted', '集団授業クラスが存在しないか削除されていません',
  'La classe est introuvable ou n’est pas supprimée', 'La clase grupal no existe o no está eliminada', 'Группа не существует или не удалена',
  'A turma não existe ou não foi excluída', 'Gruppenkurs nicht vorhanden oder nicht gelöscht')
add('该学员不在班级中', 'This student is not in the class', 'この学生はクラスに在籍していません', 'Cet élève n’est pas dans la classe',
  'Este estudiante no pertenece a la clase', 'Учащийся не состоит в группе', 'Este estudante não está na turma', 'Dieser Schüler ist nicht in der Klasse')
add('该课次已确认', 'This lesson is already confirmed', 'この授業は確認済みです', 'Cette séance est déjà confirmée', 'Esta sesión ya está confirmada',
  'Занятие уже подтверждено', 'Esta aula já foi confirmada', 'Dieser Unterrichtstermin ist bereits bestätigt')
add('该课次已取消', 'This lesson has been cancelled', 'この授業は取り消されています', 'Cette séance a été annulée', 'Esta sesión se ha cancelado',
  'Занятие отменено', 'Esta aula foi cancelada', 'Dieser Unterrichtstermin wurde abgesagt')
add('课程尚未开始，不能确认', 'The lesson has not started and cannot be confirmed', '授業開始前のため確認できません',
  'La séance n’a pas commencé et ne peut pas être confirmée', 'La sesión aún no ha comenzado y no se puede confirmar',
  'Занятие ещё не началось, подтверждение невозможно', 'A aula ainda não começou e não pode ser confirmada',
  'Der Unterricht hat noch nicht begonnen und kann nicht bestätigt werden')
add('课次状态已变化，请刷新', 'The lesson status has changed. Refresh the page', '授業の状態が変わりました。画面を更新してください',
  'Le statut de la séance a changé. Actualisez la page', 'El estado de la sesión ha cambiado. Actualice la página',
  'Статус занятия изменился. Обновите страницу', 'O status da aula mudou. Atualize a página',
  'Der Terminstatus hat sich geändert. Bitte die Seite aktualisieren')
add('单节课时不能超过 12h', 'A lesson cannot exceed 12 hours', '1回の授業は12時間以内にしてください',
  'Une séance ne peut pas dépasser 12 heures', 'Una sesión no puede superar las 12 horas', 'Занятие не может превышать 12 часов',
  'Uma aula não pode exceder 12 horas', 'Ein Unterrichtstermin darf 12 Stunden nicht überschreiten')
add('课时不能为负', 'Lesson hours cannot be negative', '授業時間は0以上にしてください', 'Les heures de cours ne peuvent pas être négatives',
  'Las horas de clase no pueden ser negativas', 'Часы занятий не могут быть отрицательными', 'As horas de aula não podem ser negativas',
  'Unterrichtsstunden dürfen nicht negativ sein')
add('该班课已结课，不能再排课', 'This group class has ended and cannot be scheduled', 'このクラスは終了しているため授業を追加できません',
  'Cette classe est terminée et ne peut plus être planifiée', 'Esta clase grupal ha finalizado y no admite más sesiones',
  'Группа завершила обучение, планирование занятий невозможно', 'Esta turma foi encerrada e não aceita novas aulas',
  'Dieser Gruppenkurs ist abgeschlossen. Weitere Termine können nicht geplant werden')
add('您不是该 VIP 学生的任课老师', 'You are not this VIP student’s assigned teacher', 'この個別指導の学生の担当講師ではありません',
  'Vous n’êtes pas l’enseignant attitré de cet élève VIP', 'No es el docente asignado a este estudiante VIP',
  'Вы не назначенный преподаватель этого учащегося VIP', 'Você não é o professor responsável por este estudante VIP',
  'Sie sind nicht die zuständige Lehrkraft dieses VIP-Schülers')
add('VIP 课时必须大于 0', 'VIP lesson hours must be greater than 0', '個別指導の授業時間は0より大きくしてください',
  'Les heures VIP doivent être supérieures à 0', 'Las horas VIP deben ser mayores que 0', 'Часы VIP должны быть больше 0',
  'As horas VIP devem ser maiores que 0', 'VIP-Stunden müssen größer als 0 sein')
add('教室不存在或已停用', 'The classroom does not exist or is inactive', '教室が存在しないか利用停止中です',
  'La salle est introuvable ou désactivée', 'El aula no existe o está inactiva', 'Аудитория не существует или отключена',
  'A sala não existe ou está inativa', 'Raum nicht vorhanden oder deaktiviert')
add('所选教室不属于该校区', 'The selected classroom is not at this campus', '選択した教室はこの校舎に属していません',
  'La salle choisie n’appartient pas à ce site', 'El aula seleccionada no pertenece a esta sede', 'Выбранная аудитория не относится к этому филиалу',
  'A sala selecionada não pertence a esta unidade', 'Der gewählte Raum gehört nicht zu diesem Standort')
add('教室「{0}」不可用于 VIP 课', 'Classroom “{0}” cannot be used for VIP lessons', '教室「{0}」は個別指導には利用できません',
  'La salle « {0} » ne peut pas accueillir de cours VIP', 'El aula «{0}» no admite clases VIP', 'Аудитория «{0}» недоступна для занятий VIP',
  'A sala “{0}” não pode ser usada para aulas VIP', 'Raum „{0}“ kann nicht für VIP-Unterricht genutzt werden')
add('教师只能为自己安排课次', 'Teachers can only schedule lessons for themselves', '講師は自分の授業のみ登録できます',
  'Les enseignants ne peuvent planifier que leurs propres séances', 'Los docentes solo pueden programar sus propias sesiones',
  'Преподаватели могут планировать занятия только для себя', 'Professores só podem agendar suas próprias aulas',
  'Lehrkräfte können nur eigene Unterrichtstermine planen')
add('开始日期格式应为 YYYY-MM-DD', 'The start date must use YYYY-MM-DD', '開始日はYYYY-MM-DD形式で入力してください',
  'La date de début doit être au format YYYY-MM-DD', 'La fecha de inicio debe tener el formato YYYY-MM-DD', 'Формат даты начала: YYYY-MM-DD',
  'A data inicial deve estar no formato YYYY-MM-DD', 'Das Startdatum muss das Format YYYY-MM-DD haben')
add('结束日期格式应为 YYYY-MM-DD', 'The end date must use YYYY-MM-DD', '終了日はYYYY-MM-DD形式で入力してください',
  'La date de fin doit être au format YYYY-MM-DD', 'La fecha de fin debe tener el formato YYYY-MM-DD', 'Формат даты окончания: YYYY-MM-DD',
  'A data final deve estar no formato YYYY-MM-DD', 'Das Enddatum muss das Format YYYY-MM-DD haben')
add('请至少选择一个星期', 'Select at least one weekday', '曜日を1つ以上選択してください', 'Sélectionnez au moins un jour de la semaine',
  'Seleccione al menos un día de la semana', 'Выберите хотя бы один день недели', 'Selecione pelo menos um dia da semana',
  'Bitte mindestens einen Wochentag auswählen')
add('开始时刻格式应为 HH:mm', 'The start time must use HH:mm', '開始時刻はHH:mm形式で入力してください',
  'L’heure de début doit être au format HH:mm', 'La hora de inicio debe tener el formato HH:mm', 'Формат времени начала: HH:mm',
  'O horário inicial deve estar no formato HH:mm', 'Die Startzeit muss das Format HH:mm haben')
add('结束时刻格式应为 HH:mm', 'The end time must use HH:mm', '終了時刻はHH:mm形式で入力してください',
  'L’heure de fin doit être au format HH:mm', 'La hora de fin debe tener el formato HH:mm', 'Формат времени окончания: HH:mm',
  'O horário final deve estar no formato HH:mm', 'Die Endzeit muss das Format HH:mm haben')
add('结束日期不能早于开始日期', 'The end date cannot be before the start date', '終了日は開始日以降にしてください',
  'La date de fin ne peut pas précéder la date de début', 'La fecha de fin no puede ser anterior a la de inicio',
  'Дата окончания не может быть раньше даты начала', 'A data final não pode ser anterior à inicial', 'Das Enddatum darf nicht vor dem Startdatum liegen')
add('结束时刻必须晚于开始时刻', 'The end time must be after the start time', '終了時刻は開始時刻より後にしてください',
  'L’heure de fin doit être postérieure à l’heure de début', 'La hora de fin debe ser posterior a la de inicio',
  'Время окончания должно быть позже времени начала', 'O horário final deve ser posterior ao inicial', 'Die Endzeit muss nach der Startzeit liegen')
add('所选日期区间内没有符合星期条件的日期', 'No dates in the selected range match the weekdays', '選択した期間に指定の曜日に該当する日がありません',
  'Aucune date de la période ne correspond aux jours choisis', 'No hay fechas en el intervalo que coincidan con los días seleccionados',
  'В выбранном периоде нет дат с указанными днями недели', 'Nenhuma data no período corresponde aos dias selecionados',
  'Im gewählten Zeitraum gibt es keine passenden Wochentage')
add('一次最多生成 {0} 节课次（当前 {1} 节），请缩短日期区间', 'At most {0} lessons can be generated at once (currently {1}). Shorten the date range',
  '一度に作成できる授業は{0}件までです（現在{1}件）。期間を短くしてください',
  'Limite de {0} séances par génération ({1} actuellement). Réduisez la période',
  'Se pueden generar hasta {0} sesiones a la vez (actualmente {1}). Reduzca el intervalo',
  'Можно создать не более {0} занятий за раз (сейчас {1}). Сократите период',
  'É possível gerar até {0} aulas por vez (atualmente {1}). Reduza o período',
  'Maximal {0} Termine auf einmal (aktuell {1}). Bitte den Zeitraum verkürzen')
add('请提供开始日期 from', 'Provide the start date (from)', '開始日（from）を指定してください', 'Indiquez la date de début (from)',
  'Indique la fecha de inicio (from)', 'Укажите дату начала (from)', 'Informe a data inicial (from)', 'Bitte das Startdatum (from) angeben')
add('请提供结束日期 to', 'Provide the end date (to)', '終了日（to）を指定してください', 'Indiquez la date de fin (to)',
  'Indique la fecha de fin (to)', 'Укажите дату окончания (to)', 'Informe a data final (to)', 'Bitte das Enddatum (to) angeben')
add('结束日期必须晚于开始日期', 'The end date must be after the start date', '終了日は開始日より後にしてください',
  'La date de fin doit être postérieure à la date de début', 'La fecha de fin debe ser posterior a la de inicio',
  'Дата окончания должна быть позже даты начала', 'A data final deve ser posterior à inicial', 'Das Enddatum muss nach dem Startdatum liegen')
add('查询跨度不能超过 62 天', 'The query range cannot exceed 62 days', '検索期間は62日以内にしてください',
  'La période de recherche ne peut pas dépasser 62 jours', 'El intervalo de consulta no puede superar 62 días',
  'Период запроса не может превышать 62 дня', 'O período de consulta não pode exceder 62 dias', 'Der Abfragezeitraum darf 62 Tage nicht überschreiten')
add('时间冲突', 'Scheduling conflict', '時間が重複しています', 'Conflit horaire', 'Conflicto de horario', 'Конфликт времени', 'Conflito de horário', 'Zeitkonflikt')
add('有 {0} 个日期存在时间冲突', 'Scheduling conflicts on {0} dates', '{0}件の日付で時間が重複しています', 'Conflits horaires sur {0} dates',
  'Conflictos de horario en {0} fechas', 'Конфликты времени на {0} датах', 'Conflitos de horário em {0} datas', 'Zeitkonflikte an {0} Tagen')
add('全部日期都有冲突，没有可创建的课次', 'All dates have conflicts; no lessons can be created', 'すべての日付で時間が重複しているため授業を作成できません',
  'Toutes les dates présentent des conflits ; aucune séance ne peut être créée', 'Todas las fechas tienen conflictos; no se pueden crear sesiones',
  'Конфликты на всех датах; создать занятия невозможно', 'Todas as datas têm conflitos; não é possível criar aulas',
  'Alle Daten haben Konflikte; es können keine Termine angelegt werden')
add('标题不能为空', 'The title cannot be empty', '件名を入力してください', 'Le titre ne peut pas être vide', 'El título no puede estar vacío',
  'Заголовок не может быть пустым', 'O título não pode estar vazio', 'Der Titel darf nicht leer sein')
add('教师只能把课次安排给自己', 'Teachers can only assign lessons to themselves', '講師は自分を担当とする授業のみ登録できます',
  'Les enseignants ne peuvent affecter les séances qu’à eux-mêmes', 'Los docentes solo pueden asignarse sesiones a sí mismos',
  'Преподаватели могут назначать занятия только себе', 'Professores só podem atribuir aulas a si mesmos',
  'Lehrkräfte können Unterrichtstermine nur sich selbst zuweisen')
add('只能修改自己的课次', 'You can only edit your own lessons', '自分の授業のみ編集できます', 'Vous pouvez modifier uniquement vos séances',
  'Solo puede editar sus propias sesiones', 'Можно изменять только свои занятия', 'Você só pode editar suas próprias aulas',
  'Sie können nur eigene Termine bearbeiten')
add('已取消的课次不能修改', 'Cancelled lessons cannot be edited', '取り消された授業は編集できません', 'Les séances annulées ne peuvent pas être modifiées',
  'No se pueden editar sesiones canceladas', 'Отменённые занятия нельзя изменять', 'Aulas canceladas não podem ser editadas',
  'Abgesagte Termine können nicht bearbeitet werden')
add('已确认的课次只能修改备注', 'Only notes can be edited for confirmed lessons', '確認済みの授業は備考のみ編集できます',
  'Seules les notes des séances confirmées peuvent être modifiées', 'Solo se pueden editar las notas de sesiones confirmadas',
  'У подтверждённых занятий можно менять только примечания', 'Só é possível editar observações de aulas confirmadas',
  'Bei bestätigten Terminen können nur Anmerkungen bearbeitet werden')
add('修改已确认 VIP 课次的课时需要「删除已确认的 VIP 课次」权限',
  'Editing hours of confirmed VIP lessons requires the Delete confirmed VIP lessons permission',
  '確認済みの個別指導の時間変更には「確認済みの個別指導を削除」の権限が必要です',
  'Modifier les heures VIP confirmées nécessite le droit Supprimer les séances VIP confirmées',
  'Editar horas VIP confirmadas requiere el permiso Eliminar sesiones VIP confirmadas',
  'Для изменения часов подтверждённых занятий VIP нужно право удаления подтверждённых занятий VIP',
  'Editar horas VIP confirmadas exige a permissão Excluir aulas VIP confirmadas',
  'Zum Ändern bestätigter VIP-Stunden ist das Recht Bestätigte VIP-Termine löschen erforderlich')
add('批量修改只能修改时刻，不能修改日期（请选择「仅本次」）', 'Bulk editing can only change times. To change the date, select This lesson only',
  '一括編集では時刻のみ変更できます。日付を変える場合は「今回のみ」を選択してください',
  'La modification groupée porte uniquement sur les heures. Pour la date, choisissez Cette séance uniquement',
  'La edición en lote solo cambia horas. Para cambiar la fecha, seleccione Solo esta sesión',
  'Массово можно менять только время. Для даты выберите «Только это занятие»',
  'A edição em lote só altera horários. Para alterar a data, selecione Somente esta aula',
  'Bei Sammeländerungen sind nur Uhrzeiten änderbar. Für das Datum bitte Nur diesen Termin wählen')
add('有 {0} 节课次存在时间冲突', '{0} lessons have scheduling conflicts', '{0}件の授業で時間が重複しています',
  '{0} séances présentent un conflit horaire', '{0} sesiones tienen conflictos de horario', 'У {0} занятий есть конфликты времени',
  '{0} aulas têm conflitos de horário', '{0} Unterrichtstermine haben Zeitkonflikte')
add('只能取消自己的课次', 'You can only cancel your own lessons', '自分の授業のみ取り消せます', 'Vous pouvez annuler uniquement vos séances',
  'Solo puede cancelar sus propias sesiones', 'Можно отменять только свои занятия', 'Você só pode cancelar suas próprias aulas',
  'Sie können nur eigene Termine absagen')
add('删除已确认的 VIP 课次需要相应权限', 'Deleting confirmed VIP lessons requires the relevant permission',
  '確認済みの個別指導を削除するには対応する権限が必要です', 'La suppression de séances VIP confirmées nécessite le droit correspondant',
  'Eliminar sesiones VIP confirmadas requiere el permiso correspondiente', 'Для удаления подтверждённых занятий VIP нужны соответствующие права',
  'Excluir aulas VIP confirmadas exige a permissão correspondente', 'Zum Löschen bestätigter VIP-Termine ist die entsprechende Berechtigung erforderlich')
add('取消已确认的课次需要教务权限', 'Cancelling confirmed lessons requires academic administration permission',
  '確認済みの授業を取り消すには教務権限が必要です', 'L’annulation de séances confirmées nécessite les droits de gestion pédagogique',
  'Cancelar sesiones confirmadas requiere permisos de gestión académica', 'Для отмены подтверждённых занятий нужны права учебной администрации',
  'Cancelar aulas confirmadas exige permissão de gestão acadêmica',
  'Zum Absagen bestätigter Termine ist die Berechtigung der Unterrichtsverwaltung erforderlich')
add('课次状态已变化，请刷新后重试', 'The lesson status has changed. Refresh and try again', '授業の状態が変わりました。画面を更新して再度お試しください',
  'Le statut de la séance a changé. Actualisez puis réessayez', 'El estado de la sesión ha cambiado. Actualice y vuelva a intentarlo',
  'Статус занятия изменился. Обновите страницу и повторите', 'O status da aula mudou. Atualize e tente novamente',
  'Der Terminstatus hat sich geändert. Bitte aktualisieren und erneut versuchen')
add('只能确认自己的课次', 'You can only confirm your own lessons', '自分の授業のみ確認できます', 'Vous pouvez confirmer uniquement vos séances',
  'Solo puede confirmar sus propias sesiones', 'Можно подтверждать только свои занятия', 'Você só pode confirmar suas próprias aulas',
  'Sie können nur eigene Termine bestätigen')
add('已取消的课次不能确认', 'Cancelled lessons cannot be confirmed', '取り消された授業は確認できません', 'Les séances annulées ne peuvent pas être confirmées',
  'No se pueden confirmar sesiones canceladas', 'Отменённые занятия нельзя подтвердить', 'Aulas canceladas não podem ser confirmadas',
  'Abgesagte Termine können nicht bestätigt werden')
add('只能填写自己课次的课堂记录', 'You can only enter records for your own lessons', '自分の授業の授業記録のみ入力できます',
  'Vous pouvez saisir des comptes rendus uniquement pour vos séances', 'Solo puede registrar notas de sus propias sesiones',
  'Можно заполнять записи только для своих занятий', 'Você só pode registrar anotações das suas próprias aulas',
  'Sie können nur für eigene Termine Unterrichtsberichte erfassen')
add('已取消的课次不能填写课堂记录', 'Records cannot be entered for cancelled lessons', '取り消された授業には授業記録を入力できません',
  'Aucun compte rendu ne peut être saisi pour une séance annulée', 'No se pueden registrar notas para sesiones canceladas',
  'Для отменённых занятий нельзя заполнять записи', 'Não é possível registrar anotações de aulas canceladas',
  'Für abgesagte Termine können keine Unterrichtsberichte erfasst werden')
add('总课时必须大于 0', 'Total hours must be greater than 0', '総受講時間は0より大きくしてください', 'Le total d’heures doit être supérieur à 0',
  'El total de horas debe ser mayor que 0', 'Общее число часов должно быть больше 0', 'O total de horas deve ser maior que 0',
  'Die Gesamtstunden müssen größer als 0 sein')
add('请至少选择一位任课老师', 'Select at least one assigned teacher', '担当講師を1名以上選択してください', 'Sélectionnez au moins un enseignant',
  'Seleccione al menos un docente', 'Выберите хотя бы одного преподавателя', 'Selecione pelo menos um professor', 'Bitte mindestens eine Lehrkraft auswählen')
add('订单不属于该学员', 'The order does not belong to this student', 'この申込は対象の学生のものではありません',
  'La commande n’appartient pas à cet élève', 'El pedido no pertenece a este estudiante', 'Заказ не принадлежит этому учащемуся',
  'O pedido não pertence a este estudante', 'Der Auftrag gehört nicht zu diesem Schüler')
add('总课时不能小于已确认 + 待确认（{0}h）', 'Total hours cannot be less than confirmed plus pending hours ({0}h)',
  '総受講時間は確認済みと確認待ちの合計（{0}時間）以上にしてください', 'Le total ne peut être inférieur aux heures confirmées et en attente ({0}h)',
  'El total no puede ser menor que las horas confirmadas y pendientes ({0}h)', 'Общее число часов не может быть меньше подтверждённых и ожидающих ({0}ч)',
  'O total não pode ser menor que as horas confirmadas e pendentes ({0}h)',
  'Gesamtstunden dürfen bestätigte und ausstehende Stunden ({0}h) nicht unterschreiten')
add('该课时包还有 {0} 节未取消的课次，不能删除', 'This package has {0} uncancelled lessons and cannot be deleted',
  'このパックには未取消の授業が{0}件あるため削除できません', 'Ce forfait contient {0} séances non annulées et ne peut pas être supprimé',
  'Este paquete tiene {0} sesiones sin cancelar y no se puede eliminar', 'В пакете {0} неотменённых занятий, удаление невозможно',
  'Este pacote tem {0} aulas não canceladas e não pode ser excluído', 'Dieses Paket enthält {0} nicht abgesagte Termine und kann nicht gelöscht werden')
add('课时包不存在或未删除', 'The lesson package does not exist or is not deleted', '受講時間パックが存在しないか削除されていません',
  'Le forfait est introuvable ou n’est pas supprimé', 'El paquete no existe o no está eliminado', 'Пакет не существует или не удалён',
  'O pacote não existe ou não foi excluído', 'Stundenpaket nicht vorhanden oder nicht gelöscht')
add('课时账本异常（待确认 / 已确认出现负数），操作已回滚', 'Invalid hours ledger (negative pending or confirmed hours). Operation rolled back',
  '時間台帳に異常があります（確認待ち・確認済みが負の値）。操作を取り消しました',
  'Registre d’heures incohérent (heures en attente ou confirmées négatives). Opération annulée',
  'Registro de horas incoherente (horas pendientes o confirmadas negativas). Operación revertida',
  'Ошибка учёта часов (отрицательные ожидающие или подтверждённые часы). Операция отменена',
  'Registro de horas inconsistente (horas pendentes ou confirmadas negativas). Operação revertida',
  'Fehler im Stundenkonto (negative ausstehende oder bestätigte Stunden). Vorgang rückgängig gemacht')
add('剩余课时不足（{0}），操作已回滚', 'Insufficient remaining hours ({0}). Operation rolled back',
  '残り時間が不足しています（{0}）。操作を取り消しました', 'Solde d’heures insuffisant ({0}). Opération annulée',
  'Horas restantes insuficientes ({0}). Operación revertida', 'Недостаточно оставшихся часов ({0}). Операция отменена',
  'Horas restantes insuficientes ({0}). Operação revertida', 'Nicht genügend Reststunden ({0}). Vorgang rückgängig gemacht')
add('剩余课时不足：「{0}」剩余 {1}h，本次需要 {2}h', 'Insufficient hours: “{0}” has {1}h remaining; {2}h required',
  '残り時間が不足しています。「{0}」の残りは{1}時間、今回必要な時間は{2}時間です',
  'Heures insuffisantes : « {0} » dispose de {1}h ; {2}h nécessaires', 'Horas insuficientes: «{0}» tiene {1}h; se necesitan {2}h',
  'Недостаточно часов: у «{0}» осталось {1}ч, требуется {2}ч', 'Horas insuficientes: “{0}” tem {1}h; são necessárias {2}h',
  'Nicht genügend Stunden: „{0}“ hat noch {1}h; benötigt werden {2}h')
add('该 VIP 课时包已结业，不能再约课', 'This VIP package is completed; no further lessons can be booked',
  'この個別指導パックは受講終了のため新たに予約できません', 'Ce forfait VIP est terminé ; aucune nouvelle séance ne peut être réservée',
  'Este paquete VIP ha finalizado y no admite más reservas', 'Обучение по пакету VIP завершено, запись невозможна',
  'Este pacote VIP foi concluído e não aceita novas reservas', 'Dieses VIP-Paket ist abgeschlossen. Weitere Buchungen sind nicht möglich')
add('时间格式错误', 'Invalid time format', '時刻の形式が正しくありません', 'Format d’heure invalide', 'Formato de hora no válido',
  'Неверный формат времени', 'Formato de horário inválido', 'Ungültiges Zeitformat')
add('结束时间必须晚于开始时间', 'The end time must be after the start time', '終了日時は開始日時より後にしてください',
  'La fin doit être postérieure au début', 'La hora de fin debe ser posterior a la de inicio', 'Время окончания должно быть позже начала',
  'O horário final deve ser posterior ao inicial', 'Die Endzeit muss nach der Startzeit liegen')
add('单节课次不能超过 12 小时', 'A single lesson cannot exceed 12 hours', '1回の授業は12時間以内にしてください',
  'Une séance ne peut pas dépasser 12 heures', 'Una sesión no puede superar las 12 horas', 'Одно занятие не может превышать 12 часов',
  'Uma aula não pode exceder 12 horas', 'Ein Unterrichtstermin darf 12 Stunden nicht überschreiten')

add('只能管理本人任课班级的名单', 'You can only manage rosters of classes you teach', '自分が担当するクラスの名簿のみ管理できます',
  'Vous pouvez gérer uniquement les listes des classes où vous enseignez', 'Solo puede gestionar listas de las clases que imparte',
  'Можно управлять списками только своих групп', 'Você só pode gerenciar listas das turmas em que leciona',
  'Sie können nur Teilnehmerlisten eigener Klassen verwalten')
add('课次不存在或无权查看', 'The lesson does not exist or you cannot view it', '授業が存在しないか閲覧権限がありません',
  'La séance est introuvable ou inaccessible', 'La sesión no existe o no tiene permiso para verla', 'Занятие не существует или нет прав на просмотр',
  'A aula não existe ou você não pode visualizá-la', 'Termin nicht vorhanden oder keine Anzeigeberechtigung')
add('没有要保存的记录', 'There are no records to save', '保存する記録がありません', 'Aucun enregistrement à sauvegarder', 'No hay registros para guardar',
  'Нет записей для сохранения', 'Não há registros para salvar', 'Keine Einträge zum Speichern vorhanden')
add('课次不存在或无权操作', 'The lesson does not exist or you cannot modify it', '授業が存在しないか操作権限がありません',
  'La séance est introuvable ou vous ne pouvez pas la modifier', 'La sesión no existe o no tiene permiso para modificarla',
  'Занятие не существует или нет прав на изменение', 'A aula não existe ou você não pode modificá-la',
  'Termin nicht vorhanden oder keine Bearbeitungsberechtigung')
add('该课次已取消，不能点名', 'Attendance cannot be taken for a cancelled lesson', '取り消された授業では出欠を登録できません',
  'L’appel est impossible pour une séance annulée', 'No se puede pasar lista en una sesión cancelada', 'Нельзя отмечать посещаемость отменённого занятия',
  'Não é possível registrar presença em uma aula cancelada', 'Bei abgesagten Terminen kann keine Anwesenheit erfasst werden')
add('存在不属于该班级的学生，请先把学生加入班级名单', 'Some students are not in this class. Add them to the roster first',
  'クラスに所属していない学生がいます。先に名簿に追加してください', 'Certains élèves ne sont pas dans cette classe. Ajoutez-les d’abord à la liste',
  'Hay estudiantes que no pertenecen a la clase. Añádalos primero a la lista', 'Некоторые учащиеся не состоят в группе. Сначала добавьте их в список',
  'Alguns estudantes não estão nesta turma. Adicione-os primeiro à lista',
  'Einige Schüler gehören nicht zur Klasse. Bitte zuerst zur Teilnehmerliste hinzufügen')
add('同名学员多于 1 人，请改用学号', 'Multiple students have this name. Use a student ID', '同姓同名の学生が複数います。学生番号で指定してください',
  'Plusieurs élèves portent ce nom. Utilisez le numéro d’élève', 'Hay varios estudiantes con este nombre. Use el número de estudiante',
  'Найдено несколько учащихся с таким именем. Используйте номер учащегося', 'Há vários estudantes com este nome. Use a matrícula',
  'Mehrere Schüler haben diesen Namen. Bitte die Schülernummer verwenden')
add('未找到该学号 / 姓名', 'Student ID or name not found', '該当する学生番号・氏名が見つかりません', 'Numéro ou nom d’élève introuvable',
  'No se encuentra el número o nombre del estudiante', 'Номер или имя учащегося не найдены', 'Matrícula ou nome do estudante não encontrado',
  'Schülernummer oder Name nicht gefunden')
add('该学生不在班级名单中', 'This student is not on the class roster', 'この学生はクラス名簿に登録されていません',
  'Cet élève ne figure pas sur la liste de la classe', 'Este estudiante no figura en la lista de la clase', 'Учащийся отсутствует в списке группы',
  'Este estudante não está na lista da turma', 'Dieser Schüler steht nicht auf der Teilnehmerliste')
add('仅文书管理员可查看回收站', 'Only document administrators can view the recycle bin', '書類管理者のみゴミ箱を閲覧できます',
  'Seuls les responsables des documents peuvent consulter la corbeille', 'Solo los administradores de documentos pueden ver la papelera',
  'Корзина доступна только администраторам документов', 'Somente administradores de documentos podem visualizar a lixeira',
  'Nur die Dokumentenverwaltung kann den Papierkorb anzeigen')
add('该申请已返还，不能再分配', 'This request has been returned and cannot be reassigned', 'この申請は返却済みのため再割当できません',
  'Cette demande a été rendue et ne peut plus être affectée', 'Esta solicitud ya se ha devuelto y no se puede reasignar',
  'Заявка возвращена и не может быть переназначена', 'Esta solicitação foi devolvida e não pode ser reatribuída',
  'Dieser Antrag wurde zurückgegeben und kann nicht neu zugewiesen werden')
add('只能返还分配给自己的文书', 'You can only return documents assigned to you', '自分に割り当てられた書類のみ返却できます',
  'Vous pouvez rendre uniquement les documents qui vous sont affectés', 'Solo puede devolver documentos que tenga asignados',
  'Можно возвращать только назначенные вам документы', 'Você só pode devolver documentos atribuídos a você',
  'Sie können nur Ihnen zugewiesene Dokumente zurückgeben')
add('该申请已返还', 'This request has already been returned', 'この申請は返却済みです', 'Cette demande a déjà été rendue',
  'Esta solicitud ya se ha devuelto', 'Заявка уже возвращена', 'Esta solicitação já foi devolvida', 'Dieser Antrag wurde bereits zurückgegeben')
add('请上传修改后的文件或填写修改意见', 'Upload the revised file or enter revision comments', '添削済みファイルをアップロードするか修正コメントを入力してください',
  'Téléversez le fichier corrigé ou saisissez vos commentaires', 'Suba el archivo corregido o introduzca comentarios de revisión',
  'Загрузите исправленный файл или укажите замечания', 'Envie o arquivo revisado ou informe comentários de revisão',
  'Bitte die korrigierte Datei hochladen oder Korrekturhinweise eingeben')
add('回收站中没有该记录', 'This record is not in the recycle bin', 'この記録はゴミ箱にありません', 'Cet enregistrement n’est pas dans la corbeille',
  'Este registro no está en la papelera', 'Этой записи нет в корзине', 'Este registro não está na lixeira', 'Dieser Eintrag ist nicht im Papierkorb')
add('时间格式应为 HH:mm', 'The time format must be HH:mm', '時刻はHH:mm形式で入力してください', 'L’heure doit être au format HH:mm',
  'La hora debe tener el formato HH:mm', 'Формат времени: HH:mm', 'O horário deve estar no formato HH:mm', 'Das Zeitformat muss HH:mm sein')
add('请至少添加一个时间段', 'Add at least one time slot', '予約枠を1つ以上追加してください', 'Ajoutez au moins un créneau',
  'Añada al menos una franja horaria', 'Добавьте хотя бы один временной интервал', 'Adicione pelo menos um horário',
  'Bitte mindestens ein Zeitfenster hinzufügen')
add('无权操作其他校区的时间段', 'You cannot modify time slots at other campuses', '他校舎の予約枠を操作する権限がありません',
  'Vous ne pouvez pas modifier les créneaux des autres sites', 'No puede modificar franjas de otras sedes', 'Нет прав на изменение интервалов других филиалов',
  'Você não pode modificar horários de outras unidades', 'Keine Berechtigung zum Bearbeiten von Zeitfenstern anderer Standorte')
add('无权操作其他校区的学员', 'You cannot modify students at other campuses', '他校舎の学生を操作する権限がありません',
  'Vous ne pouvez pas modifier les élèves des autres sites', 'No puede modificar estudiantes de otras sedes', 'Нет прав на изменение учащихся других филиалов',
  'Você não pode modificar estudantes de outras unidades', 'Keine Berechtigung zum Bearbeiten von Schülern anderer Standorte')
add('老师不存在或已停用', 'The teacher does not exist or is inactive', '講師が存在しないか無効になっています',
  'L’enseignant est introuvable ou inactif', 'El docente no existe o está inactivo', 'Преподаватель не существует или отключён',
  'O professor não existe ou está inativo', 'Lehrkraft nicht vorhanden oder deaktiviert')
add('只能指定本校区的老师', 'You can only assign teachers at your campus', '所属校舎の講師のみ指定できます',
  'Vous pouvez désigner uniquement des enseignants de votre site', 'Solo puede asignar docentes de su sede',
  'Можно назначать только преподавателей своего филиала',
  'Você só pode atribuir professores da sua unidade', 'Sie können nur Lehrkräfte des eigenen Standorts zuweisen')
add('只能在本校区发布时间段', 'You can only publish time slots at your campus', '所属校舎の予約枠のみ公開できます',
  'Vous pouvez publier des créneaux uniquement sur votre site', 'Solo puede publicar franjas en su sede', 'Можно публиковать интервалы только своего филиала',
  'Você só pode publicar horários na sua unidade', 'Sie können nur Zeitfenster am eigenen Standort veröffentlichen')
add('日期区间不能超过一年', 'The date range cannot exceed one year', '日付の範囲は1年以内にしてください',
  'La période ne peut pas dépasser un an', 'El intervalo de fechas no puede superar un año', 'Диапазон дат не может превышать один год',
  'O período não pode exceder um ano', 'Der Datumsbereich darf ein Jahr nicht überschreiten')
add('时间段 {0}-{1} 结束时间必须晚于开始时间', 'Time slot {0}-{1}: the end must be after the start',
  '予約枠{0}-{1}：終了時刻は開始時刻より後にしてください', 'Créneau {0}-{1} : la fin doit être postérieure au début',
  'Franja {0}-{1}: el fin debe ser posterior al inicio', 'Интервал {0}-{1}: окончание должно быть позже начала',
  'Horário {0}-{1}: o fim deve ser posterior ao início', 'Zeitfenster {0}-{1}: Das Ende muss nach dem Beginn liegen')
add('一次最多生成 1000 个时间段', 'At most 1,000 time slots can be generated at once', '一度に作成できる予約枠は1000件までです',
  'Limite de 1 000 créneaux par génération', 'Se pueden generar hasta 1000 franjas a la vez', 'Можно создать не более 1000 интервалов за раз',
  'É possível gerar até 1.000 horários por vez', 'Es können höchstens 1.000 Zeitfenster auf einmal erstellt werden')
add('所选日期范围内没有符合条件的日期', 'No dates in the selected range meet the criteria', '選択した期間に条件に合う日付がありません',
  'Aucune date de la période ne remplit les critères', 'No hay fechas que cumplan los criterios en el intervalo',
  'В выбранном периоде нет подходящих дат', 'Nenhuma data no período atende aos critérios', 'Im gewählten Zeitraum gibt es keine passenden Daten')
add('时间已过', 'The time has passed', '時刻が過ぎています', 'L’heure est passée', 'La hora ya ha pasado', 'Время уже прошло',
  'O horário já passou', 'Der Zeitpunkt liegt in der Vergangenheit')
add('与该老师已有时间段重叠', 'Overlaps with an existing time slot for this teacher', 'この講師の既存の予約枠と重複しています',
  'Chevauche un créneau existant de cet enseignant', 'Se solapa con una franja existente de este docente', 'Пересекается с интервалом этого преподавателя',
  'Sobrepõe um horário existente deste professor', 'Überschneidung mit einem bestehenden Zeitfenster dieser Lehrkraft')
add('没有可生成的时间段（全部重叠或已过期）', 'No time slots can be generated (all overlap or have expired)',
  '作成できる予約枠がありません（すべて重複または期限切れです）', 'Aucun créneau disponible (tous se chevauchent ou sont passés)',
  'No se pueden generar franjas (todas se solapan o han vencido)', 'Нет доступных интервалов (все пересекаются или истекли)',
  'Nenhum horário pode ser gerado (todos se sobrepõem ou expiraram)', 'Keine Zeitfenster erstellbar (alle überschneiden sich oder sind abgelaufen)')
add('该时间段已有面谈记录，不能删除', 'This time slot has a consultation record and cannot be deleted',
  'この予約枠には面談記録があるため削除できません', 'Ce créneau comporte un compte rendu d’entretien et ne peut pas être supprimé',
  'Esta franja tiene un registro de entrevista y no se puede eliminar', 'У интервала есть запись консультации, удаление невозможно',
  'Este horário tem um registro de orientação e não pode ser excluído', 'Dieses Zeitfenster hat einen Beratungsbericht und kann nicht gelöscht werden')
add('该时间段已被预约或不可用', 'This time slot is booked or unavailable', 'この予約枠は予約済みまたは利用できません',
  'Ce créneau est réservé ou indisponible', 'Esta franja está reservada o no disponible', 'Интервал занят или недоступен',
  'Este horário está reservado ou indisponível', 'Dieses Zeitfenster ist gebucht oder nicht verfügbar')
add('该时间段当前没有预约', 'This time slot currently has no booking', 'この予約枠には現在予約がありません',
  'Ce créneau n’a actuellement aucune réservation', 'Esta franja no tiene ninguna reserva actualmente', 'В этом интервале сейчас нет записи',
  'Este horário não tem reserva no momento', 'Dieses Zeitfenster hat derzeit keine Buchung')
add('已有面谈记录，不能取消预约', 'A consultation record exists; the booking cannot be cancelled', '面談記録があるため予約を取り消せません',
  'Un compte rendu d’entretien existe ; la réservation ne peut pas être annulée', 'Existe un registro de entrevista; no se puede cancelar la reserva',
  'Есть запись консультации, отмена бронирования невозможна', 'Há um registro de orientação; a reserva não pode ser cancelada',
  'Ein Beratungsbericht ist vorhanden; die Buchung kann nicht storniert werden')
add('该时间段已有记录，请直接编辑', 'This time slot already has a record. Edit it directly', 'この予約枠には既に記録があります。既存の記録を編集してください',
  'Ce créneau a déjà un compte rendu. Modifiez-le directement', 'Esta franja ya tiene un registro. Edítelo directamente',
  'У интервала уже есть запись. Отредактируйте её', 'Este horário já tem um registro. Edite-o diretamente',
  'Dieses Zeitfenster hat bereits einen Eintrag. Bitte direkt bearbeiten')
add('该时间段尚无学生预约', 'No student has booked this time slot yet', 'この予約枠にはまだ学生の予約がありません',
  'Aucun élève n’a encore réservé ce créneau', 'Ningún estudiante ha reservado esta franja todavía', 'Ни один учащийся ещё не записался на этот интервал',
  'Nenhum estudante reservou este horário ainda', 'Für dieses Zeitfenster hat noch kein Schüler gebucht')
add('请上传文件', 'Please upload a file', 'ファイルをアップロードしてください', 'Veuillez téléverser un fichier', 'Suba un archivo',
  'Загрузите файл', 'Envie um arquivo', 'Bitte eine Datei hochladen')
add('该申请已删除', 'This request has been deleted', 'この申請は削除されています', 'Cette demande a été supprimée', 'Esta solicitud se ha eliminado',
  'Заявка удалена', 'Esta solicitação foi excluída', 'Dieser Antrag wurde gelöscht')
add('已返还的申请不能修改', 'Returned requests cannot be edited', '返却済みの申請は編集できません', 'Les demandes rendues ne peuvent pas être modifiées',
  'No se pueden editar solicitudes devueltas', 'Возвращённые заявки нельзя изменять', 'Solicitações devolvidas não podem ser editadas',
  'Zurückgegebene Anträge können nicht bearbeitet werden')
add('已超过{0}小时，申请已锁定，无法再进行任何修改', 'More than {0} hours have passed. The request is locked and cannot be edited',
  '{0}時間を過ぎたため申請がロックされています。これ以降は一切変更できません',
  'Plus de {0} heures se sont écoulées. La demande est verrouillée et ne peut plus être modifiée',
  'Han pasado más de {0} horas. La solicitud está bloqueada y no admite cambios',
  'Прошло более {0} часов. Заявка заблокирована, изменения невозможны',
  'Já passaram mais de {0} horas. A solicitação está bloqueada e não pode ser editada',
  'Mehr als {0} Stunden sind vergangen. Der Antrag ist gesperrt und kann nicht mehr geändert werden')
add('提交后的{0}小时内仅可修改{1}次，您已修改过', 'Only {1} edits are allowed within {0} hours of submission. You have used them',
  '提出後{0}時間以内の変更は{1}回までです。変更回数の上限に達しています',
  'Seules {1} modifications sont autorisées dans les {0} heures suivant l’envoi. Vous les avez utilisées',
  'Solo se permiten {1} cambios en las {0} horas posteriores al envío. Ya los ha utilizado',
  'Допускается только {1} изменений за {0} часов после подачи. Лимит исчерпан',
  'São permitidas apenas {1} edições nas {0} horas após o envio. Você já as utilizou',
  'Innerhalb von {0} Stunden nach Einreichung sind nur {1} Änderungen erlaubt. Diese wurden bereits genutzt')
add('份数最多 100', 'At most 100 copies are allowed', '部数は100部までです', '100 exemplaires maximum', 'Se permiten hasta 100 copias',
  'Допускается не более 100 копий', 'São permitidas até 100 cópias', 'Höchstens 100 Exemplare erlaubt')
add('份数至少为 1', 'At least 1 copy is required', '部数は1部以上にしてください', 'Au moins 1 exemplaire est requis', 'Se requiere al menos 1 copia',
  'Необходима хотя бы 1 копия', 'É necessária pelo menos 1 cópia', 'Mindestens 1 Exemplar erforderlich')
add('仅限 PDF、JPG 格式文档', 'Only PDF and JPG files are allowed', 'PDF・JPG形式のファイルのみ対応しています',
  'Seuls les fichiers PDF et JPG sont acceptés', 'Solo se admiten archivos PDF y JPG', 'Разрешены только файлы PDF и JPG',
  'Somente arquivos PDF e JPG são aceitos', 'Nur PDF- und JPG-Dateien sind erlaubt')
add('无法自动识别 PDF 页数，请填写页数', 'The PDF page count could not be detected. Enter it manually',
  'PDFのページ数を自動取得できません。ページ数を入力してください', 'Le nombre de pages PDF n’a pas pu être détecté. Saisissez-le',
  'No se pudo detectar el número de páginas PDF. Introdúzcalo manualmente', 'Не удалось определить число страниц PDF. Укажите его вручную',
  'Não foi possível detectar o número de páginas do PDF. Informe-o manualmente', 'Die PDF-Seitenzahl konnte nicht ermittelt werden. Bitte manuell eingeben')
add('该时间段已被预约或不可预约，请选择其他时间段', 'This time slot is booked or unavailable. Choose another',
  'この予約枠は予約済みまたは予約できません。別の枠を選択してください', 'Ce créneau est réservé ou indisponible. Choisissez-en un autre',
  'Esta franja está reservada o no disponible. Seleccione otra', 'Интервал занят или недоступен. Выберите другой',
  'Este horário está reservado ou indisponível. Escolha outro', 'Dieses Zeitfenster ist gebucht oder nicht buchbar. Bitte ein anderes wählen')
add('没有找到您的这条预约', 'Your booking was not found', '該当する予約が見つかりません', 'Votre réservation est introuvable',
  'No se ha encontrado su reserva', 'Ваша запись не найдена', 'Sua reserva não foi encontrada', 'Ihre Buchung wurde nicht gefunden')
add('面谈前{0}小时将无法取消预约', 'Bookings cannot be cancelled within {0} hours of the consultation',
  '面談開始の{0}時間前から予約を取り消せません', 'L’annulation est impossible dans les {0} heures précédant l’entretien',
  'No se puede cancelar en las {0} horas previas a la entrevista', 'Отмена невозможна менее чем за {0} часов до консультации',
  'Não é possível cancelar nas {0} horas anteriores à orientação', 'Innerhalb von {0} Stunden vor der Beratung ist keine Stornierung möglich')
add('书类修改仅支持上传 txt 文件', 'Document revision only accepts txt files', '書類添削でアップロードできるのはtxtファイルのみです',
  'La correction de documents accepte uniquement les fichiers txt', 'La revisión de documentos solo admite archivos txt',
  'Для проверки документов принимаются только файлы txt', 'A revisão de documentos aceita apenas arquivos txt',
  'Die Dokumentenkorrektur akzeptiert nur txt-Dateien')
add('当前申请已不可修改', 'This request can no longer be edited', 'この申請は現在変更できません', 'Cette demande ne peut plus être modifiée',
  'Esta solicitud ya no se puede editar', 'Эту заявку больше нельзя изменить', 'Esta solicitação não pode mais ser editada',
  'Dieser Antrag kann nicht mehr bearbeitet werden')
add('只有待打印的申请可以取消', 'Only pending print requests can be cancelled', '印刷待ちの申請のみ取り消せます',
  'Seules les demandes en attente d’impression peuvent être annulées', 'Solo se pueden cancelar solicitudes pendientes de impresión',
  'Можно отменять только заявки, ожидающие печати', 'Somente solicitações aguardando impressão podem ser canceladas',
  'Nur ausstehende Druckanträge können storniert werden')
add('该申请已取消', 'This request has been cancelled', 'この申請は取り消されています', 'Cette demande a été annulée', 'Esta solicitud se ha cancelado',
  'Заявка отменена', 'Esta solicitação foi cancelada', 'Dieser Antrag wurde storniert')
add('月份格式应为 YYYY-MM', 'The month format must be YYYY-MM', '月はYYYY-MM形式で入力してください', 'Le mois doit être au format YYYY-MM',
  'El mes debe tener el formato YYYY-MM', 'Формат месяца: YYYY-MM', 'O mês deve estar no formato YYYY-MM', 'Das Monatsformat muss YYYY-MM sein')
add('文件地址无效，请重新上传', 'Invalid file URL. Upload the file again', 'ファイルのURLが無効です。再度アップロードしてください',
  'Adresse du fichier invalide. Téléversez-le à nouveau', 'Dirección de archivo no válida. Súbalo de nuevo', 'Недопустимый адрес файла. Загрузите его заново',
  'Endereço de arquivo inválido. Envie-o novamente', 'Ungültige Dateiadresse. Bitte erneut hochladen')
add('自定义范围请至少选择一个校区或员工', 'Select at least one campus or staff member for a custom scope',
  '範囲を指定する場合は校舎または職員を1つ以上選択してください', 'Pour un périmètre personnalisé, sélectionnez au moins un site ou employé',
  'Seleccione al menos una sede o empleado para el alcance personalizado', 'Для своего диапазона выберите хотя бы один филиал или сотрудника',
  'Selecione pelo menos uma unidade ou funcionário para o escopo personalizado',
  'Für einen eigenen Bereich bitte mindestens einen Standort oder Mitarbeiter auswählen')
add('工时不能超过 24 小时', 'Work hours cannot exceed 24 hours', '勤務時間は24時間以内にしてください',
  'La durée de travail ne peut pas dépasser 24 heures', 'Las horas de trabajo no pueden superar las 24 horas', 'Рабочее время не может превышать 24 часа',
  'O tempo de trabalho não pode exceder 24 horas', 'Die Arbeitszeit darf 24 Stunden nicht überschreiten')
add('工时必须大于 0', 'Work hours must be greater than 0', '勤務時間は0より大きくしてください', 'La durée de travail doit être supérieure à 0',
  'Las horas de trabajo deben ser mayores que 0', 'Рабочее время должно быть больше 0', 'As horas de trabalho devem ser maiores que 0',
  'Die Arbeitszeit muss größer als 0 sein')
add('关联课次不存在、已取消或不是本人的课次', 'The linked lesson does not exist, is cancelled, or is not yours',
  '関連する授業が存在しないか、取り消されているか、自分の担当ではありません', 'La séance liée est introuvable, annulée ou ne vous appartient pas',
  'La sesión vinculada no existe, está cancelada o no le pertenece', 'Связанное занятие не существует, отменено или не ваше',
  'A aula vinculada não existe, foi cancelada ou não é sua', 'Der verknüpfte Termin fehlt, wurde abgesagt oder gehört nicht Ihnen')
add('该课次已申报过', 'This lesson has already been claimed', 'この授業は既に申請されています', 'Cette séance a déjà été déclarée',
  'Esta sesión ya se ha declarado', 'Заявка по этому занятию уже подана', 'Esta aula já foi declarada', 'Dieser Termin wurde bereits abgerechnet')
add('未设置默认时薪，请填写时薪', 'No default hourly rate is set. Enter a rate', '既定の時給が設定されていません。時給を入力してください',
  'Aucun taux horaire par défaut. Saisissez un taux', 'No hay tarifa horaria predeterminada. Introduzca una',
  'Ставка по умолчанию не задана. Укажите почасовую ставку', 'Não há valor por hora padrão. Informe um valor',
  'Kein Standardstundensatz festgelegt. Bitte einen Stundensatz eingeben')
add('未设置默认时薪，请逐条申报并填写时薪', 'No default hourly rate is set. Submit each claim separately with a rate',
  '既定の時給が設定されていません。1件ずつ時給を入力して申請してください', 'Aucun taux horaire par défaut. Déclarez chaque séance séparément avec son taux',
  'No hay tarifa horaria predeterminada. Declare cada sesión por separado con su tarifa',
  'Ставка по умолчанию не задана. Подавайте заявки по отдельности с указанием ставки',
  'Não há valor por hora padrão. Declare cada aula separadamente com seu valor',
  'Kein Standardstundensatz festgelegt. Bitte jeden Antrag einzeln mit Stundensatz einreichen')
add('所选课次均已申报或不可申报', 'All selected lessons are already claimed or ineligible', '選択した授業はすべて申請済みまたは申請対象外です',
  'Toutes les séances choisies sont déjà déclarées ou non admissibles', 'Todas las sesiones seleccionadas ya están declaradas o no son elegibles',
  'Все выбранные занятия уже заявлены или недоступны для заявки', 'Todas as aulas selecionadas já foram declaradas ou não são elegíveis',
  'Alle gewählten Termine wurden bereits abgerechnet oder sind nicht abrechenbar')
add('只能修改本人的申报', 'You can only edit your own claims', '自分の申請のみ編集できます', 'Vous pouvez modifier uniquement vos déclarations',
  'Solo puede editar sus propias declaraciones', 'Можно изменять только свои заявки', 'Você só pode editar suas próprias declarações',
  'Sie können nur eigene Anträge bearbeiten')
add('已通过的申报不能修改', 'Approved claims cannot be edited', '承認済みの申請は編集できません', 'Les déclarations approuvées ne peuvent pas être modifiées',
  'No se pueden editar declaraciones aprobadas', 'Одобренные заявки нельзя изменять', 'Declarações aprovadas não podem ser editadas',
  'Genehmigte Anträge können nicht bearbeitet werden')
add('只能删除本人的申报', 'You can only delete your own claims', '自分の申請のみ削除できます', 'Vous pouvez supprimer uniquement vos déclarations',
  'Solo puede eliminar sus propias declaraciones', 'Можно удалять только свои заявки', 'Você só pode excluir suas próprias declarações',
  'Sie können nur eigene Anträge löschen')
add('已通过的申报不能删除', 'Approved claims cannot be deleted', '承認済みの申請は削除できません', 'Les déclarations approuvées ne peuvent pas être supprimées',
  'No se pueden eliminar declaraciones aprobadas', 'Одобренные заявки нельзя удалять', 'Declarações aprovadas não podem ser excluídas',
  'Genehmigte Anträge können nicht gelöscht werden')
add('不通过时请填写原因', 'Enter a reason when rejecting', '却下する場合は理由を入力してください', 'Indiquez un motif en cas de refus',
  'Indique un motivo al rechazar', 'Укажите причину отказа', 'Informe um motivo ao rejeitar', 'Bei Ablehnung bitte einen Grund eingeben')
add('不能审核自己的工资申报', 'You cannot review your own wage claims', '自分の給与申請は審査できません', 'Vous ne pouvez pas valider vos propres déclarations de salaire',
  'No puede revisar sus propias solicitudes salariales', 'Нельзя проверять собственные заявки на оплату',
  'Você não pode revisar suas próprias solicitações de salário',
  'Sie können eigene Gehaltsanträge nicht prüfen')
add('没有可审核的记录（不在您的审核范围内）', 'No records available for review (outside your review scope)',
  '審査できる記録がありません（審査範囲外です）', 'Aucune déclaration à examiner (hors de votre périmètre)',
  'No hay registros para revisar (fuera de su alcance de revisión)', 'Нет доступных записей для проверки (вне вашей области проверки)',
  'Não há registros para revisar (fora do seu escopo de revisão)', 'Keine prüfbaren Einträge vorhanden (außerhalb Ihres Prüfbereichs)')

add('Logo 地址不合法，请重新上传', 'Invalid logo URL. Upload it again', 'ロゴのURLが無効です。再度アップロードしてください',
  'Adresse du logo invalide. Téléversez-le à nouveau', 'Dirección del logotipo no válida. Súbalo de nuevo', 'Недопустимый адрес логотипа. Загрузите его заново',
  'Endereço do logotipo inválido. Envie-o novamente', 'Ungültige Logo-Adresse. Bitte erneut hochladen')
add('请输入六位十六进制颜色', 'Enter a six-digit hexadecimal color', '6桁の16進カラーコードを入力してください',
  'Saisissez une couleur hexadécimale à six chiffres', 'Introduzca un color hexadecimal de seis dígitos', 'Введите шестизначный шестнадцатеричный цвет',
  'Informe uma cor hexadecimal de seis dígitos', 'Bitte einen sechsstelligen Hexadezimal-Farbcode eingeben')
add('无权查看该学员', 'You cannot view this student', 'この学生を閲覧する権限がありません', 'Vous ne pouvez pas consulter cet élève',
  'No puede ver este estudiante', 'Нет прав на просмотр учащегося', 'Você não pode visualizar este estudante',
  'Keine Berechtigung zum Anzeigen dieses Schülers')
add('该客户已转为学员', 'This customer has already become a student', 'この顧客は既に学生に移行しています', 'Ce client est déjà devenu élève',
  'Este cliente ya se ha convertido en estudiante', 'Клиент уже стал учащимся', 'Este cliente já se tornou estudante',
  'Dieser Kunde ist bereits als Schüler erfasst')
add('学号生成失败，请重试', 'Failed to generate a student ID. Try again', '学生番号を生成できませんでした。再度お試しください',
  'Impossible de générer le numéro d’élève. Réessayez', 'No se pudo generar el número de estudiante. Vuelva a intentarlo',
  'Не удалось создать номер учащегося. Повторите попытку', 'Não foi possível gerar a matrícula. Tente novamente',
  'Schülernummer konnte nicht erstellt werden. Bitte erneut versuchen')
add('无权编辑该学员档案', 'You cannot edit this student’s profile', 'この学生の記録を編集する権限がありません',
  'Vous ne pouvez pas modifier le dossier de cet élève', 'No puede editar el expediente de este estudiante', 'Нет прав на изменение личного дела учащегося',
  'Você não pode editar o cadastro deste estudante', 'Keine Berechtigung zum Bearbeiten dieser Schülerakte')
add('无权删除该学员', 'You cannot delete this student', 'この学生を削除する権限がありません', 'Vous ne pouvez pas supprimer cet élève',
  'No puede eliminar este estudiante', 'Нет прав на удаление учащегося', 'Você não pode excluir este estudante',
  'Keine Berechtigung zum Löschen dieses Schülers')
add('该学员未被删除', 'This student has not been deleted', 'この学生は削除されていません', 'Cet élève n’a pas été supprimé',
  'Este estudiante no está eliminado', 'Учащийся не удалён', 'Este estudante não foi excluído', 'Dieser Schüler wurde nicht gelöscht')
add('无权恢复该学员', 'You cannot restore this student', 'この学生を復元する権限がありません', 'Vous ne pouvez pas restaurer cet élève',
  'No puede restaurar este estudiante', 'Нет прав на восстановление учащегося', 'Você não pode restaurar este estudante',
  'Keine Berechtigung zum Wiederherstellen dieses Schülers')
add('合格院校必填', 'The admitting institution is required', '合格した学校名を入力してください', 'L’établissement d’admission est obligatoire',
  'La institución de admisión es obligatoria', 'Укажите учебное заведение, куда зачислен учащийся', 'A instituição de admissão é obrigatória',
  'Die aufnehmende Bildungseinrichtung ist erforderlich')
add('语言学校为必填项', 'The language school is required', '日本語学校を入力してください', 'L’école de langue est obligatoire',
  'La escuela de idiomas es obligatoria', 'Укажите языковую школу', 'A escola de idiomas é obrigatória', 'Die Sprachschule ist erforderlich')
add('最终学历不在可选范围内', 'The qualification is not among the available options', '最終学歴が選択肢に含まれていません',
  'Le diplôme ne figure pas parmi les options', 'El nivel educativo no está entre las opciones disponibles', 'Уровень образования отсутствует в списке',
  'A formação não está entre as opções disponíveis', 'Der Bildungsabschluss gehört nicht zu den verfügbaren Optionen')
add('学科分类不在可选范围内', 'The subject category is not among the available options', '学科分類が選択肢に含まれていません',
  'La catégorie disciplinaire ne figure pas parmi les options', 'La categoría de asignatura no está entre las opciones disponibles',
  'Категория дисциплины отсутствует в списке', 'A categoria de disciplina não está entre as opções disponíveis',
  'Die Fachkategorie gehört nicht zu den verfügbaren Optionen')
add('志望学位不在可选范围内', 'The intended degree is not among the available options', '志望学位が選択肢に含まれていません',
  'Le diplôme visé ne figure pas parmi les options', 'El título deseado no está entre las opciones disponibles', 'Желаемая степень отсутствует в списке',
  'O grau pretendido não está entre as opções disponíveis', 'Der angestrebte Abschluss gehört nicht zu den verfügbaren Optionen')
add('{0}：只能选择教师身份的工号', '{0}: only staff IDs with teacher status may be selected', '{0}：講師の職員番号のみ選択できます',
  '{0} : seuls les matricules d’enseignants sont acceptés', '{0}: solo se admiten números de empleado con función de docente',
  '{0}: можно выбрать только табельный номер преподавателя', '{0}: selecione apenas matrículas de professores',
  '{0}: Nur Personalnummern von Lehrkräften können ausgewählt werden')
add('EJU 成绩最多录入 {0} 回', 'At most {0} EJU exam results may be entered', 'EJUの成績は{0}回分まで登録できます',
  'Au maximum {0} sessions EJU peuvent être saisies', 'Se pueden registrar hasta {0} resultados EJU', 'Можно внести результаты не более {0} экзаменов EJU',
  'É possível registrar até {0} resultados EJU', 'Es können höchstens {0} EJU-Ergebnisse erfasst werden')
add('EJU 回数只能是 1~{0}', 'The EJU attempt number must be between 1 and {0}', 'EJUの受験回は1〜{0}で指定してください',
  'Le numéro de session EJU doit être compris entre 1 et {0}', 'El número de intento EJU debe estar entre 1 y {0}',
  'Номер попытки EJU должен быть от 1 до {0}', 'O número da tentativa EJU deve estar entre 1 e {0}', 'Die EJU-Versuchsnummer muss zwischen 1 und {0} liegen')
add('EJU 第 {0} 回重复', 'Duplicate EJU attempt {0}', 'EJUの第{0}回が重複しています', 'Session EJU {0} en double',
  'Intento EJU {0} duplicado', 'Попытка EJU {0} повторяется', 'Tentativa EJU {0} duplicada', 'EJU-Versuch {0} ist doppelt vorhanden')
add('合格信息最多 {0} 条', 'At most {0} admission results may be entered', '合格情報は{0}件まで登録できます',
  'Au maximum {0} résultats d’admission sont autorisés', 'Se permiten hasta {0} resultados de admisión', 'Допускается не более {0} записей о зачислении',
  'São permitidos até {0} resultados de admissão', 'Es sind höchstens {0} Zulassungsergebnisse erlaubt')
add('无效的时区：{0}', 'Invalid time zone: {0}', '無効なタイムゾーン：{0}', 'Fuseau horaire invalide : {0}',
  'Zona horaria no válida: {0}', 'Недопустимый часовой пояс: {0}', 'Fuso horário inválido: {0}', 'Ungültige Zeitzone: {0}')
add('校区代码已存在（可能在已删除列表中）', 'The campus code already exists (possibly in deleted items)',
  '校舎コードは既に存在します（削除済み一覧も確認してください）', 'Ce code de site existe déjà (peut-être dans les éléments supprimés)',
  'El código de sede ya existe (posiblemente en la lista de eliminados)', 'Код филиала уже существует (возможно, в списке удалённых)',
  'O código da unidade já existe (possivelmente nos excluídos)', 'Der Standortcode ist bereits vorhanden (möglicherweise unter gelöschten Einträgen)')
add('校区代码已存在', 'The campus code already exists', '校舎コードは既に存在します', 'Ce code de site existe déjà',
  'El código de sede ya existe', 'Код филиала уже существует', 'O código da unidade já existe', 'Der Standortcode ist bereits vorhanden')
add('校区不存在或已删除', 'The campus does not exist or is deleted', '校舎が存在しないか削除されています',
  'Le site est introuvable ou supprimé', 'La sede no existe o está eliminada', 'Филиал не существует или удалён',
  'A unidade não existe ou foi excluída', 'Standort nicht vorhanden oder gelöscht')
add('至少保留一个校区', 'At least one campus must remain', '校舎を1つ以上残してください', 'Au moins un site doit être conservé',
  'Debe conservar al menos una sede', 'Должен остаться хотя бы один филиал', 'É necessário manter pelo menos uma unidade',
  'Mindestens ein Standort muss erhalten bleiben')
add('校区不存在或未删除', 'The campus does not exist or is not deleted', '校舎が存在しないか削除されていません',
  'Le site est introuvable ou n’est pas supprimé', 'La sede no existe o no está eliminada', 'Филиал не существует или не удалён',
  'A unidade não existe ou não foi excluída', 'Standort nicht vorhanden oder nicht gelöscht')
add('未知的权限点：{0}', 'Unknown permission: {0}', '不明な権限：{0}', 'Autorisation inconnue : {0}', 'Permiso desconocido: {0}',
  'Неизвестное право: {0}', 'Permissão desconhecida: {0}', 'Unbekannte Berechtigung: {0}')
add('只有超级管理员可以创建拥有全部权限的角色', 'Only super administrators can create roles with full permissions',
  '全権限を持つロールを作成できるのはスーパー管理者のみです', 'Seuls les super-administrateurs peuvent créer des rôles avec tous les droits',
  'Solo los superadministradores pueden crear roles con todos los permisos', 'Только суперадминистраторы могут создавать роли с полными правами',
  'Somente superadministradores podem criar perfis com todas as permissões', 'Nur Superadministratoren können Rollen mit allen Rechten anlegen')
add('角色名称已存在', 'The role name already exists', 'ロール名は既に存在します', 'Ce nom de rôle existe déjà', 'El nombre del rol ya existe',
  'Название роли уже существует', 'O nome do perfil já existe', 'Der Rollenname ist bereits vorhanden')
add('系统内置角色不可改名', 'Built-in roles cannot be renamed', 'システム標準のロール名は変更できません', 'Les rôles système ne peuvent pas être renommés',
  'No se pueden renombrar los roles del sistema', 'Встроенные роли нельзя переименовывать', 'Perfis do sistema não podem ser renomeados',
  'Integrierte Systemrollen können nicht umbenannt werden')
add('系统内置角色不可去掉「全部权限」', 'Full permissions cannot be removed from built-in roles',
  'システム標準のロールから「全権限」を外すことはできません', 'Tous les droits ne peuvent pas être retirés des rôles système',
  'No se pueden quitar todos los permisos de los roles del sistema', 'У встроенных ролей нельзя отобрать полные права',
  'Não é possível remover todas as permissões de perfis do sistema', 'Integrierten Systemrollen können nicht alle Rechte entzogen werden')
add('只有超级管理员可以修改拥有全部权限的角色', 'Only super administrators can edit roles with full permissions',
  '全権限を持つロールを編集できるのはスーパー管理者のみです', 'Seuls les super-administrateurs peuvent modifier les rôles avec tous les droits',
  'Solo los superadministradores pueden editar roles con todos los permisos', 'Только суперадминистраторы могут изменять роли с полными правами',
  'Somente superadministradores podem editar perfis com todas as permissões', 'Nur Superadministratoren können Rollen mit allen Rechten bearbeiten')
add('去掉「全部权限」后将没有有效的超级管理员', 'Removing full permissions would leave no active super administrator',
  '「全権限」を外すと有効なスーパー管理者がいなくなります', 'Retirer tous les droits laisserait le système sans super-administrateur actif',
  'Quitar todos los permisos dejaría el sistema sin superadministrador activo', 'Удаление полных прав оставит систему без действующего суперадминистратора',
  'Remover todas as permissões deixaria o sistema sem superadministrador ativo', 'Der Entzug aller Rechte würde keinen aktiven Superadministrator übrig lassen')
add('系统内置角色不可删除', 'Built-in roles cannot be deleted', 'システム標準のロールは削除できません', 'Les rôles système ne peuvent pas être supprimés',
  'No se pueden eliminar los roles del sistema', 'Встроенные роли нельзя удалять', 'Perfis do sistema não podem ser excluídos',
  'Integrierte Systemrollen können nicht gelöscht werden')
add('该角色下还有 {0} 个账号（含回收站），请先移除后再删除', 'This role has {0} accounts (including the recycle bin). Remove them before deleting',
  'このロールにはアカウントが{0}件あります（ゴミ箱を含む）。先に割当を外してから削除してください',
  'Ce rôle est attribué à {0} comptes (corbeille comprise). Retirez-les avant de supprimer',
  'Este rol tiene {0} cuentas (incluida la papelera). Retírelas antes de eliminarlo',
  'У роли {0} учётных записей (включая корзину). Сначала снимите назначения',
  'Este perfil tem {0} contas (incluindo a lixeira). Remova as atribuições antes de excluir',
  'Diese Rolle hat {0} Konten (einschließlich Papierkorb). Bitte vor dem Löschen die Zuweisungen entfernen')
add('课程名称已存在（可能已停用）', 'The course name already exists (possibly inactive)', '講座名は既に存在します（無効な講座も確認してください）',
  'Ce nom de cours existe déjà (peut-être désactivé)', 'El nombre del curso ya existe (posiblemente inactivo)',
  'Название курса уже существует (возможно, курс отключён)',
  'O nome do curso já existe (possivelmente inativo)', 'Der Kursname ist bereits vorhanden (möglicherweise deaktiviert)')
add('课程名称已存在', 'The course name already exists', '講座名は既に存在します', 'Ce nom de cours existe déjà', 'El nombre del curso ya existe',
  'Название курса уже существует', 'O nome do curso já existe', 'Der Kursname ist bereits vorhanden')
add('请输入非负数字', 'Enter a nonnegative number', '0以上の数値を入力してください', 'Saisissez un nombre positif ou nul',
  'Introduzca un número no negativo', 'Введите неотрицательное число', 'Informe um número não negativo', 'Bitte eine nichtnegative Zahl eingeben')
add('该账号是最后一个有效的超级管理员（拥有全部权限），不能{0}',
  'This account is the last active super administrator (with full permissions); cannot {0}',
  'このアカウントは最後の有効なスーパー管理者（全権限あり）のため、{0}できません',
  'Ce compte est le dernier super-administrateur actif (tous les droits) ; impossible de {0}',
  'Esta cuenta es el último superadministrador activo (todos los permisos); no se puede {0}',
  'Это последний действующий суперадминистратор (с полными правами); нельзя {0}',
  'Esta conta é o último superadministrador ativo (todas as permissões); não é possível {0}',
  'Dieses Konto ist der letzte aktive Superadministrator (mit allen Rechten); folgender Vorgang ist nicht möglich: {0}')
add('包含不存在的职务角色', 'One or more job roles do not exist', '存在しない職務ロールが含まれています', 'Un ou plusieurs rôles n’existent pas',
  'Uno o más roles no existen', 'Содержит несуществующие должностные роли', 'Um ou mais perfis de cargo não existem',
  'Enthält nicht vorhandene Funktionsrollen')
add('包含不存在的教授课程', 'One or more taught courses do not exist', '存在しない担当講座が含まれています', 'Un ou plusieurs cours enseignés n’existent pas',
  'Uno o más cursos impartidos no existen', 'Содержит несуществующие преподаваемые курсы', 'Um ou mais cursos lecionados não existem',
  'Enthält nicht vorhandene unterrichtete Kurse')
add('只有超级管理员可以分配超级管理员角色', 'Only super administrators can assign the super administrator role',
  'スーパー管理者ロールを割り当てられるのはスーパー管理者のみです', 'Seuls les super-administrateurs peuvent attribuer le rôle de super-administrateur',
  'Solo los superadministradores pueden asignar el rol de superadministrador', 'Только суперадминистраторы могут назначать роль суперадминистратора',
  'Somente superadministradores podem atribuir o perfil de superadministrador', 'Nur Superadministratoren können die Superadministratorrolle zuweisen')
add('工号已存在（可能在回收站中，可恢复后使用）', 'The staff ID already exists (it may be in the recycle bin and can be restored)',
  '職員番号は既に存在します（ゴミ箱にある場合は復元して利用できます）', 'Ce matricule existe déjà (il peut être restauré depuis la corbeille)',
  'El número de empleado ya existe (puede estar en la papelera y restaurarse)', 'Табельный номер уже существует (возможно восстановление из корзины)',
  'A matrícula já existe (pode estar na lixeira e ser restaurada)', 'Die Personalnummer ist bereits vorhanden (ggf. aus dem Papierkorb wiederherstellen)')
add('工号已被其他账号使用', 'The staff ID is used by another account', 'この職員番号は別のアカウントで使用されています',
  'Ce matricule est utilisé par un autre compte', 'Otra cuenta utiliza este número de empleado', 'Табельный номер используется другой учётной записью',
  'A matrícula está sendo usada por outra conta', 'Die Personalnummer wird von einem anderen Konto verwendet')
add('只有超级管理员可以调整超级管理员角色', 'Only super administrators can change the super administrator role',
  'スーパー管理者ロールを変更できるのはスーパー管理者のみです', 'Seuls les super-administrateurs peuvent modifier le rôle de super-administrateur',
  'Solo los superadministradores pueden cambiar el rol de superadministrador', 'Только суперадминистраторы могут менять роль суперадминистратора',
  'Somente superadministradores podem alterar o perfil de superadministrador', 'Nur Superadministratoren können die Superadministratorrolle ändern')
add('不能移除最后一个有效超级管理员的超级管理员角色', 'The last active super administrator’s role cannot be removed',
  '最後の有効なスーパー管理者からスーパー管理者ロールを外すことはできません', 'Le rôle du dernier super-administrateur actif ne peut pas être retiré',
  'No se puede quitar el rol al último superadministrador activo', 'Нельзя снять роль последнего действующего суперадминистратора',
  'Não é possível remover o perfil do último superadministrador ativo', 'Die Rolle des letzten aktiven Superadministrators kann nicht entfernt werden')
add('只有超级管理员可以重置超级管理员的密码', 'Only super administrators can reset a super administrator’s password',
  'スーパー管理者のパスワードをリセットできるのはスーパー管理者のみです', 'Seuls les super-administrateurs peuvent réinitialiser le mot de passe d’un super-administrateur',
  'Solo los superadministradores pueden restablecer la contraseña de un superadministrador',
  'Только суперадминистраторы могут сбрасывать пароль суперадминистратора',
  'Somente superadministradores podem redefinir a senha de um superadministrador',
  'Nur Superadministratoren können das Passwort eines Superadministrators zurücksetzen')
add('不能锁定自己的账号', 'You cannot lock your own account', '自分のアカウントはロックできません', 'Vous ne pouvez pas bloquer votre propre compte',
  'No puede bloquear su propia cuenta', 'Нельзя заблокировать свою учётную запись', 'Você não pode bloquear sua própria conta',
  'Sie können Ihr eigenes Konto nicht sperren')
add('工号不存在或已删除', 'The staff ID does not exist or is deleted', '職員番号が存在しないか削除されています',
  'Le matricule est introuvable ou supprimé', 'El número de empleado no existe o está eliminado', 'Табельный номер не существует или удалён',
  'A matrícula não existe ou foi excluída', 'Personalnummer nicht vorhanden oder gelöscht')
add('只有超级管理员可以锁定超级管理员', 'Only super administrators can lock a super administrator',
  'スーパー管理者をロックできるのはスーパー管理者のみです', 'Seuls les super-administrateurs peuvent bloquer un super-administrateur',
  'Solo los superadministradores pueden bloquear a un superadministrador', 'Только суперадминистраторы могут блокировать суперадминистратора',
  'Somente superadministradores podem bloquear um superadministrador', 'Nur Superadministratoren können einen Superadministrator sperren')
add('不能删除自己的账号', 'You cannot delete your own account', '自分のアカウントは削除できません', 'Vous ne pouvez pas supprimer votre propre compte',
  'No puede eliminar su propia cuenta', 'Нельзя удалить свою учётную запись', 'Você não pode excluir sua própria conta',
  'Sie können Ihr eigenes Konto nicht löschen')
add('只有超级管理员可以删除超级管理员', 'Only super administrators can delete a super administrator',
  'スーパー管理者を削除できるのはスーパー管理者のみです', 'Seuls les super-administrateurs peuvent supprimer un super-administrateur',
  'Solo los superadministradores pueden eliminar a un superadministrador', 'Только суперадминистраторы могут удалять суперадминистратора',
  'Somente superadministradores podem excluir um superadministrador', 'Nur Superadministratoren können einen Superadministrator löschen')
add('工号不存在或未删除', 'The staff ID does not exist or is not deleted', '職員番号が存在しないか削除されていません',
  'Le matricule est introuvable ou n’est pas supprimé', 'El número de empleado no existe o no está eliminado', 'Табельный номер не существует или не удалён',
  'A matrícula não existe ou não foi excluída', 'Personalnummer nicht vorhanden oder nicht gelöscht')
add('账号不存在或已停用', 'The account does not exist or is inactive', 'アカウントが存在しないか無効になっています',
  'Le compte est introuvable ou désactivé', 'La cuenta no existe o está inactiva', 'Учётная запись не существует или отключена',
  'A conta não existe ou está inativa', 'Konto nicht vorhanden oder deaktiviert')
add('仅限教职工', 'Staff only', '教職員のみ利用できます', 'Réservé au personnel', 'Solo para personal', 'Только для сотрудников',
  'Somente funcionários', 'Nur für Mitarbeitende')
add('仅限学生', 'Students only', '学生のみ利用できます', 'Réservé aux élèves', 'Solo para estudiantes', 'Только для учащихся',
  'Somente estudantes', 'Nur für Schüler')
add('锁定', 'lock', 'ロック', 'bloquer', 'bloquear', 'заблокировать', 'bloquear', 'Sperren')
add('删除', 'delete', '削除', 'supprimer', 'eliminar', 'удалить', 'excluir', 'Löschen')
add('担当老师', 'Assigned teacher', '担当講師', 'Enseignant responsable', 'Docente asignado', 'Назначенный преподаватель',
  'Professor responsável', 'Zuständige Lehrkraft')
add('签约老师', 'Contract teacher', '契約担当講師', 'Enseignant du contrat', 'Docente del contrato', 'Преподаватель по договору',
  'Professor do contrato', 'Vertragslehrkraft')
add('请输入数字', 'Enter a number', '数値を入力してください', 'Saisissez un nombre', 'Introduzca un número', 'Введите число', 'Informe um número', 'Bitte eine Zahl eingeben')
add('必须是整数', 'Must be an integer', '整数で入力してください', 'Doit être un entier', 'Debe ser un número entero', 'Требуется целое число', 'Deve ser um número inteiro', 'Muss eine ganze Zahl sein')
add('不能小于 {0}', 'Must not be less than {0}', '{0}未満にはできません', 'Ne peut pas être inférieur à {0}', 'No puede ser menor que {0}', 'Не может быть меньше {0}', 'Não pode ser menor que {0}', 'Darf nicht kleiner als {0} sein')
add('不能大于 {0}', 'Must not be greater than {0}', '{0}を超えることはできません', 'Ne peut pas être supérieur à {0}', 'No puede ser mayor que {0}', 'Не может быть больше {0}', 'Não pode ser maior que {0}', 'Darf nicht größer als {0} sein')
add('至少选择一个月份', 'Select at least one month', '月を1つ以上選択してください', 'Sélectionnez au moins un mois', 'Seleccione al menos un mes', 'Выберите хотя бы один месяц', 'Selecione pelo menos um mês', 'Wählen Sie mindestens einen Monat')
add('看板结束时刻必须晚于开始时刻', 'The board end time must be later than the start time', '時間割ボードの終了時刻は開始時刻より後に設定してください', 'L’heure de fin doit être postérieure à l’heure de début', 'La hora de fin debe ser posterior a la de inicio', 'Время окончания должно быть позже времени начала', 'O horário final deve ser posterior ao inicial', 'Die Endzeit muss nach der Startzeit liegen')
add('至少保留一个选项', 'Keep at least one option', '選択肢を1件以上残してください', 'Conservez au moins une option', 'Conserve al menos una opción', 'Оставьте хотя бы один вариант', 'Mantenha pelo menos uma opção', 'Mindestens eine Option muss erhalten bleiben')
add('该选项不可修改', 'This option cannot be edited', 'この選択肢は変更できません', 'Cette option ne peut pas être modifiée', 'Esta opción no se puede modificar', 'Этот вариант нельзя изменить', 'Esta opção não pode ser alterada', 'Diese Option kann nicht geändert werden')
add('至少保留一个可见选项', 'Keep at least one option visible', '表示する選択肢を1件以上残してください', 'Conservez au moins une option visible', 'Conserve al menos una opción visible', 'Оставьте хотя бы один видимый вариант', 'Mantenha pelo menos uma opção visível', 'Mindestens eine sichtbare Option muss erhalten bleiben')
add('已有选项不能删除，只能隐藏：{0}', 'Existing options cannot be deleted, only hidden: {0}', '既存の選択肢は削除できません。非表示にしてください：{0}', 'Les options existantes ne peuvent être que masquées : {0}', 'Las opciones existentes solo se pueden ocultar: {0}', 'Существующие варианты можно только скрыть: {0}', 'Opções existentes só podem ser ocultadas: {0}', 'Bestehende Optionen können nur ausgeblendet werden: {0}')
add('学生端确认课时已关闭，请联系老师确认', 'Student confirmation is disabled; ask the teacher to confirm', '学生による授業確認は無効です。講師に確認を依頼してください', 'La confirmation par l’élève est désactivée ; contactez l’enseignant', 'La confirmación del estudiante está desactivada; contacte al profesor', 'Подтверждение учащимся отключено; обратитесь к преподавателю', 'A confirmação pelo aluno está desativada; fale com o professor', 'Die Bestätigung durch Schüler ist deaktiviert; wenden Sie sich an die Lehrkraft')
add('数据库名只能包含字母、数字、下划线和短横线', 'The database name may contain only letters, numbers, underscores, and hyphens',
  'データベース名に使用できるのは半角英数字、アンダースコア、ハイフンのみです', 'Le nom de la base ne peut contenir que des lettres, chiffres, traits de soulignement et tirets',
  'El nombre de la base de datos solo puede contener letras, números, guiones bajos y guiones', 'Имя базы данных может содержать только буквы, цифры, подчёркивания и дефисы',
  'O nome do banco pode conter apenas letras, números, sublinhados e hífens', 'Der Datenbankname darf nur Buchstaben, Zahlen, Unterstriche und Bindestriche enthalten')
add('工号只能包含字母、数字、下划线、点和短横线（2–30 位）', 'The staff ID may contain only letters, numbers, underscores, dots, and hyphens (2–30 characters)',
  '職員番号は2～30文字の半角英数字、アンダースコア、ピリオド、ハイフンで入力してください', 'Le matricule ne peut contenir que des lettres, chiffres, traits de soulignement, points et tirets (2 à 30 caractères)',
  'El número de empleado solo puede contener letras, números, guiones bajos, puntos y guiones (2–30 caracteres)', 'Табельный номер может содержать буквы, цифры, подчёркивания, точки и дефисы (2–30 символов)',
  'A matrícula pode conter apenas letras, números, sublinhados, pontos e hífens (2–30 caracteres)', 'Die Personalnummer darf nur Buchstaben, Zahlen, Unterstriche, Punkte und Bindestriche enthalten (2–30 Zeichen)')
add('安装码不正确，请查看服务器控制台或 server/.install-token', 'Invalid installation code. Check the server console or server/.install-token',
  'インストールコードが正しくありません。サーバーコンソールまたは server/.install-token を確認してください', 'Code d’installation incorrect. Consultez la console du serveur ou server/.install-token',
  'Código de instalación incorrecto. Consulte la consola del servidor o server/.install-token', 'Неверный код установки. Проверьте консоль сервера или server/.install-token',
  'Código de instalação incorreto. Consulte o console do servidor ou server/.install-token', 'Ungültiger Installationscode. Prüfen Sie die Serverkonsole oder server/.install-token')
add('安装码不正确', 'Invalid installation code', 'インストールコードが正しくありません', 'Code d’installation incorrect', 'Código de instalación incorrecto',
  'Неверный код установки', 'Código de instalação incorreto', 'Ungültiger Installationscode')
add('连接失败：{0}', 'Connection failed: {0}', '接続に失敗しました：{0}', 'Échec de la connexion : {0}', 'Error de conexión: {0}',
  'Ошибка подключения: {0}', 'Falha na conexão: {0}', 'Verbindung fehlgeschlagen: {0}')
add('安装正在进行中', 'Installation is in progress', 'インストール中です', 'Installation en cours', 'La instalación está en curso',
  'Выполняется установка', 'A instalação está em andamento', 'Installation läuft')
add('系统尚未安装', 'The system is not installed yet', 'システムはまだインストールされていません', 'Le système n’est pas encore installé', 'El sistema aún no está instalado',
  'Система ещё не установлена', 'O sistema ainda não está instalado', 'Das System ist noch nicht installiert')
add('访问地址应以 http:// 或 https:// 开头', 'The URL must start with http:// or https://', 'URL は http:// または https:// で始めてください',
  'L’adresse doit commencer par http:// ou https://', 'La dirección debe comenzar por http:// o https://', 'Адрес должен начинаться с http:// или https://',
  'O endereço deve começar com http:// ou https://', 'Die Adresse muss mit http:// oder https:// beginnen')
add('启用邮件前请填写 SMTP 服务器和发件地址', 'Enter the SMTP server and sender address before enabling email',
  'メール送信を有効にする前に、SMTP サーバーと送信元アドレスを入力してください', 'Renseignez le serveur SMTP et l’adresse d’expédition avant d’activer les e-mails',
  'Indique el servidor SMTP y la dirección del remitente antes de activar el correo', 'Перед включением почты укажите SMTP-сервер и адрес отправителя',
  'Informe o servidor SMTP e o endereço do remetente antes de ativar o e-mail', 'Geben Sie vor dem Aktivieren den SMTP-Server und die Absenderadresse ein')
add('请先启用并保存 SMTP 配置', 'Enable and save the SMTP settings first', 'SMTP 設定を有効にして保存してください',
  'Activez et enregistrez d’abord les paramètres SMTP', 'Active y guarde primero la configuración SMTP', 'Сначала включите и сохраните настройки SMTP',
  'Ative e salve primeiro as configurações SMTP', 'Aktivieren und speichern Sie zuerst die SMTP-Einstellungen')
add('SMTP 连接或认证失败：{0}', 'SMTP connection or authentication failed: {0}', 'SMTP の接続または認証に失敗しました：{0}',
  'Échec de la connexion ou de l’authentification SMTP : {0}', 'Error de conexión o autenticación SMTP: {0}', 'Ошибка подключения или аутентификации SMTP: {0}',
  'Falha na conexão ou autenticação SMTP: {0}', 'SMTP-Verbindung oder Authentifizierung fehlgeschlagen: {0}')
add('前缀只能包含字母、数字和短横线，最多 10 位', 'The prefix may contain only letters, numbers, and hyphens, up to 10 characters',
  '接頭辞は10文字以内の半角英数字またはハイフンで入力してください', 'Le préfixe ne peut contenir que des lettres, chiffres et tirets, sur 10 caractères maximum',
  'El prefijo solo puede contener letras, números y guiones, hasta 10 caracteres', 'Префикс может содержать только буквы, цифры и дефисы, до 10 символов',
  'O prefixo pode conter apenas letras, números e hífens, com no máximo 10 caracteres', 'Das Präfix darf nur Buchstaben, Zahlen und Bindestriche enthalten und höchstens 10 Zeichen lang sein')
add('文件过大（上限 {0}MB）', 'File too large (limit: {0} MB)', 'ファイルサイズが上限（{0}MB）を超えています', 'Fichier trop volumineux (limite : {0} Mo)',
  'El archivo es demasiado grande (límite: {0} MB)', 'Файл слишком большой (лимит: {0} МБ)', 'Arquivo muito grande (limite: {0} MB)', 'Datei zu groß (Limit: {0} MB)')
add('系统未开启邮件找回密码，请联系管理员重置', 'Email password recovery is disabled. Contact an administrator to reset your password',
  'メールによるパスワード再設定は有効になっていません。管理者に再設定を依頼してください', 'La récupération par e-mail est désactivée. Contactez un administrateur',
  'La recuperación por correo está desactivada. Contacte a un administrador', 'Восстановление пароля по почте отключено. Обратитесь к администратору',
  'A recuperação por e-mail está desativada. Contate um administrador', 'Die Passwortwiederherstellung per E-Mail ist deaktiviert. Wenden Sie sich an die Administration')
add('链接无效或已过期，请重新申请', 'The link is invalid or expired. Request a new one', 'リンクが無効または有効期限切れです。もう一度申請してください',
  'Le lien est invalide ou expiré. Faites une nouvelle demande', 'El enlace no es válido o ha caducado. Solicite uno nuevo', 'Ссылка недействительна или истекла. Запросите новую',
  'O link é inválido ou expirou. Solicite um novo', 'Der Link ist ungültig oder abgelaufen. Fordern Sie einen neuen an')
add('请输入正确的邮箱地址', 'Enter a valid email address', '正しいメールアドレスを入力してください', 'Saisissez une adresse e-mail valide',
  'Introduzca una dirección de correo válida', 'Введите корректный адрес электронной почты', 'Informe um endereço de e-mail válido', 'Geben Sie eine gültige E-Mail-Adresse ein')

// 成绩管理 / 成绩与档案设置
add('代码只能包含字母、数字、下划线和短横线（1–30 位）', 'Codes may contain only letters, numbers, underscores and hyphens (1–30 characters)',
  'コードは半角英数字・アンダースコア・ハイフンの 1～30 文字で入力してください', 'Le code ne peut contenir que des lettres, chiffres, traits de soulignement et tirets (1 à 30 caractères)',
  'El código solo puede contener letras, números, guiones bajos y guiones (1–30 caracteres)', 'Код может содержать только буквы, цифры, подчёркивания и дефисы (1–30 символов)',
  'O código pode conter apenas letras, números, sublinhados e hífens (1–30 caracteres)', 'Der Code darf nur Buchstaben, Zahlen, Unter- und Bindestriche enthalten (1–30 Zeichen)')
add('请填写名称', 'Enter a name', '名称を入力してください', 'Saisissez un nom', 'Introduzca un nombre', 'Введите название', 'Informe um nome', 'Geben Sie einen Namen ein')
add('名称最多 40 个字', 'Names can be at most 40 characters', '名称は 40 文字以内で入力してください', 'Le nom ne doit pas dépasser 40 caractères',
  'El nombre no puede superar los 40 caracteres', 'Название не может быть длиннее 40 символов', 'O nome deve ter no máximo 40 caracteres', 'Der Name darf höchstens 40 Zeichen lang sein')
add('满分必须是数字', 'Full mark must be a number', '満点は数値で入力してください', 'Le barème doit être un nombre', 'La nota máxima debe ser un número',
  'Максимальный балл должен быть числом', 'A nota máxima deve ser um número', 'Die Höchstpunktzahl muss eine Zahl sein')
add('满分必须大于 0', 'Full mark must be greater than 0', '満点は 0 より大きい値にしてください', 'Le barème doit être supérieur à 0', 'La nota máxima debe ser mayor que 0',
  'Максимальный балл должен быть больше 0', 'A nota máxima deve ser maior que 0', 'Die Höchstpunktzahl muss größer als 0 sein')
add('同一考试中的科目代码不能重复', 'Subject codes must be unique within an exam', '同じ試験内で科目コードを重複させることはできません',
  'Les codes de matière doivent être uniques dans un même examen', 'Los códigos de asignatura no pueden repetirse dentro de un examen',
  'Коды предметов в одном экзамене не должны повторяться', 'Os códigos de disciplina não podem se repetir no mesmo exame', 'Fachcodes dürfen innerhalb einer Prüfung nicht doppelt vorkommen')
add('同一模板中的科目代码不能重复', 'Subject codes must be unique within a template', '同じテンプレート内で科目コードを重複させることはできません',
  'Les codes de matière doivent être uniques dans un même modèle', 'Los códigos de asignatura no pueden repetirse dentro de una plantilla',
  'Коды предметов в одном шаблоне не должны повторяться', 'Os códigos de disciplina não podem se repetir no mesmo modelo', 'Fachcodes dürfen innerhalb einer Vorlage nicht doppelt vorkommen')
add('至少一个科目', 'At least one subject is required', '科目を 1 つ以上設定してください', 'Au moins une matière est requise', 'Se requiere al menos una asignatura',
  'Нужен хотя бы один предмет', 'É necessária pelo menos uma disciplina', 'Mindestens ein Fach ist erforderlich')
add('考试类型代码不能重复', 'Exam type codes must be unique', '試験種別のコードが重複しています', 'Les codes de type d’examen doivent être uniques',
  'Los códigos de tipo de examen no pueden repetirse', 'Коды типов экзаменов не должны повторяться', 'Os códigos de tipo de exame não podem se repetir', 'Codes von Prüfungsarten dürfen nicht doppelt vorkommen')
add('模板代码不能重复', 'Template codes must be unique', 'テンプレートのコードが重複しています', 'Les codes de modèle doivent être uniques',
  'Los códigos de plantilla no pueden repetirse', 'Коды шаблонов не должны повторяться', 'Os códigos de modelo não podem se repetir', 'Vorlagencodes dürfen nicht doppelt vorkommen')
add('以下考试类型已有学员成绩，不能删除（可设为隐藏）：{0}', 'These exam types have student results and cannot be deleted (hide them instead): {0}',
  '次の試験種別には学生の成績があるため削除できません（非表示にはできます）：{0}', 'Ces types d’examen ont des résultats d’élèves et ne peuvent pas être supprimés (masquez-les plutôt) : {0}',
  'Estos tipos de examen tienen resultados de estudiantes y no se pueden eliminar (puede ocultarlos): {0}', 'Эти типы экзаменов содержат результаты учащихся и не могут быть удалены (их можно скрыть): {0}',
  'Estes tipos de exame têm resultados de alunos e não podem ser excluídos (oculte-os): {0}', 'Diese Prüfungsarten haben Schülerergebnisse und können nicht gelöscht werden (stattdessen ausblenden): {0}')
add('{0}「{1}」分数无效', '{0} “{1}”: invalid score', '{0}「{1}」の点数が無効です', '{0} « {1} » : note invalide', '{0} «{1}»: nota no válida',
  '{0} «{1}»: недопустимый балл', '{0} “{1}”: nota inválida', '{0} „{1}“: ungültige Punktzahl')
add('{0}「{1}」分数应在 0–{2} 之间', '{0} “{1}”: score must be between 0 and {2}', '{0}「{1}」の点数は 0～{2} の範囲で入力してください',
  '{0} « {1} » : la note doit être comprise entre 0 et {2}', '{0} «{1}»: la nota debe estar entre 0 y {2}', '{0} «{1}»: балл должен быть от 0 до {2}',
  '{0} “{1}”: a nota deve estar entre 0 e {2}', '{0} „{1}“: Die Punktzahl muss zwischen 0 und {2} liegen')
add('行业模板不存在', 'Industry preset not found', '業種別テンプレートが見つかりません', 'Modèle sectoriel introuvable', 'No se encuentra la plantilla por sector',
  'Отраслевой шаблон не найден', 'Modelo por segmento não encontrado', 'Branchenvorlage nicht gefunden')
add('科目代码不能重复', 'Subject codes must be unique', '科目コードが重複しています', 'Les codes de matière doivent être uniques', 'Los códigos de asignatura no pueden repetirse',
  'Коды предметов не должны повторяться', 'Os códigos de disciplina não podem se repetir', 'Fachcodes dürfen nicht doppelt vorkommen')
add('请填写考试名称', 'Enter the assessment name', '試験名を入力してください', 'Saisissez le nom de l’évaluation', 'Introduzca el nombre de la evaluación',
  'Введите название контрольной', 'Informe o nome da avaliação', 'Geben Sie den Namen der Prüfung ein')
add('请选择考试类别', 'Choose the assessment type', '試験区分を選択してください', 'Choisissez le type d’évaluation', 'Elija el tipo de evaluación',
  'Выберите тип контрольной', 'Escolha o tipo de avaliação', 'Wählen Sie die Art der Prüfung')
add('请选择考试日期', 'Choose the assessment date', '実施日を選択してください', 'Choisissez la date de l’évaluation', 'Elija la fecha de la evaluación',
  'Выберите дату контрольной', 'Escolha a data da avaliação', 'Wählen Sie das Datum der Prüfung')
add('考试类别不在可选范围内', 'The assessment type is not one of the available options', '試験区分が選択肢にありません', 'Ce type d’évaluation ne fait pas partie des options disponibles',
  'El tipo de evaluación no está entre las opciones disponibles', 'Такого типа контрольной нет среди доступных вариантов', 'O tipo de avaliação não está entre as opções disponíveis',
  'Diese Prüfungsart gehört nicht zu den verfügbaren Optionen')
add('请至少选择一项', 'Select at least one item', '1 つ以上選択してください', 'Sélectionnez au moins un élément', 'Seleccione al menos un elemento',
  'Выберите хотя бы один пункт', 'Selecione pelo menos um item', 'Wählen Sie mindestens einen Eintrag aus')
add('只能为本校区创建考试', 'You can only create assessments for your own campus', '自分の校舎の試験のみ作成できます', 'Vous ne pouvez créer des évaluations que pour votre site',
  'Solo puede crear evaluaciones para su propia sede', 'Можно создавать контрольные только для своего филиала', 'Você só pode criar avaliações para a sua unidade',
  'Sie können Prüfungen nur für Ihren eigenen Standort anlegen')
add('部分学员不存在或已删除', 'Some students do not exist or have been deleted', '一部の学生が存在しないか、削除されています', 'Certains élèves n’existent pas ou ont été supprimés',
  'Algunos estudiantes no existen o se han eliminado', 'Некоторые учащиеся не существуют или удалены', 'Alguns alunos não existem ou foram excluídos',
  'Einige Schüler existieren nicht oder wurden gelöscht')
add('考试不存在或未删除', 'The assessment does not exist or has not been deleted', '試験が存在しないか、削除されていません', 'L’évaluation n’existe pas ou n’a pas été supprimée',
  'La evaluación no existe o no se ha eliminado', 'Контрольная не существует или не была удалена', 'A avaliação não existe ou não foi excluída',
  'Die Prüfung existiert nicht oder wurde nicht gelöscht')
add('学员 {0} 不存在', 'Student {0} not found', '学生 {0} が見つかりません', 'Élève {0} introuvable', 'No se encuentra el estudiante {0}',
  'Учащийся {0} не найден', 'Aluno {0} não encontrado', 'Schüler {0} nicht gefunden')
add('考试不存在或无权查看', 'The assessment does not exist or you do not have permission to view it', '試験が存在しないか、閲覧する権限がありません',
  'L’évaluation n’existe pas ou vous n’avez pas le droit de la consulter', 'La evaluación no existe o no tiene permiso para verla',
  'Контрольная не существует или у вас нет прав на её просмотр', 'A avaliação não existe ou você não tem permissão para visualizá-la',
  'Die Prüfung existiert nicht oder Sie dürfen sie nicht ansehen')
add('没有录入成绩的权限', 'You do not have permission to enter scores', '成績を入力する権限がありません', 'Vous n’avez pas le droit de saisir des notes',
  'No tiene permiso para registrar notas', 'У вас нет прав на ввод оценок', 'Você não tem permissão para lançar notas', 'Sie haben keine Berechtigung, Noten zu erfassen')
add('{0}为必填项', '{0} is required', '{0}は必須項目です', '{0} est obligatoire', '{0} es obligatorio', 'Поле «{0}» обязательно', '{0} é obrigatório', '{0} ist ein Pflichtfeld')
add('考试类型「{0}」不存在，请先在「成绩与档案设置」中添加', 'Exam type “{0}” does not exist. Add it under “Grades & profile settings” first',
  '試験種別「{0}」が存在しません。先に「成績・プロフィール設定」で追加してください', 'Le type d’examen « {0} » n’existe pas. Ajoutez-le d’abord dans « Paramètres des notes et des fiches »',
  'El tipo de examen «{0}» no existe. Añádalo primero en «Ajustes de calificaciones y fichas»', 'Тип экзамена «{0}» не существует. Сначала добавьте его в разделе «Настройки оценок и анкет»',
  'O tipo de exame “{0}” não existe. Adicione-o primeiro em “Configurações de notas e cadastro”', 'Die Prüfungsart „{0}“ existiert nicht. Fügen Sie sie zuerst unter „Noten- und Profileinstellungen“ hinzu')
add('{0} 最多录入 {1} 回', '{0}: up to {1} attempts can be recorded', '{0} は最大 {1} 回まで登録できます', '{0} : {1} sessions maximum',
  '{0}: se pueden registrar como máximo {1} convocatorias', '{0}: можно внести не более {1} попыток', '{0}: no máximo {1} tentativas', '{0}: höchstens {1} Versuche')
add('{0} 回数只能是 1~{1}', '{0}: attempt number must be between 1 and {1}', '{0} の回数は 1～{1} で入力してください', '{0} : le numéro de session doit être compris entre 1 et {1}',
  '{0}: el número de convocatoria debe estar entre 1 y {1}', '{0}: номер попытки должен быть от 1 до {1}', '{0}: o número da tentativa deve estar entre 1 e {1}',
  '{0}: Die Versuchsnummer muss zwischen 1 und {1} liegen')
add('{0} 第 {1} 回重复', '{0}: attempt {1} is duplicated', '{0} の第 {1} 回が重複しています', '{0} : la session {1} est en double', '{0}: la convocatoria {1} está duplicada',
  '{0}: попытка {1} повторяется', '{0}: a tentativa {1} está duplicada', '{0}: Versuch {1} ist doppelt vorhanden')
add('{0} 的等级「{1}」不在可选范围内', '{0}: level “{1}” is not one of the available options', '{0} のレベル「{1}」は選択肢にありません',
  '{0} : le niveau « {1} » ne fait pas partie des options disponibles', '{0}: el nivel «{1}» no está entre las opciones disponibles',
  '{0}: уровня «{1}» нет среди доступных вариантов', '{0}: o nível “{1}” não está entre as opções disponíveis', '{0}: Die Stufe „{1}“ gehört nicht zu den verfügbaren Optionen')
add('{0} 总分应在 0–{1} 之间', '{0}: total score must be between 0 and {1}', '{0} の合計点は 0～{1} の範囲で入力してください', '{0} : le total doit être compris entre 0 et {1}',
  '{0}: el total debe estar entre 0 y {1}', '{0}: общий балл должен быть от 0 до {1}', '{0}: a nota total deve estar entre 0 e {1}', '{0}: Die Gesamtpunktzahl muss zwischen 0 und {1} liegen')

// 学生端：我的课表
add('查询范围最长 62 天', 'The date range can be at most 62 days', '検索期間は最長 62 日です', 'La période ne peut pas dépasser 62 jours',
  'El intervalo no puede superar los 62 días', 'Период не может превышать 62 дня', 'O período pode ter no máximo 62 dias', 'Der Zeitraum darf höchstens 62 Tage umfassen')

// 只读（演示 / 审计）角色
add('当前账号为只读（演示）账号，不能修改数据', 'This is a read-only (demo) account and cannot change data', 'このアカウントは閲覧専用（デモ）のため、データを変更できません',
  'Ce compte est en lecture seule (démonstration) et ne peut pas modifier les données', 'Esta cuenta es de solo lectura (demostración) y no puede modificar datos',
  'Эта учётная запись доступна только для чтения (демо) и не может изменять данные', 'Esta conta é somente leitura (demonstração) e não pode alterar dados',
  'Dieses Konto ist schreibgeschützt (Demo) und kann keine Daten ändern')
add('系统内置角色不能设为只读', 'Built-in roles cannot be made read-only', '組み込みロールは閲覧専用にできません', 'Les rôles intégrés ne peuvent pas être mis en lecture seule',
  'Los roles integrados no pueden ser de solo lectura', 'Встроенные роли нельзя сделать доступными только для чтения', 'Funções integradas não podem ser somente leitura',
  'Integrierte Rollen können nicht schreibgeschützt werden')
add('设为只读后将没有有效的超级管理员', 'Making this role read-only would leave no effective super administrator', '閲覧専用にすると有効な特権管理者がいなくなります',
  'Mettre ce rôle en lecture seule ne laisserait aucun super administrateur effectif', 'Si este rol pasa a solo lectura, no quedará ningún superadministrador efectivo',
  'Если сделать роль доступной только для чтения, не останется действующих суперадминистраторов', 'Tornar esta função somente leitura deixaria o sistema sem superadministrador efetivo',
  'Wird diese Rolle schreibgeschützt, gibt es keinen wirksamen Superadministrator mehr')
add('该账号是最后一个有效的超级管理员，不能移除其超级管理员角色或为其添加只读角色',
  'This is the last effective super administrator; its super administrator role cannot be removed and a read-only role cannot be added',
  'このアカウントは最後の有効な特権管理者のため、特権管理者ロールの解除や閲覧専用ロールの追加はできません',
  'Ce compte est le dernier super administrateur effectif : impossible de retirer son rôle ou de lui ajouter un rôle en lecture seule',
  'Esta cuenta es el último superadministrador efectivo: no se puede quitar su rol ni añadirle un rol de solo lectura',
  'Это последний действующий суперадминистратор: нельзя снять его роль или добавить роль «только чтение»',
  'Esta conta é o último superadministrador efetivo: não é possível remover sua função nem adicionar uma função somente leitura',
  'Dies ist der letzte wirksame Superadministrator: Die Rolle kann nicht entfernt und keine Nur-Lesen-Rolle hinzugefügt werden')

// 数据范围（校区）校验与安全加固
add('只能操作本校区的数据', 'You can only work with data of your own campus', '自校舎のデータのみ操作できます', 'Vous ne pouvez agir que sur les données de votre site',
  'Solo puede operar con datos de su propia sede', 'Можно работать только с данными своего филиала', 'Você só pode operar dados da sua própria unidade',
  'Sie können nur Daten Ihres eigenen Standorts bearbeiten')
add('只能在本校区排课', 'You can only schedule lessons in your own campus', '自校舎でのみ授業を登録できます', 'Vous ne pouvez planifier des cours que sur votre site',
  'Solo puede programar clases en su propia sede', 'Занятия можно назначать только в своём филиале', 'Você só pode agendar aulas na sua própria unidade',
  'Unterricht kann nur am eigenen Standort geplant werden')
add('只能在本校区办理报名', 'You can only enroll students in your own campus', '自校舎でのみ入塾手続きができます', 'Vous ne pouvez inscrire des élèves que sur votre site',
  'Solo puede matricular estudiantes en su propia sede', 'Зачислять учащихся можно только в своём филиале', 'Você só pode matricular estudantes na sua própria unidade',
  'Anmeldungen sind nur am eigenen Standort möglich')
add('无权把学员转到其他校区', 'You are not allowed to move the student to another campus', '学生を他の校舎へ移す権限がありません',
  'Vous n’êtes pas autorisé à transférer l’élève vers un autre site', 'No tiene permiso para trasladar al estudiante a otra sede',
  'Нет прав на перевод учащегося в другой филиал', 'Você não tem permissão para transferir o estudante para outra unidade',
  'Sie dürfen den Schüler nicht an einen anderen Standort verlegen')
add('该代码为保留字，请换一个', 'This code is reserved; please choose another', 'このコードは予約語です。別のコードにしてください', 'Ce code est réservé, veuillez en choisir un autre',
  'Este código está reservado; elija otro', 'Этот код зарезервирован, выберите другой', 'Este código é reservado; escolha outro', 'Dieser Code ist reserviert, bitte einen anderen wählen')
add('无权恢复其他校区的客户', 'You are not allowed to restore customers of another campus', '他の校舎の顧客を復元する権限がありません',
  'Vous n’êtes pas autorisé à restaurer les clients d’un autre site', 'No tiene permiso para restaurar clientes de otra sede',
  'Нет прав на восстановление клиентов другого филиала', 'Você não tem permissão para restaurar clientes de outra unidade',
  'Sie dürfen Kunden eines anderen Standorts nicht wiederherstellen')
add('学员 {0} 不在本次考试名单中，请先添加学员', 'Student {0} is not on the roster of this assessment; add the student first', '学生 {0} はこの試験の名簿にいません。先に学生を追加してください',
  'L’élève {0} ne figure pas dans la liste de cette évaluation ; ajoutez-le d’abord', 'El estudiante {0} no está en la lista de esta evaluación; añádalo primero',
  'Учащегося {0} нет в списке этой контрольной; сначала добавьте его', 'O estudante {0} não está na lista desta avaliação; adicione-o primeiro',
  'Schüler {0} steht nicht auf der Liste dieser Prüfung; bitte zuerst hinzufügen')
add('只能为本校区创建或修改考试', 'You can only create or edit assessments for your own campus', '自校舎の試験のみ作成・変更できます',
  'Vous ne pouvez créer ou modifier des évaluations que pour votre site', 'Solo puede crear o modificar evaluaciones de su propia sede',
  'Создавать и изменять контрольные можно только для своего филиала', 'Você só pode criar ou alterar avaliações da sua própria unidade',
  'Prüfungen können nur für den eigenen Standort angelegt oder geändert werden')
add('班课不存在，或不在您的数据范围内', 'The class does not exist or is outside your data scope', 'クラスが存在しないか、データ範囲外です',
  'La classe n’existe pas ou est hors de votre périmètre', 'El grupo no existe o está fuera de su ámbito de datos',
  'Группа не существует или находится вне вашей области данных', 'A turma não existe ou está fora do seu escopo de dados',
  'Die Klasse existiert nicht oder liegt außerhalb Ihres Datenbereichs')
add('关联班课不属于所选校区', 'The linked class does not belong to the selected campus', '関連付けたクラスは選択した校舎に属していません',
  'La classe associée n’appartient pas au site sélectionné', 'El grupo vinculado no pertenece a la sede seleccionada',
  'Связанная группа не относится к выбранному филиалу', 'A turma vinculada não pertence à unidade selecionada',
  'Die verknüpfte Klasse gehört nicht zum gewählten Standort')
add('部分学员不存在，或不在您的数据范围内', 'Some students do not exist or are outside your data scope', '一部の学生が存在しないか、データ範囲外です',
  'Certains élèves n’existent pas ou sont hors de votre périmètre', 'Algunos estudiantes no existen o están fuera de su ámbito de datos',
  'Некоторые учащиеся не существуют или находятся вне вашей области данных', 'Alguns estudantes não existem ou estão fora do seu escopo de dados',
  'Einige Schüler existieren nicht oder liegen außerhalb Ihres Datenbereichs')
add('只能为本人任课的班级排课', 'You can only schedule lessons for classes you teach', '自分が担当するクラスの授業のみ登録できます',
  'Vous ne pouvez planifier des cours que pour vos propres classes', 'Solo puede programar clases para los grupos que imparte',
  'Занятия можно назначать только для групп, которые вы ведёте', 'Você só pode agendar aulas para as turmas que leciona',
  'Unterricht kann nur für eigene Klassen geplant werden')
add('一次最多选择 400 个日期', 'You can select at most 400 dates at a time', '一度に選択できる日付は 400 件までです', 'Vous pouvez sélectionner 400 dates au maximum à la fois',
  'Puede seleccionar como máximo 400 fechas a la vez', 'За один раз можно выбрать не более 400 дат', 'Você pode selecionar no máximo 400 datas por vez',
  'Es können höchstens 400 Termine auf einmal gewählt werden')
add('一次最多添加 30 个时间段', 'You can add at most 30 time slots at a time', '一度に追加できる時間帯は 30 件までです', 'Vous pouvez ajouter 30 créneaux au maximum à la fois',
  'Puede añadir como máximo 30 franjas a la vez', 'За один раз можно добавить не более 30 интервалов', 'Você pode adicionar no máximo 30 horários por vez',
  'Es können höchstens 30 Zeitfenster auf einmal hinzugefügt werden')
add('无权把该客户转为学员', 'You are not allowed to convert this customer into a student', 'この顧客を学生に切り替える権限がありません',
  'Vous n’êtes pas autorisé à convertir ce client en élève', 'No tiene permiso para convertir este cliente en estudiante',
  'Нет прав на перевод этого клиента в учащиеся', 'Você não tem permissão para converter este cliente em estudante',
  'Sie dürfen diesen Kunden nicht in einen Schüler umwandeln')
add('只有超级管理员可以修改超级管理员账号', 'Only super administrators can edit super administrator accounts', '特権管理者アカウントを変更できるのは特権管理者のみです',
  'Seuls les super administrateurs peuvent modifier les comptes de super administrateur', 'Solo los superadministradores pueden modificar cuentas de superadministrador',
  'Изменять учётные записи суперадминистраторов могут только суперадминистраторы', 'Somente superadministradores podem editar contas de superadministrador',
  'Nur Superadministratoren können Superadministrator-Konten bearbeiten')

// 可管理校区 / 细分权限
add('没有排班课的权限，班课请由教务安排', 'You are not allowed to schedule group lessons; please ask the academic office', '集団授業を登録する権限がありません。教務に依頼してください',
  'Vous n’êtes pas autorisé à planifier des cours collectifs ; adressez-vous à l’administration', 'No tiene permiso para programar clases grupales; solicítelo a coordinación',
  'Нет прав на назначение групповых занятий; обратитесь в учебную часть', 'Você não tem permissão para agendar aulas em grupo; peça à secretaria',
  'Keine Berechtigung, Gruppenunterricht zu planen; bitte an die Verwaltung wenden')
add('可管理校区中包含不存在的校区', 'The managed campuses include one that does not exist', '管理できる校舎に存在しない校舎が含まれています',
  'Les sites gérés contiennent un site inexistant', 'Las sedes gestionadas incluyen una que no existe',
  'Среди управляемых филиалов есть несуществующий', 'As unidades gerenciadas incluem uma que não existe',
  'Unter den verwalteten Standorten ist einer, der nicht existiert')
add('只能指定自己可管理范围内的校区', 'You can only assign campuses that you manage yourself', '自分が管理できる範囲の校舎のみ指定できます',
  'Vous ne pouvez attribuer que des sites que vous gérez vous-même', 'Solo puede asignar sedes que usted mismo gestiona',
  'Можно назначать только филиалы, которыми вы управляете сами', 'Você só pode atribuir unidades que você mesmo gerencia',
  'Sie können nur Standorte zuweisen, die Sie selbst verwalten')

// 货币 / 单位
add('请选择货币', 'Please choose a currency', '通貨を選択してください', 'Veuillez choisir une devise', 'Elija una moneda', 'Выберите валюту', 'Escolha uma moeda', 'Bitte eine Währung wählen')
add('货币文字最多 12 个字', 'The currency text can be at most 12 characters', '通貨の文字は 12 文字までです', 'Le texte de la devise est limité à 12 caractères',
  'El texto de la moneda admite como máximo 12 caracteres', 'Текст валюты — не более 12 символов', 'O texto da moeda pode ter no máximo 12 caracteres', 'Der Währungstext darf höchstens 12 Zeichen lang sein')
add('请选择教室', 'Please select a room', '教室を選択してください', 'Veuillez choisir une salle', 'Seleccione un aula', 'Выберите аудиторию', 'Selecione uma sala', 'Bitte einen Raum auswählen')
add('请先填写课堂记录，再确认课时', 'Fill in the lesson record before confirming', '授業記録を入力してから確認してください', 'Remplissez le compte rendu de séance avant de confirmer', 'Complete el registro de clase antes de confirmar', 'Сначала заполните запись урока, затем подтвердите', 'Preencha o registro da aula antes de confirmar', 'Bitte zuerst das Unterrichtsprotokoll ausfüllen, dann bestätigen')
add('老师还没有填写课堂记录，暂时不能确认，请联系老师', 'The teacher has not filled in the lesson record yet, so it cannot be confirmed; please contact the teacher', '講師がまだ授業記録を入力していないため確認できません。講師にお問い合わせください', 'L’enseignant n’a pas encore rempli le compte rendu ; confirmation impossible pour le moment, contactez-le', 'El profesor aún no ha completado el registro de clase; no se puede confirmar por ahora, contáctelo', 'Преподаватель ещё не заполнил запись урока, подтверждение пока невозможно; свяжитесь с преподавателем', 'O professor ainda não preencheu o registro da aula; não é possível confirmar agora, fale com o professor', 'Die Lehrkraft hat das Unterrichtsprotokoll noch nicht ausgefüllt; Bestätigung derzeit nicht möglich, bitte wenden Sie sich an die Lehrkraft')
add('该功能暂未开放', 'This feature is not available', 'この機能は現在利用できません', 'Cette fonction n’est pas disponible', 'Esta función no está disponible', 'Эта функция недоступна', 'Este recurso não está disponível', 'Diese Funktion ist nicht verfügbar')
add('请填写打印页数', 'Please enter the number of pages to print', '印刷ページ数を入力してください', 'Veuillez indiquer le nombre de pages à imprimer', 'Indique el número de páginas a imprimir', 'Укажите количество страниц для печати', 'Informe o número de páginas a imprimir', 'Bitte die Anzahl der zu druckenden Seiten angeben')
add('至少选择一种文件格式', 'Select at least one file format', 'ファイル形式を1つ以上選択してください', 'Sélectionnez au moins un format de fichier', 'Seleccione al menos un formato de archivo', 'Выберите хотя бы один формат файла', 'Selecione pelo menos um formato de arquivo', 'Bitte mindestens ein Dateiformat auswählen')
add('首页板块不能重复', 'Home sections cannot be repeated', 'ホームのセクションは重複できません', 'Les sections de l’accueil ne peuvent pas être répétées', 'Las secciones del inicio no pueden repetirse', 'Разделы главной страницы не должны повторяться', 'As seções da página inicial não podem se repetir', 'Startseiten-Bereiche dürfen nicht doppelt vorkommen')
