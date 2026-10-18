# My Apps — board + @my99apps_bot

Source of the app board and Telegram bot that list Thanoon12k's apps by status.

| File | What |
|---|---|
| `bot.ts` | Supabase Edge Function `my-apps-bot` (project `axncazensmjdqpczvzwf`, `verify_jwt: false`) |
| `board.html` | The board website (claude.ai artifact `BLhV3nNdM13SQon6WXvaWi`) |
| `workflow-template.yml` | GitHub Actions workflow that builds an APK and publishes it to the board |

Data lives in the `app_manager` schema (apps, comments, chats, bot_settings); builds in the private
Storage bucket `app-builds`.

## Connect a new Flutter repo

1. Copy `workflow-template.yml` to the repo as `.github/workflows/my-apps.yml`.
2. Put the app's public `.env` lines under `APP_ENV` (or `''` if it has none).
3. Push to `main`, then run it from the Actions tab — or push a tag: `git tag v1.0.0 && git push --tags`.

The app appears in **Developing** with its APK. No secrets: the bot accepts GitHub OIDC tokens from
repos owned by `Thanoon12k` on `main`/`master` or a tag. The APK name comes from the repo name and
`pubspec.yaml` version. If release signing needs `key.properties`, make it fall back to the debug key
when the file is missing (see Pediatric-Clinic-manager's `android/app/build.gradle.kts`).

## Rules

- Only the owner can download apps that aren't Released; everyone with the PIN can download Released ones.
- Moving an app to Released (on the board) tells everyone on the bot.
- Anyone with access can comment on any app; the owner gets each comment on Telegram.
- Files are only sent when someone presses Download.
