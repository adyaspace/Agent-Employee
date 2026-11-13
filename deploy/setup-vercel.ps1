# Deploy karyawan-ai ke Vercel (team adyaspaces-projects) dengan data di Supabase project "Adyaspace".
# Jalankan dari PowerShell di folder proyek:
#   powershell -ExecutionPolicy Bypass -File deploy\setup-vercel.ps1
# Aman diulang. Rahasia dibuat di laptop ini dan langsung disimpan ke Vercel; tidak ditulis ke file.

$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)
$scope = 'adyaspaces-projects'

function Langkah($t) { Write-Host "`n== $t" -ForegroundColor Cyan }
function Rahasia([int]$n) {
  $b = New-Object byte[] ($n * 2)
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return (([Convert]::ToBase64String($b)) -replace '[+/=]', '').Substring(0, $n)
}
function SetEnv([string]$k, [string]$v) {
  if (-not $v) { return }
  vercel env rm $k production --yes --scope $scope *> $null
  $tmp = New-TemporaryFile
  [System.IO.File]::WriteAllText($tmp.FullName, $v)            # tanpa baris baru di ujung
  cmd /c "vercel env add $k production --scope $scope < `"$($tmp.FullName)`"" *> $null
  Remove-Item $tmp.FullName -Force
  if ($LASTEXITCODE -ne 0) { Write-Host "  gagal mengisi $k" -ForegroundColor Red } else { Write-Host "  $k tersimpan" }
}
function Tanya([string]$label) {
  $s = Read-Host -AsSecureString $label
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

Langkah 'Cek Vercel CLI'
if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) { npm i -g vercel }
vercel whoami
if ($LASTEXITCODE -ne 0) { vercel login }

Langkah 'Pasang dependensi'
npm install --no-audit --no-fund

Langkah 'Hubungkan ke project Vercel "karyawan-ai" (dibuat otomatis bila belum ada)'
vercel link --yes --scope $scope --project karyawan-ai
if ($LASTEXITCODE -ne 0) { vercel link --yes --scope $scope }
if ($LASTEXITCODE -ne 0) { Write-Host 'Gagal link project. Berhenti.' -ForegroundColor Red; exit 1 }

Langkah 'Isi environment variables'
$pin = Rahasia 16
SetEnv 'SUPABASE_URL' 'https://gvikzfnxxgcbaoapeipq.supabase.co'
SetEnv 'NODEJS_HELPERS' '0'
SetEnv 'CS_AUTODRAFT' '1'
SetEnv 'CRON_SECRET' (Rahasia 40)
SetEnv 'SESSION_SECRET' (Rahasia 48)
SetEnv 'DASHBOARD_PIN' $pin
SetEnv 'ANTHROPIC_API_KEY' (Tanya 'Tempel ANTHROPIC_API_KEY untuk CS AI (Enter bila belum punya)')

Langkah 'Kunci Supabase (diuji dulu) lalu deploy production'
& "$PSScriptRoot\perbaiki-kunci.ps1"
if ($LASTEXITCODE -ne 0) { Write-Host 'Belum selesai: kunci Supabase atau deploy gagal.' -ForegroundColor Red; exit 1 }

Write-Host "`n== Selesai" -ForegroundColor Green
Write-Host "Buka URL production di atas, masuk dengan nama Anda dan PIN berikut (simpan di password manager, lalu tutup jendela ini):"
Write-Host "  PIN: $pin" -ForegroundColor Yellow
Write-Host "Ganti PIN kapan saja: jalankan ulang skrip ini, atau ubah DASHBOARD_PIN di Vercel lalu redeploy."
Write-Host "WhatsApp menyusul: isi WA_PHONE_ID_*, WA_TOKEN_*, WA_APP_SECRET, WA_VERIFY_TOKEN, lalu KARYAWAN_LIVE=1 (lihat README)."
