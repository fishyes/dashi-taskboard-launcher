# Dashi Taskboard 雙專案 Codex 自動部署與每日維護提示詞

這份提示詞用於 Windows Codex Desktop。它會部署 Launcher 與 Taskboard、建立使用者自己的 GitHub forks、安裝 `manage-taskboard` Skill，並可選擇建立每日固定時間的來源更新與功能合併排程。

來源關係務必區分清楚：

- Taskboard 原作者／權威來源是 [`chuspeeism/dashi-taskboard`](https://github.com/chuspeeism/dashi-taskboard) 的 `main`。
- [`sperictao/dashi-taskboard`](https://github.com/sperictao/dashi-taskboard) 是上述原作者專案的直接 fork，也是 Launcher 原作者目前指定的 Taskboard submodule；它只代表 Launcher 相容維護層，不是 Taskboard 原作者。
- [`fishyes/dashi-taskboard`](https://github.com/fishyes/dashi-taskboard) 是同一 fork network 內的 Windows/Codex 整合 fork，`codex/windows-integration` 是整合分支。
- Launcher 則是另一個獨立專案：原始來源已更名為 [`sperictao/codex-pro-max`](https://github.com/sperictao/codex-pro-max)，FishYes repo 仍是 `dashi-taskboard-launcher` 的 Windows/Codex 整合 fork。

使用前只需確認：

- Codex Desktop 已登入；只有需要定期維護時，工作區才需要開放 Scheduled tasks。
- GitHub CLI `gh` 已登入可建立 fork 與 push。
- 磁碟上有可寫入的部署目錄；若未指定，提示詞預設使用 `%USERPROFILE%\CodexProjects`。
- 每日排程需要本機檔案時，電腦與 Codex Desktop 必須保持開啟。

Scheduled tasks 的建立、啟用與本機專案限制請以 [Codex 官方說明](https://learn.chatgpt.com/docs/automations) 為準。

把以下整個區塊貼入 Codex Desktop 的新對話：

```text
你是 Dashi Taskboard 的 Windows 部署與長期維護代理。請直接完成工作，不只提供教學。全程使用 PowerShell 與臺灣繁體中文；程式既有識別字、上游原文和必要命令不需翻譯。

## 目標

1. 把兩個專案部署到這台 Windows 電腦：
   - Launcher 原始來源：https://github.com/sperictao/codex-pro-max
   - Launcher 整合基線：https://github.com/fishyes/dashi-taskboard-launcher
   - Taskboard 原作者來源：https://github.com/chuspeeism/dashi-taskboard
   - Taskboard 整合基線：https://github.com/fishyes/dashi-taskboard
2. 使用目前 GitHub 登入者建立或沿用自己的兩個 forks，維護分支統一為 `codex/windows-integration`。
3. 建置 Windows NSIS 安裝包、安裝 Launcher、重裝 `manage-taskboard` Skill，並用 Launcher CLI 啟動與驗證 Taskboard/Codex 整合。
4. 依 `ENABLE_SCHEDULED_MAINTENANCE` 決定是否在 Codex Desktop 建立每日固定時間的 Scheduled task，自動檢查所有來源、理解並合併功能、修衝突、測試、push、重封裝及更新本機安裝。

## 可調參數

- `DEPLOY_ROOT`：若我在本訊息後另外指定路徑就採用該路徑；否則使用 `$env:USERPROFILE\CodexProjects`。
- `ENABLE_SCHEDULED_MAINTENANCE`：若我在本訊息後指定就照指定值；未指定時為 `false`，不得自行建立排程。
- `MAINTENANCE_TIME`：只有啟用定期維護時使用，採電腦當地時區的 24 小時制 `HH:mm`；未指定時為 `06:00`。
- `REQUIRED_CODEX_MODEL`：可選的精確模型 ID；未指定時不猜測模型名稱，也不以 UI 顯示名稱取代 API／CLI ID。
- `BRANCH`：`codex/windows-integration`。
- Launcher 目錄：`$DEPLOY_ROOT\dashi-taskboard-launcher`。
- 維護紀錄：`$DEPLOY_ROOT\dashi-maintenance`，所有 log、baseline、暫存與部署摘要只放這裡，不提交到 repo。

## 版本依賴與相容閘門

硬性條件與目前已驗證快照分開處理；快照用來重現，不代表永遠的最低版本：

- Codex Desktop：必須能登入、啟動 `app://-/index.html` 主 renderer 並接受 Launcher 的 CDP 注入。2026-08-13 已驗證 Windows App `26.803.10989.0`。
- Codex CLI：不永久硬編最低版；每次部署都比較實際解析版本與 npm `@openai/codex` 的 `dist-tags.latest`。2026-08-13 已驗證 `0.147.0`。
- Node.js：Taskboard manifest 是 `>=22.5`，但目前 Vite 8 鎖定依賴要求 `>=22.12.0`，所以有效最低版本固定採 `>=22.12.0`；已驗證 `22.14.0`。
- npm：隨合格 Node.js 安裝；已驗證 `11.4.2`。Taskboard 必須使用提交的 `package-lock.json` 與 `npm ci`。
- pnpm：Launcher 使用提交的 `pnpm-lock.yaml`；為可重現建置，使用 Corepack 啟用 `pnpm@11.16.0`，不得任意重寫 lockfile。
- Rust：`src-tauri/Cargo.toml` 宣告最低 `1.77.2`；必須使用 `x86_64-pc-windows-msvc` 或與目標架構相符的 Windows MSVC target。已驗證 `rustc/cargo 1.97.1`。
- Tauri CLI：使用 Launcher lockfile 解析的 `2.11.4`；不得另裝一份未鎖定的全域 Tauri CLI 取代專案版本。
- Windows 建置環境：x64 Windows、WebView2 Evergreen Runtime、Rust MSVC target 所需的 C++ linker，以及 NSIS/Tauri 能正常完成一次實際 build。不要只因 registry 或 PATH 有名稱就判定可用。
- Git/GitHub CLI：不硬編最低版，但 `git` 必須支援 submodule、worktree 與目前 repo 格式，`gh` 必須已登入且能建立 fork／push。已驗證 Git `2.44.0.windows.1`、gh `2.94.0`。
- 專案快照：本文件最近驗證為 Launcher `1.0.0`、Taskboard `1.0.3`；實際部署版本以 checkout 後的 manifest、tag 與 commit 為準，不得為了吻合本段文字降版。

Codex CLI 是獨立閘門，必須遵守：

1. 同時執行 `Get-Command codex -All`、shell 中的 `codex --version`，以及 Launcher 實際解析到的原生 `codex.exe --version`。只檢查 PowerShell shim 不算通過。
2. Launcher 的 resolver 順序是：`CODEX_EXECUTABLE` 明確指定值 → 真實 Codex App 內附 CLI → Windows npm 套件內的原生 CLI → PATH 中的原生 CLI。記錄最後選中的完整路徑與版本，但不要記錄憑據。
3. 以 `npm view @openai/codex dist-tags.latest` 取得當下官方 npm stable；若實際解析版本較舊，依 [Codex CLI 官方文件](https://developers.openai.com/codex/cli/) 使用 `npm install -g @openai/codex@latest` 更新，再重新解析原生 `.exe` 並驗證版本。不得只更新 shim 後就宣告成功。
4. 若 resolver 優先選到較舊的 App 內附 CLI，先更新 Codex Desktop；若 App 尚無新版而 npm 原生 CLI 已合格，可將 `CODEX_EXECUTABLE` 指向已驗證的 npm 原生 `.exe`，重啟 Launcher 後再驗證。不得指向 `codex.ps1`、`codex.cmd` 或無副檔名 shim。
5. 若指定 `REQUIRED_CODEX_MODEL`，使用解析後的 CLI 在維護目錄執行一次 `codex exec --ephemeral --sandbox read-only --skip-git-repo-check --model <精確ID>` 最小連線診斷。CLI 已是 stable 最新但模型仍不可用時，回報帳號權限／分批開放／模型 ID 問題；不得無限重裝 CLI。
6. Codex Desktop 下拉選單與 CLI 模型能力分開驗證。CLI 更新成功不等於 App UI 一定立即顯示新模型；必要時依 [Codex Windows 官方文件](https://developers.openai.com/codex/app/windows/) 更新／重啟 App，再確認帳號是否已取得模型。

## 授權與禁止事項

我授權你在 `DEPLOY_ROOT` 內建立／修改檔案、安裝缺少的公開開發工具、建立我的 GitHub forks、commit、正常 push、建置與安裝 Launcher、重裝 Skill，以及僅在選項啟用時建立 Codex Scheduled task。

必須遵守：

- 不得 force push、刪除遠端分支、建立 tag、建立 GitHub Release、公開發布安裝包或修改上游 repo。
- 不得覆蓋、stash、reset、clean 或刪除不明的使用者修改。
- 不得把 instance token、instance secret、GitHub token 或其他憑據寫進 log、commit 或回覆。
- 只終止經執行檔完整路徑與命令列確認、確實屬於本 Launcher 的程序；不得用模糊名稱批次終止程序。
- Codex App 已存在且通過上述閘門時不要無故重裝；Codex CLI 則必須依上述 stable 版本與實際 resolver 檢查更新。若已是 stable 最新但指定模型仍不可用，不得反覆重裝。
- 若需要 UAC、重新啟動 Codex，或安裝 Visual Studio C++ workload，先用一句話告知我要確認的動作；完成後自動接續，不要讓我重貼整份提示詞。
- 公開散布前必須重新確認兩個原始專案及所有依賴當下的授權條款；本流程只做個人 fork 與本機部署，不自動公開散布二進位安裝包。

## 完成條件

只有下列項目全部成立才可宣告完成：

- 兩個本機 repo 都在 `codex/windows-integration`，remotes 正確，工作樹乾淨，分支已 push 到我的 forks。
- Launcher submodule URL 指向我的 Taskboard fork，submodule commit 已先存在於我的 Taskboard fork。
- Taskboard 聚焦測試與 Web build 通過；Launcher 測試、前端 build、Rust 測試及 NSIS build 通過。
- 安裝檔與安裝目錄的關鍵 CLI/injector 檔案雜湊一致。
- `dashi-launcher.cmd skill reinstall`、`start`、`status --json` 成功。
- Codex CLI shell 版本、Launcher 實際解析路徑／版本均已記錄；若指定模型，最小只讀模型診斷成功。
- Codex 主 renderer 中注入版本存在、Taskboard frame ready 且可見，繁中儀表板與至少一個 API 請求成功。
- 若 `ENABLE_SCHEDULED_MAINTENANCE=true`，指定時間的排程已啟用，工作目錄與下方維護提示詞正確，能在 Scheduled 中看到下一次執行時間；若為 `false`，確認沒有因本次部署新增排程。

## 第一階段：環境預檢

1. 建立 `DEPLOY_ROOT` 與維護紀錄目錄，解析成絕對路徑並確認都位於使用者指定範圍內。
2. 執行並記錄版本：
   - `git --version`
   - `gh --version` 與 `gh auth status`
   - `node --version`，有效最低版本必須 `>=22.12.0`
   - `npm --version`、`corepack --version`，並以 Corepack 啟用／驗證 `pnpm@11.16.0`
   - `rustc --version`、`cargo --version`、`rustc -vV`，Rust 必須 `>=1.77.2` 且 target 與 Windows 架構相符
   - `pnpm exec tauri --version`，版本必須來自 Launcher lockfile
   - `Get-Command codex -All`、`codex --version`、npm stable 最新版，以及 Launcher resolver 實際選中的原生 CLI 路徑／版本
   - Windows WebView2 與 Tauri 所需的 MSVC/C++ Build Tools
3. 若啟用排程，嚴格驗證 `MAINTENANCE_TIME` 符合 `^(?:[01]\d|2[0-3]):[0-5]\d$`；不符合就停止要求修正，不猜測上午／下午。
4. 只補齊缺少或未達相容閘門的工具。優先使用 `winget`、Node 內建 Corepack 與 rustup；不改用來路不明的二進位檔。
5. 以 `gh api user --jq .login` 取得 `GITHUB_OWNER`。若 GitHub 未登入，停止並只要求我完成 `gh auth login`。

## 第二階段：建立 forks 與 checkout

GitHub 關係固定為：

Launcher：

- `origin`：`https://github.com/$GITHUB_OWNER/dashi-taskboard-launcher.git`
- `integration`：`https://github.com/fishyes/dashi-taskboard-launcher.git`
- `upstream`：`https://github.com/sperictao/codex-pro-max.git`

Taskboard submodule：

- `origin`：`https://github.com/$GITHUB_OWNER/dashi-taskboard.git`
- `integration`：`https://github.com/fishyes/dashi-taskboard.git`
- `canonical`：`https://github.com/chuspeeism/dashi-taskboard.git`（Taskboard 原作者／權威來源）
- `launcher-fork`：`https://github.com/sperictao/dashi-taskboard.git`（Launcher 原作者的相容維護 fork）

執行規則：

1. 用 `gh repo view` 判斷 forks 是否已存在；不存在才用 `gh repo fork` 建立。若 GitHub 不允許建立 fork，不可偷偷改成無關的 mirror repo，保留錯誤並詢問我是否改用 private mirror。
2. Launcher 目錄不存在時，從 FishYes 整合 repo clone，包含 submodule；已存在時先確認它就是正確 repo，不能覆蓋同名資料夾。
3. 設定上述 remotes，fetch branches 與 tags。
4. Launcher 從 `integration/codex/windows-integration` 建立／切到本機 `codex/windows-integration`。
5. 初始化 `vendor/dashi-taskboard`，設定 Taskboard remotes，再從 `integration/codex/windows-integration` 建立／切到同名分支。
6. 先把 Taskboard 分支正常 push 到我的 Taskboard fork。
7. 把 Launcher `.gitmodules` 的 submodule URL 改成我的 Taskboard fork，執行 `git submodule sync`，確認 submodule 指標指向剛才已 push 的 commit；若有變更，以 `chore: configure personal Taskboard fork` 提交。
8. 正常 push Launcher 分支。兩層都禁止 force push。

## 第三階段：首次建置與基線

先讀兩層 `AGENTS.md`、README、package scripts、Tauri config、立即呼叫端與測試，再動手。

Taskboard（`vendor/dashi-taskboard`）：

1. `npm ci`；若 lockfile 與平台不相容，先查原因，不要直接刪 lockfile。
2. 執行：
   - `node --test test/codex-executable.test.mjs test/inject.test.mjs test/injector.test.mjs`
   - `npm run typecheck`
   - `npm run build:web`
3. 若本機有 Chrome/Chromium，再設定 `CHROME_PATH` 執行 `node --test test/inject-fullheight-regression.test.mjs`。
4. 執行一次 `npm test` 建立 Windows baseline，完整輸出寫入維護紀錄並摘要 pass/fail/skip 與失敗簽章。目前已知 Windows 類型包括 `.ts` 直接載入、假的 `.mjs` 執行檔 `spawn EFTYPE`、symlink `EPERM` 與部分 source-extraction 測試；不得把已知平台失敗冒充本輪回歸，也不得把新失敗塞進 baseline。

Launcher：

1. 啟用 Corepack，執行 `pnpm install --frozen-lockfile`。
2. 執行：
   - `pnpm test`
   - `pnpm build`
   - `cargo test --manifest-path src-tauri/Cargo.toml`
   - `pnpm tauri build --bundles nsis`
3. NSIS 應位於 `src-tauri\target\release\bundle\nsis\`。記錄檔名、版本、大小與 SHA-256。
4. 建置流程若讓 Taskboard `package-lock.json` 只因平台 optional dependency 產生機械變動，確認 diff 後還原該建置副作用；不可連真正的 dependency 更新一起丟掉。

## 第四階段：安裝與實機驗證

1. 若已安裝 Launcher，先使用：
   - `$launcher = "$env:LOCALAPPDATA\Codex Pro Max\dashi-launcher.cmd"`
   - 若仍是 1.0.0 前的舊安裝，才回退到 `$env:LOCALAPPDATA\Dashi Taskboard Launcher\dashi-launcher.cmd`。
   - `& $launcher stop`
2. 安裝新版前，只能終止完整路徑等於安裝目錄內 `codex-pro-max.exe`（舊版為 `dashi-taskboard-launcher.exe`）的 Launcher；不能批次終止所有同名或 Node 程序。
3. 以 NSIS `/S` 安裝，檢查退出碼為 0。
4. 比對原始碼與安裝目錄中的下列 SHA-256：
   - `dashi-launcher-cli.mjs`
   - `dashi-launcher.cmd`
   - `vendor/dashi-taskboard/scripts/codex-injector.mjs`
   - `vendor/dashi-taskboard/inject/codex-taskboard.user.js`
5. 執行：
   - `& $launcher skill reinstall`
   - `& $launcher start`
   - `& $launcher status --json`
6. 若 CDP 只有 `avatar-overlay` 而暫時沒有 `app://-/index.html` 主 renderer，先重新啟用 Codex 主視窗並等待 resident injector 自動補注入；這不等於 renderer crash。若 Codex 本來未使用 CDP 啟動，才請我允許關閉並由 Launcher 重啟。
7. 透過 loopback CDP 只讀驗證：
   - `window.__codexTaskboardInjection__` 存在且 ready。
   - 外層頁面與 `codex-taskboard-frame` 可見，狀態 placeholder 已隱藏。
   - frame 維持 opaque `null` origin，以 `Page.setDocumentContent` 載入。
   - 已認證 resident injector 的 CDP Fetch proxy 只代理目前 instance token 路徑。
   - frame 內可讀到「儀表板／議題看板／列表檢視／甘特圖」之一，且一個專案 API 回傳成功。
8. 不在輸出中顯示 instance token 或 secret。

## 第五階段：依選項建立每日 Codex Scheduled task

1. 若 `ENABLE_SCHEDULED_MAINTENANCE=false`，完全跳過建立／修改排程；回報「已依設定停用定期維護」，但不要刪除使用者原有的同名或其他排程。
2. 若 `ENABLE_SCHEDULED_MAINTENANCE=true`，使用 Codex Desktop 的 Scheduled tasks 建立：

   - 名稱：`Dashi Taskboard 每日來源同步與部署`
   - 時間：每天電腦當地時間 `MAINTENANCE_TIME`
   - 執行位置：Launcher 的實際絕對路徑
   - 模式：本機專案，不使用臨時 worktree
   - 狀態：啟用

建立時，把下方 `{{LAUNCHER_DIR}}`、`{{MAINTENANCE_DIR}}` 與 `{{REQUIRED_CODEX_MODEL}}` 換成實際值；沒有指定模型時把最後一項寫成 `未指定`。若目前 workspace 沒開放 Scheduled tasks，不能假裝建立成功；請輸出已代換完成的排程提示詞及 `MAINTENANCE_TIME`，讓我在 Codex Desktop 的 Scheduled 頁面貼上。

### 每日排程提示詞

依本排程每天維護 Dashi Taskboard Windows 整合並在有更新時重新部署。工作目錄固定為 `{{LAUNCHER_DIR}}`；所有 log、baseline、暫存與摘要只寫入 `{{MAINTENANCE_DIR}}`。需要驗證的 Codex 模型為 `{{REQUIRED_CODEX_MODEL}}`。使用臺灣繁體中文回報。

維護分支固定為：

- Launcher：目前 GitHub 使用者 fork 的 `codex/windows-integration`
- Taskboard submodule：目前 GitHub 使用者 fork 的 `codex/windows-integration`
- FishYes Launcher 整合：`integration/codex/windows-integration`
- Launcher 原始來源：`upstream/main`
- FishYes Taskboard 整合：`integration/codex/windows-integration`
- Taskboard 原作者／權威來源：`canonical/main`
- Launcher 相容維護 fork：`launcher-fork/main`

每輪規則：

1. 先確認 Launcher 與 `vendor/dashi-taskboard` 都在 `codex/windows-integration`，remotes 與 submodule URL 正確，沒有未提交的 tracked 使用者修改。不得 stash、reset、clean、覆蓋或刪除不明修改；只有能從維護紀錄證明是上一輪留下的安全續作內容才可接續，否則停止並回報。
2. 依「版本依賴與相容閘門」記錄工具版本。特別比較 Launcher resolver 實際選中的 Codex CLI 與 npm stable；較舊才更新並重新解析。若設定了精確模型 ID，更新後做最小只讀診斷；CLI 已最新但模型仍不可用時停止重裝並回報帳號／模型可用性。只有 manifest、lockfile 或上游建置需求提高門檻時才升級其他工具。
3. Launcher fetch `origin/integration/upstream` 的 branches 與 tags；Taskboard fetch `origin/integration/canonical/launcher-fork` 的 branches 與 tags。記錄合併前所有來源 commit，使用 ancestry 與 changed-file 比對判斷真正新增內容。
4. 先處理 Taskboard：依序整合 FishYes `integration/codex/windows-integration`、原作者 `canonical/main`，最後只整合 `launcher-fork/main` 尚未包含的 Launcher 相容 commit。`canonical/main` 是核心功能的權威來源；不得以落後的 `launcher-fork/main` 取代或回退 canonical 功能。若前一來源已包含後一來源，不製造多餘 merge commit。
5. 合併時保留並驗證：Windows 原生 Codex resolver、臺灣繁中導航與穩定入口錨點、opaque sandbox、`Page.setDocumentContent`、已認證且限 instance token 的 CDP loopback proxy、opaque iframe 輪詢 fallback、taskctl 與 `manage-taskboard` Skill。不得只選 ours/theirs；閱讀雙方呼叫路徑與測試，主動形成同時保留新上游功能與 Windows 整合的解法。
6. Taskboard 有變更時，至少執行：
   - `node --test test/codex-executable.test.mjs test/inject.test.mjs test/injector.test.mjs`
   - `npm run typecheck`
   - `npm run build:web`
   - 與上游變更檔案直接相關的測試
   - 有 Chrome 時執行 `test/inject-fullheight-regression.test.mjs`
   可執行 `npm test` 並與保存的 Windows baseline 比較；只有新增或與本輪相關的失敗才是回歸。主動診斷並修復，不能只列出錯誤。
7. Taskboard 驗證成功後，提交清楚的 merge/fix commit，正常 push 至 Taskboard `origin/codex/windows-integration`；禁止 force push。未 push 的 submodule commit 不得交給 Launcher 引用。
8. 再處理 Launcher：整合 FishYes `integration/codex/windows-integration` 與 `upstream/main` 尚未包含的 commit，保留 Launcher CLI、`--cli-daemon` 不搶焦點、Skill/CLI 封裝、Windows Skill 實體複製 fallback、乾淨退出程序、目前使用者的 Taskboard fork URL，以及剛驗證並 push 的 submodule commit。
9. Launcher 或 submodule 指標有變更時，執行：
   - `pnpm install --frozen-lockfile`
   - `pnpm test`
   - `pnpm build`
   - `cargo test --manifest-path src-tauri/Cargo.toml`
   - `pnpm tauri build --bundles nsis`
   測試或建置失敗時主動查根因並修復，直到通過或確認需要產品決策／外部狀態。
10. 驗證成功後正常 push Launcher `origin/codex/windows-integration`，禁止 force push。不要自動改 major 版本、tag 或建立 Release；本機部署可沿用來源版本重新建置。
11. 有 runtime 更新時，用已安裝的 `dashi-launcher.cmd` 依序 `stop`，靜默安裝新 NSIS，執行 `skill reinstall`、`start`、`status --json`，再做 Codex frame ready、繁中介面與 API 實機驗證。只能終止路徑已確認屬於 Launcher 的程序。若只有文件或不進封裝白名單的 submodule 內容變更，先以關鍵檔案雜湊證明 runtime 相同，再跳過中斷服務的重裝。
12. 沒有更新時不重建、不重裝、不製造空 commit。回報各來源與本機分支 commit 相同。
13. 只有遇到下列狀況才停止：需要產品決策、無法安全判斷的破壞性重構、GitHub／憑證失效、必需外部服務不可用、需要 UAC 或需要關閉有未保存工作的 Codex。保留現場與完整證據，不可猜測或破壞性處理。
14. 每輪摘要必須包含：所有來源 commit、採納的上游功能、衝突與修復、兩層新 commit、Codex CLI shell／resolver 版本、指定模型診斷、測試／建置結果、安裝與 Skill 狀態、是否 push、剩餘風險。不得輸出任何 token 或 secret。

## 最終回報格式

首次部署完成後回報：

1. 部署根目錄與兩層 repo 路徑。
2. GitHub forks、remotes、分支與 commit。
3. 工具版本與只在本輪新增的套件。
4. Taskboard/Launcher 測試及 Windows baseline。
5. NSIS 路徑、版本、大小與 SHA-256。
6. CLI、Skill、服務與 Codex 內嵌面板實機結果。
7. `ENABLE_SCHEDULED_MAINTENANCE`、指定時間；若啟用則回報 Scheduled task 名稱、當地時區、下一次執行時間與工作目錄，若停用則明確回報未建立／修改排程。
8. 尚未確認的限制或需要我做的唯一下一步。
```

## 維護原則

這份提示詞不把「自動合併」解讀為無條件接受上游。Codex 必須先理解變更、保留 Windows 整合，再由測試、建置與實機結果決定是否 push 和部署。需要產品決策或無法安全解讀的重構會保留現場並停止，不會以 `ours`、`theirs`、force push 或空 commit 掩蓋問題。
