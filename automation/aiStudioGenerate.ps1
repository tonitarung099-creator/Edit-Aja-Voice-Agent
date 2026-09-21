param(
    [Parameter(Mandatory=$true)][long]$Hwnd,
    [Parameter(Mandatory=$true)][string]$VoiceName
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class EditAjaGenerateWin32 {
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
}
"@

function Write-Result([bool]$Ok, [string]$Message, [bool]$VoiceSelected=$false, [bool]$GenerateClicked=$false) {
    [pscustomobject]@{
        ok=$Ok
        message=$Message
        voiceSelected=$VoiceSelected
        generateClicked=$GenerateClicked
    } | ConvertTo-Json -Compress
}

function Get-Elements([IntPtr]$Handle) {
    $root=[System.Windows.Automation.AutomationElement]::FromHandle($Handle)
    if(-not $root){ return @() }
    return @($root.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition
    ))
}

function Find-ByNameRegex($Elements,[string]$Pattern,[string[]]$Types=@()) {
    foreach($el in $Elements){
        try{
            $name=[string]$el.Current.Name
            if($name -notmatch $Pattern){ continue }
            if($Types.Count -gt 0){
                $ct=[string]$el.Current.ControlType.ProgrammaticName
                $matched=$false
                foreach($wanted in $Types){ if($ct -like "*$wanted*"){ $matched=$true; break } }
                if(-not $matched){ continue }
            }
            return $el
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
        $p=$Element.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
        if($p){ $p.Select(); return $true }
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
    [EditAjaGenerateWin32]::ShowWindow($Handle,9)|Out-Null
    [EditAjaGenerateWin32]::BringWindowToTop($Handle)|Out-Null
    [EditAjaGenerateWin32]::SetForegroundWindow($Handle)|Out-Null
    Start-Sleep -Milliseconds 350
}

function Candidate-Names($Elements) {
    $items=New-Object System.Collections.Generic.List[string]
    foreach($el in $Elements){
        try{
            $name=([string]$el.Current.Name).Trim()
            if(-not $name){ continue }
            if($name -match '(?i)voice|speaker|run|generate|speech|audio'){
                if(-not $items.Contains($name)){ $items.Add($name) }
            }
            if($items.Count -ge 30){ break }
        }catch{}
    }
    return ($items -join ' | ')
}

$handle=[IntPtr]::new($Hwnd)
try{
    if(-not [EditAjaGenerateWin32]::IsWindow($handle)){ throw 'Window AI Studio sudah tidak tersedia.' }
    Focus-Window $handle

    $deadline=(Get-Date).AddSeconds(25)
    $voiceSelected=$false

    while((Get-Date) -lt $deadline -and -not $voiceSelected){
        $els=Get-Elements $handle

        $exact=Find-ByNameRegex $els ('^'+[regex]::Escape($VoiceName)+'$') @('Button','ListItem','RadioButton','MenuItem','Custom')
        if($exact){
            if(Invoke-Element $exact){ $voiceSelected=$true; break }
        }

        $voiceControl=Find-ByNameRegex $els '(?i)^(voice|choose voice|select voice|speaker voice)(\b|\s|:)' @('Button','ComboBox','Custom')
        if(-not $voiceControl){
            $voiceControl=Find-ByNameRegex $els '(?i)voice' @('Button','ComboBox')
        }
        if($voiceControl){
            [void](Invoke-Element $voiceControl)
            Start-Sleep -Milliseconds 700
            $els=Get-Elements $handle
            $choice=Find-ByNameRegex $els ('^'+[regex]::Escape($VoiceName)+'$') @('Button','ListItem','RadioButton','MenuItem','Custom','Text')
            if($choice){
                if(Invoke-Element $choice){ $voiceSelected=$true; break }
                try{
                    if(([string]$choice.Current.Name) -eq $VoiceName){ $voiceSelected=$true; break }
                }catch{}
            }
        }
        Start-Sleep -Milliseconds 550
    }

    if(-not $voiceSelected){
        $els=Get-Elements $handle
        $hints=Candidate-Names $els
        Write-Result $false ("Voice '$VoiceName' tidak berhasil dipilih. Kandidat UI: "+$hints)
        exit 0
    }

    Start-Sleep -Milliseconds 450
    $els=Get-Elements $handle
    $generate=Find-ByNameRegex $els '^(Run|Generate|Generate speech|Run prompt)$' @('Button')
    if(-not $generate){
        $generate=Find-ByNameRegex $els '(?i)^(generate|run)\b.*' @('Button')
    }
    if(-not $generate){
        $hints=Candidate-Names $els
        Write-Result $false ("Tombol Generate/Run tidak ditemukan. Kandidat UI: "+$hints) $true $false
        exit 0
    }

    try{
        if(-not $generate.Current.IsEnabled){
            Write-Result $false 'Tombol Generate ditemukan tetapi belum aktif.' $true $false
            exit 0
        }
    }catch{}

    if(-not (Invoke-Element $generate)){
        Write-Result $false 'Tombol Generate ditemukan tetapi tidak berhasil diklik.' $true $false
        exit 0
    }

    Start-Sleep -Milliseconds 900
    Write-Result $true ("Voice "+$VoiceName+" dipilih dan Generate dijalankan.") $true $true
}
catch{
    Write-Result $false $_.Exception.Message
    exit 0
}
