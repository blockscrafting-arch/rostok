# =============================================================
# Тест POST /api/onboarding — все 4 сценария аудио
# =============================================================
# На сервере (секрет из .env автоматически):
#   cd ~/rostok/content-factory && chmod +x scripts/test-onboarding.sh && ./scripts/test-onboarding.sh
#
# С этого ПК (нужен секрет вручную):
#   .\test-onboarding.ps1 -BaseUrl "https://bot.ex-ai.pro" -Secret "секрет_из_.env_на_сервере"
# =============================================================

param(
    [string]$BaseUrl = "https://bot.ex-ai.pro",
    [string]$Secret  = "ВСТАВЬТЕ_СЕКРЕТ_ИЗ_env"
)

$Url     = "$BaseUrl/api/onboarding"
$Headers = @{ "Authorization" = "Bearer $Secret"; "Content-Type" = "application/json" }

function Invoke-Test {
    param([string]$Name, [hashtable]$Body)
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "ТЕСТ: $Name" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    $json = $Body | ConvertTo-Json -Depth 10
    Write-Host "Запрос:`n$json" -ForegroundColor Gray
    try {
        $resp = Invoke-RestMethod -Uri $Url -Method Post -Headers $Headers -Body $json -ErrorAction Stop
        Write-Host "Ответ (201): $($resp | ConvertTo-Json -Depth 5)" -ForegroundColor Green
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        $msg    = $_.ErrorDetails.Message
        Write-Host "Ответ ($status): $msg" -ForegroundColor Yellow
    }
}

# --- ТЕСТ 1 ---
# Сценарий: И текст, И аудио на одном шаге.
# Ожидаем: аудио игнорируется, берётся текст.
# Лог:     INFO Audio ignored: text answer takes priority {step: 1}
Invoke-Test -Name "1. Текст + Аудио (аудио должно игнорироваться)" -Body @{
    user    = @{ name = "Тест Текст+Аудио"; email = "test_audio1@example.com" }
    answers = @(
        @{ step = 1; question = "Расскажите о бизнесе"; answer = "Мы продаем розы."; audio = "https://file-examples.com/storage/fe2c92e1cc67c9d9f52f865/2017/11/file_example_MP3_700KB.mp3" }
    )
}

# --- ТЕСТ 2 ---
# Сценарий: Только аудио (правильный вариант, answer = null).
# Ожидаем: файл скачается, расшифруется.
# Лог:     INFO Audio download started, INFO Audio file downloaded, INFO Audio transcribed
Invoke-Test -Name "2. Только аудио (answer: null)" -Body @{
    user    = @{ name = "Тест Только Аудио"; email = "test_audio2@example.com" }
    answers = @(
        @{ step = 1; question = "Расскажите о себе"; answer = $null; audio = "https://file-examples.com/storage/fe2c92e1cc67c9d9f52f865/2017/11/file_example_MP3_700KB.mp3" }
    )
}

# --- ТЕСТ 3 ---
# Сценарий: Аудио с битой ссылкой (404 от сервера).
# Ожидаем: ошибка скачивания, но запрос не упадёт целиком (текст = заглушка).
# Лог:     WARN Audio transcription failed {step: 1, error: "Failed to download file: 404"}
Invoke-Test -Name "3. Битая ссылка на аудио (404)" -Body @{
    user    = @{ name = "Тест Битое Аудио"; email = "test_audio3@example.com" }
    answers = @(
        @{ step = 1; question = "Кто ваша аудитория?"; answer = $null; audio = "https://file-examples.com/nonexistent_audio_404.mp3" }
    )
}

# --- ТЕСТ 4 ---
# Сценарий: 4 шага — 2 аудио, 1 текст, 1 полностью пустой.
# Ожидаем: audioCount = 2, skipped = 1
# Лог: Onboarding started {audioCount: 2, textCount: 1}
#      Audio download started {step: 1}
#      Audio download started {step: 3}
#      Answers processed {audioOk: 2, audioFail: 0, skipped: 1}
Invoke-Test -Name "4. Микс: 2 аудио + 1 текст + 1 пустой" -Body @{
    user    = @{ name = "Тест Микс"; email = "test_audio4@example.com" }
    answers = @(
        @{ step = 1; question = "О бизнесе?";     answer = $null;           audio = "https://file-examples.com/storage/fe2c92e1cc67c9d9f52f865/2017/11/file_example_MP3_700KB.mp3" }
        @{ step = 2; question = "Аудитория?";     answer = "Дачники 35+";   audio = $null }
        @{ step = 3; question = "Конкуренты?";    answer = $null;           audio = "https://file-examples.com/storage/fe2c92e1cc67c9d9f52f865/2017/11/file_example_MP3_700KB.mp3" }
        @{ step = 4; question = "Есть акции?";    answer = $null;           audio = $null }
    )
}

Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "Все тесты выполнены." -ForegroundColor Magenta
Write-Host "Проверьте логи на сервере:" -ForegroundColor Magenta
Write-Host "  docker compose logs app --tail 100 | grep -E 'Audio|Onboarding|Answers'" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
