param(
    [Parameter(Mandatory=$true)][string]$ProfileDirectory,
    [ValidateRange(1,6)][int]$LayoutSlot = 1,
    [Parameter(Mandatory=$true)][string]$InputFile,
    [Parameter(Mandatory=$true)][string]$TargetUrl
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.IO.Compression.FileSystem

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class EditAjaWin32 {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@

[EditAjaWin32]::SetProcessDPIAware() | Out-Null

function Write-Result([bool]$Ok, [bool]$NeedsLogin, [long]$Hwnd, [string]$Message) {
    [pscustomobject]@{
        ok = $Ok
        needsLogin = $NeedsLogin
        hwnd = $Hwnd
        message = $Message
    } | ConvertTo-Json -Compress
}

function Get-ChromePath {
    $candidates = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        $(if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe' }),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
    if (-not $candidates -or $candidates.Count -eq 0) { throw 'Google Chrome tidak ditemukan.' }
    return [string]$candidates[0]
}

function Get-ChromeWindows {
    $items = New-Object 'System.Collections.Generic.List[System.IntPtr]'
    $cb = [EditAjaWin32+EnumWindowsProc]{
        param([IntPtr]$hWnd, [IntPtr]$lParam)
        if ([EditAjaWin32]::IsWindowVisible($hWnd)) {
            $sb = New-Object System.Text.StringBuilder 256
            [void][EditAjaWin32]::GetClassName($hWnd, $sb, $sb.Capacity)
            if ($sb.ToString() -eq 'Chrome_WidgetWin_1') { $items.Add($hWnd) }
        }
        return $true
    }
    [EditAjaWin32]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
    return @($items)
}

function Wait-NewChromeWindow($Before, [int]$TimeoutSec = 30) {
    $beforeSet = @{}
    foreach ($h in $Before) { $beforeSet[$h.ToInt64()] = $true }
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 200
        foreach ($h in @(Get-ChromeWindows)) {
            if (-not $beforeSet.ContainsKey($h.ToInt64())) { return $h }
        }
    }
    return [IntPtr]::Zero
}

function Get-SlotRect([int]$Slot) {
    $wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
    $gap = 6
    $usableW = $wa.Width - (2 * $gap)
    $baseW = [math]::Floor($usableW / 3)
    $usableH = $wa.Height - $gap
    $baseH = [math]::Floor($usableH / 2)
    $col = [math]::Floor(($Slot - 1) / 2)
    $row = ($Slot - 1) % 2
    $x = $wa.Left + ($col * ($baseW + $gap))
    $y = $wa.Top + ($row * ($baseH + $gap))
    $w = if ($col -eq 2) { $wa.Right - $x } else { $baseW }
    $h = if ($row -eq 1) { $wa.Bottom - $y } else { $baseH }
    return [pscustomobject]@{ Left=[int]$x; Top=[int]$y; Width=[int]$w; Height=[int]$h }
}

function Move-ToSlot([IntPtr]$Hwnd, [int]$Slot) {
    $r = Get-SlotRect $Slot
    [EditAjaWin32]::ShowWindow($Hwnd, 9) | Out-Null
    Start-Sleep -Milliseconds 100
    [EditAjaWin32]::MoveWindow($Hwnd, $r.Left, $r.Top, $r.Width, $r.Height, $true) | Out-Null
    Start-Sleep -Milliseconds 250
}

function Focus-Window([IntPtr]$Hwnd) {
    [EditAjaWin32]::ShowWindow($Hwnd, 9) | Out-Null
    [EditAjaWin32]::BringWindowToTop($Hwnd) | Out-Null
    [EditAjaWin32]::SetForegroundWindow($Hwnd) | Out-Null
    Start-Sleep -Milliseconds 350
}

function Set-Zoom67([IntPtr]$Hwnd) {
    Focus-Window $Hwnd
    [System.Windows.Forms.SendKeys]::SendWait('^0')
    Start-Sleep -Milliseconds 250
    for ($i = 0; $i -lt 4; $i++) {
        [System.Windows.Forms.SendKeys]::SendWait('^-')
        Start-Sleep -Milliseconds 180
    }
}

function Read-DocxText([string]$Path) {
    $zip = [System.IO.Compression.ZipFile]::OpenRead($Path)
    try {
        $entry = $zip.GetEntry('word/document.xml')
        if (-not $entry) { throw 'word/document.xml tidak ditemukan pada DOCX.' }
        $stream = $entry.Open()
        try {
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8, $true)
            try { $xmlText = $reader.ReadToEnd() } finally { $reader.Dispose() }
        } finally { $stream.Dispose() }
    } finally { $zip.Dispose() }
    [xml]$xml = $xmlText
    $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
    $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
    $paras = $xml.SelectNodes('//w:body/w:p', $ns)
    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($p in $paras) {
        $sb = New-Object System.Text.StringBuilder
        foreach ($node in $p.SelectNodes('.//w:t|.//w:tab|.//w:br|.//w:cr', $ns)) {
            if ($node.LocalName -eq 't') { [void]$sb.Append($node.InnerText) }
            elseif ($node.LocalName -eq 'tab') { [void]$sb.Append("`t") }
            else { [void]$sb.Append("`n") }
        }
        $lines.Add($sb.ToString())
    }
    return (($lines -join "`r`n") -replace "`r?`n{3,}", "`r`n`r`n").Trim()
}

function Read-InputText([string]$Path) {
    $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
    switch ($ext) {
        '.txt' { return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8).Trim() }
        '.md' { return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8).Trim() }
        '.docx' { return (Read-DocxText $Path).Trim() }
        default { throw "Format tidak didukung: $ext" }
    }
}

function Get-UiaElements([IntPtr]$Hwnd) {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($Hwnd)
    if (-not $root) { return @() }
    return @($root.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition
    ))
}

function Find-UiaByNameRegex($Elements, [string]$Pattern, [string[]]$ControlTypes = @()) {
    foreach ($el in $Elements) {
        try {
            $name = [string]$el.Current.Name
            if ($name -notmatch $Pattern) { continue }
            if ($ControlTypes.Count -gt 0) {
                $ct = [string]$el.Current.ControlType.ProgrammaticName
                $ok = $false
                foreach ($wanted in $ControlTypes) { if ($ct -like "*$wanted*") { $ok = $true; break } }
                if (-not $ok) { continue }
            }
            return $el
        } catch {}
    }
    return $null
}

function Invoke-Uia($Element) {
    if (-not $Element) { return $false }
    try {
        $p = $Element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        if ($p) { $p.Invoke(); return $true }
    } catch {}
    try {
        $p = $Element.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
        if ($p) { $p.Select(); return $true }
    } catch {}
    try {
        $Element.SetFocus(); Start-Sleep -Milliseconds 120
        [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
        return $true
    } catch {}
    return $false
}

function Set-UiaText($Element, [string]$Text) {
    if (-not $Element) { return $false }
    try {
        $vp = $Element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        if ($vp) { $vp.SetValue($Text); Start-Sleep -Milliseconds 250; return $true }
    } catch {}
    try {
        $Element.SetFocus(); Start-Sleep -Milliseconds 150
        [System.Windows.Forms.Clipboard]::SetText($Text)
        [System.Windows.Forms.SendKeys]::SendWait('^a'); Start-Sleep -Milliseconds 80
        [System.Windows.Forms.SendKeys]::SendWait('^v'); Start-Sleep -Milliseconds 300
        return $true
    } catch {}
    return $false
}

function Ensure-ComposerEditor([IntPtr]$Hwnd) {
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        $els = Get-UiaElements $Hwnd
        if ($els.Count -gt 5) {
            $signIn = Find-UiaByNameRegex $els '^(Sign in|Login|Log in)$' @('Button','Hyperlink')
            if ($signIn) { return [pscustomobject]@{ Ok=$false; NeedsLogin=$true; Message='Akun belum login Google.' } }
            $prompt = Find-UiaByNameRegex $els '^(Speech block text|Enter a prompt)$' @('Edit','Document')
            if ($prompt) { return [pscustomobject]@{ Ok=$true; Prompt=$prompt } }
            $template = Find-UiaByNameRegex $els '(The Master Storyteller|Turn text into natural-sounding speech)' @('Button','Hyperlink','Custom')
            if ($template) { [void](Invoke-Uia $template); Start-Sleep -Seconds 2 }
            $composer = Find-UiaByNameRegex $els '^Composer$' @('RadioButton','Button')
            if ($composer) { [void](Invoke-Uia $composer); Start-Sleep -Milliseconds 500 }
        }
        Start-Sleep -Milliseconds 650
    }
    return [pscustomobject]@{ Ok=$false; NeedsLogin=$false; Message='Kolom teks TTS tidak ditemukan.' }
}

$hwnd = [IntPtr]::Zero
try {
    if (-not (Test-Path -LiteralPath $InputFile -PathType Leaf)) { throw 'File Part tidak ditemukan.' }
    $text = Read-InputText $InputFile
    if ([string]::IsNullOrWhiteSpace($text)) { throw 'Isi Part kosong.' }

    $chrome = Get-ChromePath
    $before = @(Get-ChromeWindows)
    $argProfile = '--profile-directory="{0}"' -f $ProfileDirectory
    Start-Process -FilePath $chrome -ArgumentList @(
        $argProfile,
        '--new-window',
        '--force-renderer-accessibility',
        $TargetUrl
    ) | Out-Null

    $hwnd = Wait-NewChromeWindow $before 30
    if ($hwnd -eq [IntPtr]::Zero) { throw 'Window Chrome baru tidak berhasil dideteksi.' }

    Start-Sleep -Milliseconds 500
    Move-ToSlot $hwnd $LayoutSlot
    Set-Zoom67 $hwnd
    Move-ToSlot $hwnd $LayoutSlot

    $editor = Ensure-ComposerEditor $hwnd
    if (-not $editor.Ok) {
        Write-Result $false ([bool]$editor.NeedsLogin) $hwnd.ToInt64() ([string]$editor.Message)
        exit 0
    }

    Focus-Window $hwnd
    if (-not (Set-UiaText $editor.Prompt $text)) { throw 'Teks Part tidak berhasil dimasukkan ke kolom TTS.' }
    Write-Result $true $false $hwnd.ToInt64() 'Narasi berhasil dimasukkan. Menunggu tahap pilih voice + Generate.'
}
catch {
    $raw = if ($hwnd -ne [IntPtr]::Zero) { $hwnd.ToInt64() } else { 0 }
    Write-Result $false $false $raw $_.Exception.Message
    exit 0
}
