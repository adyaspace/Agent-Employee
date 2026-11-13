# Cek lalu ganti SUPABASE_SERVICE_ROLE_KEY di Vercel, kemudian redeploy.
# Kunci DIUJI ke Supabase dulu; yang salah tidak akan disimpan.
#   powershell -ExecutionPolicy Bypass -File deploy\perbaiki-kunci.ps1

$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)
$scope = 'adyaspaces-projects'
$url = 'https://gvikzfnxxgcbaoapeipq.supabase.co'
$ref = 'gvikzfnxxgcbaoapeipq'

function Tanya([string]$label) {
  $s = Read-Host -AsSecureString $label
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
function IsiJWT([string]$k) {
  try {
    $p = $k.Split('.')[1].Replace('-', '+').Replace('_', '/')
    while ($p.Length % 4) { $p += '=' }
    return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p)) | ConvertFrom-Json
  } catch { return $null }
}
function UjiKunci([string]$k) {
  if (-not $k) { return 'Kosong.' }
  if ($k -like 'sb_publishable_*') { return 'Ini publishable key (publik). Yang dibutuhkan secret key: sb_secret_... atau service_role.' }
  if ($k -like 'eyJ*') {
    $j = IsiJWT $k
    if (-not $j) { return 'Format JWT rusak. Salin ulang utuh (biasanya 200+ karakter, 3 bagian dipisah titik).' }
    if ($j.ref -ne $ref) { return "Kunci ini milik project lain ($($j.ref)). Buka project Adyaspace ($ref)." }
    if ($j.role -ne 'service_role') { return "Ini kunci peran '$($j.role)'. Yang dibutuhkan service_role (bukan anon)." }
  } elseif ($k -notlike 'sb_secret_*') { return 'Format tidak dikenal. Kunci yang benar diawali sb_secret_ atau eyJ.' }
  $h = @{ apikey = $k }
  if ($k -like 'eyJ*') { $h.Authorization = "Bearer $k" }
  try {
    Invoke-RestMethod -Uri "$url/rest/v1/karyawan_rekaman?select=id&limit=1" -Headers $h -Method Get | Out-Null
    return $null
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    return "Supabase menolak kunci ini (HTTP $code). Pastikan menyalin service_role / secret key dari project Adyaspace."
  }
}

Write-Host 'Ambil kunci: supabase.com > project Adyaspace > Project Settings > API Keys' -ForegroundColor Cyan
Write-Host '  pilihan 1: tab "API Keys" > Secret keys > salin sb_secret_...'
Write-Host '  pilihan 2: tab "Legacy API Keys" > service_role > Reveal > salin (diawali eyJ)'
while ($true) {
  $k = Tanya 'Tempel kunci (Enter kosong untuk batal)'
  if (-not $k) { Write-Host 'Dibatalkan.'; exit 1 }
  $err = UjiKunci $k
  if (-not $err) { Write-Host 'Kunci valid: Supabase menerima.' -ForegroundColor Green; break }
  Write-Host "  $err" -ForegroundColor Red
}

vercel env rm SUPABASE_SERVICE_ROLE_KEY production --yes --scope $scope *> $null
$tmp = New-TemporaryFile
[System.IO.File]::WriteAllText($tmp.FullName, $k)
cmd /c "vercel env add SUPABASE_SERVICE_ROLE_KEY production --scope $scope < `"$($tmp.FullName)`""
Remove-Item $tmp.FullName -Force
if ($LASTEXITCODE -ne 0) { Write-Host 'Gagal menyimpan ke Vercel.' -ForegroundColor Red; exit 1 }

vercel deploy --prod --yes --scope $scope
if ($LASTEXITCODE -eq 0) { Write-Host "`nSelesai. Buka dashboard lalu muat ulang (Ctrl+F5)." -ForegroundColor Green }
