# 学航 · 教学管理平台

开源的 **CRM + 教学管理系统**，适用于各类培训机构：升学私塾、中小学学科辅导、语言培训、职业技能与兴趣培训等。一套系统串起招生跟进、报名缴费、排课约课、成绩管理和教学服务。

不同行业的差异用 **行业模板** 处理：考试类型、成绩科目、档案字段、下拉选项和教授课程都可以一键导入，导入后也能逐项修改。

[English](README.en.md) · [功能介绍](docs/功能介绍.md) · [使用指南](docs/使用指南.md) · [部署指南](docs/部署指南.md)

![信息中心](docs/screenshots/dashboard.png)

## 核心亮点

- **行业模板，一键适配**：内置「日本升学私塾」「中国中小学培训机构」「语言培训机构」「通用培训机构（精简）」四套模板，安装时选好，之后也可以随时重新导入。
- **成绩管理**：可以建月考、模拟考、期中期末等考试，按科目模板生成成绩表，支持从 Excel 粘贴。系统自动算总分（各科相加 / 平均 / 手填）和排名，给出均分、及格率与分数段分布，结果可导出 Excel、发布到学生端；学员页有成绩趋势图。
- **成绩科目可自定义**：学员档案里的考试与证书都能配置，包括等级、满分、分科成绩、可录回数和固定考试月份，例如 JLPT、EJU、雅思（取均分）、托福、中考、高考、四六级。
- **档案字段可自定义**：档案中每个字段都可以单独设置是否显示、是否必填，并改成本机构的叫法（如把「最终学历」改为「年级」，「语言学校」改为「就读学校」）。
- **从招生到在读**：客户跟进、公海领取、报名建档、套餐选购、缴费与退费记录前后衔接。
- **统一教室排期**：班课、一对一（VIP）和其他占用共用一张课表，自动检测教室、教师和学员的时间冲突；支持按日期区间和星期批量排课。
- **课时账本**：一对一课时按总课时、已确认、待确认、剩余分开记账，学生可自行确认，也可在下课后自动确认，自动确认可在后台开关。
- **教学服务**：班课点名、面谈与面试预约、文书批改、打印计费、通知公告、资料下载。
- **权限分工**：按职务分配权限，数据范围可设为本人、本校区或全部，每个账号还能单独勾选额外可管理的校区；排课和成绩权限做了细分（班课默认只能由教务排，成绩分为查看、录入、发布、管理）；薪资审核范围可以按审核人单独配置。内置「只读管理员」角色，能看全部、不能改任何数据，适合公开演示或审计。
- **学生课表**：学生端「我的课表」把教务排的班课和一对一课程放在同一个周 / 月日历里，可查看教室、老师、出勤和课堂记录，上完的一对一课程可直接确认课时。
- **双端 + 多语言 + 手机端**：教职工后台与学生端入口分开，页面适配手机，界面支持 8 种语言。
- **部署灵活**：提供 Docker 镜像和一键部署脚本；支持 SQLite、MySQL / MariaDB、PostgreSQL；首次安装在浏览器中完成。SMTP 邮件支持站内提醒同步发邮件和找回密码。

## 功能截图

| 教室预约（按教室排期） | 周视图 |
|---|---|
| ![教室预约](docs/screenshots/schedule-board.png) | ![周视图](docs/screenshots/schedule-week.png) |

| 成绩录入（排名、低于及格线标红） | 统计分析 |
|---|---|
| ![成绩录入](docs/screenshots/grades-entry.png) | ![统计分析](docs/screenshots/grades-stats.png) |

| 学员的校内考试趋势 | 学员档案：可配置的考试 / 证书成绩 |
|---|---|
| ![学员成绩趋势](docs/screenshots/student-grades.png) | ![档案成绩录入](docs/screenshots/student-form.png) |

| 行业模板 | 考试类型配置 |
|---|---|
| ![行业模板](docs/screenshots/settings-presets.png) | ![考试类型](docs/screenshots/settings-exams.png) |

| 客户管理 | 报表统计 |
|---|---|
| ![客户管理](docs/screenshots/crm-customers.png) | ![报表统计](docs/screenshots/crm-stats.png) |

| 学员详情 | 订单记录 |
|---|---|
| ![学员详情](docs/screenshots/student-detail.png) | ![订单记录](docs/screenshots/orders.png) |

| 学生端：我的课表（班课 + 一对一） | 学生端首页 |
|---|---|
| ![我的课表](docs/screenshots/portal-timetable.png) | ![学生端](docs/screenshots/portal-home.png) |

| 课程表（班课 + VIP 同一日历） | 后台搜索（Ctrl+K） |
|---|---|
| ![课程表](docs/screenshots/timetable.png) | ![搜索](docs/screenshots/global-search.png) |

| 业务规则：打印费 / 工资货币可选日元、人民币或自定义 | 可管理校区 |
|---|---|
| ![货币设置](docs/screenshots/rules-currency.png) | ![可管理校区](docs/screenshots/user-managed-campuses.png) |

| 多语言（英语） | 多语言（日语） |
|---|---|
| ![English](docs/screenshots/en-grades-stats.png) | ![日本語](docs/screenshots/ja-settings-presets.png) |

<p align="center">
  <img src="docs/screenshots/mobile-portal-timetable.png" alt="手机端：我的课表" width="260" />
  &nbsp;&nbsp;
  <img src="docs/screenshots/mobile-portal-grades.png" alt="手机端：我的成绩" width="260" />
  &nbsp;&nbsp;
  <img src="docs/screenshots/mobile-board.png" alt="手机端：教室预约" width="260" />
</p>

## 功能总览

| 模块 | 主要功能 |
|---|---|
| 信息中心 | 最新通知、资料、岗位待办、今日本人课程与面谈、我的日报、全员日报 |
| 客户管理 | 我的客户、公海客户、全部客户、跟进、渠道管理、合作机构、报表统计、业绩排行 |
| 学员管理 | 新学员报名、我的／全部在籍学员、档案、考试与证书、录取信息、**成绩管理**、订单记录、缴费明细、退费记录、单期课程、套餐课程 |
| 教务管理 | 教室预约、课程表、月课表、批量排课、一对一（VIP）班级、班课管理、教室管理 |
| 教师中心 | 学校通知、我的课表、我担当的学生、课堂记录、资料下载、工资申报 |
| 教学服务 | 出勤管理、面谈预约、面试预约、面谈&面试记录、文书修改、资料打印、通知公告、资料管理 |
| 人事管理 | 薪资申请管理、按人汇总、Excel 导出、薪资审核范围 |
| 系统设置 | 站点设置（名称 / Logo / 登录页文案 / 主题色）、业务规则与下拉选项、**成绩与档案设置**（行业模板 / 考试类型 / 成绩模板 / 档案字段）、邮件、工号、职务权限、校区、教授课程、操作日志 |
| 学生端 | 首页、**我的课表**（班课 + 一对一，周 / 月视图）、**我的成绩**、我的课时、面谈／面试预约、文书修改、资料打印、通知公告、资料下载 |

菜单和操作按账号权限显示。业务规则和已知限制见[功能介绍](docs/功能介绍.md)。

## 行业模板

| 模板 | 考试 / 证书 | 成绩模板 | 档案调整 |
|---|---|---|---|
| 日本升学私塾（默认） | JLPT、EJU（3 回、8 科）、托福、托业、雅思 | EJU 文科 / 理科模考、JLPT 模考、单科测验 | 完整的升学档案字段 |
| 中国中小学培训机构 | 中考、高考（语数外 + 理化生政史地）、剑桥英语、学科竞赛 | 小学语数英、初中五科、高中（物化生 / 政史地）、单科测验 | 「学历」改为「年级」，「语言学校」改为「就读学校」，隐藏签证、来日时间等 |
| 语言培训机构 | 雅思（取均分）、托福、托业、四六级、JLPT（分项） | 雅思 / 托福 / 托业 / JLPT 模考、单科测验 | 「罗马字名」改为「英文名」，增加课程方向、学习目的 |
| 通用培训机构（精简） | 证书 / 等级考试 | 理论 + 实操、单科测验 | 精简为常用字段 |

导入不会删除已有数据：学员成绩里已经在用的考试类型会保留为隐藏，原有的下拉选项也保留为隐藏，教授课程只会新增。

## 多语言

界面支持简体中文（`zh-CN`）、英语（`en`）、日语（`ja`）、法语（`fr`）、西班牙语（`es`）、俄语（`ru`）、葡萄牙语（巴西，`pt`）和德语（`de`），在语言切换器里选择，偏好保存在当前浏览器。行业模板自带的考试、科目和选项名称会随语言翻译；用户自己填写的名称、姓名、通知正文等内容不翻译。

## 技术栈

| 层次 | 技术 |
|---|---|
| 运行环境 | Node.js 22+（推荐 24）、npm workspaces、TypeScript |
| 后端 `server/` | Fastify 5、Prisma 7（多文件 schema + 驱动适配器）、Zod 4、JWT、bcrypt、Nodemailer |
| 数据库 | SQLite（默认）、MySQL / MariaDB、PostgreSQL |
| 前端 `web/` | Vue 3、Vite 8、Element Plus、Pinia、Vue Router、vue-i18n 11 |
| 导出 | ExcelJS |

## 快速开始

### Docker 一键部署（推荐）

```bash
git clone https://github.com/MRTangwin8/XueHang.git
```

```bash
cd XueHang && ./deploy.sh
```

脚本会构建镜像并启动服务，然后显示安装码。标准做法是学航在 Docker 里只监听本机 `127.0.0.1:8080`，前面用 Nginx 或 IIS 做反向代理并提供 HTTPS；配好后在浏览器里按向导填安装码、选择数据库和行业模板、创建管理员。只想临时试用可以用 `DIRECT=1 ./deploy.sh`，直接访问 `http://服务器IP:8080`。镜像不含数据库服务：默认使用 SQLite，也可以在向导里填写已有的 MySQL / PostgreSQL。数据都在 `./data` 目录。

带截图的完整步骤（Nginx / IIS 反向代理配置、备份、升级、搭建只读演示站、不用 Docker 的部署方式）见[部署指南](docs/部署指南.md)。

### 从源码运行

```bash
npm install
npm run dev:server   # 终端 1：后端（未配置数据库时进入安装模式）
npm run dev:web      # 终端 2：前端
```

如果没有配置 `DATABASE_URL`，后端启动时会进入安装模式。用浏览器打开 `http://localhost:5173`，输入控制台打印的安装码（也保存在 `server/.install-token`），按向导依次选择数据库、填写站点与校区、选择**行业模板**、创建管理员。安装完成后，系统会在同一进程内直接切换到正式应用。生产环境需要先构建前端（`cd web && npm run build`），再用 Nginx 等反向代理部署，详见[部署指南](docs/部署指南.md)。

### 本地开发与演示

将 `server/.env.example` 复制为 `server/.env`，保留其中的开发用 SQLite 地址，并填一个随机的 `JWT_SECRET`：

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

初始化演示数据库：

```bash
npm run db:generate -w server
cd server && npx prisma db push && npm run db:seed && cd ..
```

在两个终端中分别启动：

```bash
npm run dev:server
```

```bash
npm run dev:web
```

教职工后台：`http://localhost:5173/`；学生端：`http://localhost:5173/portal`。

### 演示账号

| 角色 | 账号 | 密码 |
|---|---|---|
| 超级管理员 | `admin` | `admin123` |
| 教务 | `jw01` | `123456` |
| 市场销售 | `sales01` | `123456` |
| 教师 | `t01`～`t04` | `123456` |
| 事务 | `sw01` | `123456` |
| 只读管理员（演示） | `demo` | `demo123456` |
| 学生端 | `S2026001`～`S2026006` | `123456` |

以上账号只存在于用 `npm run db:seed` 建立的本地演示库。通过安装向导导入演示数据时，这些账号会被自动锁定，需要由管理员解锁并重置密码。

## 文档

| 文档 | 内容 |
|---|---|
| [功能介绍](docs/功能介绍.md) | 产品能力、业务规则与适用边界 |
| [使用指南](docs/使用指南.md) | 管理员、教务、销售、教师、事务与学生的常见操作 |
| [部署指南](docs/部署指南.md) | 安装向导、多数据库、构建、反向代理、备份与上线检查 |
| [安全说明](docs/安全说明.md) | 安全措施、已知遗留项、上线前检查清单 |
| [第三方许可](docs/第三方许可.md) | 依赖许可审计 |
| [开发约定](docs/开发约定.md) · [i18n 约定](docs/i18n约定.md) | 目录、接口与多语言维护规范 |

## 安全概要

系统已具备以下措施：密码哈希、登录失败限流、JWT 认证、接口权限检查、上传文件类型与文件头校验、上传文件需登录才能访问、操作日志。生产环境必须配置强 JWT 密钥和 HTTPS，备份数据库与上传文件，并停用演示账号。上线前请完整阅读[安全说明](docs/安全说明.md)。

## 许可证

本项目以 [Apache License 2.0](LICENSE) 开源，版权与第三方说明见 [NOTICE](NOTICE)。

## 反馈与支持

- 需要新功能或发现问题：欢迎[提交 Issue](https://github.com/MRTangwin8/XueHang/issues)。
- 需要部署帮助：请发邮件至 [mrtangwin8@gmail.com](mailto:mrtangwin8@gmail.com)。
