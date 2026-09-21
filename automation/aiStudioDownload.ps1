param(
    [Parameter(Mandatory=$true)][long]$Hwnd,
    [Parameter(Mandatory=$true)][string]$OutputBase
)

$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class EditAjaDownloadWin32 {
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
}
"@

function Write-Result([bool]$Ok,[string]$Message,[string]$OutputPath='') {
    [pscustomobject]@{ok=$Ok;message=$Message;outputPath=$OutputPath}|ConvertTo-Json -Compress
}

function Get-Elements([IntPtr]$Handle) {
    $root=[System.Windows.Automation.AutomationElement]::FromHandle($Handle)
    if(-not $root){ return @() }
    return @($root.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition
    ))
}

function Find-Download($Elements) {
    foreach($el in $Elements){
        try{
            $name=([string]$el.Current.Name).Trim()
            $ct=[string]$el.Current.ControlType.ProgrammaticName
            if($name -match '(?i)^(Download|Download audio|Save audio|Download generated audio)$' -and $ct -match 'Button|Hyperlink|MenuItem'){
                return $el
            }
        }catch{}
    }
    return $null
}

function Invoke-Element($Element) {
    if(-not $Element){ return $false }
    try{
        $p=$Element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        if($p){ $p.Invoke(); return $true }
    }catch{}
    try{
        $Element.SetFocus()
        Start-Sleep -Milliseconds 120
        [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
        return $true
    }catch{}
    return $false
}

function Focus-Window([IntPtr]$Handle) {
    [EditAjaDownloadWin32]::ShowWindow($Handle,9)|Out-Null
    [EditAjaDownloadWin32]::BringWindowToTop($Handle)|Out-Null
    [EditAjaDownloadWin32]::SetForegroundWindow($Handle)|Out-Null
    Start-Sleep -Milliseconds 400
}

function Get-DownloadDirectory {
    $home=[Environment]::GetFolderPath('UserProfile')
    $dir=Join-Path $home 'Downloads'
    if(-not (Test-Path -LiteralPath $dir)){ New-Item -ItemType Directory -Path $dir -Force|Out-Null }
    return $dir
}

function Find-NewDownload([string]$Dir,[datetime]$Since,[int]$TimeoutSec=120) {
    $deadline=(Get-Date).AddSeconds($TimeoutSec)
    $candidate=$null
    $lastSize=-1
    $stable=0
    while((Get-Date) -lt $deadline){
        $files=@(Get-ChildItem -LiteralPath $Dir -File -ErrorAction SilentlyContinue |
            Where-Object {
                $_.LastWriteTime -ge $Since.AddSeconds(-2) -and
                $_.Extension.ToLowerInvariant() -notin @('.crdownload','.tmp','.part')
            } |
            Sort-Object LastWriteTime -Descending)
        if($files.Count -gt 0){
            $candidate=$files[0]
            $size=$candidate.Length
            if($size -gt 0 -and $size -eq $lastSize){ $stable++ } else { $stable=0; $lastSize=$size }
            if($stable -ge 2){ return $candidate }
        }
        Start-Sleep -Seconds 1
    }
    return $null
}

try{
    $handle=[IntPtr]::new($Hwnd)
    if(-not [EditAjaDownloadWin32]::IsWindow($handle)){ throw 'Window hasil Generate sudah tidak tersedia.' }

    $outputDir=Split-Path -Parent $OutputBase
    if(-not $outputDir){ throw 'OutputBase tidak mempunyai folder tujuan.' }
    New-Item -ItemType Directory -Path $outputDir -Force|Out-Null

    $existing=@(Get-ChildItem -LiteralPath $outputDir -File -ErrorAction SilentlyContinue |
        Where-Object { $_.BaseName -eq [System.IO.Path]::GetFileName($OutputBase) } |
        Select-Object -First 1)
    if($existing){
        Write-Result $true 'File output sudah ada; download dilewati.' $existing[0].FullName
        exit 0
    }

    Focus-Window $handle
    $deadline=(Get-Date).AddSeconds(25)
    $button=$null
    while((Get-Date) -lt $deadline -and -not $button){
        $button=Find-Download (Get-Elements $handle)
        if(-not $button){ Start-Sleep -Milliseconds 600 }
    }
    if(-not $button){ throw 'Tombol Download audio tidak ditemukan.' }

    $downloadDir=Get-DownloadDirectory
    $clickedAt=Get-Date
    if(-not (Invoke-Element $button)){ throw 'Tombol Download ditemukan tetapi tidak berhasil diklik.' }

    $file=Find-NewDownload $downloadDir $clickedAt 120
    if(-not $file){ throw 'File download baru tidak terdeteksi dalam 120 detik. Pastikan Chrome tidak memakai Ask where to save each file.' }

    $ext=$file.Extension
    if([string]::IsNullOrWhiteSpace($ext)){ $ext='.wav' }
    $destination=$OutputBase+$ext
    Move-Item -LiteralPath $file.FullName -Destination $destination -Force
    Write-Result $true 'Download selesai dan file sudah diberi nama.' $destination
}
catch{
    Write-Result $false $_.Exception.Message
    exit 0
}
