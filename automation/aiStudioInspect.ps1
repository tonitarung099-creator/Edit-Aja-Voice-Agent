param(
    [Parameter(Mandatory=$true)][long]$Hwnd,
    [switch]$MinimizeWhenReady
)

$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class EditAjaInspectWin32 {
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

function Write-Result([string]$State,[string]$Message) {
    [pscustomobject]@{ ok=$true; state=$State; message=$Message } | ConvertTo-Json -Compress
}

function Get-Elements([IntPtr]$Handle) {
    $root=[System.Windows.Automation.AutomationElement]::FromHandle($Handle)
    if(-not $root){ return @() }
    return @($root.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition
    ))
}

function Element-Names($Elements) {
    $names=New-Object System.Collections.Generic.List[string]
    foreach($el in $Elements){
        try{
            $name=([string]$el.Current.Name).Trim()
            if($name -and -not $names.Contains($name)){ $names.Add($name) }
        }catch{}
    }
    return @($names)
}

try{
    $handle=[IntPtr]::new($Hwnd)
    if(-not [EditAjaInspectWin32]::IsWindow($handle)){
        Write-Result 'window_closed' 'Window AI Studio sudah tertutup.'
        exit 0
    }

    $els=Get-Elements $handle
    if($els.Count -lt 5){
        Write-Result 'unknown' 'Accessibility tree belum siap.'
        exit 0
    }

    $names=Element-Names $els
    $joined=($names -join "`n")

    if($joined -match '(?im)^(Sign in|Login|Log in)$'){
        Write-Result 'needs_login' 'Sesi Google meminta login.'
        exit 0
    }

    if($joined -match '(?i)(quota|rate limit|resource exhausted|too many requests|usage limit|limit reached|capacity reached)'){
        Write-Result 'provider_limited' 'AI Studio melaporkan limit/quota pada akun ini.'
        exit 0
    }

    if($joined -match '(?i)(generation failed|failed to generate|something went wrong|internal error)'){
        Write-Result 'error' 'AI Studio melaporkan kegagalan Generate.'
        exit 0
    }

    $download=$false
    foreach($el in $els){
        try{
            $name=([string]$el.Current.Name).Trim()
            $ct=[string]$el.Current.ControlType.ProgrammaticName
            if($name -match '(?i)^(Download|Download audio|Save audio|Download generated audio)$' -and $ct -match 'Button|Hyperlink|MenuItem'){
                $download=$true
                break
            }
        }catch{}
    }

    if($download){
        if($MinimizeWhenReady){ [EditAjaInspectWin32]::ShowWindow($handle,6)|Out-Null }
        Write-Result 'generated' 'Audio siap. Window disimpan dan diminimalkan untuk antrean download.'
        exit 0
    }

    if($joined -match '(?i)(generating|running|stop generating|cancel generation|processing)'){
        Write-Result 'generating' 'Generate masih berjalan.'
        exit 0
    }

    Write-Result 'generating' 'Belum menemukan kontrol Download; masih dipantau.'
}
catch{
    [pscustomobject]@{ok=$false;state='error';message=$_.Exception.Message}|ConvertTo-Json -Compress
    exit 0
}
